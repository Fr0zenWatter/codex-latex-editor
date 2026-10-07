"""Local, append-only source snapshots; SQLite and compressed text need no packages."""
from contextlib import closing
from pathlib import Path
from datetime import datetime, timezone
import difflib
import hashlib
import json
import re
import sqlite3
import zlib


SUMMARY_LANGUAGES = {'en':'English', 'zh-CN':'Simplified Chinese', 'zh-TW':'Traditional Chinese', 'ja':'Japanese',
                     'fr':'French', 'de':'German', 'es':'Spanish'}


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
            db.execute('''CREATE TABLE IF NOT EXISTS revisions (
                id INTEGER PRIMARY KEY, file TEXT NOT NULL, created TEXT NOT NULL,
                kind TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',
                digest TEXT NOT NULL, source BLOB NOT NULL)''')
            db.execute('CREATE INDEX IF NOT EXISTS file_revisions ON revisions(file, id)')
            db.execute("CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL, file TEXT NOT NULL DEFAULT '', selection TEXT NOT NULL DEFAULT '')")
            db.execute("CREATE TABLE IF NOT EXISTS revision_activity (revision_id INTEGER NOT NULL, baseline_id INTEGER NOT NULL, sections TEXT NOT NULL, details TEXT NOT NULL, description TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', PRIMARY KEY(revision_id,baseline_id))")
            db.execute('CREATE TABLE IF NOT EXISTS revision_summaries (revision_id INTEGER NOT NULL, baseline_id INTEGER NOT NULL, language TEXT NOT NULL, summary TEXT NOT NULL, PRIMARY KEY(revision_id,baseline_id,language))')
            db.execute('CREATE TABLE IF NOT EXISTS revision_annotations (revision_id INTEGER PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, baseline_id INTEGER NOT NULL, count INTEGER NOT NULL, items BLOB NOT NULL, reply TEXT NOT NULL)')
            # Earlier versions always generated Simplified Chinese summaries.
            db.execute("INSERT OR IGNORE INTO revision_summaries SELECT revision_id,baseline_id,'zh-CN',summary FROM revision_activity WHERE summary!=''")

    def connect(self):
        db = sqlite3.connect(self.database, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def chat_read(self):
        with closing(self.connect()) as db:
            revision = db.execute('SELECT COALESCE(MAX(id),0) FROM chat_messages').fetchone()[0]
            boundary = db.execute("SELECT COALESCE(MAX(id),0) FROM chat_messages WHERE role='boundary'").fetchone()[0]
            rows = db.execute('SELECT role, content, file, selection FROM chat_messages WHERE id>? ORDER BY id DESC LIMIT 41', (boundary,)).fetchall()
        return {'revision': revision, 'messages': [dict(row) for row in reversed(rows[:40])],
                'truncated': len(rows)>40, 'project': str(self.database.parent.parent)}

    def chat_append(self, revision, question, answer, file, selection):
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT COALESCE(MAX(id),0) FROM chat_messages').fetchone()[0] != revision:
                raise ValueError('项目对话已更新，请重新打开对话后重试。')
            db.execute('INSERT INTO chat_messages(role,content,file,selection) VALUES (?,?,?,?)', ('user',question,file,selection))
            return db.execute('INSERT INTO chat_messages(role,content) VALUES (?,?)',
                              ('assistant',json.dumps(answer,ensure_ascii=False))).lastrowid

    def chat_new(self):
        # Archive the preceding conversation without deleting its stored messages.
        with closing(self.connect()) as db, db:
            db.execute("INSERT INTO chat_messages(role,content) VALUES ('boundary','')")
        return self.chat_read()

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
