// Local LaTeX completions for CodeMirror's show-hint addon.
(function(CodeMirror) {
  'use strict';
  const commands = (`begin end documentclass usepackage title author date maketitle abstract
    section subsection subsubsection paragraph chapter part label ref eqref pageref autoref cref Cref cite citep citet nocite
    bibliography bibliographystyle bibitem item text textbf textit textrm texttt emph footnote url href
    includegraphics caption centering input include newcommand renewcommand providecommand newenvironment newtheorem
    frac dfrac tfrac sqrt sum prod int iint iiint oint lim min max inf sup arg det dim ker log ln exp sin cos tan
    alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho
    sigma varsigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega
    mathbb mathcal mathscr mathfrak mathrm mathbf mathsf mathit boldsymbol bm operatorname
    left right big Big bigg Bigg overline underline hat widehat tilde widetilde bar vec dot ddot
    cdot dots ldots cdots vdots ddots times div pm mp leq geq neq approx equiv sim simeq cong propto
    in notin subset subseteq supset supseteq cup cap emptyset forall exists neg land lor
    to mapsto rightarrow leftarrow leftrightarrow Rightarrow Leftarrow Leftrightarrow
    infty partial nabla ell hbar Re Im angle perp parallel lVert rVert langle rangle
    quad qquad hspace vspace textwidth linewidth hfill vfill noindent nonumber notag tag
    color textcolor newpage clearpage pagebreak tableofcontents appendix thanks`).split(/\s+/).filter(Boolean).map(name => '\\' + name);
  const environments = (`equation equation* align align* aligned alignat alignat* gather gather* gathered
    multline multline* split cases matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix smallmatrix array
    itemize enumerate description figure figure* table table* tabular tabular* tabularx longtable
    theorem lemma proposition corollary definition assumption remark proof example
    document abstract center flushleft flushright minipage quote quotation verbatim tikzpicture`).split(/\s+/).filter(Boolean);

  function insertEnvironment(cm, data, item) {
    const name = item.displayText, line = cm.getLine(data.from.line);
    const begin = CodeMirror.Pos(data.from.line, line.slice(0, data.from.ch).lastIndexOf('\\begin'));
    // ponytail: literal environment pairs; macro-generated pairs need a TeX language server.
    const tokens = text => [...text.replace(/(^|[^\\])((?:\\\\)*)%[^\n]*/g, '$1$2')
      .matchAll(/(?<!\\)(?:\\\\)*\\(begin|end)\s*\{([\w*@.-]+)\}/g)]
      .filter(match => match[2] === name).map(match => match[1] === 'begin' ? 1 : -1);
    let depth = Math.max(0, tokens(cm.getRange(CodeMirror.Pos(0, 0), begin)).reduce((sum, delta) => sum + delta, 0));
    const paired = tokens(cm.getRange(data.to, CodeMirror.Pos(cm.lastLine(), Infinity)))
      .some(delta => (depth += delta) < 0);
    if (paired) { cm.replaceRange(item.text, data.from, data.to, 'complete'); return; }
    const indent = line.match(/^[\t ]*/)[0];
    const inner = indent + (cm.getOption('indentWithTabs') ? '\t' : ' '.repeat(cm.getOption('indentUnit')));
    cm.replaceRange(item.text + line.slice(data.to.ch) + '\n' + inner + '\n' + indent + '\\end{' + name + '}',
      data.from, CodeMirror.Pos(data.to.line, line.length), 'complete');
    cm.setCursor(CodeMirror.Pos(data.from.line + 1, inner.length));
  }

  CodeMirror.registerHelper('hint', 'latex', function(cm) {
    const cursor = cm.getCursor(), line = cm.getLine(cursor.line), before = line.slice(0, cursor.ch);
    if ((cm.getTokenTypeAt(cursor) || '').split(' ').includes('comment')) return null;
    const environment = before.match(/\\(begin|end)\s*\{([\w*@.-]*)$/);
    const command = environment ? null : before.match(/\\[A-Za-z@]*\*?$/);
    const match = environment || command;
    if (!match) return null;
    let backslashes = 0;
    for (let i = match.index - 1; i >= 0 && before[i] === '\\'; i--) backslashes++;
    if (backslashes % 2) return null; // A TeX line break (\\) is not a command prefix.
    const source = cm.getValue();
    if (environment) {
      const prefix = environment[2], names = new Set(environments);
      for (const found of source.matchAll(/\\(?:begin|end|newenvironment|renewenvironment|newtheorem\*?|newsiamthm|newsiamremark)\s*\{([\w*@.-]+)\}/g)) names.add(found[1]);
      const rest = line.slice(cursor.ch).match(/^[\w*@.-]*\}?/)[0];
      return {list: [...names].filter(name => name.startsWith(prefix)).map(name => ({text: name + '}', displayText: name,
        hint: environment[1] === 'begin' ? insertEnvironment : undefined})),
        from: CodeMirror.Pos(cursor.line, cursor.ch - prefix.length), to: CodeMirror.Pos(cursor.line, cursor.ch + rest.length)};
    }
    const prefix = command[0], names = new Set(commands);
    for (const found of source.matchAll(/\\[A-Za-z@]+\*?/g)) if (found[0] !== prefix) names.add(found[0]);
    const rest = line.slice(cursor.ch).match(/^[A-Za-z@]*\*?/)[0];
    return {list: [...names].filter(name => name.startsWith(prefix)),
      from: CodeMirror.Pos(cursor.line, command.index), to: CodeMirror.Pos(cursor.line, cursor.ch + rest.length)};
  });
})(CodeMirror);
