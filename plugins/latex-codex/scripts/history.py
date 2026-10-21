"""Local, append-only source snapshots; SQLite and compressed text need no packages."""
from contextlib import closing
from pathlib import Path
from datetime import datetime, timezone
import difflib
import hashlib
import json
import re
import sqlite3
import uuid
import zlib


SUMMARY_LANGUAGES = {'en':'English', 'zh-CN':'Simplified Chinese', 'zh-TW':'Traditional Chinese', 'ja':'Japanese',
                     'fr':'French', 'de':'German', 'es':'Spanish'}
CHAT_EXPORT_NAMES = {
    'en': ('AI Chat Notes.md', 'AI Reply'),
    'zh-CN': ('AI对话记录.md', 'AI 回复'),
    'zh-TW': ('AI對話記錄.md', 'AI 回覆'),
    'ja': ('AIチャット記録.md', 'AIの回答'),
    'fr': ('Notes de conversation IA.md', 'Réponse de l’IA'),
    'de': ('KI-Chatnotizen.md', 'KI-Antwort'),
    'es': ('Notas de chat de IA.md', 'Respuesta de IA'),
}


def summary_language(value):
    return value if isinstance(value, str) and value in SUMMARY_LANGUAGES else 'en'


# Keep immutable backups; show the last automatic save in each five-minute window.
VISIBLE_REVISIONS = """WITH checkpoints AS (
    SELECT id, file, created, kind, label, SUM(CASE WHEN kind NOT IN ('save', 'external') OR label!=''
        THEN 1 ELSE 0 END) OVER (PARTITION BY file ORDER BY id) AS checkpoint
    FROM revisions), grouped AS (
    SELECT id, file, created, kind, label, ROW_NUMBER() OVER (
        PARTITION BY file, checkpoint, CASE WHEN kind IN ('save', 'external') AND label=''
            THEN CAST(strftime('%s', created) AS INTEGER)/300 ELSE -id END
        ORDER BY id DESC) AS position
    FROM checkpoints), visible AS (
    SELECT id, file, created, kind, label, LEAD(id,1,0) OVER (PARTITION BY file ORDER BY id DESC) AS baseline
    FROM grouped WHERE position=1 AND kind!='before-annotation') """


class History:
    def __init__(self, path, project_root=None):
        root = project_root or path.parent
        self.file = path.relative_to(root).as_posix()
        self.database = root / '.latex-codex' / 'history.sqlite3'
        self.database.parent.mkdir(exist_ok=True)
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('''CREATE TABLE IF NOT EXISTS revisions (
                id INTEGER PRIMARY KEY, file TEXT NOT NULL, created TEXT NOT NULL,
                kind TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',
                digest TEXT NOT NULL, source BLOB NOT NULL)''')
            db.execute('CREATE INDEX IF NOT EXISTS file_revisions ON revisions(file, id)')
            db.execute("CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL, file TEXT NOT NULL DEFAULT '', selection TEXT NOT NULL DEFAULT '')")
            db.execute("CREATE TABLE IF NOT EXISTS chat_threads (id TEXT PRIMARY KEY, parent TEXT, root TEXT NOT NULL, title TEXT NOT NULL, quote TEXT NOT NULL DEFAULT '', message_id INTEGER, context TEXT NOT NULL DEFAULT '[]')")
            if 'deleted' not in {row['name'] for row in db.execute('PRAGMA table_info(chat_threads)')}:
                db.execute('ALTER TABLE chat_threads ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0')
            if 'thread' not in {row['name'] for row in db.execute('PRAGMA table_info(chat_messages)')}:
                db.execute("ALTER TABLE chat_messages ADD COLUMN thread TEXT NOT NULL DEFAULT ''")
                db.execute("UPDATE chat_messages SET thread='main:' || COALESCE((SELECT MAX(b.id) FROM chat_messages b WHERE b.role='boundary' AND b.id<=chat_messages.id),0)")
            db.execute('CREATE INDEX IF NOT EXISTS thread_messages ON chat_messages(thread,id)')
            for row in db.execute("SELECT 0 AS id UNION SELECT id FROM chat_messages WHERE role='boundary'").fetchall():
                identity = 'main:' + str(row['id'])
                first = db.execute("SELECT content FROM chat_messages WHERE thread=? AND role='user' ORDER BY id LIMIT 1", (identity,)).fetchone()
                db.execute('INSERT OR IGNORE INTO chat_threads(id,root,title) VALUES (?,?,?)', (identity, identity, first['content'].strip()[:60] if first else ''))
            db.execute("CREATE TABLE IF NOT EXISTS revision_activity (revision_id INTEGER NOT NULL, baseline_id INTEGER NOT NULL, sections TEXT NOT NULL, details TEXT NOT NULL, description TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', PRIMARY KEY(revision_id,baseline_id))")
            db.execute('CREATE TABLE IF NOT EXISTS revision_summaries (revision_id INTEGER NOT NULL, baseline_id INTEGER NOT NULL, language TEXT NOT NULL, summary TEXT NOT NULL, PRIMARY KEY(revision_id,baseline_id,language))')
            db.execute('CREATE TABLE IF NOT EXISTS revision_annotations (revision_id INTEGER PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, baseline_id INTEGER NOT NULL, count INTEGER NOT NULL, items BLOB NOT NULL, reply TEXT NOT NULL)')
            # Earlier versions always generated Simplified Chinese summaries.
            db.execute("INSERT OR IGNORE INTO revision_summaries SELECT revision_id,baseline_id,'zh-CN',summary FROM revision_activity WHERE summary!=''")

    def connect(self):
        db = sqlite3.connect(self.database, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    @staticmethod
    def _chat_thread(db, thread=None):
        if thread is None:
            boundary = db.execute("SELECT COALESCE(MAX(id),0) FROM chat_messages WHERE role='boundary'").fetchone()[0]
            thread = 'main:' + str(boundary)
        if not isinstance(thread, str):
            raise ValueError('对话编号无效。')
        row = db.execute('SELECT * FROM chat_threads WHERE id=? AND deleted=0', (thread,)).fetchone()
        if row is None:
            raise ValueError('对话不存在，请重新打开。')
        return dict(row)

    def chat_read(self, thread=None):
        with closing(self.connect()) as db:
            node = self._chat_thread(db, thread)
            revision = db.execute('SELECT COALESCE(MAX(id),0) FROM chat_messages WHERE thread=?', (node['id'],)).fetchone()[0]
            rows = db.execute("SELECT id, role, content, file, selection FROM chat_messages WHERE thread=? AND role!='boundary' ORDER BY id DESC LIMIT 41", (node['id'],)).fetchall()
            threads = [{**dict(row), 'has_messages': bool(row['has_messages'])} for row in db.execute('''
                SELECT id,parent,root,title,quote,message_id, EXISTS(
                    SELECT 1 FROM chat_messages m WHERE m.thread=chat_threads.id AND m.role='user'
                ) AS has_messages FROM chat_threads WHERE deleted=0 ORDER BY rowid''')]
        return {'revision': revision, 'messages': [dict(row) for row in reversed(rows[:40])],
                'truncated': len(rows)>40, 'project': str(self.database.parent.parent),
                'thread': node['id'], 'root': node['root'], 'threads': threads, 'quote': node['quote']}

    def chat_append(self, revision, question, answer, file, selection, thread=None):
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            node = self._chat_thread(db, thread)
            if db.execute('SELECT COALESCE(MAX(id),0) FROM chat_messages WHERE thread=?', (node['id'],)).fetchone()[0] != revision:
                raise ValueError('项目对话已更新，请重新打开对话后重试。')
            db.execute('INSERT INTO chat_messages(role,content,file,selection,thread) VALUES (?,?,?,?,?)', ('user',question,file,selection,node['id']))
            if not node['title']:
                db.execute('UPDATE chat_threads SET title=? WHERE id=?', (question.strip()[:60], node['id']))
            return db.execute('INSERT INTO chat_messages(role,content,thread) VALUES (?,?,?)',
                              ('assistant',json.dumps(answer,ensure_ascii=False),node['id'])).lastrowid

    def chat_new(self):
        # Archive the preceding conversation without deleting its stored messages.
        with closing(self.connect()) as db, db:
            revision = db.execute("INSERT INTO chat_messages(role,content) VALUES ('boundary','')").lastrowid
            identity = 'main:' + str(revision)
            db.execute('UPDATE chat_messages SET thread=? WHERE id=?', (identity, revision))
            db.execute('INSERT INTO chat_threads(id,root,title) VALUES (?,?,?)', (identity,identity,''))
        return self.chat_read()

    def chat_branch(self, parent, message_id, quote):
        if not isinstance(parent, str) or type(message_id) is not int or not isinstance(quote, str) or not 1 <= len(quote.strip()) <= 12000:
            raise ValueError('请选择一条对话中的文字（最多 12000 字符）。')
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            node = self._chat_thread(db, parent)
            if not db.execute("SELECT id FROM chat_messages WHERE id=? AND thread=? AND role IN ('user','assistant')", (message_id,node['id'])).fetchone():
                raise ValueError('引用消息不存在，请重新选择。')
            recent = [dict(row) for row in reversed(db.execute("SELECT role,content,file,selection FROM chat_messages WHERE thread=? AND id<=? AND role!='boundary' ORDER BY id DESC LIMIT 38", (node['id'],message_id)).fetchall())]
            context = json.loads(node['context'])
            if node['quote']:
                context.append({'role':'user', 'content':'Quoted discussion passage:\n' + node['quote']})
            context += recent
            while context and (len(context)>38 or len(json.dumps(context,ensure_ascii=False))>80000):
                context = context[1:]
            identity = uuid.uuid4().hex
            db.execute('INSERT INTO chat_threads(id,parent,root,title,quote,message_id,context) VALUES (?,?,?,?,?,?,?)',
                       (identity,node['id'],node['root'],quote.strip()[:60],quote.strip(),message_id,json.dumps(context,ensure_ascii=False)))
        return self.chat_read(identity)

    def chat_rename(self, thread, title):
        if not isinstance(thread, str) or not isinstance(title, str) or not 1 <= len(title.strip()) <= 120 or '\n' in title or '\r' in title:
            raise ValueError('对话名称须为 1–120 字符的单行文字。')
        with closing(self.connect()) as db, db:
            node = self._chat_thread(db, thread)
            db.execute('UPDATE chat_threads SET title=? WHERE id=?', (title.strip(), node['id']))
        return {'thread': node['id'], 'title': title.strip()}

    def chat_seed(self, thread):
        with closing(self.connect()) as db:
            node = self._chat_thread(db, thread)
        return {'quote': node['quote'], 'messages': json.loads(node['context'])} if node['parent'] else None

    def chat_delete(self, thread, descendants):
        if not isinstance(thread, str) or not isinstance(descendants, list) or not descendants or not all(isinstance(item, str) for item in descendants):
            raise ValueError('删除对话的范围无效。')
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            node = self._chat_thread(db, thread)
            if not node['parent']:
                raise ValueError('主对话不能通过分支菜单删除。')
            deleted = [row['id'] for row in db.execute('''WITH RECURSIVE subtree(id) AS (
                SELECT id FROM chat_threads WHERE id=? AND deleted=0
                UNION SELECT child.id FROM chat_threads child JOIN subtree ON child.parent=subtree.id WHERE child.deleted=0
                ) SELECT id FROM subtree''', (thread,))]
            if len(descendants) != len(deleted) or set(descendants) != set(deleted):
                raise ValueError('对话分支已变化，请重新打开分支图后重试。')
            # Retain message IDs so later replies cannot reuse an ID referenced by another conversation.
            db.executemany('UPDATE chat_threads SET deleted=1 WHERE id=?', ((item,) for item in deleted))
        return {'deleted': deleted, 'threads': self.chat_read(node['root'])['threads']}

    def chat_export(self, message_id, language='zh-CN'):
        if not isinstance(language, str) or language not in CHAT_EXPORT_NAMES:
            raise ValueError('记录语言无效。')
        with closing(self.connect()) as db:
            row = db.execute("SELECT m.content FROM chat_messages m JOIN chat_threads t ON t.id=m.thread WHERE m.id=? AND m.role='assistant' AND t.deleted=0", (message_id,)).fetchone()
        if row is None:
            raise ValueError('找不到这条 AI 回复。')
        try:
            reply = json.loads(row['content']).get('reply')
        except (ValueError, AttributeError):
            reply = row['content']
        if not isinstance(reply, str) or not reply.strip():
            raise ValueError('这条 AI 回复没有可记录的内容。')
        root = self.database.parent.parent.resolve()
        filename, heading = CHAT_EXPORT_NAMES[language]
        target = root / filename
        if target.resolve().parent != root:
            raise ValueError('记录文件必须位于项目目录内。')
        marker = f'<!-- latex-codex-chat:{message_id} -->'
        previous = target.read_text(encoding='utf-8') if target.exists() else ''
        if marker in previous:
            return {'file': target.name, 'already_saved': True}
        prefix = '' if not previous else '\n' if previous.endswith('\n') else '\n\n'
        with target.open('a', encoding='utf-8', newline='\n') as stream:
            stream.write(f'{prefix}{marker}\n\n## {heading}\n\n{reply.strip()}\n')
        return {'file': target.name, 'already_saved': False}

    def record(self, source, kind='external', force=False):
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            return self._record(db, self.file, source, kind, force)

    def record_sources(self, sources, kind='external'):
        """Capture project sources together, including edits outside the active file."""
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            for file, source in sources.items():
                self._record(db, file, source, kind)

    def annotation_record(self, request_id):
        with closing(self.connect()) as db:
            row = db.execute('SELECT revision_id,baseline_id FROM revision_annotations WHERE request_id=?', (request_id,)).fetchone()
        return {**self.get(row['revision_id']), 'before':self.get(row['baseline_id'])['source']} if row else None

    def record_annotations(self, source, change):
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            baseline = self._record(db, self.file, change['before'], 'before-annotation')
            revision = self._record(db, self.file, source, 'annotation', force=True)
            items = zlib.compress(json.dumps(change['items'], ensure_ascii=False).encode('utf-8'))
            db.execute('INSERT INTO revision_annotations VALUES (?,?,?,?,?,?)',
                       (revision,change['id'],baseline,len(change['items']),items,change['reply']))
        return revision

    @staticmethod
    def _record(db, file, source, kind, force=False):
        raw = source.encode('utf-8')
        digest = hashlib.sha256(raw).hexdigest()
        previous = db.execute('SELECT id, digest FROM revisions WHERE file=? ORDER BY id DESC LIMIT 1', (file,)).fetchone()
        if previous and previous['digest'] == digest and not force:
            return previous['id']
        return db.execute('INSERT INTO revisions(file, created, kind, digest, source) VALUES (?, ?, ?, ?, ?)',
                          (file, datetime.now(timezone.utc).isoformat(), kind, digest, zlib.compress(raw))).lastrowid

    def list(self, before=None, language='en'):
        language = summary_language(language)
        if before is not None and (type(before) is not int or before < 1):
            raise ValueError('历史记录游标无效。')
        with closing(self.connect()) as db, db:
            rows = db.execute(VISIBLE_REVISIONS + '''SELECT id, file, created, kind, label,
                COALESCE(notes.baseline_id,visible.baseline) AS baseline, COALESCE(notes.count,0) AS annotation_count
                FROM visible LEFT JOIN revision_annotations AS notes ON notes.revision_id=visible.id
                WHERE (? IS NULL OR id<?) ORDER BY id DESC LIMIT 101''', (before, before)).fetchall()
            result = []
            for row in rows[:100]:
                baseline = row['baseline']
                activity = db.execute('SELECT sections,description,summary,details FROM revision_activity WHERE revision_id=? AND baseline_id=?', (row['id'],baseline)).fetchone()
                if activity is None or baseline and not activity['details'] and activity['description'] not in ('调整空白或换行','内容与上一版相同'):
                    source = self.get(row['id'])['source']
                    data = describe_revision(self.get(baseline)['source'] if baseline else '', source, Path(row['file']).suffix.lower() in ('.md', '.markdown')) if baseline else {'sections':['文档初始版本'],'description':'首次保存的版本','details':''}
                    db.execute('INSERT INTO revision_activity(revision_id,baseline_id,sections,details,description) VALUES (?,?,?,?,?) ON CONFLICT(revision_id,baseline_id) DO UPDATE SET sections=excluded.sections,details=excluded.details,description=excluded.description,summary=\'\'',
                               (row['id'],baseline,json.dumps(data['sections'],ensure_ascii=False),data['details'],data['description']))
                    activity = {**data,'summary':''}
                    db.execute('DELETE FROM revision_summaries WHERE revision_id=? AND baseline_id=?', (row['id'],baseline))
                else:
                    activity = {**dict(activity),'sections':json.loads(activity['sections'])}
                summaries = dict(db.execute('SELECT language,summary FROM revision_summaries WHERE revision_id=? AND baseline_id=?', (row['id'],baseline)))
                result.append({**dict(row), 'baseline':baseline, **{key:activity[key] for key in ('sections','description')},
                               'summaries':summaries, 'summary':summaries.get(language,'')})
        return {'revisions': result,
                'next': rows[99]['id'] if len(rows) > 100 else None}

    def summary_context(self, ids, language='en'):
        if not isinstance(ids, list) or len(ids)>100 or any(type(value) is not int for value in ids):
            raise ValueError('历史记录编号无效。')
        visible = {row['id']:row for row in self.list(max(ids)+1 if ids else None, language)['revisions']}
        items = []
        with closing(self.connect()) as db:
            for revision in ids:
                row = visible.get(revision)
                if not row or not row['baseline'] or row['summary']:
                    continue
                data = db.execute('SELECT details FROM revision_activity WHERE revision_id=? AND baseline_id=?', (revision,row['baseline'])).fetchone()
                if not data['details']: continue
                items.append({'id':revision,'file':row['file'],'baseline':row['baseline'],'sections':row['sections'],'diff':data['details']})
                # ponytail: summarize at most 12 displayed versions per request; later batches reuse this cache.
                if len(items)>=12:
                    break
        return items

    def save_summaries(self, items, summaries, language='en'):
        language = summary_language(language)
        expected = {item['id']:item['baseline'] for item in items}
        if not isinstance(summaries, list) or any(not isinstance(row,dict) or type(row.get('id')) is not int or row['id'] not in expected or not isinstance(row.get('summary'),str) or not 1<=len(row['summary'].strip())<=160 for row in summaries):
            raise ValueError('AI 改动摘要格式无效。')
        if len({row['id'] for row in summaries}) != len(summaries) or {row['id'] for row in summaries} != set(expected):
            raise ValueError('AI 改动摘要缺少记录或包含重复记录。')
        with closing(self.connect()) as db, db:
            for row in summaries:
                db.execute('INSERT INTO revision_summaries(revision_id,baseline_id,language,summary) VALUES (?,?,?,?) ON CONFLICT(revision_id,baseline_id,language) DO UPDATE SET summary=excluded.summary',
                           (row['id'],expected[row['id']],language,row['summary'].strip()))

    def get(self, revision):
        if type(revision) is not int or revision < 1:
            raise ValueError('历史版本编号无效。')
        with closing(self.connect()) as db:
            row = db.execute('SELECT id, file, created, kind, label, source FROM revisions WHERE id=?', (revision,)).fetchone()
            notes = db.execute('SELECT items,reply FROM revision_annotations WHERE revision_id=?', (revision,)).fetchone()
        if row is None:
            raise ValueError('这个项目中没有该历史版本。')
        return {**dict(row), 'source': zlib.decompress(row['source']).decode('utf-8'),
                'annotations':json.loads(zlib.decompress(notes['items'])) if notes else [], 'annotation_reply':notes['reply'] if notes else ''}

    def label(self, revision, label):
        self.get(revision)
        if not isinstance(label, str) or len(label) > 120:
            raise ValueError('版本名称最多 120 个字符。')
        with closing(self.connect()) as db, db:
            db.execute('UPDATE revisions SET label=? WHERE id=?', (label.strip(), revision))

    def previous(self, revision):
        selected = self.get(revision)
        with closing(self.connect()) as db:
            note = db.execute('SELECT baseline_id FROM revision_annotations WHERE revision_id=?', (revision,)).fetchone()
            row = note or db.execute(VISIBLE_REVISIONS + 'SELECT id FROM visible WHERE file=? AND id<? ORDER BY id DESC LIMIT 1',
                                    (selected['file'], revision)).fetchone()
        return self.get(row[0]) if row else None


def difference(before, after):
    return list(difflib.unified_diff(before.splitlines(keepends=True), after.splitlines(keepends=True),
                                     fromfile='所选版本', tofile='对比版本', n=3))


def describe_revision(before, after, markdown=False):
    def headings(source):
        # ponytail: literal entry-file headings determine numbering; custom counters/includes need compiled metadata.
        found, counts = [(0,'正文' if markdown else '导言区')], [0,0,0,0]
        fence = None
        commands = {'chapter':0,'section':1,'subsection':2,'subsubsection':3}
        for line, text in enumerate(source.splitlines()):
            if markdown:
                marker = re.match(r'^ {0,3}(`{3,}|~{3,})', text)
                if marker:
                    if fence is None: fence = marker[1]
                    elif marker[1][0] == fence[0] and len(marker[1]) >= len(fence): fence = None
                    continue
                if fence: continue
                heading = re.match(r'^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$', text)
                if heading: found.append((line,heading[1][:100]))
                continue
            text = re.split(r'(?<!\\)%',text,1)[0]
            if r'\begin{document}' in text: found.append((line,'正文'))
            if r'\begin{abstract}' in text: found.append((line,'摘要'))
            match = re.search(r'\\(chapter|section|subsection|subsubsection)(\*)?(?:\[[^]]*\])?\s*\{',text)
            if not match: continue
            level = commands[match[1]]
            title, depth = '', 1
            for char in text[match.end():]:
                if char == '{': depth+=1
                if char == '}': depth-=1
                if not depth: break
                title+=char
            title = re.sub(r'\\[A-Za-z]+\*?', '', title).replace('{','').replace('}','').strip()
            if not match[2]:
                counts[level]+=1; counts[level+1:]=[0]*(3-level)
            number = '.'.join(str(count) for count in counts[:level+1] if count) if not match[2] else ''
            found.append((line, (number+' '+title).strip()[:100]))
        return found
    old, new = before.splitlines(), after.splitlines()
    positions = [headings(before),headings(after)]
    sections, excerpts = [], []
    matcher = difflib.SequenceMatcher(None,old,new,autojunk=len(old)*len(new)>4_000_000)
    for kind,a,b,c,d in matcher.get_opcodes():
        if kind=='equal': continue
        first,last,index = (a,b,0) if kind=='delete' else (c,d,1)
        candidates = [title for line,title in positions[index] if first < line < last]
        candidates.insert(0,next(title for line,title in reversed(positions[index]) if line<=first))
        for title in candidates:
            if title not in sections: sections.append(title)
        excerpts.append('@@ '+candidates[0]+'\n- '+ '\n- '.join(old[a:b])[:700]+'\n+ '+ '\n+ '.join(new[c:d])[:700])
    details = '\n'.join(excerpts)[:2800]
    if not details:
        return {'sections':['检查点' if before==after else '文档格式'],'description':'内容与上一版相同' if before==after else '调整空白或换行','details':''}
    description = '调整文档设置' if sections==['导言区'] else '调整公式与论述' if re.search(r'\$|\\\[|\\begin\{(?:equation|align)',details) else '更新正文'
    return {'sections':sections or ['正文'],'description':description,'details':details}


def word_changes(before, after):
    """Lossless runs: excluding insertions yields before; excluding deletions yields after."""
    runs = []

    def add(kind, text):
        if not text:
            return
        if runs and runs[-1]['kind'] == kind:
            runs[-1]['text'] += text
        else:
            runs.append({'kind': kind, 'text': text})

    def compare(old, new, words=False):
        # ponytail: cap repeated-token quadratic matching; larger blocks use difflib's popularity heuristic.
        matcher = difflib.SequenceMatcher(None, old, new, autojunk=len(old) * len(new) > 4_000_000)
        for kind, a, b, c, d in matcher.get_opcodes():
            if kind == 'equal':
                add('equal', ''.join(new[c:d]))
            elif kind == 'replace' and not words:
                pattern = r'\\[A-Za-z@]+\*?|\\[^\r\n]|[\u3400-\u9fff]|[^\W_]+|[ \t]+|\r\n|[\s\S]'
                compare(re.findall(pattern, ''.join(old[a:b])), re.findall(pattern, ''.join(new[c:d])), True)
            else:
                add('delete', ''.join(old[a:b]))
                add('insert', ''.join(new[c:d]))

    compare(before.splitlines(keepends=True), after.splitlines(keepends=True))
    return runs
