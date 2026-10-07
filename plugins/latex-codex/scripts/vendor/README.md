CodeMirror 5.65.20 (MIT), obtained from:
https://registry.npmjs.org/codemirror/-/codemirror-5.65.20.tgz

Markdown preview uses Marked 16.4.2 (MIT), from
https://registry.npmjs.org/marked/-/marked-16.4.2.tgz, and DOMPurify 3.3.1
(Apache-2.0 OR MPL-2.0), from https://registry.npmjs.org/dompurify/-/dompurify-3.3.1.tgz.
Both archives were verified against npm SHA-512 integrity metadata. Their original
ES modules and licenses are bundled as marked.mjs / marked.LICENSE.md and
purify.mjs / dompurify.LICENSE. Authored HTML is sanitized before insertion; math
uses the existing local KaTeX bundle. Markdown/GFM/XML modes and overlay.js come
from the same verified CodeMirror 5.65.20 archive. No CDN or runtime install is used.

`multiplex.js` is the CodeMirror 5 multiplex addon (MIT), copied from the
user-supplied LaTeX Sidecar 16.22.00 archive; its upstream copyright notice and
the bundled CodeMirror LICENSE are retained. `latex-markdown.js` adapts that
archive's local Obsidian Markdown/math mode to these CodeMirror assets, adding
math token styles and code/escaped-delimiter isolation. The associated Python
converter is adapted in `../obsidian_tex.py`; it is not a third-party runtime
dependency.

The OpenAI selection-annotation toolbar icon is inlined from Simple Icons
11.15.0 (CC0-1.0):
https://github.com/simple-icons/simple-icons/blob/11.15.0/icons/openai.svg
The license is retained in simple-icons.LICENSE.txt. Its fill uses currentColor
to follow the editor theme; it does not load external assets at runtime.

The history pill tabs and source-file option wheel are locally bundled React islands built from
`../../frontend/` with React, Radix Tabs, Framer Motion and Tailwind CSS.
Exact npm versions and integrity hashes are in the frontend package-lock.json.
The user-supplied PillMorphTabs design is adapted to the existing three views,
white history panel, reduced-motion preference and shared source/PDF pane.
Full third-party notices are in history-tabs.LICENSE.txt; esbuild also emits
history-tabs.mjs.LEGAL.txt. Rebuild with `npm ci` and `npm run build` in frontend.

Included: lib/codemirror.{js,css}, theme/{cobalt,dracula,monokai,nord,eclipse,idea,neo,base16-light,solarized,
material-darker,material-palenight,ayu-dark,gruvbox-dark}.css,
mode/stex/stex.js, keymap/{vim,emacs}.js, addon/runmode/runmode.node.js (test-only),
addon/search/{searchcursor,search}.js, addon/edit/matchbrackets.js, addon/comment/comment.js,
addon/dialog/dialog.{js,css}, addon/hint/show-hint.{js,css}, LICENSE.
The Emacs keymap and search addon come from the same archive, verified against
the npm registry SHA-512 integrity value. The show-hint files use the same 5.65.20 release from jsDelivr's npm mirror.
The nine additional theme CSS files come from the same 5.65.20 archive,
verified against the npm registry SHA-512 integrity value. Solarized supplies
both light and dark variants. Theme author comments and the MIT LICENSE are
retained. These assets are served locally; no CDN or build step is required.

PDF.js 6.3.289 (Apache-2.0) is bundled under `pdfjs/`, from
https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.3.289.tgz
The archive was verified against the npm registry's SHA-512 integrity value.
Included: build/pdf.mjs, build/pdf.worker.mjs, web/pdf_viewer.{mjs,css},
web/images, cmaps, standard_fonts, wasm, iccs, LICENSE and package.json.
The API, worker, viewer and supporting resources must be updated together.
Local API/worker adapters expose page MediaBox (SyncTeX must not use CropBox)
and opt-in `disableCombineTextItems` glyph extraction for exact text advances.
Default preview/text-layer behavior remains upstream. Preserve these adapters
and run the PDF history/SyncTeX tests when updating. `latex-pdf-analysis.mjs`
assembles glyphs into words and reads metadata in the browser, replacing native
Poppler tools. Node is used only by the maintenance test runner, not at runtime.

KaTeX 0.18.9 (MIT), from https://registry.npmjs.org/katex/-/katex-0.18.9.tgz,
is bundled under katex/ for instant source formula previews. The archive was
verified against the npm SHA-512 integrity value. Included: katex.mjs,
katex.min.css, WOFF2 fonts, LICENSE and package.json. latex-hover.mjs is the
local delimiter scanner and caret-triggered popup; it never saves or compiles the file.

stex.js is locally adapted to distinguish math delimiters/letters, operators,
references and math environments. latex-hint.js is the local command/environment
completion provider. The other upstream assets are unchanged.
The editor's semantic color overrides and brighter comment colors are deliberate
LaTeX adaptations, not exact copies of each original theme.

Palette references:
- https://codemirror.net/5/theme/cobalt.css
- https://codemirror.net/5/theme/dracula.css
- https://codemirror.net/5/theme/monokai.css
- https://codemirror.net/5/theme/nord.css
- https://draculatheme.com/contribute
- https://www.nordtheme.com/docs/colors-and-palettes

Additional palette sources (same CodeMirror 5 release):
- https://codemirror.net/5/theme/eclipse.css
- https://codemirror.net/5/theme/idea.css
- https://codemirror.net/5/theme/neo.css
- https://codemirror.net/5/theme/base16-light.css
- https://codemirror.net/5/theme/solarized.css
- https://codemirror.net/5/theme/material-darker.css
- https://codemirror.net/5/theme/material-palenight.css
- https://codemirror.net/5/theme/ayu-dark.css
- https://codemirror.net/5/theme/gruvbox-dark.css
