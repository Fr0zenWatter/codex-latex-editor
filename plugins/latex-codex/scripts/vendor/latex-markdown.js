// Obsidian Markdown for CodeMirror 5: Markdown outside math, LaTeX (stex math mode) inside $...$ and $$...$$.
// Obsidian comments use %%...%%, so comment toggling wraps lines in %% instead of HTML comments.
(function (CodeMirror) {
  CodeMirror.defineMode('obsidian-md', function (config) {
    const markdown = CodeMirror.getMode(config, {
      name: 'markdown', highlightFormatting: true, fencedCodeBlockHighlighting: false, strikethrough: true, taskLists: true,
    });
    markdown.blockCommentStart = '%%';
    markdown.blockCommentEnd = '%%';
    markdown.lineComment = null;
    const math = () => CodeMirror.getMode(config, {name: 'stex', inMathMode: true});
    const mode = CodeMirror.multiplexingMode(markdown,
      {open: '$$', close: '$$', mode: math(), delimStyle: 'keyword', innerStyle: 'latex-math', parseDelimiters: false},
      {open: '$', close: '$', mode: math(), delimStyle: 'keyword', innerStyle: 'latex-math', parseDelimiters: false},
      {open: '\\[', close: '\\]', mode: math(), delimStyle: 'keyword', innerStyle: 'latex-math', parseDelimiters: false},
      {open: '\\(', close: '\\)', mode: math(), delimStyle: 'keyword', innerStyle: 'latex-math', parseDelimiters: false});
    const token = mode.token;
    mode.token = function (stream, state) {
      if (stream.sol() && state.innerActive && ['$', '\\('].includes(state.innerActive.open)) {
        state.innerActive = state.inner = null;
      }
      if (!state.innerActive && (state.outer.code || state.outer.fencedEndRE || stream.match(/^\\[$\\]/, false))) {
        return markdown.token(stream, state.outer);
      }
      if (state.innerActive && stream.match(/^\\[$\\]/, false)) {
        return (state.innerActive.mode.token(stream, state.inner) || '') + ' latex-math';
      }
      return token.call(this, stream, state);
    };
    mode.blockCommentStart = '%%';
    mode.blockCommentEnd = '%%';
    return mode;
  });
  CodeMirror.defineMIME('text/x-obsidian-md', 'obsidian-md');
})(CodeMirror);
