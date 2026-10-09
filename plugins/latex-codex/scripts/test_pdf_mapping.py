"""Run: python test_pdf_mapping.py (local TeX and Node; real PDF glyphs and SyncTeX)."""
import json
from pathlib import Path
import subprocess
import tempfile
import threading
from urllib.request import ProxyHandler, Request, build_opener

from editor import make_server


NODE = r'''
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {boxedPdfContent} from './vendor/latex-pdf-selection.mjs';
import {pdfTextRect,pdfPageBoxes} from './vendor/latex-pdf-analysis.mjs';
import {findMathRanges,documentMacros} from './vendor/latex-hover.mjs';
Uint8Array.prototype.toHex ??= function(){return Buffer.from(this).toString('hex');};
Map.prototype.getOrInsertComputed ??= function(key,compute){if(!this.has(key))this.set(key,compute(key));return this.get(key);};
let input='';for await(const part of process.stdin)input+=part;
const {base,source,version,pdf_revision,citations}=JSON.parse(input);
const {getDocument}=await import('./vendor/pdfjs/build/pdf.mjs');
const task=getDocument({data:new Uint8Array(await(await fetch(base+'/pdf')).arrayBuffer()),verbosity:0,isEvalSupported:false,
  standardFontDataUrl:fileURLToPath(new URL('./vendor/pdfjs/standard_fonts/',import.meta.url)).replaceAll('\\','/'),
  cMapUrl:fileURLToPath(new URL('./vendor/pdfjs/cmaps/',import.meta.url)).replaceAll('\\','/'),cMapPacked:true});
try{
  const pdf=await task.promise,boxes=await pdfPageBoxes(pdf);
  const content=await(await pdf.getPage(1)).getTextContent({disableNormalization:true,disableCombineTextItems:true});
  const code=await readFile('editor.py','utf8');
  // Keep unsupported math opaque so the test must use real compiled formula geometry.
  const context=vm.createContext({t:x=>x,findMathRanges,documentMacros,katex:{},document:{createElement:()=>({})}});
  vm.runInContext(code.slice(code.indexOf('function sourceParagraphRange('),code.indexOf('function pdfPoint(')),context);
  let stream='',indices=[];
  content.items.forEach((item,index)=>{for(const ch of item.str||'')if(!/\s/.test(ch)){stream+=ch;indices.push(index);}});
  function select(text,occurrence=0,endText=''){
    const needle=text.replace(/\s/g,'');let at=-1;
    for(let i=0;i<=occurrence;i++)at=stream.indexOf(needle,at+1);
    assert(at>=0,'The fixture PDF must contain '+text);
    const ending=endText.replace(/\s/g,''),finish=endText?stream.indexOf(ending,at):at;
    assert(finish>=at,'The fixture PDF must contain the selection end.');
    const last=endText?finish+ending.length-1:at+needle.length-1;
    const glyphs=content.items.slice(indices[at],indices[last]+1).filter(item=>item.str?.trim());
    const rects=glyphs.map(item=>pdfTextRect(item,content.styles));
    return boxedPdfContent(content,1,[Math.min(...rects.map(r=>r[0]))-.01,Math.min(...rects.map(r=>r[1]))-.01,
      Math.max(...rects.map(r=>r[2]))+.01,Math.max(...rects.map(r=>r[3]))+.01]);
  }
  let queries=0;
  const regions=async(first,last)=>{
    queries++;
    const response=await fetch(base+'/synctex',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({direction:'range',version,pdf_revision,boxes,first,last})});
    const result=await response.json();
    if(!response.ok)throw Object.assign(new Error(result.error),{status:response.status});
    return result;
  };
  for(const [name,text,occurrence,locations,expected,count] of [
    ['repeated text with real glyph context','repeated phrase',1,[6],{line:5,ch:16},0],
    ['adjacent paragraph with real row geometry','Before the formula.',0,[5],{line:7,ch:0},1],
    ['displaced custom-macro formula','x=y.',0,[5],{line:8,ch:0},2]]){
    const selected=select(text,occurrence);
    const range=await context.sourcePdfSelectionRange(source,locations,selected,{}, {},regions);
    assert.deepEqual(JSON.parse(JSON.stringify(range.from)),expected,name);
    assert.equal(queries,count,'The fast path adds no lookup; each retry reads the cached index once.');
    if(name==='displaced custom-macro formula'){
      assert.equal(range.mathBlock,true);assert.equal(range.to.line,10);
    }
    console.log('PASS: '+name);
  }
  const katex=(await import('./vendor/katex/katex.mjs')).default;
  context.katex.renderToString=katex.renderToString;
  context.katex.render=(tex,node,options)=>{
    node.textContent=katex.renderToString(tex,options).replace(/<annotation\b[\s\S]*?<\/annotation>/g,'').replace(/<[^>]+>/g,'')
      .replace(/&#x([0-9a-f]+);/gi,(_,code)=>String.fromCodePoint(parseInt(code,16)))
      .replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code)))
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
    node.querySelectorAll=()=>[];
  };
  const selected=select('For example, for any',0,'is contained in an ultrafilter on X.');
  assert.equal(selected.contiguous,true,'The paragraph box must contain every intervening glyph.');
  assert(selected.text.includes('74–75'),'Use the actual TeX dash glyph from the compiled citation note.');
  const from=source.indexOf('For example, for any'),to=source.indexOf('\n\n',from);
  const offset=pos=>source.split('\n').slice(0,pos.line).reduce((sum,line)=>sum+line.length+1,0)+pos.ch;
  const first=source.slice(0,from).split('\n').length,last=source.slice(0,to).split('\n').length;
  for(const kind of ['text','box']){
    const range=await context.sourcePdfSelectionRange(source,[first,last],{...selected,kind},{},citations,regions);
    assert.equal(offset(range.from),from);assert.equal(offset(range.to),to,'Do not include the following paragraph or bibliography.');
    console.log('PASS: real PDF '+kind+' mapping with formulas and a citation postnote');
  }
  let misread=0;
  const damagedText=selected.text.replace(/[a-z]/gi,char=>++misread%4===0?'◆':char);
  assert.throws(()=>context.sourcePdfTextRange(source,[first,last],damagedText,{},citations),/唯一匹配/);
  for(const kind of ['text','box']){
    const range=await context.sourcePdfSelectionRange(source,[first,last],{...selected,text:damagedText,kind},{},citations,regions);
    assert.equal(offset(range.from),from);assert.equal(offset(range.to),to);
    console.log('PASS: real compiled row verification with more tolerant '+kind+' matching');
  }
  const lemmaBox=select('Lemma 1',0,'with these properties.');
  assert.equal(lemmaBox.contiguous,true);
  const bodyFrom=source.indexOf('Let $\\cA$'),bodyTo=source.indexOf('\n\n',bodyFrom);
  const bodyFirst=source.slice(0,bodyFrom).split('\n').length,bodyLast=source.slice(0,bodyTo).split('\n').length;
  for(const kind of ['text','box']){
    const range=await context.sourcePdfSelectionRange(source,[bodyFirst,bodyLast],{...lemmaBox,kind},{}, {},regions);
    assert.equal(offset(range.from),bodyFrom);
    assert.equal(offset(range.to),bodyTo,'The generated heading must not pull in later theorem paragraphs.');
    console.log('PASS: real PDF '+kind+' mapping with a theorem title and reordered formulas');
  }
  const completeLemma=select('Lemma 1',0,'Later theorem paragraph.');
  const completeRange=await context.sourcePdfSelectionRange(source,[bodyFirst,bodyLast],completeLemma,{}, {},regions);
  assert.equal(offset(completeRange.from),source.indexOf('\\begin{lemma}'));
  assert.equal(offset(completeRange.to),source.indexOf('\\end{lemma}')+'\\end{lemma}'.length,'A complete theorem selection retains paired delimiters.');
}finally{await task.destroy();}
'''


with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'main.tex'
    source = r'''\documentclass{article}
\usepackage{amsmath,amssymb,amsthm}\usepackage[numbers]{natbib}
\newcommand{\custom}[1]{#1}\newcommand{\cA}{\mathcal{A}}\newcommand{\bZ}{\mathbb{Z}}\newtheorem{lemma}{Lemma}
\begin{document}
First context: repeated phrase.\\
Second context: repeated phrase.

Before the formula.
\begin{align*}
\custom{x}&=\custom{y}.
\end{align*}

For example, for any $x\in X$, the family
$\{A\subseteq X:x\in A\}$ is an ultrafilter on $X$.
The ultrafilter lemma (see, e.g.,
\cite[Lemma~7.2(iii) and Theorem~7.5, pp.~74--75]{Jech2003}),
a consequence of Zorn's lemma, states that any family of subsets of
$X$ whose finite intersections are nonempty is contained in an
ultrafilter on $X$.

Following paragraph.
\begin{lemma}[A generated title with inline indices and symbols]
\label{lem:indices}
Let $\cA$ carry the data $(\Phi,\{\Pi_\varphi\}_{\varphi\in\Phi})$, where
$\Phi=\{\varphi_1<\cdots<\varphi_n\}$, and suppose each part is closed.
For every $1\leq i<n$, the maps $f,g:K_0(\cA)\to\bZ$ are defined
on the generators with these properties.

Later theorem paragraph.
\end{lemma}
\begin{thebibliography}{1}
\bibitem{Jech2003} Test reference.
\end{thebibliography}
\end{document}
'''
    path.write_text(source, encoding='utf-8')
    server = make_server(path)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    base = f'http://127.0.0.1:{server.server_port}'
    direct = build_opener(ProxyHandler({}))

    def request(route, data=None):
        body = json.dumps(data).encode() if data is not None else None
        with direct.open(Request(base + route, body, {'Content-Type':'application/json'}), timeout=55) as response:
            return json.loads(response.read())

    try:
        state = request('/state')
        compiled = request('/compile', {'source':state['source'], 'version':state['version']})
        assert compiled['ok'], compiled
        result = subprocess.run(['node', '--input-type=module', '-e', NODE], cwd=Path(__file__).parent,
            input=json.dumps({'base':base, 'source':source, 'version':compiled['version'], 'pdf_revision':compiled['pdf_revision'], 'citations':compiled['citations']}),
            text=True, encoding='utf-8', capture_output=True, timeout=30)
        assert result.returncode == 0, result.stdout + result.stderr
        print(result.stdout, end='')
        assert path.read_text(encoding='utf-8') == source, 'Mapping must never edit the fixture source.'
    finally:
        server.shutdown()
        worker.join()
        server.server_close()
        server.build.cleanup()
