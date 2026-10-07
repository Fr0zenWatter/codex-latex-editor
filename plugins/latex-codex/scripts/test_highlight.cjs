// Run: node test_highlight.cjs (stdlib + bundled CodeMirror, no browser).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const CodeMirror = {};
const relocatedRequire = Object.assign(() => CodeMirror, {resolve: name => name, cache: {}});
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'vendor/runmode.node.js'), 'utf8'),
  {exports: CodeMirror, module: {exports: CodeMirror}, require: relocatedRequire});
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'vendor/stex.js'), 'utf8'), {CodeMirror});
function tokens(text, state) {
  const result = [];
  CodeMirror.runMode(text, 'text/x-stex', (text, style) => result.push([text, style || null]), {state});
  return result;
}
function has(result, text, style) {
  assert(result.some(token => token[0].trim() === text.trim() && token[1] === style), JSON.stringify({text, style, result}));
}
const sample = tokens('$$ x + \\alpha = 2 $$ prose \\cite{key} \\ref{sec}');
for (const text of ['$$', 'x', '\\alpha']) has(sample, text, 'math');
for (const text of ['+', '=']) has(sample, text, 'operator');
for (const text of ['\\cite', 'key', '\\ref', 'sec']) has(sample, text, 'reference');
has(sample, '2', 'number');
has(sample, 'prose', null);
for (const pair of [['$', '$'], ['$$', '$$'], ['\\(', '\\)'], ['\\[', '\\]'],
  ['\\begin{equation}', '\\end{equation}'], ['\\begin{align*}', '\\end{align*}']]) {
  const result = tokens(pair[0] + '\nx_i + y = 2\n' + pair[1] + ' prose');
  has(result, 'x', 'math'); has(result, '_', 'operator'); has(result, '+', 'operator');
  has(result, 'prose', null);
}
const nested = tokens('\\begin{equation}\\begin{aligned}x&=y\\end{aligned}+z\\end{equation} prose');
has(nested, 'z', 'math'); has(nested, 'prose', null);
has(tokens('$x\\\\y$'), '\\\\', 'operator');
const escaped = tokens('\\$50 % $ not math');
has(escaped, '\\$', 'tag'); has(escaped, '% $ not math', 'comment');
const textMath = tokens('$x+\\text{cost \\$5}+y+\\eqref{eq:test}$');
has(textMath, 'cost ', null); has(textMath, 'y', 'math'); has(textMath, '{eq:test}', 'reference');
has(tokens('$\\text{cost % ignored }\nrest}+y$'), 'y', 'math');
const mode = CodeMirror.getMode({}, 'text/x-stex'), state = CodeMirror.startState(mode);
tokens('$\\text{first', state);
const copy = CodeMirror.copyState(mode, state);
assert.deepEqual(tokens('next}+x$', state), tokens('next}+x$', copy));
console.log('PASS: math delimiters/letters/operators, references, environments, escapes, text, copied multiline state');
for (const name of ['xml','markdown','overlay','gfm','multiplex','latex-markdown']) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'vendor',name+'.js'), 'utf8'), {CodeMirror});
}
function markdownTokens(text) {
  const result=[];
  CodeMirror.runMode(text,'text/x-obsidian-md',(text,style)=>result.push([text,style||'']));
  return result;
}
for (const text of ['$x+\\alpha$', '$$\nx+\\alpha\n$$', '\\(x+\\alpha\\)', '\\[\nx+\\alpha\n\\]']) {
  const result=markdownTokens('# Notes\n\n'+text+'\nprose');
  assert(result.some(([word,style])=>word==='x'&&style.includes('latex-math')),JSON.stringify(result));
  assert(result.some(([word,style])=>word.includes('prose')&&!style.includes('latex-math')));
}
for (const text of ['`$x$`','```tex\n$x$\n```','~~~tex\n$$x$$\n~~~','\\$50']) {
  assert(markdownTokens(text).every(([,style])=>!style.includes('latex-math')),text);
}
assert(markdownTokens('$unclosed\nordinary prose').some(([word,style])=>word.includes('ordinary')&&!style.includes('latex-math')));
console.log('PASS: Markdown math highlighting, bracket delimiters, code isolation, escapes and unclosed inline math');
