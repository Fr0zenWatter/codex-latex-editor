"""User-owned editor preferences, shared across documents and loopback ports."""
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import sys


PREFERENCE_KEYS = frozenset('latex-codex-' + name for name in (
    'language', 'revision-color', 'outline-style', 'theme', 'custom-themes',
    'editor-mode', 'source-font-size', 'forward-shortcut', 'chat-color', 'chat-bar-permanent', 'auto-compile', 'pdf-box-auto-comment', 'pdf-invert', 'pdf-paper',
    'proofread-editor', 'proofread-pdf', 'proofread-project', 'writing-style', 'split',
    'inline-completion', 'completion-model', 'completion-effort'))


class Preferences:
    def __init__(self, path=None):
        self.path = Path(path) if path else Path.home() / '.latex-codex' / 'preferences.sqlite3'
        self.legacy_path = None
        local = os.environ.get('LOCALAPPDATA') if sys.platform == 'win32' and not path else None
        if local and Path(local).is_absolute():
            self.legacy_path = self.path
            self.path = Path(local) / 'latex-codex' / 'preferences.sqlite3'

    def read(self):
        path = self.path if self.path.exists() or not self.legacy_path else self.legacy_path
        try:
            if not path.exists():
                return {}
            with closing(sqlite3.connect(path, timeout=10)) as database:
                return dict(database.execute('SELECT name, value FROM preferences'))
        except (PermissionError, sqlite3.OperationalError) as error:
            # An inaccessible legacy location must not block the writable Windows settings directory.
            denied = isinstance(error, PermissionError) or str(error) in (
                'unable to open database file', 'attempt to write a readonly database')
            if path == self.legacy_path and denied:
                return {}
            raise

    def save(self, changes):
        if not isinstance(changes, dict) or any(
                name not in PREFERENCE_KEYS or not isinstance(value, str) or len(value) > 262144
                for name, value in changes.items()):
            raise ValueError('Invalid editor preferences.')
        legacy = self.read() if self.legacy_path and not self.path.exists() else {}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path, timeout=10)) as database, database:
            database.execute('CREATE TABLE IF NOT EXISTS preferences (name TEXT PRIMARY KEY, value TEXT NOT NULL)')
            database.executemany('INSERT OR IGNORE INTO preferences(name, value) VALUES (?, ?)', legacy.items())
            database.executemany('INSERT INTO preferences(name, value) VALUES (?, ?) '
                                 'ON CONFLICT(name) DO UPDATE SET value=excluded.value', changes.items())
        return self.read()
