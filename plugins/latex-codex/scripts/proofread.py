"""Disposable LaTeX proofread source; never save the marked text to a document."""
import re


def document_start(source):
    # Keep offsets while ignoring commented-out document declarations.
    visible = re.sub(r'(?<!\\)(?:\\\\)*%[^\n]*', lambda match: ' ' * len(match[0]), source)
    return re.search(r'\\begin\s*\{document\}', visible)


def proofread_source(source, items, body_start=0):
    if not isinstance(source, str) or not isinstance(items, list) or not 1 <= len(items) <= 100:
        raise ValueError('校对预览需要源码和 1–100 处建议。')
    if any(not isinstance(item, dict) or type(item.get('start')) is not int for item in items):
        raise ValueError('校对选区无效。')
    cursor, parts, ranges, ids, line = 0, [], [], set(), 1
    for item in sorted(items, key=lambda item: item['start']):
        start, end, identifier = item.get('start'), item.get('end'), item.get('id')
        before, after = item.get('selection'), item.get('replacement')
        displayed_before = item.get('display_original', before)
        if (type(start) is not int or type(end) is not int or type(identifier) is not int
                or identifier < 1 or identifier in ids or not isinstance(before, str) or not isinstance(after, str)
                or not isinstance(displayed_before, str) or len(displayed_before) > 262144
                or not max(cursor, body_start) <= start <= end <= len(source) or source[start:end] != before
                or (start == end and not displayed_before)):
            raise ValueError('校对选区已变化、重叠或位于导言区。')
        ids.add(identifier)
        prefix = source[cursor:start]
        parts.append(prefix); line += prefix.count('\n')
        first = line
        # Whole selections remain structurally intact, including complete math environments.
        # The trailing comment/newline also prevents a source comment swallowing the closing group.
        marked = ('{\\color[rgb]{0.78,0.12,0.16}' + displayed_before + '%\n}') if displayed_before else ''
        if after:
            marked += ('\\allowbreak\\hspace{0.5em}' if marked else '') + '{\\color[rgb]{0.02,0.48,0.20}' + after + '%\n}'
        parts.append(marked); line += marked.count('\n')
        ranges.append({'id':identifier, 'first':first, 'last':line})
        cursor = end
    parts.append(source[cursor:])
    return ''.join(parts), ranges


def color_preamble(source):
    start = document_start(source)
    if not start:
        raise ValueError('PDF 校对需要含有 document 环境的 LaTeX 主文件。')
    return source[:start.start()] + '\\RequirePackage{xcolor}\n' + source[start.start():]
