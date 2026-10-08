// Test helper only. The installed plugin runs this analysis in the browser.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {analyzePdf, pdfPageBoxes} from './vendor/latex-pdf-analysis.mjs';
console.log = (...args) => console.error(...args);
// The modern browser build uses ES2026 APIs that Node 24 lacks.
Uint8Array.prototype.toHex ??= function () { return Buffer.from(this).toString('hex'); };
Map.prototype.getOrInsertComputed ??= function(key,compute){if(!this.has(key))this.set(key,compute(key));return this.get(key);};
const {getDocument,OPS} = await import('./vendor/pdfjs/build/pdf.mjs');
let input = '';
for await (const chunk of process.stdin) input += chunk;
const {path,url,text = true,colors = false} = JSON.parse(input);
const data = path ? new Uint8Array(await readFile(path)) : new Uint8Array(await (await fetch(url)).arrayBuffer());
const task = getDocument({data,verbosity:0,isEvalSupported:false,
  standardFontDataUrl:fileURLToPath(new URL('./vendor/pdfjs/standard_fonts/',import.meta.url)).replaceAll('\\','/'),
  cMapUrl:fileURLToPath(new URL('./vendor/pdfjs/cmaps/',import.meta.url)).replaceAll('\\','/'),cMapPacked:true});
try {
  const pdf = await task.promise;
  const analysis = text ? await analyzePdf(pdf) : {boxes:await pdfPageBoxes(pdf)};
  if(colors){
    analysis.fillColors=[];
    for(let number=1;number<=pdf.numPages;number++){
      const ops=await (await pdf.getPage(number)).getOperatorList();
      ops.fnArray.forEach((kind,index)=>{if(kind===OPS.setFillRGBColor)analysis.fillColors.push(ops.argsArray[index]);});
    }
  }
  process.stdout.write(JSON.stringify(analysis));
} finally { await task.destroy(); }
