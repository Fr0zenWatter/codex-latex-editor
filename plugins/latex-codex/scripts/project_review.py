"""Persistent review baselines for externally written project TeX sources."""
from contextlib import closing
import difflib
import hashlib
import sqlite3
import zlib

from history import word_changes


def normalized(source):
    return source.replace('\r\n', '\n')


def review_hunks(before, after):
    old, new = before.splitlines(keepends=True), after.splitlines(keepends=True)
    old_offsets, new_offsets = [0], [0]
    for line in old:
        old_offsets.append(old_offsets[-1] + len(line))
    for line in new:
        new_offsets.append(new_offsets[-1] + len(line))
    hunks = []
    for kind, a, b, c, d in difflib.SequenceMatcher(None, old, new).get_opcodes():
        if kind == 'equal':
            continue
        previous, proposed = ''.join(old[a:b]), ''.join(new[c:d])
        hunks.append({'id': len(hunks) + 1, 'old_start': old_offsets[a], 'old_end': old_offsets[b],
                      'start': new_offsets[c], 'end': new_offsets[d], 'line': c + 1,
                      'before': previous, 'after': proposed, 'changes': word_changes(previous, proposed)})
    return hunks


class ProjectReview:
    def __init__(self, root):
        self.root = root
        self.database = root / '.latex-codex' / 'history.sqlite3'
        with closing(self.connect()) as db, db:
            db.execute('CREATE TABLE IF NOT EXISTS project_review_baselines (file TEXT PRIMARY KEY, source BLOB NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS project_review_state (name TEXT PRIMARY KEY, value TEXT NOT NULL)')

    def connect(self):
        return sqlite3.connect(self.database, timeout=10)

    @staticmethod
    def put(db, file, source):
        db.execute('INSERT INTO project_review_baselines VALUES (?, ?) ON CONFLICT(file) DO UPDATE SET source=excluded.source',
                   (file, zlib.compress(source.encode('utf-8'))))

    def initialize(self, sources):
        # Enabling starts from the current files. Restarting retains unresolved reviews.
        with closing(self.connect()) as db, db:
            if db.execute("SELECT 1 FROM project_review_state WHERE name='initialized'").fetchone():
                return
            for file, source in sources.items():
                self.put(db, file, normalized(source))
            db.execute("INSERT INTO project_review_state VALUES ('initialized', 'yes')")

    def baseline(self, file):
        with closing(self.connect()) as db:
            row = db.execute('SELECT source FROM project_review_baselines WHERE file=?', (file,)).fetchone()
        return zlib.decompress(row[0]).decode('utf-8') if row else None

    def approve(self, file, source):
        with closing(self.connect()) as db, db:
            self.put(db, file, source)

    def saved(self, file, before, after):
        before, after = normalized(before), normalized(after)
        baseline = self.baseline(file)
        if baseline is None:
            return
        if baseline == before:
            self.approve(file, after)
            return
        # Keep unrelated manual edits out of an external review. Edits touching a
        # pending change stay in that change, so no unconfirmed text is accepted.
        prior_lines, base_lines = before.splitlines(keepends=True), baseline.splitlines(keepends=True)
        prior_offsets, base_offsets = [0], [0]
        for line in prior_lines:
            prior_offsets.append(prior_offsets[-1] + len(line))
        for line in base_lines:
            base_offsets.append(base_offsets[-1] + len(line))
        equal = [(prior_offsets[a], prior_offsets[b], base_offsets[c])
                 for kind, a, b, c, _ in difflib.SequenceMatcher(None, prior_lines, base_lines).get_opcodes()
                 if kind == 'equal']
        edits = []
        for hunk in review_hunks(before, after):
            a, b = hunk['old_start'], hunk['old_end']
            mappings = [(x + a - u, x + b - u) for u, v, x in equal
                        if u <= a <= b <= v and (a != b or u < a < v or a == 0 == u or a == len(before) == v)]
            if len(mappings) == 1:
                start, end = mappings[0]
                edits.append((start, end, hunk['after']))
        for start, end, text in sorted(edits, reverse=True):
            baseline = baseline[:start] + text + baseline[end:]
        self.approve(file, baseline)

    def file_review(self, file, state):
        after = normalized(state['source'])
        before = self.baseline(file)
        if before is None:
            before = ''
            self.approve(file, before)
        hunks = review_hunks(before, after)
        signature = hashlib.sha256((before + '\0' + state['version']).encode('utf-8')).hexdigest()
        return {'name': file, 'path': state['path'], 'version': state['version'], 'signature': signature,
                'source': after, 'hunks': hunks}

    def resolve(self, file, state, signature, identifier, action):
        after = normalized(state['source'])
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            stored = db.execute('SELECT source FROM project_review_baselines WHERE file=?', (file,)).fetchone()
            before = zlib.decompress(stored[0]).decode('utf-8') if stored else ''
            current = hashlib.sha256((before + '\0' + state['version']).encode('utf-8')).hexdigest()
            if signature != current:
                raise ValueError('项目修改已变化，请刷新校对后重试。')
            hunk = next((item for item in review_hunks(before, after) if item['id'] == identifier), None)
            if not hunk or action not in ('keep', 'undo'):
                raise ValueError('请选择有效的项目修改及 Keep / Undo。')
            if action == 'keep':
                self.put(db, file, before[:hunk['old_start']] + hunk['after'] + before[hunk['old_end']:])
                return None
            return after[:hunk['start']] + hunk['before'] + after[hunk['end']:]
