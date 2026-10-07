// Read PDF geometry with the same bundled PDF.js used for the preview.
// No native PDF tools, page rasterization, or Node runtime are needed.
const geometryCache = new WeakMap();

export async function pdfPageBoxes(pdf) {
  if (!geometryCache.has(pdf)) {
    geometryCache.set(pdf, (async () => {
      const boxes = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        boxes.push([...(await pdf.getPage(number)).mediaBox]);
      }
      return boxes;
    })());
  }
  return geometryCache.get(pdf);
}

export function pdfTextRect(item, styles) {
  const [a,b,c,d,x,y] = item.transform;
  const size = Math.hypot(c,d) || item.height || 1;
  const advance = Math.hypot(a,b) || size;
  const style = styles[item.fontName] || {};
  let ascent = style.ascent ?? .9, descent = style.descent ?? -.25;
  // TeX extension fonts can report zero metrics for visible radicals/delimiters.
  if (ascent <= descent) { ascent = .9; descent = -.25; }
  const ux = a/advance, uy = b/advance, vx = c/size, vy = d/size;
  const points = [
    [x+vx*size*descent, y+vy*size*descent],
    [x+vx*size*ascent, y+vy*size*ascent],
    [x+ux*item.width+vx*size*descent, y+uy*item.width+vy*size*descent],
    [x+ux*item.width+vx*size*ascent, y+uy*item.width+vy*size*ascent],
  ];
  return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),
    Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
}

export function pdfWords(content, page) {
  const words = [];
  let previous = null;
  for (const item of content.items) {
    if (typeof item.str !== 'string') continue;
    const text = item.str.trim();
    if (!text) { previous = null; continue; }
    const [a,b,c,d,x,y] = item.transform;
    const size = Math.hypot(c,d) || item.height || 1;
    const advance = Math.hypot(a,b) || size;
    const style = content.styles[item.fontName] || {};
    const ux = a/advance, uy = b/advance, vx = c/size, vy = d/size;
    const rect = pdfTextRect(item, content.styles);
    if (!(rect[2] > rect[0] && rect[3] > rect[1])) continue;
    // The opt-in glyph stream keeps actual glyph advances, including ligatures.
    // Join only adjacent glyphs on the same baseline, never across a space/row.
    const gap = previous ? (x-previous.endX)*ux+(y-previous.endY)*uy : Infinity;
    const rowGap = previous ? Math.abs((x-previous.endX)*vx+(y-previous.endY)*vy) : Infinity;
    if (previous && !/[。！？][”’」』）)\]}]*$/u.test(words.at(-1)[2]) && !/^\s/.test(item.str) && rowGap < Math.max(.5,size*.08) &&
        gap > -size*.2 && gap < Math.max(.5,size*.16) && !style.vertical) {
      const word = words.at(-1);
      word[1] = [Math.min(word[1][0],rect[0]),Math.min(word[1][1],rect[1]),
        Math.max(word[1][2],rect[2]),Math.max(word[1][3],rect[3])];
      word[2] += text;
    } else words.push([page,rect,text]);
    previous = item.hasEOL || /\s$/.test(item.str) ? null : {endX:x+ux*item.width,endY:y+uy*item.width};
  }
  return words;
}

export async function analyzePdf(pdf, check = () => {}) {
  const boxes = await pdfPageBoxes(pdf), words = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    check();
    const page = await pdf.getPage(number);
    const content = await page.getTextContent({disableNormalization:true,disableCombineTextItems:true});
    check();
    words.push(...pdfWords(content,number));
  }
  return {boxes,words};
}
