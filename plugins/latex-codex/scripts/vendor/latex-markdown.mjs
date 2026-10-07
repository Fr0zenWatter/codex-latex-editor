import {Marked} from './marked.mjs';
import DOMPurify from './purify.mjs';
import katex from './katex/katex.mjs';

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const imageUrl = href => /^https?:\/\//i.test(href) ? href : '/markdown-resource?path=' + encodeURIComponent(href);

// Marked handles fenced/inline code before math; source offsets belong to whole rendered blocks.
export function markdownHtml(source, sanitizeHtml = escape) {
  source = source.replace(/\r\n?/g, '\n');
  const macros = {}, slugs = new Map();
  const math = (text, displayMode) => katex.renderToString(text.replace(/^\\\(([\s\S]*)\\\)$/, '$1'), {
    displayMode, throwOnError:false, strict:'ignore', trust:false, macros, globalGroup:true,
  });
  const markdown = new Marked({gfm:true}, {
    tokenizer: {
      lheading(src) {
        const match = this.rules.block.lheading.exec(src);
        // An '=' row inside display math must never turn preceding prose into a Setext heading.
        if(match && /(?:^|\n) {0,3}(?:\$\$|\\\[)/.test(match[0]))return;
        return false;
      },
    },
    renderer: {
      html({text}) { return sanitizeHtml(text); },
      heading({tokens, text, depth}) {
        const base = text.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '') || 'heading';
        const count = slugs.get(base) || 0; slugs.set(base, count + 1);
        return `<h${depth} id="markdown-heading-${escape(base + (count ? '-' + count : ''))}">${this.parser.parseInline(tokens)}</h${depth}>`;
      },
      link({href, title, tokens}) {
        if(href.startsWith('#'))href='#markdown-heading-'+href.slice(1);
        return `<a href="${escape(href)}"${title ? ` title="${escape(title)}"` : ''}>${this.parser.parseInline(tokens)}</a>`;
      },
      image({href, text, title}) {
        return `<img src="${escape(imageUrl(href))}" alt="${escape(text)}"${title ? ` title="${escape(title)}"` : ''} loading="lazy" referrerpolicy="no-referrer">`;
      },
    },
    extensions: [
      {name:'blockMath', level:'block', start:src=>src.search(/\$\$|\\\[/),
        tokenizer(src) {
          const match = /^(?: {0,3}\$\$([\s\S]+?)\$\$| {0,3}\\\[([\s\S]+?)\\\])[ \t]*(?:\n|$)/.exec(src);
          if (match) return {type:'blockMath', raw:match[0], text:(match[1] ?? match[2]).trim()};
        }, renderer:token=>math(token.text,true)},
      {name:'inlineMath', level:'inline', start:src=>src.search(/\$|\\\(/),
        tokenizer(src) {
          const match = /^(?:\$(?![\s$])((?:\\.|[^\\$\n])+?)\$(?!\d)|\\\(([^\n]*?)\\\))/.exec(src);
          if (match && (match[1] == null || match[1].trim() === match[1])) return {type:'inlineMath', raw:match[0], text:match[1] ?? match[2]};
        }, renderer:token=>math(token.text,false)},
      {name:'wikiImage', level:'inline', start:src=>src.indexOf('![['),
        tokenizer(src) {
          const match = /^!\[\[([^\]\n]+)\]\]/.exec(src);
          if (match) return {type:'wikiImage', raw:match[0], text:match[1]};
        }, renderer(token) {
          const [href, size] = token.text.split('|'), width = /^\d+(?:x\d+)?$/.test(size || '') ? Math.min(1200,Number(size.split('x')[0])) : null;
          return `<img src="${escape(imageUrl(href))}" alt="${escape(href)}"${width ? ` width="${width}"` : ''} loading="lazy" referrerpolicy="no-referrer">`;
        }},
    ],
  });
  const tokens = markdown.lexer(source);
  let offset = 0;
  return tokens.map(token => {
    const from = offset; offset += token.raw.length;
    const block = [token]; block.links = tokens.links;
    return `<div class="markdown-block" data-source-from="${from}" data-source-to="${offset}">${markdown.parser(block,markdown.defaults)}</div>`;
  }).join('');
}

export function attachMarkdownPreview(container, editor) {
  let current = null;
  function render(source) {
    if (source === current) return;
    current = source;
    const top = container.scrollTop;
    const clean = html => {
      const fragment = DOMPurify.sanitize(html, {
        FORBID_TAGS:['style','iframe','object','embed','form','textarea','button'],
        FORBID_ATTR:['style','id','name'], ALLOW_DATA_ATTR:false, RETURN_DOM_FRAGMENT:true,
      });
      for(const image of fragment.querySelectorAll('img'))image.setAttribute('src',imageUrl(image.getAttribute('src')||''));
      const wrapper=container.ownerDocument.createElement('div');wrapper.append(fragment);return wrapper.innerHTML;
    };
    // Sanitize authored HTML separately; KaTeX's trusted layout requires inline styles.
    container.innerHTML = DOMPurify.sanitize(markdownHtml(source, clean));
    for (const link of container.querySelectorAll('a')) {
      if (!link.getAttribute('href')?.startsWith('#')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    }
    for (const input of container.querySelectorAll('input')) { input.disabled = true; input.type = 'checkbox'; }
    container.scrollTop = top;
  }
  container.addEventListener('dblclick', event => {
    if (event.target.closest('a,input') || editor.getOption('readOnly')) return;
    const block = event.target.closest('.markdown-block');
    if (!block) return;
    const position = editor.posFromIndex(Number(block.dataset.sourceFrom));
    editor.setCursor(position); editor.scrollIntoView(position,80); editor.focus();
  });
  return {
    render,
    clear() { current = null; container.replaceChildren(); },
    locate() {
      const position = editor.indexFromPos(editor.getCursor());
      const block = [...container.querySelectorAll('.markdown-block')].find(block =>
        Number(block.dataset.sourceFrom) <= position && position < Number(block.dataset.sourceTo));
      if (block) container.scrollTop += block.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientHeight / 3;
    },
  };
}
