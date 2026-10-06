"""Read compiled contents entries without evaluating TeX or changing the document."""
import re
from pathlib import Path


def groups(text, start, count):
    values = []
    for _ in range(count):
        while start < len(text) and text[start].isspace():
            start += 1
        if start >= len(text) or text[start] != '{':
            break
        depth, begin = 1, start + 1
        start += 1
        while start < len(text) and depth:
            if text[start] == '\\':
                start += 2
                continue
            if text[start] == '{':
                depth += 1
            elif text[start] == '}':
                depth -= 1
            start += 1
        if depth:
            break
        values.append(text[begin:start - 1])
    return values


def plain_title(text):
    # Common formatting is transparent; auxiliary commands are never executed.
    text = re.sub(r'\\(?:protect|ignorespaces|relax)\b\s*', '', text)
    text = re.sub(r'\\(?:label|index)\s*\{[^{}]*\}', '', text)
    text = re.sub(r'\\([%&#_$])', r'\1', text)
    text = re.sub(r'\\[a-zA-Z@]+\s*', '', text)
    return re.sub(r'\s+', ' ', text.translate(str.maketrans({'{': '', '}': '', '~': ' ', '$': ''}))).strip()


def compiled_outline(aux):
    """Keep include order, actual numbering and printed page labels from the build."""
    root = Path(aux).resolve().parent
    seen, entries = set(), []
    levels = {'part': 0, 'chapter': 1, 'section': 2, 'subsection': 3, 'subsubsection': 4}

    def read(path):
        try:
            path = path.resolve()
            if path in seen or not path.is_relative_to(root) or not path.is_file():
                return
            seen.add(path)
            text = path.read_text(encoding='utf-8', errors='replace')
        except OSError:
            # Optional navigation must not invalidate an otherwise successful build.
            return
        for match in re.finditer(r'\\(@input|@writefile)\s*', text):
            args = groups(text, match.end(), 1 if match[1] == '@input' else 2)
            if match[1] == '@input':
                if args:
                    read(path.parent / args[0])
                continue
            if len(args) != 2 or args[0] != 'toc':
                continue
            contents = re.search(r'\\contentsline\s*', args[1])
            if not contents:
                continue
            fields = groups(args[1], contents.end(), 4)
            if len(fields) < 3 or fields[0] not in levels:
                continue
            kind, title, page = fields[:3]
            number = ''
            numbered = re.match(r'\s*\\numberline\s*', title)
            if numbered:
                value = groups(title, numbered.end(), 1)
                if value:
                    number = plain_title(value[0])
                    title = title[numbered.end():].lstrip()[len(value[0]) + 2:]
            title = plain_title(title)
            if title:
                entries.append({'kind': kind, 'level': levels[kind], 'number': number,
                                'title': title, 'pageLabel': plain_title(page),
                                'dest': fields[3].strip() if len(fields) > 3 else None})

    read(Path(aux))
    return entries
