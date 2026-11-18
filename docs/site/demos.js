// Small working pieces of the app, set in its own rules (studio/DESIGN.md) and the sample book
// (core/src/sample.rs). Everything happens in this tab: no network, nothing uploaded, nothing saved.
(() => {
  const B = window.BTL;
  if (!B) return;
  const { D, esc } = B;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const design = k => D.find(d => d.k === k);
  const FANTASY = design('fantasy');
  const fmt = n => n.toLocaleString('en-US');
  const plural = (n, one, many = one + 's') => `${fmt(n)} ${n === 1 ? one : many}`;
  // The app's count_words: split on whitespace and dashes, count pieces with a letter or digit.
  const count = t => t.split(/[\s—–]+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------- The sample book ---------- */
  const BOOK = { title: 'Where the Rivers Run Upward', author: 'Imre Calloway', sub: 'Book One of the Saltmarch Cycle', pub: 'Windle & Thorn', goal: 80000, daily: 500, other: 72 };
  const CH = [
    { t: 'The River That Climbed', text: `On the morning the Tamsel turned around, Iske Varrow was selling her last good compass for the price of a week's bread.
The fishwives saw it first. A cry went up along the quay at Lowmere, then another, and then the whole market was crowding the river wall to watch the water slow, and stop, and begin, with the patience of something that had made up its mind, to climb.[^lowmere]
It went up the weir steps like a congregation. It went up the tanners' lane and the long hill past the bell tower, carrying leaves and gulls and one astonished rowing boat, and it did not spill a drop.
"Rivers don't do that," said the man holding her compass.
"No," Iske agreed. She took the compass back out of his hand, because she had a feeling she was going to need it. "They don't."
***
By noon there were soldiers on the bridges, and by evening there were notices nailed to every door in the lower town. They were short, and the ink was still wet. *By order of the Ninefold Gate: all charts, maps and surveys of the Saltmarch are to be surrendered for burning.*
Iske read it twice by lamplight. Then she went home, lifted the loose board under her bed, and unrolled the one map she had sworn never to look at again.
[^lowmere]: *Lowmere* is the old marsh tongue for "the low lake." There has been no lake there for three hundred years.` },
    { t: 'A Ledger of Names', text: `Ten years ago she had drawn every river in the Saltmarch, and the empire had paid her in silver and then in disgrace, because the map was too honest about where the border ran.
She had drawn it carefully. She remembered every line, and the ledger in the case still held the figures:
| River | Charted | Leagues |
|---|:-:|--:|
| Tamsel | spring | 42 |
| Orrin | summer | 17 |
| Lesser Vey | autumn | 9 |
She did not remember the mountain.
It sat at the very top of the sheet where there should have been nothing but salt flats and the blank, polite space a cartographer leaves for what she has not seen. A dark peak, inked in a hand very like her own, and around it, like the spokes of a wheel, every river she had ever charted, all of them bending toward it.
Beneath it, in letters so small she needed her glass to read them, someone had written: *Not yet. Not until the water remembers.*
Outside, in the dark, the Tamsel went on climbing.` },
    { t: 'The Warden of the Ninefold Gate', text: `Corran Ash had arrested a great many people in his nine years as a warden, and he had never once been offered tea.
"You're here for the map," said the cartographer, pouring. She did not look up. "Sit down. You'll want to see it before you burn it."
"I'm here for you," said Corran, who had rehearsed this on the stairs. "The map is a separate matter."
"It isn't," she said, and turned the sheet toward him, and he saw the mountain, and the rivers bending toward it, and his own name written in the margin in a hand he knew very well, because it was his.` },
  ];
  const ROMAN = ['I', 'II', 'III'];

  /* ---------- Typesetting: the writing format into page HTML ---------- */
  const quotes = s => s.replace(/(^|[\s(—])"/g, '$1“').replace(/"/g, '”').replace(/(^|[\s(—])'/g, '$1‘').replace(/'/g, '’');
  function md(src, d, { open = true } = {}) {
    const notes = {}, order = [];
    const lines = src.split('\n').filter(l => {
      const m = l.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
      if (m) notes[m[1]] = m[2];
      return !m;
    });
    const typeset = s => esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[\^([^\]]+)\]/g, (_, k) => { if (!order.includes(k)) order.push(k); return `<sup class="fnr">${order.indexOf(k) + 1}</sup>`; });
    const ink = s => typeset(quotes(s));
    let out = '', i = 0, opened = !open, fresh = true;
    while (i < lines.length) {
      const l = lines[i].trim();
      let m;
      if (!l) { i++; continue; }
      if (/^(\*\s*){3,}$/.test(l)) { out += `<div class="brk" aria-hidden="true">${d.brk}</div>`; fresh = true; i++; continue; }
      if ((m = l.match(/^(#{2,3})\s+(.+)/))) { out += `<p class="md-h${m[1].length}">${ink(m[2])}</p>`; fresh = true; i++; continue; }
      if (l.startsWith('>')) {
        const q = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) q.push(lines[i++].trim().replace(/^>\s?/, ''));
        out += `<blockquote class="md-q">${q.map(ink).join('<br>')}</blockquote>`; fresh = true; continue;
      }
      if (l.startsWith('|')) {
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++].trim());
        out += table(rows, ink); fresh = true; continue;
      }
      if ((m = l.match(/^!\[([^\]]*)\]\(([^)]*)\)$/))) { out += `<div class="md-img"><span aria-hidden="true"></span><p>${ink(m[1])}</p></div>`; fresh = true; i++; continue; }
      const body = !opened && !/[*[]/.test(l) ? B.openHTML(d, quotes(l), typeset) : ink(l);
      out += `<p${fresh ? ' class="first"' : ''}>${body}</p>`;
      opened = true; fresh = false; i++;
    }
    if (order.length) out += `<div class="fns">${order.map((k, n) => `<p><sup>${n + 1}</sup> ${k in notes ? ink(notes[k]) : '<em>No note yet</em>'}</p>`).join('')}</div>`;
    return out;
  }
  function table(rows, ink) {
    const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const sep = rows.length > 1 && /^\|?(\s*:?-+:?\s*\|)*\s*:?-+:?\s*\|?$/.test(rows[1]);
    const al = sep ? cells(rows[1]).map(c => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left')) : [];
    const tr = (tag, r) => `<tr>${cells(r).map((c, j) => `<${tag} style="text-align:${al[j] || 'left'}">${ink(c)}</${tag}>`).join('')}</tr>`;
    return `<table class="md-t">${sep ? `<thead>${tr('th', rows[0])}</thead>` : ''}<tbody>${rows.slice(sep ? 2 : 0).map(r => tr('td', r)).join('')}</tbody></table>`;
  }

  /* ---------- Pages: one flow, windowed page by page ---------- */
  // ponytail: the browser's line breaking, measured into fixed page boxes, stands in for the Rust typesetter; page counts are close, not exact.
  function mkPage(d, html, folio) {
    const wrap = document.createElement('div');
    wrap.className = 'pg';
    wrap.innerHTML = `<div class="page"><div class="pg-win"><div class="pg-flow">${html}</div></div><span class="folio">${folio}</span></div><span class="pg-cap num">${folio}</span>`;
    B.setPageVars(wrap.firstChild, d);
    return wrap;
  }
  function paginate(host, d, html, { from = 1, max = 99 } = {}) {
    host.textContent = '';
    const first = mkPage(d, html, from);
    host.append(first);
    const win = $('.pg-win', first), flow = $('.pg-flow', first), head = $('.pg-head', flow);
    const lh = parseFloat(getComputedStyle(flow).lineHeight) || 1;
    const C = Math.max(1, Math.floor(win.clientHeight / lh)) * lh;
    win.style.bottom = 'auto'; win.style.height = C + 'px';
    // Keep the text on a grid of whole lines so no line is cut at a page's foot.
    let pad = '';
    if (head) { head.style.marginBottom = '0px'; pad = (Math.ceil(head.offsetHeight / lh + 1.5) * lh - head.offsetHeight) + 'px'; head.style.marginBottom = pad; }
    const n = Math.max(1, Math.ceil((flow.offsetHeight - lh * .6) / C)); // under a line over is spacing, not text
    for (let i = 1; i < Math.min(n, max); i++) {
      const p = mkPage(d, html, from + i), f = $('.pg-flow', p), w = $('.pg-win', p), h = $('.pg-head', f);
      w.style.bottom = 'auto'; w.style.height = C + 'px';
      if (h) h.style.marginBottom = pad;
      f.style.transform = `translateY(${-i * C}px)`;
      host.append(p);
    }
    return n;
  }
  const chapterHTML = (d, i, text = CH[i].text, title = CH[i].t) => B.headHTML(d, title, i + 1) + md(text, d);

  /* ---------- Editors: plain text, one paragraph per line, bold and italic shown ---------- */
  const edInline = l => esc(l).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const edHTML = text => text.split('\n').map(l => `<p${l.trim() === '***' ? ' class="sb"' : ''}>${edInline(l) || '<br>'}</p>`).join('');
  const ser = el => [...el.childNodes].map(n => {
    if (n.nodeType === 3) return n.data;
    if (n.nodeName === 'BR') return '\n';
    const inner = ser(n);
    return /^(B|STRONG)$/.test(n.nodeName) ? `**${inner}**` : /^(I|EM)$/.test(n.nodeName) ? `*${inner}*` : inner;
  }).join('');
  const readEd = ed => [...ed.childNodes].map(n => (n.nodeType === 3 ? n.data : ser(n))).join('\n').replace(/ /g, ' ').replace(/\n+$/, '');
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* older engines keep <div> */ }
  function editable(ed, onChange) {
    ed.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
    ed.addEventListener('drop', e => e.preventDefault());
    ed.addEventListener('input', () => {
      if (!ed.firstElementChild) ed.innerHTML = '<p><br></p>';
      $$('p', ed).forEach(p => p.classList.toggle('sb', p.textContent.trim() === '***'));
      onChange(readEd(ed));
    });
  }
  const EDITOR = (label, text, extra = '') => `<div class="ed${extra}" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${label}" spellcheck="false" data-ed>${edHTML(text)}</div>`;

  const refreshers = [];

  /* ---------- 1. The Write screen ---------- */
  function writeDemo(root) {
    root.classList.add('app');
    const texts = CH.map(c => c.text), pages = CH.map(() => 0);
    let ci = 0;
    root.innerHTML = `
      <div class="w-out">
        <p class="ui-h">Story</p>
        <ol class="w-list">${CH.map((c, i) => `<li><button type="button" class="w-row" data-ch="${i}" aria-pressed="${i === 0}"><span class="w-n num">${i + 1}</span><span class="w-t">${esc(c.t)}</span><span class="w-c num" data-wc="${i}"></span></button></li>`).join('')}</ol>
        <p class="ui-h">Back matter</p>
        <p class="w-row w-static"><span class="w-n"></span><span class="w-t">About the author</span><span class="w-c num">28</span></p>
      </div>
      <div class="w-main">
        <div class="tb">
          <button type="button" class="tool" data-cmd="bold" aria-label="Bold"><b>B</b></button>
          <button type="button" class="tool" data-cmd="italic" aria-label="Italic"><i>I</i></button>
          <span class="tb-sp"></span><span class="num tb-wc" data-words></span>
        </div>
        <div class="w-scroll"><div class="sheet">
          <p class="s-num" data-num>Chapter I</p><p class="s-title" data-title></p>
          ${EDITOR('Chapter text', '')}
        </div></div>
      </div>
      <div class="w-lands">
        <p class="ui-h2">Where this chapter lands in print</p>
        <p class="w-pages num" data-pages aria-live="polite">Pages 1–2 of 6</p>
        <div class="thumbs" data-thumbs></div>
        <p class="ui-note">Type, add a paragraph or paste a scene. The pages are set in Epic fantasy, 6 × 9 in.</p>
      </div>
      <div class="thumbs w-measure" aria-hidden="true" data-measure></div>`;
    const ed = $('[data-ed]', root), thumbs = $('[data-thumbs]', root), measure = $('[data-measure]', root);
    const show = () => {
      const start = 1 + pages.slice(0, ci).reduce((a, b) => a + b, 0), end = start + pages[ci] - 1;
      const total = pages.reduce((a, b) => a + b, 0) + 1; // + About the author
      $('[data-pages]', root).textContent = start === end ? `Page ${start} of ${total}` : `Pages ${start}–${end} of ${total}`;
    };
    const setPages = () => {
      const start = 1 + pages.slice(0, ci).reduce((a, b) => a + b, 0);
      pages[ci] = paginate(thumbs, FANTASY, chapterHTML(FANTASY, ci, texts[ci]), { from: start, max: 6 });
      if (pages[ci] > 6) thumbs.insertAdjacentHTML('beforeend', `<p class="ui-note more">and ${pages[ci] - 6} more</p>`);
      show();
    };
    const later = debounce(setPages, 140);
    const counts = () => {
      CH.forEach((_, i) => { $(`[data-wc="${i}"]`, root).textContent = fmt(count(texts[i])); });
      $('[data-words]', root).textContent = plural(count(texts[ci]), 'word');
    };
    function open(i) {
      ci = i;
      $$('[data-ch]', root).forEach(b => b.setAttribute('aria-pressed', +b.dataset.ch === i));
      $('[data-num]', root).textContent = 'Chapter ' + ROMAN[i];
      $('[data-title]', root).textContent = CH[i].t;
      ed.innerHTML = edHTML(texts[i]);
      $('.w-scroll', root).scrollTop = 0;
      counts(); setPages();
    }
    function all() {
      CH.forEach((_, i) => { if (i !== ci) pages[i] = paginate(measure, FANTASY, chapterHTML(FANTASY, i, texts[i]), { max: 1 }); });
      measure.textContent = '';
      setPages();
    }
    editable(ed, v => { texts[ci] = v; counts(); later(); });
    $$('[data-ch]', root).forEach(b => b.addEventListener('click', () => open(+b.dataset.ch)));
    $$('[data-cmd]', root).forEach(b => {
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => { ed.focus(); document.execCommand(b.dataset.cmd); });
    });
    open(0); all();
    refreshers.push(all);
  }

  /* ---------- 2. Word goals and snapshots ---------- */
  function goalsDemo(root) {
    root.classList.add('app');
    const ch = CH[2], others = CH.slice(0, 2).reduce((a, c) => a + count(c.text), 0);
    const story = t => others + count(t);
    const at = (days, h, m) => { const x = new Date(); x.setDate(x.getDate() - days); x.setHours(h, m, 0, 0); return x; };
    let text = ch.text;
    const atLoad = story(text);
    const firstPass = ch.text.split('\n').slice(0, 2).join('\n');
    const snaps = [{ name: 'Before the warden scene', when: at(3, 21, 40), text: ch.text.split('\n')[0] }, { name: 'Warden, first pass', when: at(1, 22, 15), text: firstPass }];
    const when = s => s.when.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    let asking = null;
    root.innerHTML = `
      <div class="g-main">
        <div class="tb"><span class="tb-title">${esc(ch.t)}</span><span class="tb-sp"></span><span class="num tb-wc" data-words></span></div>
        <div class="g-scroll"><div class="sheet">${EDITOR('Chapter text', text)}</div></div>
      </div>
      <div class="g-side">
        <section class="blk">
          <p class="ui-h2">Today</p>
          <p class="g-line num" data-today aria-live="polite"></p>
          <div class="bar" role="progressbar" aria-label="Today's words" aria-valuemin="0" aria-valuemax="${BOOK.daily}" data-tbar><i></i></div>
          <p class="g-line num" data-story></p>
          <div class="bar" role="progressbar" aria-label="Words in the story" aria-valuemin="0" aria-valuemax="${BOOK.goal}" data-sbar><i></i></div>
        </section>
        <section class="blk">
          <p class="ui-h2">Snapshots</p>
          <form class="g-form" data-form>
            <input class="ui-in" type="text" maxlength="40" placeholder="Name (optional)" aria-label="Snapshot name" autocomplete="off">
            <button type="submit" class="ui-btn">Save snapshot</button>
          </form>
          <ul class="g-snaps" data-snaps></ul>
          <div class="g-ask" data-ask hidden role="alertdialog" aria-labelledby="g-ask-t">
            <p id="g-ask-t" class="g-ask-t"></p><p class="ui-note" data-ask-d></p>
            <div class="g-ask-b"><button type="button" class="ui-btn" data-no>Cancel</button><button type="button" class="ui-btn ui-primary" data-yes>Restore</button></div>
          </div>
          <p class="ui-note" data-said role="status"></p>
        </section>
      </div>`;
    const ed = $('[data-ed]', root);
    const bar = (el, v, max) => { el.setAttribute('aria-valuenow', v); el.firstChild.style.width = Math.min(100, v / max * 100) + '%'; };
    function show() {
      const s = story(text), today = Math.max(0, s - atLoad);
      $('[data-words]', root).textContent = plural(count(text), 'word');
      $('[data-today]', root).innerHTML = `<b>${fmt(today)}</b> of ${fmt(BOOK.daily)} words today${today >= BOOK.daily ? ' · goal met' : ''}`;
      $('[data-story]', root).innerHTML = `<b>${fmt(s)}</b> of ${fmt(BOOK.goal)} words in the story`;
      bar($('[data-tbar]', root), today, BOOK.daily); bar($('[data-sbar]', root), s, BOOK.goal);
    }
    function list() {
      $('[data-snaps]', root).innerHTML = [...snaps].sort((a, b) => b.when - a.when).map(s => `
        <li><span class="g-sn"><span class="g-sn-n">${esc(s.name)}</span><span class="ui-note num">${when(s)} · ${plural(story(s.text), 'word')}</span></span>
        <button type="button" class="ui-btn ui-ghost" data-restore="${snaps.indexOf(s)}">Restore…</button></li>`).join('');
      $$('[data-restore]', root).forEach(b => b.addEventListener('click', () => ask(snaps[+b.dataset.restore], b)));
    }
    let returnTo = null;
    function ask(s, from) {
      asking = s; returnTo = from;
      const box = $('[data-ask]', root);
      $('.g-ask-t', box).textContent = `Restore “${s.name}”?`;
      $('[data-ask-d]', box).textContent = `The whole book goes back to how it was on ${when(s)}. Your current version is saved as a snapshot called “Before restoring” first, so nothing is lost.`;
      box.hidden = false; $('[data-yes]', box).focus();
    }
    const close = () => { $('[data-ask]', root).hidden = true; asking = null; returnTo?.focus(); };
    $('[data-no]', root).addEventListener('click', close);
    $('[data-ask]', root).addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    $('[data-yes]', root).addEventListener('click', () => {
      const s = asking;
      snaps.push({ name: 'Before restoring', when: new Date(), text });
      text = s.text; ed.innerHTML = edHTML(text);
      $('[data-ask]', root).hidden = true; asking = null;
      list(); show();
      $('[data-said]', root).textContent = `Restored “${s.name}”. Your previous version is saved as “Before restoring”.`;
      $('[data-snaps] button', root)?.focus();
    });
    $('[data-form]', root).addEventListener('submit', e => {
      e.preventDefault();
      const input = $('input', e.target), name = input.value.trim() || `Snapshot ${snaps.length + 1}`;
      snaps.push({ name, when: new Date(), text }); input.value = '';
      list();
      $('[data-said]', root).textContent = `Snapshot saved: “${name}”, ${plural(story(text), 'word')}.`;
    });
    editable(ed, v => { text = v; show(); });
    list(); show();
  }

  /* ---------- 3. Designs: cards and a live two-page spread ---------- */
  function themesDemo(root) {
    root.classList.add('app');
    let cur = D.indexOf(design('classic-fiction'));
    root.innerHTML = `
      <div class="t-cards" role="group" aria-label="Designs">${D.map((d, i) => `
        <button type="button" class="t-card" data-t="${i}" aria-pressed="false">
          <span class="t-sw" aria-hidden="true"><span style="font-family:&quot;${d.h}&quot;,Georgia,serif;${d.up ? 'text-transform:uppercase;letter-spacing:.04em;' : ''}${d.it ? 'font-style:italic;' : ''}${d.c ? `color:${d.c};` : ''}">Aa</span><span class="t-orn" data-orn="${d.brk}" style="color:${d.oc || d.c || '#2b2723'}"></span></span>
          <span class="t-name">${esc(d.n)}</span><span class="t-spec num">${esc(d.b)} ${d.pt} pt</span>
        </button>`).join('')}</div>
      <div class="t-stage">
        <div class="t-spread" data-spread></div>
        <p class="t-meta num" data-meta aria-live="polite"></p>
      </div>`;
    const spread = $('[data-spread]', root);
    function render() {
      const d = D[cur], [tw, th] = B.trimOf(d);
      // A spread is two pages: the chapter's second page, or the next chapter opening when it fits on one.
      if (paginate(spread, d, chapterHTML(d, 0), { max: 2 }) < 2) {
        const next = document.createElement('div');
        paginate(next, d, chapterHTML(d, 1), { from: 2, max: 1 });
        spread.append(...next.children);
      }
      $('[data-meta]', root).textContent = `${d.n} · ${d.b} ${d.pt} pt · ${tw} × ${th} in`;
      $$('[data-t]', root).forEach(b => b.setAttribute('aria-pressed', +b.dataset.t === cur));
    }
    $$('[data-t]', root).forEach(b => b.addEventListener('click', () => { cur = +b.dataset.t; render(); }));
    render();
    refreshers.push(render);
  }

  /* ---------- Mount every demo: these three, and the modules in demos/<name>.js ---------- */
  // A module registers window.BTLDemos.<name> = mount(root); a missing one leaves its (hidden, empty) box alone.
  const R = (window.BTLDemos = window.BTLDemos || {});
  Object.assign(R, { write: writeDemo, goals: goalsDemo, themes: themesDemo });
  Object.assign(B, { md, paginate }); // the page renderer, for any module that wants it
  B.loadFonts();
  // Page breaks depend on the book fonts and the width: set again when either changes.
  const again = debounce(() => refreshers.forEach(f => f()), 150);
  document.fonts?.addEventListener?.('loadingdone', again);
  let lastW = innerWidth;
  addEventListener('resize', () => { if (innerWidth !== lastW) { lastW = innerWidth; again(); } });
  const mountAll = () => $$('.demo[class*="demo-"]').forEach(el => {
    const name = [...el.classList].find(c => c.startsWith('demo-'))?.slice(5);
    if (!name || 'mounted' in el.dataset || !R[name]) return;
    el.dataset.mounted = '';
    try { R[name](el); } catch (e) { el.textContent = ''; console.warn(`Demo "${name}" didn't start`, e); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll); else mountAll();
})();
