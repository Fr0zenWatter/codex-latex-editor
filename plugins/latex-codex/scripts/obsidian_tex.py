"""Convert an Obsidian Markdown note into a LaTeX document that is line-aligned with the note.

Adapted from the user's Claude LaTeX Sidecar version (latex-sidecar 16.22.00).

Line N of the generated .tex corresponds to line N of the note: the whole preamble sits on line 1
in front of the note's first line, and every construct is converted without adding or removing
lines. SyncTeX positions, compile-error lines and history diffs therefore map one-to-one between
the PDF and the Markdown source.

python obsidian_tex.py note.md [-o note.tex]   prints/writes the generated LaTeX (for debugging).
"""
from functools import lru_cache
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

IMAGE_TYPES = {'.png', '.jpg', '.jpeg', '.pdf'}
UNSUPPORTED_IMAGES = {'.svg', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.avif', '.heic'}
NOTE_SUFFIXES = ('.md', '.markdown')

# Obsidian built-in callout families plus the custom theorem-style types used in the vaults.
CALLOUTS = {
    'note': ('obsblue', 'Note'), 'info': ('obsblue', 'Info'), 'todo': ('obsblue', 'Todo'),
    'abstract': ('obscyan', 'Abstract'), 'summary': ('obscyan', 'Summary'), 'tldr': ('obscyan', 'TL;DR'),
    'tip': ('obscyan', 'Tip'), 'hint': ('obscyan', 'Hint'), 'important': ('obscyan', 'Important'),
    'success': ('obsgreen', 'Success'), 'check': ('obsgreen', 'Check'), 'done': ('obsgreen', 'Done'),
    'question': ('obsorange', 'Question'), 'help': ('obsorange', 'Help'), 'faq': ('obsorange', 'FAQ'),
    'warning': ('obsorange', 'Warning'), 'caution': ('obsorange', 'Caution'), 'attention': ('obsorange', 'Attention'),
    'failure': ('obsred', 'Failure'), 'fail': ('obsred', 'Fail'), 'missing': ('obsred', 'Missing'),
    'danger': ('obsred', 'Danger'), 'error': ('obsred', 'Error'), 'bug': ('obsred', 'Bug'),
    'example': ('obspurple', 'Example'), 'quote': ('obsgray', 'Quote'), 'cite': ('obsgray', 'Cite'),
    'thm': ('obsindigo', '定理'), 'theorem': ('obsindigo', '定理'), 'lem': ('obsblue', '引理'), 'lemma': ('obsblue', '引理'),
    'def': ('obsgreen', '定义'), 'definition': ('obsgreen', '定义'), 'prop': ('obsindigo', '命题'),
    'cor': ('obscyan', '推论'), 'ex': ('obsorange', '例'), 'exercise': ('obsorange', '例'),
    'proof': ('obsgray', '证明'), 'remark': ('obsgray', '注'), 'rmk': ('obsgray', '注'),
}

COLORS = {'obsblue': '086DDD', 'obscyan': '00A3B8', 'obsgreen': '08A045', 'obsorange': 'E07A00', 'obsred': 'D93636',
          'obspurple': '7852EE', 'obsgray': '6B7280', 'obsindigo': '4F46E5', 'obslink': '7C3AED', 'obshl': 'FFF3A3'}

HEADINGS = {1: 'section', 2: 'subsection', 3: 'subsubsection', 4: 'paragraph', 5: 'subparagraph', 6: 'subparagraph'}

# MathJax accepts these; LaTeX needs definitions (\providecommand keeps real ones untouched).
MATH_SHIMS = (r'\providecommand{\lt}{<}\providecommand{\gt}{>}\providecommand{\require}[1]{}'
              r'\providecommand{\bbox}[2][]{#2}\providecommand{\class}[2]{#2}\providecommand{\cssId}[2]{#2}'
              r'\providecommand{\style}[2]{#2}\providecommand{\Rarr}{\Rightarrow}\providecommand{\rArr}{\Rightarrow}'
              r'\providecommand{\Larr}{\Leftarrow}\providecommand{\lArr}{\Leftarrow}\providecommand{\Harr}{\Leftrightarrow}'
              r'\providecommand{\hArr}{\Leftrightarrow}\providecommand{\rarr}{\rightarrow}\providecommand{\larr}{\leftarrow}'
              r'\providecommand{\harr}{\leftrightarrow}\providecommand{\uarr}{\uparrow}\providecommand{\darr}{\downarrow}'
              r'\providecommand{\hdashline}{\hline}\providecommand{\displaylines}[1]{\begin{gathered}#1\end{gathered}}'
              r'\providecommand{\Space}[3]{}\providecommand{\idotsint}{\int\cdots\int}')

DISPLAY_ENVS = ('align', 'align*', 'gather', 'gather*', 'equation', 'equation*', 'multline', 'multline*',
                'flalign', 'flalign*', 'alignat', 'alignat*', 'eqnarray', 'eqnarray*')

FENCE = re.compile(r'^(\s*)(`{3,}|~{3,})\s*([\w+#.-]*)')
HEADING = re.compile(r'^\s{0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$')
RULE = re.compile(r'^\s{0,3}([-*_])(?:\s*\1){2,}\s*$')
LIST_ITEM = re.compile(r'^(\s*)([-*+]|\d{1,9}[.)])(?:(\s+)(.*)|\s*$)')
TABLE_DELIMITER = re.compile(r'^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$')
FOOTNOTE_DEF = re.compile(r'^\[\^([^\]\s]+)\]:\s?(.*)$')
CALLOUT = re.compile(r'^\[!([\w-]+)\]([+-]?)\s*(.*)$')


def is_note(path):
    return Path(path).suffix.lower() in NOTE_SUFFIXES


def find_vault_root(path):
    """The nearest folder holding .obsidian, else the note's own folder."""
    path = Path(path).resolve()
    for folder in (path.parent, *path.parent.parents):
        if (folder / '.obsidian').is_dir():
            return folder
    return path.parent


@lru_cache(maxsize=64)
def kpsewhich(name):
    executable = shutil.which('kpsewhich') or ('/Library/TeX/texbin/kpsewhich' if Path('/Library/TeX/texbin/kpsewhich').is_file() else None)
    if not executable:
        return False
    try:
        # MiKTeX's kpsewhich alias can disagree with XeLaTeX's package search.
        # findtexmf without -must-exist only queries; it never installs packages.
        version = subprocess.run([executable, '--version'], capture_output=True, timeout=10)
        finder = Path(executable).with_name('findtexmf.exe' if os.name == 'nt' else 'findtexmf')
        command = ([str(finder), '-alias=xelatex', name]
                   if b'miktex' in (version.stdout + version.stderr).lower() and finder.is_file()
                   else [executable, '-no-mktex=tex', name])
        result = subprocess.run(command, capture_output=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0 and Path(result.stdout.decode('utf-8', errors='replace').strip()).is_file()


# Text symbols Latin Modern lacks; math equivalents render everywhere. Emoji variation selectors are dropped.
SYMBOLS = {'⇒': r'$\Rightarrow$', '⇐': r'$\Leftarrow$', '⇔': r'$\Leftrightarrow$', '→': r'$\to$', '←': r'$\leftarrow$',
           '↔': r'$\leftrightarrow$', '⟹': r'$\Longrightarrow$', '⟸': r'$\Longleftarrow$', '⟺': r'$\Longleftrightarrow$',
           '↦': r'$\mapsto$', '✓': r'$\checkmark$', '✔': r'$\checkmark$', '✗': r'$\times$', '✘': r'$\times$',
           '⚠': r'\textbf{(!)}', '★': r'$\bigstar$', '☆': r'$\star$', '∞': r'$\infty$', '≈': r'$\approx$',
           '≠': r'$\neq$', '≤': r'$\leq$', '≥': r'$\geq$', '∈': r'$\in$', '∀': r'$\forall$', '∃': r'$\exists$',
           '\ufe0f': '', '\u200b': ''}


def escape_text(text):
    replacements = {'\\': r'\textbackslash{}', '{': r'\{', '}': r'\}', '#': r'\#', '$': r'\$', '%': r'\%',
                    '&': r'\&', '_': r'\_', '~': r'\textasciitilde{}', '^': r'\textasciicircum{}',
                    '"': r'\textquotedbl{}', "'": r'\textquotesingle{}', **SYMBOLS}
    return ''.join(replacements.get(char, char) for char in text)


def expand_tabs(line):
    return line.expandtabs(4)


def indent_of(line):
    return len(expand_tabs(line)) - len(expand_tabs(line).lstrip(' '))


def strip_columns(line, count):
    """Remove up to `count` columns of leading whitespace."""
    line = expand_tabs(line)
    removable = min(count, indent_of(line))
    return line[removable:]


class Converter:
    def __init__(self, note_path, vault_root=None, assets_dir=None, has_package=kpsewhich):
        self.note_path = Path(note_path)
        self.vault_root = Path(vault_root) if vault_root else find_vault_root(self.note_path)
        self.assets_dir = Path(assets_dir) if assets_dir else None
        self.has_package = has_package
        self.packages, self.libraries, self.footnotes, self.warnings = [], [], {}, []
        self.dependencies = set()
        self.tikz = False
        self._image_index = None

    # ---------- files ----------
    def image_index(self):
        if self._image_index is None:
            index = {}
            for folder, directories, files in os.walk(self.vault_root):
                directories[:] = [d for d in directories if not d.startswith('.') and d != 'node_modules']
                for name in files:
                    candidate = (Path(folder) / name).resolve()
                    if candidate.is_relative_to(self.vault_root.resolve()):
                        index.setdefault(name.lower(), []).append(candidate)
            self._image_index = index
        return self._image_index

    def resolve_file(self, target):
        from urllib.parse import unquote, urlsplit
        target = unquote(target.strip())
        link = urlsplit(target)
        if not target or link.scheme or link.netloc or '\\' in target or '\0' in target or Path(target).is_absolute():
            return None
        for candidate in (self.note_path.parent / target, self.vault_root / target):
            candidate = candidate.resolve()
            if candidate.is_relative_to(self.vault_root.resolve()) and candidate.is_file():
                return candidate
        if '/' not in target:
            matches = self.image_index().get(target.lower(), [])
            if len(matches) == 1:
                return matches[0]
        return None

    def asset(self, path):
        """Copy an image under an ASCII name next to the build so TeX never sees spaces or CJK paths."""
        if not self.assets_dir:
            return path.as_posix()
        self.assets_dir.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha1(str(path).encode('utf-8')).hexdigest()[:16]
        target = self.assets_dir / (digest + path.suffix.lower())
        try:
            stat = path.stat()
            if not target.is_file() or target.stat().st_mtime < stat.st_mtime or target.stat().st_size != stat.st_size:
                shutil.copy2(path, target)
        except OSError:
            return None
        return target.as_posix()

    def image(self, target, size=''):
        path = self.resolve_file(target)
        name = escape_text(Path(target).name)
        if path is None:
            self.warnings.append(f'未找到图片: {target}')
            return r'\obsmissing{' + name + '}'
        if path.suffix.lower() not in IMAGE_TYPES:
            self.warnings.append(f'PDF 不支持此图片格式: {target}')
            return r'\obsmissing{' + name + '}'
        if path.stat().st_size > 24 * 1024 * 1024:
            self.warnings.append(f'图片超过 24 MiB: {target}')
            return r'\obsmissing{' + name + '}'
        self.dependencies.add(path.resolve())
        file = self.asset(path)
        if file is None:
            return r'\obsmissing{' + name + '}'
        width = re.match(r'^\s*(\d+)(?:\s*x\s*(\d+))?\s*$', size or '')
        option = f'width={int(width[1]) * 0.75:.0f}pt,' if width else ''
        return r'\obsimage{' + option + '}{' + file + '}'

    # ---------- inline ----------
    def inline(self, text):
        """Convert one line (or a fragment) of Markdown prose to LaTeX."""
        protected = []

        def keep(value):
            protected.append(value)
            return f'\x00{len(protected) - 1}\x00'

        text = re.sub(r'<!--.*?-->', '', text)
        # An escaped dollar never opens math; other Markdown escapes are handled after math is protected,
        # because inside formulas \| \! \> \{ are TeX, not Markdown escapes.
        text = re.sub(r'\\\$', lambda m: keep(r'\$'), text)
        text = re.sub(r'`([^`\n]+)`', lambda m: keep(r'\texttt{' + escape_text(m[1]) + '}'), text)

        def display(match):
            body = match[1].strip()
            environment = re.match(r'\\begin\{([a-zA-Z]+\*?)\}', body)
            if environment and environment[1] in DISPLAY_ENVS:
                return keep(body)
            return keep(r'\[' + body + r'\]')
        text = re.sub(r'\$\$(.+?)\$\$', display, text)
        text = re.sub(r'\\\[(.+?)\\\]', display, text)
        text = re.sub(r'\\\((.+?)\\\)', lambda m: keep('$' + m[1] + '$'), text)
        text = re.sub(r'(?<![\\$])\$(?!\s*\$)((?:\\.|[^$\\])+?)\$(?!\$)', lambda m: keep('$' + m[1] + '$'), text)
        text = re.sub(r'\\([\\`*_{}\[\]()#+\-.!|~=<>%&^])', lambda m: keep(escape_text(m[1])), text)
        text = re.sub(r'\[\^([^\]\s]+)\]', lambda m: keep(self.footnote(m[1])), text)
        text = re.sub(r'!\[\[([^\]|#^]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]', lambda m: keep(self.embed(m[1], m[2] or '')), text)
        text = re.sub(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', lambda m: keep(r'\obslink{' + self.inline_plain(m[2] or self.link_label(m[1])) + '}'), text)
        text = re.sub(r'!\[([^\]]*)\]\(<?([^)>\s]+)>?(?:\s+"[^"]*")?\)', lambda m: keep(self.markdown_image(m[1], m[2])), text)
        text = re.sub(r'(?<!!)\[([^\]]+)\]\(<?([^)>\s]+)>?(?:\s+"[^"]*")?\)',
                      lambda m: keep(r'\href{' + self.url(m[2]) + '}{' + self.inline(m[1]) + '}'), text)
        text = re.sub(r'<(https?://[^>\s]+)>', lambda m: keep(r'\url{' + self.url(m[1]) + '}'), text)
        text = re.sub(r'(?<![(\w"\'])(https?://[^\s<>)\]]+[^\s<>)\].,;:!?])', lambda m: keep(r'\url{' + self.url(m[1]) + '}'), text)
        text = re.sub(r'<br\s*/?>', lambda m: keep(r'\newline{}'), text, flags=re.I)
        text = re.sub(r'</?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?/?>', '', text)
        text = re.sub(r'\s\^[A-Za-z0-9-]+\s*$', '', text)  # block ids
        text = re.sub(r'(?:(?<=\s)|^)#([A-Za-z_\u4e00-\u9fff][\w/\-\u4e00-\u9fff]*)', lambda m: keep(r'\obstag{' + escape_text(m[1]) + '}'), text)

        def markup(value):
            patterns = [
                (r'\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*', r'\textbf{\emph{', '}}'),
                (r'\*\*(?=\S)(.+?)(?<=\S)\*\*', r'\textbf{', '}'),
                (r'(?<![\w\\])__(?=\S)(.+?)(?<=\S)__(?!\w)', r'\textbf{', '}'),
                (r'~~(?=\S)(.+?)(?<=\S)~~', r'\sout{', '}'),
                (r'==(?=\S)(.+?)(?<=\S)==', r'\obshl{', '}'),
                (r'(?<![*\\])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?!\*)', r'\emph{', '}'),
                (r'(?<![\w\\])_(?=[^\s_])(.+?)(?<=[^\s_])_(?!\w)', r'\emph{', '}'),
            ]
            best = None
            for pattern, before, after in patterns:
                match = re.search(pattern, value)
                if match and (best is None or match.start() < best[0].start()):
                    best = (match, before, after)
            if not best:
                return escape_text(value)
            match, before, after = best
            return escape_text(value[:match.start()]) + before + markup(match[1]) + after + markup(value[match.end():])

        result = markup(text)
        while '\x00' in result:
            result = re.sub(r'\x00(\d+)\x00', lambda m: protected[int(m[1])], result)
        return result

    def inline_plain(self, text):
        return escape_text(text)

    def link_label(self, target):
        target = target.strip()
        page, _, heading = target.partition('#')
        page = Path(page).name if page else ''
        if heading:
            heading = heading.lstrip('^')
            return f'{page} > {heading}' if page else heading
        return page

    def url(self, value):
        return value.replace('\\', '/').replace('%', r'\%').replace('#', r'\#').replace('{', '').replace('}', '')

    def embed(self, target, size):
        suffix = Path(target).suffix.lower()
        if suffix in IMAGE_TYPES or suffix in UNSUPPORTED_IMAGES:
            return self.image(target, size)
        return r'\obsembed{' + escape_text(self.link_label(target)) + '}'

    def markdown_image(self, alt, source):
        if re.match(r'^[a-z]+://', source):
            return r'\obsmissing{' + escape_text(alt or source) + '}'
        from urllib.parse import unquote
        return self.image(unquote(source))

    def footnote(self, key):
        body = self.footnotes.get(key)
        if body is None:
            return r'\textsuperscript{[' + escape_text(key) + ']}'
        return r'\footnote{' + self.inline(body) + '}'

    # ---------- blocks ----------
    def block_start(self, line):
        stripped = line.strip()
        return (not stripped or bool(FENCE.match(line)) or stripped.startswith(('$$', r'\[')) or bool(HEADING.match(line))
                or bool(RULE.match(line)) or stripped.startswith('>') or bool(LIST_ITEM.match(line))
                or stripped.startswith('|') or bool(FOOTNOTE_DEF.match(stripped)))

    def convert(self, lines):
        """Convert a list of Markdown lines to the same number of LaTeX lines."""
        out, index, count = [], 0, len(lines)
        while index < count:
            line = lines[index]
            stripped = line.strip()
            if not stripped:
                out.append('')
                index += 1
                continue
            fence = FENCE.match(line)
            if fence:
                end = index + 1
                while end < count and not re.match(r'^\s*' + re.escape(fence[2][0]) + '{' + str(len(fence[2])) + r',}\s*$', lines[end]):
                    end += 1
                out.extend(self.fenced(fence[3].lower(), lines[index + 1:end], closed=end < count))
                index = min(end, count - 1) + 1
                continue
            if stripped.startswith(('$$', r'\[')):
                closing = '$$' if stripped.startswith('$$') else r'\]'
                end = index
                rest = stripped[2:]
                if closing not in rest:
                    end = index + 1
                    while end < count and closing not in lines[end]:
                        end += 1
                if end >= count:
                    end = count - 1
                out.extend(self.display_math(lines[index:end + 1], closing))
                index = end + 1
                continue
            heading = HEADING.match(line)
            if heading and heading[2] is not None:
                out.append(self.heading(len(heading[1]), heading[2]))
                index += 1
                continue
            if RULE.match(line):
                out.append(r'\obsrule')
                index += 1
                continue
            if stripped.startswith('>'):
                end = index
                while end < count and lines[end].strip().startswith('>'):
                    end += 1
                out.extend(self.quote(lines[index:end]))
                index = end
                continue
            if '|' in stripped and index + 1 < count and TABLE_DELIMITER.match(lines[index + 1]) and '-' in lines[index + 1]:
                end = index + 2
                while end < count and '|' in lines[end] and lines[end].strip():
                    end += 1
                out.extend(self.table(lines[index:end]))
                index = end
                continue
            if LIST_ITEM.match(line):
                end = self.list_end(lines, index)
                out.extend(self.list_block(lines[index:end]))
                index = end
                continue
            if FOOTNOTE_DEF.match(stripped):
                out.append('')
                index += 1
                continue
            # Setext headings: a paragraph line underlined with === or ---.
            if index + 1 < count and re.match(r'^\s{0,3}(=+|-+)\s*$', lines[index + 1]) and not self.block_start(line):
                level = 1 if lines[index + 1].strip().startswith('=') else 2
                out.extend([self.heading(level, stripped), ''])
                index += 2
                continue
            converted = self.inline(stripped)
            following = lines[index + 1] if index + 1 < count else ''
            # Obsidian shows single newlines as line breaks (strict line breaks off by default).
            if following.strip() and not self.block_start(following) and converted.strip() and not converted.rstrip().endswith((r'\]', r'\\')):
                converted += r'\\'
            out.append(converted)
            index += 1
        assert len(out) == count, (len(out), count)
        return out

    def heading(self, level, text):
        command = HEADINGS[level]
        text = self.inline(text.strip())
        return '\\' + command + '{' + text + '}'

    def fenced(self, language, body, closed):
        """Fence open line, body lines and (if present) the closing fence line."""
        lines = []
        if language == 'tikz':
            self.tikz = True
            lines.append(r'\begin{obstikz}')
            for row in body:
                command = row.strip()
                package = re.match(r'^\\usepackage(?:\[[^\]]*\])?\{([^}]*)\}\s*$', command)
                library = re.match(r'^\\usetikzlibrary\{([^}]*)\}\s*$', command)
                if package:
                    for name in package[1].split(','):
                        name = name.strip()
                        if name and name not in self.packages and self.has_package(name + '.sty'):
                            self.packages.append(name)
                    lines.append('')
                elif library:
                    for name in library[1].split(','):
                        if name.strip() and name.strip() not in self.libraries:
                            self.libraries.append(name.strip())
                    lines.append('')
                elif re.match(r'^\\(begin|end)\{document\}\s*$', command):
                    lines.append('')
                else:
                    lines.append(row)
            if closed:
                lines.append(r'\end{obstikz}')
            else:
                lines[-1] += r'\end{obstikz}'
            return lines
        if language in ('dataview', 'dataviewjs', 'query', 'button', 'tasks', 'mermaid', 'chart'):
            lines.append(r'\obsplaceholder{' + escape_text(language) + '}')
            lines.extend('' for _ in body)
            if closed:
                lines.append('')
            return lines
        if language in ('math', 'latex-math'):
            lines.append(r'\[')
            lines.extend(row if row.strip() else '%' for row in body)
            if closed:
                lines.append(r'\]')
            else:
                lines[-1] += r'\]'
            return lines
        lines.append(r'\begin{obscode}')
        lines.extend(r'\obscl{' + escape_text(expand_tabs(row)).replace(' ', '~') + '}' for row in body)
        if closed:
            lines.append(r'\end{obscode}')
        else:
            lines[-1] += r'\end{obscode}'
        return lines

    def display_math(self, block, delimiter='$$'):
        first = block[0].strip()[2:]
        if len(block) == 1:
            body, _, after = first.partition(delimiter)
            inner = [body]
        else:
            last = block[-1]
            closing = last.find(delimiter)
            if closing < 0:  # unclosed at the end of the note
                closing = len(last)
            after = last[closing + 2:]
            inner = [first] + block[1:-1] + [last[:closing]]
        text = '\n'.join(inner).strip()
        environment = re.match(r'\\begin\{([a-zA-Z]+\*?)\}', text)
        bare = bool(environment and environment[1] in DISPLAY_ENVS and text.rstrip().endswith(r'\end{' + environment[1] + '}'))
        # Blank lines would end the paragraph inside math; keep the line as a TeX comment.
        rows = [row if row.strip() or position in (0, len(inner) - 1) else '%' for position, row in enumerate(inner)]
        if not bare:
            rows[0] = r'\[' + rows[0]
            rows[-1] = rows[-1] + r'\]'
        if after.strip():
            rows[-1] += ' ' + self.inline(after.strip())
        return rows

    def quote(self, block):
        inner = [re.sub(r'^\s*>\s?', '', row, count=1) for row in block]
        header = CALLOUT.match(inner[0].strip())
        if header:
            kind = header[1].lower()
            color, default = CALLOUTS.get(kind, ('obsblue', kind.capitalize()))
            title = self.inline(header[3].strip()) if header[3].strip() else escape_text(default)
            body = self.convert(inner[1:]) if len(inner) > 1 else []
            begin = r'\begin{obscallout}{' + color + '}{' + title + '}'
            rows = [begin] + body
            rows[-1] += r'\end{obscallout}'
            return rows
        rows = self.convert(inner)
        rows[0] = r'\begin{obsquote}' + rows[0]
        rows[-1] += r'\end{obsquote}'
        return rows

    def table(self, block):
        def cells(row):
            row = row.strip()
            if row.startswith('|'):
                row = row[1:]
            if row.endswith('|') and not row.endswith(r'\|'):
                row = row[:-1]
            parts, current, math, index = [], '', False, 0
            while index < len(row):
                char = row[index]
                if char == '\\' and index + 1 < len(row):
                    current += row[index:index + 2] if row[index + 1] != '|' else ('\\|' if math else '|')
                    index += 2
                    continue
                if char == '$':
                    math = not math
                if char == '|' and not math:
                    parts.append(current)
                    current = ''
                else:
                    current += char
                index += 1
            parts.append(current)
            return [part.strip() for part in parts]

        header = cells(block[0])
        aligns = []
        for spec in cells(block[1]):
            spec = spec.strip()
            aligns.append('c' if spec.startswith(':') and spec.endswith(':') else 'r' if spec.endswith(':') else 'l')
        columns = max(len(header), len(aligns))
        aligns += ['l'] * (columns - len(aligns))
        spec = '|' + '|'.join(aligns) + '|'

        def row(values):
            values = (values + [''] * columns)[:columns]
            return ' & '.join(self.inline(value) for value in values) + r' \\ \hline'

        rows = [r'\begin{obstable}{' + spec + r'}\hline ' + r'\rowcolor{black!5}' + row(header), '']
        rows.extend(row(cells(line)) for line in block[2:])
        rows[-1] += r'\end{obstable}'
        return rows

    def list_end(self, lines, start):
        base = indent_of(lines[start])
        index = start + 1
        while index < len(lines):
            line = lines[index]
            if not line.strip():
                ahead = index + 1
                while ahead < len(lines) and not lines[ahead].strip():
                    ahead += 1
                if ahead < len(lines) and (indent_of(lines[ahead]) > base or (LIST_ITEM.match(lines[ahead]) and indent_of(lines[ahead]) >= base)):
                    index = ahead
                    continue
                return index
            if LIST_ITEM.match(line) and indent_of(line) >= base:
                index += 1
                continue
            if indent_of(line) > base:
                index += 1
                continue
            if lines[index - 1].strip() and not self.block_start(line):
                index += 1  # lazy continuation
                continue
            return index
        return index

    def list_block(self, block):
        base = indent_of(block[0])
        items, current = [], None
        for row in block:
            match = LIST_ITEM.match(row)
            if match and indent_of(row) <= base + 1 and (current is None or indent_of(row) < current['content']):
                marker = match[2]
                spacing = len(match[3] or ' ')
                text = match[4] or ''
                content = indent_of(row) + len(marker) + (spacing if spacing <= 4 else 1)
                task = re.match(r'^\[([ xX])\]\s?(.*)$', text)
                current = {'ordered': marker[0].isdigit(), 'start': int(marker[:-1]) if marker[0].isdigit() else 1,
                           'delimiter': marker[-1] if marker[0].isdigit() else '', 'content': content,
                           'task': task[1].lower() if task else None, 'lines': [task[2] if task else text]}
                items.append(current)
            else:
                current['lines'].append(strip_columns(row, current['content']) if row.strip() else '')
        out, previous = [], None
        for position, item in enumerate(items):
            rows = self.convert(item['lines'])
            label = ''
            if item['task'] is not None:
                label = r'[$\boxtimes$]' if item['task'] == 'x' else r'[$\square$]'
            rows[0] = r'\item' + label + ' ' + rows[0]
            kind = 'enumerate' if item['ordered'] else 'itemize'
            if previous != kind:
                if previous:
                    out[-1] += r'\end{' + previous + '}'
                options = ''
                if kind == 'enumerate':
                    options = '[label=\\arabic*' + item['delimiter'] + (f',start={item["start"]}' if item['start'] != 1 else '') + ']'
                rows[0] = r'\begin{' + kind + '}' + options + rows[0]
                previous = kind
            out.extend(rows)
        out[-1] += r'\end{' + previous + '}'
        return out


def strip_comments(lines):
    """Blank Obsidian %%comments%% outside code fences, keeping line positions."""
    out, inside, fence = [], False, None
    for line in lines:
        match = FENCE.match(re.sub(r'^\s*(>\s?)+', '', line))
        if fence is None and match and not inside:
            fence = match[2][0] * 3
            out.append(line)
            continue
        if fence is not None:
            if re.match(r'^[\s>]*' + re.escape(fence), line):
                fence = None
            out.append(line)
            continue
        result, cursor = '', 0
        while cursor < len(line):
            marker = line.find('%%', cursor)
            if marker < 0:
                if not inside:
                    result += line[cursor:]
                break
            if not inside:
                result += line[cursor:marker]
            inside = not inside
            cursor = marker + 2
        out.append(result if result.strip() or not line.strip() else '')
    return out


def preamble(converter, title):
    has = converter.has_package
    parts = [r'\documentclass[11pt,a4paper]{article}']
    if has('ctex.sty'):
        parts.append(r'\usepackage[UTF8,scheme=plain,heading=false]{ctex}')
    elif has('xeCJK.sty'):
        parts.append(r'\usepackage{xeCJK}')
    parts += [r'\usepackage[margin=2.2cm]{geometry}', r'\usepackage{amsmath,amssymb,mathtools,bm}',
              r'\usepackage[dvipsnames,table]{xcolor}', r'\usepackage{graphicx}',
              r'\usepackage{enumitem}', r'\usepackage{array}']
    if converter.tikz:
        parts.append(r'\usepackage{tikz}')
    styled_boxes = has('tcolorbox.sty') and has('pdfcol.sty')
    if styled_boxes:
        parts.append(r'\usepackage[breakable]{tcolorbox}')
    for optional in ('cancel', 'mathrsfs', 'esint', 'tikz-cd'):
        if has(optional + '.sty'):
            parts.append(r'\usepackage{' + optional + '}')
    sized_images = has('adjustbox.sty') and has('collectbox.sty')
    if sized_images:
        parts.append(r'\usepackage[export]{adjustbox}')
    parts.append(r'\usepackage[normalem]{ulem}' if has('ulem.sty') else r'\providecommand{\sout}[1]{#1}')
    for package in converter.packages:
        if package not in ('tikz', 'amsmath', 'amssymb', 'xcolor', 'graphicx', 'tikz-cd', 'mathrsfs', 'esint', 'cancel'):
            parts.append(r'\usepackage{' + package + '}')
            if package == 'pgfplots':
                parts.append(r'\pgfplotsset{compat=newest}')
    if converter.libraries:
        parts.append(r'\usetikzlibrary{' + ','.join(converter.libraries) + '}')
    parts.append(r'\usepackage[hidelinks]{hyperref}')
    parts += [r'\definecolor{' + name + '}{HTML}{' + value + '}' for name, value in COLORS.items()]
    image = (r'\newcommand{\obsimage}[2]{\includegraphics[#1max width=\linewidth,max height=0.8\textheight,keepaspectratio]{#2}}'
             if sized_images else r'\newcommand{\obsimage}[2]{\includegraphics[width=\linewidth,height=0.8\textheight,keepaspectratio]{#2}}')
    boxes = [
        r'\newenvironment{obscallout}[2]{\begin{quote}\textcolor{#1}{\textbf{#2}}\par}{\end{quote}}',
        r'\newenvironment{obsquote}{\begin{quote}\itshape}{\end{quote}}',
        r'\newenvironment{obscode}{\begin{quote}\ttfamily\small}{\end{quote}}',
    ] if not styled_boxes else [
        r'\newtcolorbox{obscallout}[2]{breakable,colback=#1!5,colbacktitle=#1!12,coltitle=#1!80!black,colframe=#1,'
        r'boxrule=0pt,leftrule=3pt,titlerule=0pt,arc=2pt,outer arc=2pt,fonttitle=\bfseries,title={#2},'
        r'left=8pt,right=8pt,top=4pt,bottom=4pt,before skip=8pt,after skip=8pt}',
        r'\newtcolorbox{obsquote}{breakable,colback=white,colframe=black!25,boxrule=0pt,leftrule=2.5pt,arc=0pt,'
        r'left=8pt,right=4pt,top=2pt,bottom=2pt,fontupper=\itshape}',
        r'\newtcolorbox{obscode}{breakable,colback=black!4,colframe=black!12,boxrule=0.4pt,arc=2pt,'
        r'left=6pt,right=6pt,top=4pt,bottom=4pt,fontupper=\ttfamily\small}',
    ]
    parts += boxes + [
        r'\setcounter{secnumdepth}{0}', r'\setlength{\parindent}{0pt}', r'\setlength{\parskip}{0.5em plus 0.2em}',
        r'\setlist{nosep,leftmargin=1.6em}', r'\setlength{\emergencystretch}{3em}', r'\linespread{1.15}',
        r'\newenvironment{obstikz}{\par\begin{center}}{\end{center}\par}',
        r'\newenvironment{obstable}[1]{\par\begin{center}\small\begin{tabular}{#1}}{\end{tabular}\end{center}\par}',
        r'\newcommand{\obscl}[1]{\leavevmode\mbox{}#1\par}',
        r'\newcommand{\obslink}[1]{\textcolor{obslink}{#1}}', r'\newcommand{\obstag}[1]{\textcolor{obslink}{\##1}}',
        r'\newcommand{\obshl}[1]{\colorbox{obshl}{#1}}',
        r'\newcommand{\obsrule}{\par\noindent\textcolor{black!20}{\rule{\linewidth}{0.6pt}}\par}',
        r'\newcommand{\obsembed}[1]{\fbox{\small 嵌入: #1}}', r'\newcommand{\obsmissing}[1]{\fbox{\small 图片: #1}}',
        r'\newcommand{\obsplaceholder}[1]{\fbox{\small #1 (仅在 Obsidian 中渲染)}}',
        image, MATH_SHIMS,
    ]
    head = r'\begin{document}'
    if title:
        head += r'{\LARGE\bfseries ' + escape_text(title) + r'\par}\vspace{0.6em}'
    return ''.join(parts) + head


def convert(source, note_path, vault_root=None, assets_dir=None, has_package=kpsewhich, dependencies=None):
    """Return (latex, warnings). Line N of the LaTeX is line N of the note."""
    lines = source.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    converter = Converter(note_path, vault_root, assets_dir, has_package)
    out = [''] * len(lines)
    start = 0
    if lines and lines[0].strip() == '---':
        for index in range(1, min(len(lines), 400)):
            if lines[index].strip() in ('---', '...'):
                start = index + 1
                break
    body = strip_comments(lines[start:])
    for raw in body:
        match = FOOTNOTE_DEF.match(raw.strip())
        if match:
            converter.footnotes[match[1]] = match[2]
    out[start:] = converter.convert(body)
    first_content = next((row for row in body if row.strip()), '')
    title = None if re.match(r'^\s{0,3}#\s', first_content) else Path(note_path).stem
    out[0] = preamble(converter, title) + out[0]
    out.append(r'\end{document}')
    if dependencies is not None:
        dependencies.update(converter.dependencies)
    return '\n'.join(out) + '\n', converter.warnings


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('note', type=Path)
    parser.add_argument('-o', '--output', type=Path)
    args = parser.parse_args()
    latex, warnings = convert(args.note.read_text(encoding='utf-8'), args.note.resolve(),
                              assets_dir=(args.output.parent / 'obs-assets') if args.output else None)
    if args.output:
        args.output.write_text(latex, encoding='utf-8')
    else:
        sys.stdout.write(latex)
    for warning in warnings:
        print(warning, file=sys.stderr)
