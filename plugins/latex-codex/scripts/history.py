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
        with closing(self.connect()) as db:
            rows = db.execute(VISIBLE_REVISIONS + '''SELECT id, created, kind, label FROM visible
                WHERE position=1 AND (? IS NULL OR id<?) ORDER BY id DESC LIMIT 101''',
                              (self.file, before, before)).fetchall()
        return {'revisions': [dict(row) for row in rows[:100]],
                'next': rows[99]['id'] if len(rows) > 100 else None}

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
