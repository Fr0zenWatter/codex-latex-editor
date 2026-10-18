"""Disposable LaTeX proofread source; never save the marked text to a document."""
import re

from chat import revision_segments


def emphasize_changes(other, text, side='Before', identifier=1, *, prefix=''):
    changed, offset = [], 0
    for part, kind in revision_segments(other, text, prefix=prefix, safe=True):
        if kind:
            changed.append((offset, offset + len(part)))
        offset += len(part)
    parts, offset, change = [], 0, 0
    for part, kind in revision_segments('', text, prefix=prefix, safe=True):
        if not kind:
            parts.append(part)
            offset += len(part)
            continue
        # Each marked span stays within one word/atom, so it cannot cross pages.
        tokens = re.findall(r'\s+|[\u3400-\u9fff]|[^\W_]+(?:[’\x27-][^\W_]+)*|[\s\S]', part) if kind == 'color' else [part]
        for token in tokens:
            end = offset + len(token)
            while change < len(changed) and changed[change][1] <= offset:
                change += 1
            strong = change < len(changed) and changed[change][0] < end
            tag = f'LC{side}{"Changed" if strong else ""}{identifier}'
            marked = r'\LatexCodexProofreadLiteral{/' + tag + ' BMC}' + token + r'\LatexCodexProofreadLiteral{EMC}'
            if kind != 'color':
                marked = '{' + marked + '}'
                if kind in ('mathbin', 'mathrel', 'mathopen', 'mathclose'):
                    marked = '\\' + kind + marked
            parts.append(token if token.isspace() else marked)
            offset = end
    return ''.join(parts)


def document_start(source):
    # Keep offsets while ignoring commented-out document declarations.
    visible = re.sub(r'(?<!\\)(?:\\\\)*%[^\n]*', lambda match: ' ' * len(match[0]), source)
    return re.search(r'\\begin\s*\{document\}', visible)


def proofread_source(source, items, body_start=0, *, decorate=True):
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
                or (start == end and not (displayed_before or after))):
            raise ValueError('校对选区已变化、重叠或位于导言区。')
        ids.add(identifier)
        prefix = source[cursor:start]
        parts.append(prefix); line += prefix.count('\n')
        first = line
        if decorate:
            # Whole selections remain structurally intact, including complete math environments.
            # The trailing comment/newline also prevents a source comment swallowing the closing group.
            # Only the disposable preview gains paragraphs. Math and restricted boxes
            # (e.g. table cells) must keep their existing inline layout.
            opening = r'\LatexCodexProofreadOpen '
            closing = r'\LatexCodexProofreadClose'
            context = source[:start]
            marked = ('{\\color{black}' + opening + emphasize_changes(after, displayed_before, 'Before', identifier, prefix=context) + '%\n' + closing + '}') if displayed_before else ''
            if after:
                separator = r'\ifmmode\allowbreak\hspace{0.5em}\else\ifinner\hspace{0.5em}\fi\fi'
                marked += (separator if marked else '') + '{\\color{black}' + opening + emphasize_changes(displayed_before, after, 'After', identifier, prefix=context) + '%\n' + closing + '}'
        else:
            marked = after
        parts.append(marked); line += marked.count('\n')
        ranges.append({'id':identifier, 'first':first, 'last':line})
        cursor = end
    parts.append(source[cursor:])
    return ''.join(parts), ranges


def color_preamble(source):
    start = document_start(source)
    if not start:
        raise ValueError('PDF 校对需要含有 document 环境的 LaTeX 主文件。')
    literal = (r'\protected\def\LatexCodexProofreadLiteral#1{'
               r'\ifdefined\pdfliteral\pdfliteral direct{#1}'
               r'\else\ifdefined\pdfextension\pdfextension literal direct{#1}'
               r'\else\special{pdf:literal direct #1}\fi\fi}')
    # Keep literal paragraph tokens out of non-long command arguments.
    literal += (r'\protected\def\LatexCodexProofreadOpen{\ifmmode\else\ifinner\else\par\smallskip\noindent\fi\fi}'
                r'\protected\def\LatexCodexProofreadClose{\ifmmode\else\ifinner\else\par\fi\fi}')
    return source[:start.start()] + '\\RequirePackage{xcolor}' + literal + '\n' + source[start.start():]
