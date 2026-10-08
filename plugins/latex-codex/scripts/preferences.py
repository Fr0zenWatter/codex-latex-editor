"""User-owned editor preferences, shared across documents and loopback ports."""
from contextlib import closing
from pathlib import Path
import sqlite3


PREFERENCE_KEYS = frozenset('latex-codex-' + name for name in (
    'language', 'revision-color', 'outline-style', 'theme', 'custom-themes',
    'editor-mode', 'source-font-size', 'chat-color', 'auto-compile', 'pdf-box-auto-comment',
    'proofread-editor', 'proofread-pdf', 'proofread-project', 'writing-style', 'split'))


class Preferences:
    def __init__(self, path=None):
        self.path = Path(path) if path else Path.home() / '.latex-codex' / 'preferences.sqlite3'

    def read(self):
        if not self.path.exists():
            return {}
        with closing(sqlite3.connect(self.path, timeout=10)) as database:
            return dict(database.execute('SELECT name, value FROM preferences'))

    def save(self, changes):
        if not isinstance(changes, dict) or any(
                name not in PREFERENCE_KEYS or not isinstance(value, str) or len(value) > 262144
                for name, value in changes.items()):
            raise ValueError('Invalid editor preferences.')
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path, timeout=10)) as database, database:
            database.execute('CREATE TABLE IF NOT EXISTS preferences (name TEXT PRIMARY KEY, value TEXT NOT NULL)')
            database.executemany('INSERT INTO preferences(name, value) VALUES (?, ?) '
                                 'ON CONFLICT(name) DO UPDATE SET value=excluded.value', changes.items())
        return self.read()
