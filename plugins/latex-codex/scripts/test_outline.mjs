// Run: node test_outline.mjs (stdlib only).
import assert from 'node:assert/strict';
import {readPdfOutline, attachPdfOutline} from './vendor/latex-outline.mjs';

const pdf = {
  numPages: 3,
  async getOutline() { return [{title: '2 Methods', dest: 'section.2', items: [
    {title: '2.1 Details', dest: [1, {name: 'XYZ'}, 50, 350, 2], items: []},
    {title: 'External link', url: 'https://example.com', items: []}]}]; },
  async getDestination() { return [{num: 5, gen: 0}, {name: 'XYZ'}, 40, 700, null]; },
  async getPageIndex() { return 1; },
  async getPageLabels() { return ['i', '1', '2']; },
  async getPage() { return {view: [0, 0, 600, 800], async getTextContent() { return {items: [
    {str: '2 Methods', transform: [12, 0, 0, 12, 40, 620], height: 12},
    {str: '2.1 Details', transform: [10, 0, 0, 10, 40, 310], height: 10}]}; }}; },
};
let result = await readPdfOutline(pdf);
assert.deepEqual(result.map(({title, depth, page, y}) => ({title, depth, page, y})), [
  {title: 'Methods', depth: 0, page: 2, y: 700}, {title: 'Details', depth: 1, page: 2, y: 350}]);
const fallback = [
  {kind: 'section', level: 2, number: '2', title: 'Methods', pageLabel: '1'},
  {kind: 'subsection', level: 3, number: '2.1', title: 'Details', pageLabel: '1'},
  {kind: 'section', level: 2, number: '3', title: 'Missing page', pageLabel: '100'},
];
result = await readPdfOutline({...pdf, getOutline: async () => null}, fallback);
assert.deepEqual(result.map(entry => [entry.title, entry.depth, entry.page, entry.y]), [
  ['Methods', 0, 2, 640], ['Details', 1, 2, 328]]);
assert.deepEqual(await readPdfOutline({...pdf, getOutline: async () => null}), []);

// Interaction checks use deterministic timers and frames: browsing must never navigate.
class Element {
  constructor() {
    this.children = []; this.style = {setProperty(key, value) { this[key] = value; }}; this.attributes = {}; this.dataset = {}; this.events = {};
    this.classes = new Set(); this.classList = {add: n => this.classes.add(n), remove: n => this.classes.delete(n), toggle: (n, on) => on ? this.classes.add(n) : this.classes.delete(n)};
    this.clientWidth = 400; this.clientHeight = 600;
  }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  remove() { this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'class') this.classes = new Set(value.split(' ')); }
  addEventListener(key, value) { this.events[key] = value; }
  dispatchEvent(event) { this.events[event.type]?.(event); }
  getBoundingClientRect() { return {left: 0, top: 0, right: 336, bottom: 344, width: 336, height: 344}; }
  contains(target) { return target === this || this.children.some(child => child.contains(target)); }
  matches(selector) { return selector === ':focus-visible' ? this.keyboardFocus : this.classes.has(selector.slice(1)); }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector); }
  focus() { document.activeElement = this; }
  setPointerCapture(id) { this.captured = id; }
  hasPointerCapture(id) { return this.captured === id; }
  releasePointerCapture() { this.captured = null; }
}
const find = (node, cls) => node.classes.has(cls) ? node : node.children.map(child => find(child, cls)).find(Boolean);
const reduced = {matches: false}, observers = [], frames = new Map(), timers = new Map();
let clock = 0, serial = 0;
globalThis.document = {createElement: () => new Element(), createElementNS: () => new Element(), activeElement: null, addEventListener() {}};
globalThis.window = {addEventListener() {}, matchMedia: () => reduced};
globalThis.WheelEvent = class {constructor(type, options) { this.type = type; Object.assign(this, options); }};
globalThis.ResizeObserver = class {constructor(callback) { observers.push(callback); } observe() {}};
globalThis.requestAnimationFrame = fn => { frames.set(++serial, fn); return serial; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
globalThis.setTimeout = (fn, delay) => { timers.set(++serial, {fn, at: clock + delay}); return serial; };
globalThis.clearTimeout = id => timers.delete(id);
function flush() {
  for (let n = 0; frames.size; n++) {
    assert(n < 100, 'Animation must converge.'); clock += 16;
    const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(clock));
  }
}
function advance(ms) {
  clock += ms;
  for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn(); }
  flush();
}
const event = extra => ({preventDefault() {}, stopPropagation() {}, ...extra});
const container = new Element(), preview = new Element(), shell = new Element(); shell.append(preview, container);
preview.scrollTop = 900; preview.scrollHeight = 2400;
const jumps = [];
const viewer = {pdfDocument: pdf, currentPageNumber: 2, getPageView: i => ({div: {offsetTop: i * 800}, viewport: {convertToViewportPoint: (x, y) => [x, 800 - y]}}),
  scrollPageIntoView: target => jumps.push(target)};
const pdfEvents = {};
const outline = attachPdfOutline({container, preview, viewer, eventBus: {on(name, fn) {pdfEvents[name] = fn;}}, t: (s, values = {}) => s.replace(/\{(\w+)\}/g, (_, key) => values[key])});
await outline.load(pdf, []); flush();
const interaction = find(container, 'pdf-dial-interaction'), drawer = find(container, 'pdf-dial-drawer');
const handle = find(container, 'pdf-dial-handle'), dial = find(container, 'pdf-dial'), rotor = find(container, 'pdf-dial-rotor');
const pageNumber = find(container, 'pdf-dial-page'), pageTotal = find(container, 'pdf-dial-total');
assert.equal(pageNumber.textContent, '2'); assert.equal(pageTotal.textContent, `/ ${pdf.numPages}`);
viewer.currentPageNumber = 3; pdfEvents.pagechanging(); flush();
assert.equal(pageNumber.textContent, '3'); assert(handle.title.includes(`PDF 第 3 页，共 ${pdf.numPages} 页`));
viewer.currentPageNumber = 2;
const selectedCell = () => rotor.children.find(cell => cell.classes.has('is-selected'));
const currentTick = () => rotor.children.find(cell => cell.classes.has('is-current'))?.dataset.index;
assert.equal(handle.attributes['aria-expanded'], 'false'); assert(drawer.inert);
assert.equal(preview.style.width, undefined, 'The dial must not reserve preview width.');
handle.onpointerenter(); advance(149); assert.equal(handle.attributes['aria-expanded'], 'false');
advance(1); assert.equal(handle.attributes['aria-expanded'], 'true'); assert(!drawer.inert);
interaction.onpointerleave(); advance(200); drawer.onpointerenter(); advance(300);
assert.equal(handle.attributes['aria-expanded'], 'true', 'Entry-to-dial movement cancels closing.');
let prevented = false;
const originalTransform = rotor.children.find(cell => cell.dataset.index === 0).style.transform;
drawer.events.wheel(event({deltaY: 80, deltaX: 0, deltaMode: 0, preventDefault() { prevented = true; }}));
advance(140); assert(prevented); assert.equal(jumps.length, 0); assert.equal(preview.scrollTop, 900);
assert.equal(dial.attributes['aria-valuetext'], '2.1 Details'); assert.equal(currentTick(), 0);
assert.notEqual(rotor.children.find(cell => cell.dataset.index === 0).style.transform, originalTransform, 'Titles actually move and tilt along the circle.');
dial.onclick(event({target: selectedCell()})); assert.equal(jumps.length, 1); assert.equal(jumps[0].destArray[3], 350); assert(jumps[0].ignoreDestinationZoom);
flush(); preview.events.scroll(); flush(); assert.equal(currentTick(), 1);
// Capture retargets native clicks to the dial; the pressed tick still resolves correctly.
const major = [...rotor.children].find(cell => cell.dataset.index === 0);
const pointer = event({pointerId: 7, button: 0, clientX: 184, clientY: 172, target: major});
dial.onpointerdown(pointer); dial.onpointerup(pointer); assert.equal(jumps.length, 1, 'Pointer release is not a jump.');
dial.onclick(event({target: dial})); assert.equal(jumps.length, 2); assert.equal(jumps[1].destArray[3], 700);
flush();
// Drag outside, wait longer than close delay, release, then the synthetic click is ignored.
dial.onpointerdown(pointer); dial.onpointermove({...pointer, clientX: -40, clientY: 70});
interaction.onpointerleave(); advance(700); assert.equal(handle.attributes['aria-expanded'], 'true');
dial.onpointerup({...pointer, clientX: -40, clientY: 70}); dial.onclick(event({target: dial}));
assert.equal(jumps.length, 2); advance(399); assert.equal(handle.attributes['aria-expanded'], 'true');
advance(1); assert.equal(handle.attributes['aria-expanded'], 'false');
handle.onclick(); dial.keyboardFocus = true; dial.focus(); container.onfocusin({target: dial});
interaction.onpointerleave(); advance(1000); assert.equal(handle.attributes['aria-expanded'], 'true');
container.onkeydown(event({key: 'ArrowDown', target: dial})); assert.equal(jumps.length, 2);
container.onkeydown(event({key: 'Enter', target: dial})); assert.equal(jumps.length, 3);
assert.equal(jumps[2].destArray[3], 350, 'Fast Arrow + Enter confirms the new target before easing finishes.'); flush();
container.onkeydown(event({key: 'Escape', target: dial})); assert.equal(handle.attributes['aria-expanded'], 'false');
assert.equal(document.activeElement, preview);
// The outline entry also replaces the scrollbar: continuous scroll, not chapter jumps.
assert(preview.classes.has('outline-scrollbar'));
preview.scrollTop = 0; preview.events.scroll(); flush();
assert.equal(handle.style.top, '36px');
const scrollPointer = event({pointerId: 23, button: 0, clientX: 330, clientY: 36, target: handle});
handle.onpointerenter(); advance(100); handle.onpointerdown(scrollPointer);
assert(handle.hasPointerCapture(23));
handle.onpointermove({...scrollPointer, clientX: -20, clientY: 300}); advance(700);
assert.equal(preview.scrollTop, 900, 'Dragging half the thumb track scrolls half the document range.');
assert.equal(handle.style.top, '300px'); assert.equal(handle.attributes['aria-expanded'], 'false');
handle.onpointerup({...scrollPointer, clientY: 300}); handle.onclick(event({target: handle}));
assert(!handle.hasPointerCapture(23)); assert.equal(handle.attributes['aria-expanded'], 'false', 'Scroll release cannot accidentally open the outline.');
assert.equal(jumps.length, 3, 'The scrollbar never calls a heading destination.');
container.onkeydown(event({key: 'End', target: handle})); flush(); assert.equal(preview.scrollTop, 1800);
assert.equal(handle.style.top, '564px');
container.onkeydown(event({key: 'ArrowUp', target: handle})); flush(); assert.equal(preview.scrollTop, 1760);
container.onkeydown(event({key: 'Home', target: handle})); flush(); assert.equal(preview.scrollTop, 0);
handle.events.wheel(event({deltaY: 120, deltaX: 0, deltaMode: 0})); flush(); assert.equal(preview.scrollTop, 120);
let zoomDelta;
preview.events.wheel = event => { zoomDelta = event.deltaY; };
handle.events.wheel(event({deltaY: -100, ctrlKey: true}));
assert.equal(zoomDelta, -100); assert.equal(preview.scrollTop, 120, 'Ctrl-wheel over the handle retains the PDF zoom handler.');
handle.onclick(); const anchoredTop = interaction.style.top;
preview.scrollTop = 1800; preview.events.scroll(); flush();
assert.equal(interaction.style.top, anchoredTop, 'The open dial remains still while its scrollbar thumb follows the PDF.');
assert.equal(handle.style.top, '564px');
handle.onpointerleave(); advance(400); assert.equal(handle.attributes['aria-expanded'], 'false');
handle.onpointerdown(scrollPointer); handle.onpointermove({...scrollPointer, clientY: 1000});
assert.equal(preview.scrollTop, 1800, 'Dragging past the track clamps at the document end.');
handle.onpointercancel(scrollPointer); handle.onclick(event({target: handle}));
assert.equal(handle.attributes['aria-expanded'], 'false');
preview.scrollHeight = 600; preview.scrollTop = 0; preview.events.scroll(); flush();
assert.equal(handle.style.top, '300px'); assert.equal(handle.style.height, '52px', 'A PDF that fits still has a centered outline entry.');
preview.scrollHeight = 2400; preview.scrollTop = 900; preview.events.scroll(); flush();
// Dense outlines retain fixed spacing, bounded visible marks and full long titles.
const longTitle = 'A complete long heading '.repeat(15);
const dense = {...pdf, getOutline: async () => Array.from({length: 150}, (_, i) => ({title: `${i + 1} ${i === 149 ? longTitle : 'Section'}`, dest: [1, {name: 'XYZ'}, 40, 700 - i, null], items: []}))};
viewer.pdfDocument = dense; await outline.load(dense, []); flush(); handle.onclick();
container.onkeydown(event({key: 'End', target: dial})); flush();
assert.equal(dial.attributes['aria-valuenow'], '150'); assert(rotor.children.length < 15);
assert.equal(find(selectedCell(), 'pdf-dial-title').textContent, longTitle.trim());
assert.equal(jumps.length, 3);
preview.clientWidth = 190; preview.clientHeight = 250; observers[0](); flush();
assert.equal(interaction.style.width, '336px');
assert(Math.abs(parseFloat(interaction.style['--dial-scale']) * 336 - 190 * .8) < .001, 'The outline uses 80% of its responsive size.');
assert.equal(dial.attributes['aria-valuenow'], '150');
reduced.matches = true; container.onkeydown(event({key: 'Home', target: dial}));
assert.equal(dial.attributes['aria-valuenow'], '1'); assert.equal(animationFramesPending(), 0);
function animationFramesPending() { return frames.size; }
// Cards show only sections; the secondary dial owns just the selected section's direct subsections.
const heading = (title, y, items = []) => ({title, dest: [1, {name: 'XYZ'}, 40, y, null], items});
const cardsPdf = {...pdf, getOutline: async () => [
  heading('1 Introduction', 700, [heading('1.1 Overview', 650, [heading('1.1.1 Nested', 640)]), heading('1.2 Context', 600)]),
  heading('2 Related Work', 550),
  heading('3 Method', 500, Array.from({length: 9}, (_, i) => heading(`3.${i + 1} Detail ${i + 1}`, 480 - i * 20))),
]};
preview.clientWidth = 400; preview.clientHeight = 600; preview.scrollTop = 900; reduced.matches = false;
viewer.pdfDocument = cardsPdf; await outline.load(cardsPdf, []); flush();
const beforeCards = jumps.length;
outline.setStyle('cards'); handle.onclick(); flush();
const subdial = find(container, 'pdf-subdial'), subRotor = find(container, 'pdf-subdial-rotor');
const selectedSub = () => subRotor.children.find(cell => cell.classes.has('is-selected'));
assert.equal(dial.attributes['aria-valuemax'], '3'); assert.equal(subdial.attributes['aria-valuemax'], '2');
assert.equal(find(rotor, 'pdf-card-tag').textContent, 'Section 1', 'Cards show the section number as a badge.');
assert.equal(find(subRotor, 'pdf-card-tag'), undefined, 'Section badges belong only to the outer cards.');
assert.equal(find(subRotor, 'pdf-dial-number'), undefined);
// At the leftmost point, neighbors move right and vertically on two concentric arcs.
const circleCenter = (cell, apex) => {
  const [, x, y] = cell.style.transform.match(/translate\(([-.\d]+)px,([-.\d]+)px\)/).map(Number);
  assert(x > 0 && y > 0, 'Following headings must curve down and right from the left apex.');
  return apex + (x * x + y * y) / (2 * x);
};
const outerCenter = circleCenter(rotor.children[1], parseFloat(rotor.style['--dial-card-apex']));
const innerCenter = circleCenter(subRotor.children[1], parseFloat(subdial.style.left) + 8);
assert(Math.abs(outerCenter - innerCenter) < .001, 'Cards and subsections share the same right-side circle center.');
assert(outerCenter > parseFloat(interaction.style.width));
const selectedBeforeResize = dial.attributes['aria-valuetext'];
preview.clientWidth = 600; observers[0](); flush();
const narrowScale = Number(interaction.style['--dial-scale']);
preview.clientWidth = 1200; observers[0](); flush();
const wideScale = Number(interaction.style['--dial-scale']);
assert(wideScale > narrowScale, 'Widening the PDF pane enlarges the entire outline.');
assert(wideScale * 400 <= preview.clientHeight - 16, 'The outline still fits vertically.');
assert.equal(dial.attributes['aria-valuetext'], selectedBeforeResize);
assert.equal(preview.scrollTop, 900); assert.equal(jumps.length, beforeCards);
preview.clientWidth = 400; observers[0](); flush();
drawer.events.wheel(event({target: subdial, deltaY: 80, deltaX: 0, deltaMode: 0})); advance(140);
assert.equal(dial.attributes['aria-valuetext'], '1 Introduction');
assert.equal(subdial.attributes['aria-valuetext'], '1.2 Context'); assert.equal(jumps.length, beforeCards);
dial.onclick(event({target: selectedSub()})); flush();
assert.equal(jumps.length, beforeCards + 1); assert.equal(jumps.at(-1).destArray[3], 600);
assert.equal(dial.attributes['aria-valuetext'], '1 Introduction');
drawer.events.wheel(event({target: dial, deltaY: 80, deltaX: 0, deltaMode: 0})); advance(140);
assert.equal(dial.attributes['aria-valuetext'], '2 Related Work'); assert(subdial.hidden);
assert.equal(jumps.length, beforeCards + 1, 'Browsing the parent never navigates.');
container.onkeydown(event({key: 'End', target: dial})); flush();
assert.equal(dial.attributes['aria-valuetext'], '3 Method');
container.onkeydown(event({key: 'ArrowUp', target: dial})); flush();
assert.equal(dial.attributes['aria-valuetext'], '2 Related Work');
dial.onclick(event({target: selectedCell()})); flush(); assert.equal(jumps.at(-1).destArray[3], 550);
drawer.events.wheel(event({target: dial, deltaY: 80, deltaX: 0, deltaMode: 0})); advance(140);
assert.equal(subdial.attributes['aria-valuemax'], '9'); assert(!subdial.hidden);
const beforeSubDrag = jumps.length, subPointer = {...pointer, target: selectedSub()};
const subDragDistance = 44 * Number(interaction.style['--dial-scale']);
dial.onpointerdown(subPointer); dial.onpointermove({...subPointer, clientY: subPointer.clientY - subDragDistance});
dial.onpointerup({...subPointer, clientY: subPointer.clientY - subDragDistance}); dial.onclick(event({target: dial})); flush();
assert.equal(subdial.attributes['aria-valuetext'], '3.2 Detail 2');
assert.equal(dial.attributes['aria-valuetext'], '3 Method'); assert.equal(jumps.length, beforeSubDrag);
container.onkeydown(event({key: 'End', target: subdial})); flush();
assert.equal(subdial.attributes['aria-valuetext'], '3.9 Detail 9'); assert(subRotor.children.length < 8);
container.onkeydown(event({key: 'Enter', target: subdial})); flush();
assert.equal(jumps.at(-1).destArray[3], 320);
const beforeCardDrag = jumps.length, cardPointer = {...pointer, target: selectedCell()};
dial.onpointerdown(cardPointer); dial.onpointermove({...cardPointer, clientY: -100});
interaction.onpointerleave(); advance(700); assert.equal(handle.attributes['aria-expanded'], 'true');
dial.onpointerup({...cardPointer, clientY: -100}); dial.onclick(event({target: dial}));
assert.equal(jumps.length, beforeCardDrag, 'Vertical card rotation and release never navigate.');
advance(400); assert.equal(handle.attributes['aria-expanded'], 'false');
handle.onclick(); outline.setStyle('wheel'); flush();
assert.equal(dial.attributes['aria-valuemax'], '15'); assert(subdial.hidden);
assert.equal(jumps.length, beforeCardDrag, 'Switching styles keeps the PDF at its current heading.');
// A delayed outline response must not resurrect a cleared/replaced document.
let resolve;
const slow = {...pdf, getOutline: () => new Promise(done => { resolve = done; })};
viewer.pdfDocument = slow; const pending = outline.load(slow, []);
await Promise.resolve();
outline.clear(); resolve(await pdf.getOutline()); await pending; flush();
assert.equal(container.hidden, true); assert.equal(rotor.children.length, 0);
assert(!preview.classes.has('outline-scrollbar'), 'Without an available outline, keep the native scrollbar as a fallback.');
assert.equal(pageNumber.textContent, '', 'Clearing the document must clear its page count.');
const noOutline = {...pdf, numPages: 12, getOutline: async () => [], getPageLabels: async () => null};
viewer.pdfDocument = noOutline; viewer.currentPageNumber = 7;
await outline.load(noOutline, []); flush();
assert.equal(container.hidden, false, 'Page scrolling must remain available in PDFs without headings.');
assert(preview.classes.has('outline-scrollbar'));
assert.equal(pageNumber.textContent, '7'); assert.equal(pageTotal.textContent, '/ 12');
handle.onclick(); assert.equal(handle.attributes['aria-expanded'], 'false', 'A page-only handle cannot open an empty outline.');
outline.clear();
console.log('PASS: merged scrollbar/outline handle, captured scrolling, keyboard scrolling, delayed hover/leave, continuous region, angular browsing, independent PDF state, click-only navigation, density, resize, reduced motion and stale loads');
