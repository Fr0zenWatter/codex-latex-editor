CodeMirror 5.65.20 (MIT), obtained from:
https://registry.npmjs.org/codemirror/-/codemirror-5.65.20.tgz

Included: lib/codemirror.{js,css}, theme/{cobalt,dracula,monokai,nord}.css,
mode/stex/stex.js, keymap/vim.js, addon/runmode/runmode.node.js (test-only),
addon/search/searchcursor.js, addon/edit/matchbrackets.js, addon/comment/comment.js,
addon/dialog/dialog.{js,css}, addon/hint/show-hint.{js,css}, LICENSE.
The show-hint files use the same 5.65.20 release from jsDelivr's npm mirror.
These assets are served locally; no CDN or build step is required.

PDF.js 6.3.289 (Apache-2.0) is bundled under `pdfjs/`, from
https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.3.289.tgz
The archive was verified against the npm registry's SHA-512 integrity value.
Included: build/pdf.mjs, build/pdf.worker.mjs, web/pdf_viewer.{mjs,css},
web/images, cmaps, standard_fonts, wasm, iccs, LICENSE and package.json.
The API, worker, viewer and supporting resources must be updated together.

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
