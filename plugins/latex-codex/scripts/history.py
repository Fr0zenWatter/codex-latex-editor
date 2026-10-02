"""Local, append-only source snapshots; SQLite and compressed text need no packages."""
from contextlib import closing
from datetime import datetime, timezone
import difflib
import hashlib
import json
import re
import sqlite3
import zlib


# Keep immutable backups; show the last automatic save in each five-minute window.
VISIBLE_REVISIONS = """WITH checkpoints AS (
    SELECT id, created, kind, label, SUM(CASE WHEN kind NOT IN ('save', 'external') OR label!=''
        THEN 1 ELSE 0 END) OVER (ORDER BY id) AS checkpoint
    FROM revisions WHERE file=?), visible AS (
    SELECT id, created, kind, label, ROW_NUMBER() OVER (
        PARTITION BY checkpoint, CASE WHEN kind IN ('save', 'external') AND label=''
            THEN CAST(strftime('%s', created) AS INTEGER)/300 ELSE -id END
        ORDER BY id DESC) AS position
    FROM checkpoints) """


class History:
    def __init__(self, path):
        self.file = path.name
        self.database = path.parent / '.latex-codex' / 'history.sqlite3'
        self.database.parent.mkdir(exist_ok=True)
        with closing(self.connect()) as db, db:
            db.execute('''CREATE TABLE IF NOT EXISTS revisions (
                id INTEGER PRIMARY KEY, file TEXT NOT NULL, created TEXT NOT NULL,
                kind TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',
                digest TEXT NOT NULL, source BLOB NOT NULL)''')
            db.execute('CREATE INDEX IF NOT EXISTS file_revisions ON revisions(file, id)')
            db.execute("CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL, file TEXT NOT NULL DEFAULT '', selection TEXT NOT NULL DEFAULT '')")
            db.execute("CREATE TABLE IF NOT EXISTS revision_activity (revision_id INTEGER NOT NULL, baseline_id INTEGER NOT NULL, sections TEXT NOT NULL, details TEXT NOT NULL, description TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', PRIMARY KEY(revision_id,baseline_id))")

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
        raw = source.encode('utf-8')
        digest = hashlib.sha256(raw).hexdigest()
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            previous = db.execute('SELECT id, digest FROM revisions WHERE file=? ORDER BY id DESC LIMIT 1', (self.file,)).fetchone()
            if previous and previous['digest'] == digest and not force:
                return previous['id']
            return db.execute('INSERT INTO revisions(file, created, kind, digest, source) VALUES (?, ?, ?, ?, ?)',
                              (self.file, datetime.now(timezone.utc).isoformat(), kind,
                               digest, zlib.compress(raw))).lastrowid

    def list(self, before=None):
        if before is not None and (type(before) is not int or before < 1):
            raise ValueError('历史记录游标无效。')
        with closing(self.connect()) as db, db:
            rows = db.execute(VISIBLE_REVISIONS + '''SELECT id, created, kind, label FROM visible
                WHERE position=1 AND (? IS NULL OR id<?) ORDER BY id DESC LIMIT 101''',
                              (self.file, before, before)).fetchall()
            result = []
            for index, row in enumerate(rows[:100]):
                baseline = rows[index+1]['id'] if index+1 < len(rows) else 0
                activity = db.execute('SELECT sections,description,summary,details FROM revision_activity WHERE revision_id=? AND baseline_id=?', (row['id'],baseline)).fetchone()
                if activity is None or baseline and not activity['details'] and activity['description'] not in ('调整空白或换行','内容与上一版相同'):
                    source = self.get(row['id'])['source']
                    data = describe_revision(self.get(baseline)['source'] if baseline else '', source) if baseline else {'sections':['文档初始版本'],'description':'首次保存的版本','details':''}
                    db.execute('INSERT INTO revision_activity(revision_id,baseline_id,sections,details,description) VALUES (?,?,?,?,?) ON CONFLICT(revision_id,baseline_id) DO UPDATE SET sections=excluded.sections,details=excluded.details,description=excluded.description,summary=\'\'',
                               (row['id'],baseline,json.dumps(data['sections'],ensure_ascii=False),data['details'],data['description']))
                    activity = {**data,'summary':''}
                else:
                    activity = {**dict(activity),'sections':json.loads(activity['sections'])}
                result.append({**dict(row), 'baseline':baseline, **{key:activity[key] for key in ('sections','description','summary')}})
        return {'revisions': result,
                'next': rows[99]['id'] if len(rows) > 100 else None}

    def summary_context(self, ids):
        if not isinstance(ids, list) or len(ids)>100 or any(type(value) is not int for value in ids):
            raise ValueError('历史记录编号无效。')
        visible = {row['id']:row for row in self.list(max(ids)+1 if ids else None)['revisions']}
        items = []
        with closing(self.connect()) as db:
            for revision in ids:
                row = visible.get(revision)
                if not row or not row['baseline'] or row['summary']:
                    continue
                data = db.execute('SELECT details FROM revision_activity WHERE revision_id=? AND baseline_id=?', (revision,row['baseline'])).fetchone()
                if not data['details']: continue
                items.append({'id':revision,'baseline':row['baseline'],'sections':row['sections'],'diff':data['details']})
                # ponytail: summarize at most 12 displayed versions per request; later batches reuse this cache.
                if len(items)>=12:
                    break
        return items

    def save_summaries(self, items, summaries):
        expected = {item['id']:item['baseline'] for item in items}
        if not isinstance(summaries, list) or any(not isinstance(row,dict) or type(row.get('id')) is not int or row['id'] not in expected or not isinstance(row.get('summary'),str) or not 1<=len(row['summary'].strip())<=160 for row in summaries):
            raise ValueError('AI 改动摘要格式无效。')
        if len({row['id'] for row in summaries}) != len(summaries) or {row['id'] for row in summaries} != set(expected):
            raise ValueError('AI 改动摘要缺少记录或包含重复记录。')
        with closing(self.connect()) as db, db:
            for row in summaries:
                db.execute('UPDATE revision_activity SET summary=? WHERE revision_id=? AND baseline_id=?',
                           (row['summary'].strip(),row['id'],expected[row['id']]))

    def get(self, revision):
        if type(revision) is not int or revision < 1:
            raise ValueError('历史版本编号无效。')
        with closing(self.connect()) as db:
            row = db.execute('SELECT id, created, kind, label, source FROM revisions WHERE file=? AND id=?',
                             (self.file, revision)).fetchone()
        if row is None:
            raise ValueError('这个文件中没有该历史版本。')
        return {**dict(row), 'source': zlib.decompress(row['source']).decode('utf-8')}

    def label(self, revision, label):
        self.get(revision)
        if not isinstance(label, str) or len(label) > 120:
            raise ValueError('版本名称最多 120 个字符。')
        with closing(self.connect()) as db, db:
            db.execute('UPDATE revisions SET label=? WHERE file=? AND id=?', (label.strip(), self.file, revision))

    def previous(self, revision):
        self.get(revision)
        with closing(self.connect()) as db:
            row = db.execute(VISIBLE_REVISIONS + 'SELECT id FROM visible WHERE position=1 AND id<? ORDER BY id DESC LIMIT 1',
                             (self.file, revision)).fetchone()
        return self.get(row['id']) if row else None


def difference(before, after):
    return list(difflib.unified_diff(before.splitlines(keepends=True), after.splitlines(keepends=True),
                                     fromfile='所选版本', tofile='对比版本', n=3))


def describe_revision(before, after):
    def headings(source):
        # ponytail: literal entry-file headings determine numbering; custom counters/includes need compiled metadata.
        found, counts = [(0,'导言区')], [0,0,0,0]
        commands = {'chapter':0,'section':1,'subsection':2,'subsubsection':3}
        for line, text in enumerate(source.splitlines()):
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
