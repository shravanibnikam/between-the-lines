/* "While you write": the app's writing format (core/src/markup.rs, parse_section) typeset live. */
(function () {
  'use strict';

  const SAMPLE = [
    '## The River That Climbed',
    'The fishwives saw it first. A cry went up along the quay at Lowmere,[^lowmere] and then the whole market was crowding the river wall to watch the water slow, and stop, and begin to **climb**.',
    '"Rivers don\'t do that," said the man holding her compass.',
    '***',
    'By evening there were notices nailed to every door in the lower town. *By order of the Ninefold Gate: all charts, maps and surveys of the Saltmarch are to be surrendered for burning.*',
    '### A ledger of names',
    'The ledger in the case still held the figures:',
    '| River | Charted | Leagues |',
    '|---|:-:|--:|',
    '| Tamsel | spring | 42 |',
    '| Orrin | summer | 17 |',
    '| Lesser Vey | autumn | 9 |',
    '> Not yet. Not until the water remembers.',
    '![The Saltmarch, every river bending toward the mountain](saltmarch.png)',
    '[^lowmere]: *Lowmere* is the old marsh tongue for "the low lake." There has been no lake there for three hundred years.',
  ].join('\n');

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ALNUM = /[\p{L}\p{N}]/u;
  const alnum = c => c !== undefined && ALNUM.test(c);

  /* ---- parser: a port of markup.rs (smart quotes on, as in print) ---- */
  function smarten(s) {
    const ch = Array.from(s.replace(/---/g, '—').replace(/--/g, '—').replace(/\.\.\./g, '…'));
    return ch.map((c, i) => {
      if (c !== '"' && c !== "'") return c;
      let p; for (let k = i - 1; k >= 0; k--) if (ch[k] !== '*' && ch[k] !== '_') { p = ch[k]; break; }
      const opening = p === undefined || /\s/.test(p) || '([{—–-/“‘'.includes(p);
      if (c === '"') return opening ? '“' : '”';
      return opening && ch[i + 1] !== undefined && !/\p{N}/u.test(ch[i + 1]) ? '‘' : '’';
    }).join('');
  }
  function hasClosing(ch, from, m) {
    for (let i = from; i + m.length <= ch.length; i++) {
      if (ch.slice(i, i + m.length).join('') !== m) continue;
      if (m === '*' && ch[i + 1] === '*') { i++; continue; }
      if (m === '_' && i > 0 && alnum(ch[i - 1]) && alnum(ch[i + 1])) continue;
      return i > from;
    }
    return false;
  }
  function inline(s) {
    const ch = Array.from(smarten(s)), spans = [];
    let bold = false, italic = false, cur = '';
    const push = () => { if (cur) spans.push({ text: cur, bold, italic }); cur = ''; };
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      if (c === '\\' && i + 1 < ch.length) { cur += ch[++i]; continue; }
      if (c === '*' && ch[i + 1] === '*') {
        if (bold || hasClosing(ch, i + 2, '**')) { push(); bold = !bold; i++; continue; }
      } else if (c === '*' || c === '_') {
        const inWord = c === '_' && i > 0 && alnum(ch[i - 1]) && alnum(ch[i + 1]);
        if (!inWord && (italic || hasClosing(ch, i + 1, c))) { push(); italic = !italic; continue; }
      }
      cur += c;
    }
    push();
    return spans;
  }
  const isBreak = line => {
    const t = line.replace(/\s/g, '');
    return ['***', '#', '~', '⁂', '---', '***.', '◆', '§'].includes(t) || /^\*{3,}$/.test(t);
  };
  function blockOf(line) {
    if (isBreak(line)) return { t: 'brk' };
    const img = /^!\[(.*)\]\((.*)\)$/.exec(line);
    if (img) return { t: 'img', src: img[2].trim().replace(/\\/g, ''), s: inline(img[1]) };
    if (line.startsWith('### ')) return { t: 'h3', s: inline(line.slice(4)) };
    if (line.startsWith('## ')) return { t: 'h2', s: inline(line.slice(3)) };
    if (line.startsWith('# ')) return { t: 'h2', s: inline(line.slice(2)) };
    if (line.startsWith('>')) return { t: 'q', s: inline(line.slice(1).trimStart()) };
    return { t: 'p', s: inline(line) };
  }
  function noteDef(line) {
    const m = /^\[\^(.*?)\]:(.*)$/s.exec(line);
    if (!m) return null;
    const label = m[1].replace(/\\/g, '');
    return label && !/\s/.test(label) ? [label, m[2].trim()] : null;
  }
  function cells(line) {
    let inner = line.slice(1);
    if (inner.endsWith('|') && !inner.endsWith('\\|')) inner = inner.slice(0, -1);
    const out = [''];
    let escaped = false;
    for (const c of inner) {
      if (c === '|' && !escaped) out.push(''); else out[out.length - 1] += c;
      escaped = c === '\\' && !escaped;
    }
    return out.map(c => c.trim());
  }
  function colAlign(cell) {
    const d = cell.replace(/^:/, '').replace(/:$/, '');
    if (!d || !/^-+$/.test(d)) return null;
    return cell.startsWith(':') && cell.endsWith(':') ? 'c' : cell.endsWith(':') ? 'r' : 'l';
  }
  function table(lines) {
    const rows = lines.map(cells);
    let align = rows[1] ? rows[1].map(colAlign) : [null];
    const head = !align.includes(null);
    if (head) rows.splice(1, 1); else align = [];
    const n = Math.max(align.length, ...rows.map(r => r.length));
    while (align.length < n) align.push('l');
    const body = rows.map(r => Array.from({ length: n }, (_, k) => inline(r[k] || '')));
    return { t: 'table', align, head: head ? body.shift() : [], rows: body };
  }
  // Split [^label] calls to defined notes out of spans; numbers follow first reference.
  function refs(spans, defs, order) {
    const out = [];
    for (const sp of spans) {
      let lit = '', rest = sp.text, i;
      while ((i = rest.indexOf('[^')) >= 0) {
        const after = rest.slice(i + 2), j = after.indexOf(']');
        const l = j > 0 && !/\s/.test(after.slice(0, j)) ? after.slice(0, j) : null;
        if (l !== null && defs.has(l)) {
          lit += rest.slice(0, i);
          if (lit) out.push({ ...sp, text: lit });
          lit = '';
          let k = order.indexOf(l);
          if (k < 0) k = order.push(l) - 1;
          out.push({ ...sp, text: String(k + 1), note: k + 1 });
          rest = after.slice(l.length + 1);
        } else {
          lit += rest.slice(0, i + 2);
          rest = after;
        }
      }
      lit += rest;
      if (lit) out.push({ ...sp, text: lit });
    }
    return out;
  }
  function parse(text) {
    const defs = new Map(), blocks = [];
    let tbl = [], tblAt = 0;
    const flush = () => { if (tbl.length) blocks.push(Object.assign(table(tbl), { n: tblAt })); tbl = []; };
    text.split(/\r?\n/).forEach((raw, n) => {
      const line = raw.trim(), d = noteDef(line);
      if (d) { if (!defs.has(d[0])) defs.set(d[0], d[1]); return; }
      if (line.startsWith('|')) { if (!tbl.length) tblAt = n; tbl.push(line); return; }
      flush();
      if (line) blocks.push(Object.assign(blockOf(line), { n }));
    });
    flush();
    const order = [];
    for (const b of blocks) {
      if (b.t === 'p' || b.t === 'q') b.s = refs(b.s, defs, order);
      if (b.t === 'table') { b.head = b.head.map(c => refs(c, defs, order)); b.rows = b.rows.map(r => r.map(c => refs(c, defs, order))); }
    }
    return { blocks, notes: order.map(l => inline(defs.get(l))) };
  }

  /* ---- typesetting ---- */
  const ink = spans => spans.map(s => {
    let h = esc(s.text);
    if (s.note) h = `<sup class="fmt-call">${h}</sup>`;
    if (s.italic) h = `<em>${h}</em>`;
    if (s.bold) h = `<strong>${h}</strong>`;
    return h;
  }).join('');
  const IMG = '<svg viewBox="0 0 48 32" width="48" height="32" aria-hidden="true"><path d="M2 30 17 10l9 11 6-7 14 16Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="36" cy="7" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  function blockHTML(b) {
    const at = ` data-n="${b.n}"`;
    switch (b.t) {
      case 'p': return `<p${at}>${ink(b.s)}</p>`;
      case 'q': return `<blockquote${at}>${ink(b.s)}</blockquote>`;
      case 'h2': case 'h3': return `<div class="fmt-${b.t}"${at}>${ink(b.s)}</div>`;
      case 'brk': return `<div class="fmt-brk" role="separator" aria-label="Scene break"${at}><span aria-hidden="true">⁂</span></div>`;
      case 'img': return `<figure${at}><div class="fmt-ph">${IMG}<span>${esc(b.src)}</span></div>${b.s.length ? `<figcaption>${ink(b.s)}</figcaption>` : ''}</figure>`;
      case 'table': {
        const row = (r, tag) => `<tr>${r.map((c, k) => `<${tag} class="fmt-${b.align[k]}">${ink(c)}</${tag}>`).join('')}</tr>`;
        return `<div class="fmt-tbl"${at}><table>${b.head.length ? `<thead>${row(b.head, 'th')}</thead>` : ''}<tbody>${b.rows.map(r => row(r, 'td')).join('')}</tbody></table></div>`;
      }
    }
  }
  const notesHTML = notes => `<div class="fmt-notes" role="note" aria-label="Footnotes">${notes.map((s, k) =>
    `<p><span class="fmt-nn">${k + 1}</span>${ink(s)}</p>`).join('')}</div>`;

  let uid = 0;
  window.BTLDemos = window.BTLDemos || {};
  window.BTLDemos.format = function mount(root) {
    const id = 'fmt-src-' + ++uid;
    root.innerHTML =
      `<div class="fmt">
        <div class="fmt-ed">
          <div class="fmt-bar"><label for="${id}">Chapter text</label><button type="button" class="fmt-reset">Reset</button></div>
          <textarea id="${id}" spellcheck="false" autocapitalize="sentences"></textarea>
          <div class="fmt-try" role="group" aria-label="Insert the format at the caret"><span aria-hidden="true">Try</span></div>
        </div>
        <div class="fmt-out">
          <div class="fmt-bar"><span>In print</span><span class="fmt-hint">updates as you type</span></div>
          <div class="fmt-paper" lang="en" aria-live="polite" aria-label="The typeset page" tabindex="0"></div>
        </div>
      </div>`;
    const ta = root.querySelector('textarea'), paper = root.querySelector('.fmt-paper'), tryRow = root.querySelector('.fmt-try');
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    ta.value = SAMPLE;

    let shown = [];
    function render(follow) {
      const { blocks, notes } = parse(ta.value);
      const html = blocks.length ? blocks.map(blockHTML) : ['<p class="fmt-empty">Type a line on the left and it is set here.</p>'];
      if (notes.length) html.push(notesHTML(notes));
      // Replace only the blocks that changed, so the live region announces the edit, not the page.
      const kids = paper.children;
      html.forEach((h, k) => {
        if (shown[k] === h && kids[k]) return;
        const t = document.createElement('template');
        t.innerHTML = h;
        if (kids[k]) kids[k].replaceWith(t.content); else paper.append(t.content);
      });
      while (kids.length > html.length) paper.lastElementChild.remove();
      shown = html;
      if (!follow) return;
      // Keep the block under the caret in view, scrolling only the page preview.
      const line = ta.value.slice(0, ta.selectionStart).split('\n').length - 1;
      let el = null;
      for (const c of paper.querySelectorAll('[data-n]')) if (+c.dataset.n <= line) el = c;
      if (!el) return;
      const top = el.offsetTop - paper.offsetTop, bottom = top + el.offsetHeight;
      if (top < paper.scrollTop || bottom > paper.scrollTop + paper.clientHeight)
        paper.scrollTo({ top: Math.max(0, top - 24), behavior: still.matches ? 'auto' : 'smooth' });
    }

    // Replace the selection with `text`, then select [a, b) inside it.
    function put(text, a = text.length, b = a) {
      ta.focus();
      const s = ta.selectionStart;
      if (!document.execCommand('insertText', false, text)) ta.setRangeText(text, s, ta.selectionEnd, 'end');
      ta.setSelectionRange(s + a, s + b);
      render(true);
    }
    const wrap = (mark, word) => {
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd) || word;
      put(mark + sel + mark, mark.length, mark.length + sel.length);
    };
    // A block goes on its own line, after the line the caret is on.
    const block = (text, a = text.length) => {
      const v = ta.value;
      let end = v.indexOf('\n', ta.selectionEnd);
      if (end < 0) end = v.length;
      const pre = end > 0 && v[end - 1] !== '\n' ? '\n' : '';
      ta.setSelectionRange(end, end);
      put(pre + text, pre.length + a, pre.length + text.length);
    };
    const footnote = () => {
      const v = ta.value;
      let k = 1;
      while (v.includes(`[^${k}]`)) k++;
      const at = ta.selectionEnd;
      ta.setSelectionRange(v.length, v.length);
      put(`${v && !v.endsWith('\n') ? '\n' : ''}[^${k}]: A note, set small at the foot of the page.`);
      ta.setSelectionRange(at, at);
      put(`[^${k}]`);
    };
    const TRY = [
      ['Italic', () => wrap('*', 'slanted')],
      ['Bold', () => wrap('**', 'firm')],
      ['Heading', () => block('## A new heading', 3)],
      ['Quote', () => block('> A quoted passage, set in from both margins.', 2)],
      ['Scene break', () => block('***\nLater, the water was still climbing.')],
      ['Table', () => block('| Name | Age |\n|---|--:|\n| Iske | 34 |\n| Corran | 41 |')],
      ['Footnote', footnote],
    ];
    for (const [name, fn] of TRY) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = name;
      btn.addEventListener('click', fn);
      tryRow.append(btn);
    }
    root.querySelector('.fmt-reset').addEventListener('click', () => {
      ta.value = SAMPLE;
      render(false);
      paper.scrollTop = 0;
      ta.scrollTop = 0;
    });
    ta.addEventListener('input', () => render(true));
    render(false);
  };
})();
