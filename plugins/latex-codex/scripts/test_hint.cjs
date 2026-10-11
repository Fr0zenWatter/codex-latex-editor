// Run: node test_hint.cjs (stdlib only).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let hint;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'vendor/latex-hint.js'), 'utf8'), {
  CodeMirror: {registerHelper: (_type, _name, fn) => hint = fn, Pos: (line, ch) => ({line, ch})},
});
function complete(text, source = '', type = '') {
  const ch = text.indexOf('|'), line = text.replace('|', '');
  return hint({getCursor: () => ({line: 0, ch}), getLine: () => line,
    getValue: () => source + '\n' + line, getTokenTypeAt: () => type});
}
function apply(text, result, name) {
  const item = result.list.find(item => (item.text || item) === name || item.displayText === name);
  assert(item, name);
  const line = text.replace('|', '');
  return line.slice(0, result.from.ch) + (item.text || item) + line.slice(result.to.ch);
}
function expand(text, name, options = {}) {
  const before = text.slice(0, text.indexOf('|')).split('\n');
  let value = text.replace('|', ''), cursor = {line: before.length - 1, ch: before.at(-1).length};
  const offset = pos => value.split('\n').slice(0, pos.line).reduce((n, line) => n + line.length + 1, 0)
    + Math.min(pos.ch, value.split('\n')[pos.line].length);
  const cm = {getValue: () => value, getCursor: () => cursor, getLine: n => value.split('\n')[n],
    getTokenTypeAt: () => '', lastLine: () => value.split('\n').length - 1,
    getRange: (from, to) => value.slice(offset(from), offset(to)),
    getOption: key => ({indentUnit: 2, indentWithTabs: false, ...options})[key],
    replaceRange: (text, from, to) => { value = value.slice(0, offset(from)) + text + value.slice(offset(to)); },
    setCursor: pos => cursor = pos};
  const data = hint(cm), item = data.list.find(item => (item.text || item) === name || item.displayText === name);
  assert(item, name);
  if (item.hint) item.hint(cm, data, item);
  else cm.replaceRange(item.text || item, data.from, data.to);
  return {text: value, cursor};
}
assert(complete('\\|').list.includes('\\begin'));
assert(complete('\\fr|').list.some(item => item.text === '\\frac' && item.displayText === '\\frac{}{}'));
for (const name of ['frac', 'dfrac', 'tfrac', 'binom', 'overset', 'href', 'textcolor']) {
  const result = expand(`x \\${name}| + y`, '\\' + name);
  assert.equal(result.text, `x \\${name}{}{} + y`);
  assert.equal(result.cursor.line, 0);
  assert.equal(result.cursor.ch, 2 + name.length + 2, 'Cursor belongs inside the first argument.');
}
for (const name of ['sqrt', 'textbf', 'mathcal', 'section', 'label', 'cite', 'includegraphics']) {
  assert.equal(expand(`\\${name}|`, '\\' + name).text, `\\${name}{}`);
}
assert.equal(expand('\\fr|', '\\frac').text, '\\frac{}{}');
assert.equal(expand('\\fr|ac{a}{b}', '\\frac').text, '\\frac{a}{b}');
assert.equal(expand('\\fr|  {a}{b}', '\\frac').text, '\\frac  {a}{b}');
assert.equal(expand('\\fr|\n{a}{b}', '\\frac').text, '\\frac\n{a}{b}');
assert.equal(expand('\\sq|[3]{x}', '\\sqrt').text, '\\sqrt[3]{x}');
assert.equal(expand('\\sq| x', '\\sqrt').text, '\\sqrt{} x');
assert.equal(expand('\\al|', '\\alpha').text, '\\alpha');
assert.equal(expand('\\my|\n\\newcommand{\\myOperator}{x}', '\\myOperator').text,
  '\\myOperator\n\\newcommand{\\myOperator}{x}', 'Unknown macros must not get guessed arguments.');
assert.equal(apply('x \\fr|ac{a}{b}', complete('x \\fr|ac{a}{b}'), '\\frac'), 'x \\frac{a}{b}');
assert.equal(apply('\\begin{|', complete('\\begin{|'), 'equation'), '\\begin{equation}');
assert.equal(apply('\\begin{eq|uation}', complete('\\begin{eq|uation}'), 'equation'), '\\begin{equation}');
assert.equal(apply('\\end{ali|}', complete('\\end{ali|}'), 'align*'), '\\end{align*}');
assert(complete('\\my|', '\\newcommand{\\myOperator}{x}').list.includes('\\myOperator'));
assert(complete('\\begin{ass|', '\\newtheorem{assumption}{Assumption}').list.some(item => item.displayText === 'assumption'));
assert(complete('\\begin{cus|', '\\newenvironment{customenv}{}{}').list.some(item => item.displayText === 'customenv'));
assert.equal(complete('% \\fr|', '', 'comment'), null);
assert.equal(complete('\\\\|'), null);
assert.equal(complete('\\\\alpha|'), null);
assert(complete('\\\\\\al|').list.includes('\\alpha'));
assert.equal(complete('ordinary text|'), null);
let block = expand('  \\begin{ali|}', 'align*');
assert.equal(block.text, '  \\begin{align*}\n    \n  \\end{align*}');
assert.equal(block.cursor.line, 1); assert.equal(block.cursor.ch, 4);
assert.equal(expand('\\begin{|', 'equation').text, '\\begin{equation}\n  \n\\end{equation}');
assert.equal(expand('\\begin{eq|}\\label{test}', 'equation').text,
  '\\begin{equation}\\label{test}\n  \n\\end{equation}');
assert.equal(expand('\\begin{eq|uation}\nx=y\n\\end{equation}', 'equation').text,
  '\\begin{equation}\nx=y\n\\end{equation}');
assert.equal(expand('\\begin{align}\n  \\begin{ali|}\n\\end{align}', 'align').text,
  '\\begin{align}\n  \\begin{align}\n    \n  \\end{align}\n\\end{align}');
assert.equal(expand('\\begin{ali|}\n% \\end{align}', 'align').text,
  '\\begin{align}\n  \n\\end{align}\n% \\end{align}');
assert.equal(expand('\\end{ali|}', 'align').text, '\\end{align}');
assert.equal(expand('\t\\begin{cus|}\n\\newenvironment{customenv}{}{}', 'customenv', {indentWithTabs: true}).text,
  '\t\\begin{customenv}\n\t\t\n\t\\end{customenv}\n\\newenvironment{customenv}{}{}');
console.log('PASS: hints, command argument templates and cursor, preserved arguments, paired/star/custom environments, indentation, nested/existing ends and comments');
