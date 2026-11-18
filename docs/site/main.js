// Between the Lines landing page. No dependencies.
(() => {
  const REPO = 'shravanibnikam/between-the-lines';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // The sample book's own prose (core/src/sample.rs). It is the ink of every picture on the page.
  const PROSE = "On the morning the Tamsel turned around, Iske Varrow was selling her last good compass for the price of a week's bread. The fishwives saw it first. A cry went up along the quay at Lowmere, then another, and then the whole market was crowding the river wall to watch the water slow, and stop, and begin, with the patience of something that had made up its mind, to climb. It went up the weir steps like a congregation. It went up the tanners' lane and the long hill past the bell tower, carrying leaves and gulls and one astonished rowing boat, and it did not spill a drop. Rivers don't do that, said the man holding her compass. No, Iske agreed. She took the compass back out of his hand, because she had a feeling she was going to need it. They don't. By noon there were soldiers on the bridges, and by evening there were notices nailed to every door in the lower town. ";
  const INK = PROSE.replace(/[\s,.'"]/g, '');

  /* ---------- Entrances ---------- */
  const sections = $$('[data-reveal]');
  sections.forEach(sec => $$('.r', sec).forEach((el, i) => {
    if (el.closest('[data-reveal]') === sec) el.style.setProperty('--i', i);
  }));
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -12% 0px' });
    sections.forEach(s => io.observe(s));
  } else sections.forEach(s => s.classList.add('in'));

  /* ---------- Which system is this? ---------- */
  const ua = navigator.userAgent;
  const touchMac = /Mac/.test(ua) && navigator.maxTouchPoints > 1; // iPad
  const os = /Android|iPhone|iPod/.test(ua) || touchMac ? null
    : /Mac/.test(ua) ? 'mac' : /Win/.test(ua) ? 'win' : /Linux|X11|CrOS/.test(ua) ? 'linux' : null;
  const OS_NAME = { mac: 'macOS', win: 'Windows', linux: 'Linux' };
  const OS_ASSET = { mac: 'dmg', win: 'exe', linux: 'appimage' };

  function setPrimary() {
    if (!os) return;
    $(`[data-os="${os}"]`)?.classList.add('mine');
    const a = $(`[data-asset="${OS_ASSET[os]}"]`);
    $$('[data-dl-primary]').forEach(b => {
      b.href = a.href;
      b.textContent = b.classList.contains('btn-sm') ? 'Download' : `Download for ${OS_NAME[os]}`;
    });
  }
  setPrimary();

  /* ---------- The latest release, so links and sizes stay current ---------- */
  const MATCH = { dmg: /universal\.dmg$/, exe: /-setup\.exe$/, msi: /\.msi$/, appimage: /\.AppImage$/, deb: /\.deb$/, rpm: /\.rpm$/, flatpak: /\.flatpak$/ };
  const mb = n => (n / 1e6 >= 20 ? Math.round(n / 1e6) : (n / 1e6).toFixed(1)) + ' MB';
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
    .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
    .then(rel => {
      const v = String(rel.tag_name || '').replace(/^v/, '');
      if (v) $$('[data-version]').forEach(el => (el.textContent = `Version ${v}`));
      for (const [key, re] of Object.entries(MATCH)) {
        const asset = (rel.assets || []).find(x => re.test(x.name));
        if (!asset) continue;
        $$(`[data-asset="${key}"]`).forEach(a => { a.href = asset.browser_download_url; a.hidden = false; }); // the Flatpak link is hidden until a release has one
        $$(`[data-size="${key}"]`).forEach(s => (s.textContent = mb(asset.size)));
      }
      setPrimary();
    })
    .catch(() => {}); // The baked-in links still work.

  /* ---------- Hero: the line typing between the two lines of the name ---------- */
  const line = $('#line');
  const head = $('.head');
  const meter = document.createElement('canvas').getContext('2d');
  const OPENINGS = [
    'On the morning the Tamsel turned around, Iske Varrow was selling her last good compass.',
    'It went up the weir steps like a congregation, and it did not spill a drop.',
    'By noon there were soldiers on the bridges.',
    'Corran Ash had arrested a great many people, and he had never once been offered tea.',
  ];
  let opening = OPENINGS[0];
  let typing = !reduce;
  const listeners = new Set();

  function placeHead() {
    const cs = getComputedStyle(line);
    meter.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const caret = document.activeElement === line ? line.selectionStart ?? line.value.length : line.value.length;
    const x = Math.min(meter.measureText(line.value.slice(0, caret)).width - line.scrollLeft, line.clientWidth - 30);
    head.style.setProperty('--x', `${Math.max(0, x - 12)}px`);
  }
  function emit() { listeners.forEach(fn => fn(line.value.trim() || OPENINGS[0])); }

  async function typeLoop() {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    await wait(900);
    for (let n = 0; typing; n++) {
      const text = OPENINGS[n % OPENINGS.length];
      line.value = '';
      for (const ch of text) {
        if (!typing) return;
        line.value += ch; placeHead();
        await wait(ch === ' ' ? 70 : ch === ',' ? 220 : 34 + Math.random() * 46);
      }
      opening = text; emit();
      await wait(2600);
      if (!typing) return;
      // Carriage return: the line clears from the end, quickly.
      while (line.value && typing) { line.value = line.value.slice(0, -3); placeHead(); await wait(12); }
    }
  }
  line.addEventListener('focus', () => {
    if (typing) { typing = false; line.value = opening; }
    requestAnimationFrame(() => { line.select(); placeHead(); });
  });
  line.addEventListener('input', () => { placeHead(); emit(); });
  ['keyup', 'click', 'select'].forEach(t => line.addEventListener(t, placeHead));
  line.addEventListener('keydown', e => { if (e.key === 'Enter') { line.blur(); $('#designs').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); } });
  addEventListener('resize', placeHead);
  document.fonts?.ready.then(placeHead);
  placeHead();
  if (typing) typeLoop();

  /* ---------- Pictures made of type ---------- */
  // A brightness ramp, dim to dense. Each cell takes the character whose ink matches the picture there.
  const RAMP = ' .:-=+*#%@';
  /* The footer: the name set in type, edges shaded by coverage. A raspberry light sweeps across it; it scrambles under the pointer. */
  const mark = $('[data-ascii-mark]');
  if (mark) {
    const mx = mark.getContext('2d');
    let cells = [], W = 0, H = 0, cell = 10, cw = 6, dpr = 1, ptr = null, raf = 0;
    const build = () => {
      const pad = parseFloat(getComputedStyle(mark.parentElement).paddingLeft);
      W = mark.parentElement.clientWidth - pad * 2;
      cell = Math.max(6, Math.min(11, W / 150)); cw = cell * .6; dpr = Math.min(2, devicePixelRatio || 1);
      const LINES = ['Between', 'the Lines'];
      const m = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      m.font = '700 100px "DM Sans"';
      const fs = 100 * W / Math.max(...LINES.map(t => m.measureText(t).width)) * .97, lh = fs * .9;
      H = Math.ceil(lh * 2 + fs * .06);
      m.canvas.width = W; m.canvas.height = H;
      m.font = `700 ${fs}px "DM Sans"`; m.textBaseline = 'alphabetic';
      LINES.forEach((t, i) => m.fillText(t, 0, fs * .76 + i * lh));
      const a = m.getImageData(0, 0, W, H).data;
      cells = [];
      for (let y = 0; y + cell <= H; y += cell) for (let x = 0; x + cw <= W; x += cw) {
        // Coverage over a 3 × 3 sample of the cell, so edges get lighter characters.
        let c = 0;
        for (let j = 1; j <= 3; j++) for (let i = 1; i <= 3; i++) c += a[(((y + cell * j / 4) | 0) * W + ((x + cw * i / 4) | 0)) * 4 + 3];
        c /= 9 * 255;
        if (c > .06) cells.push({ x, y, c, ch: RAMP[Math.max(1, Math.round(c * (RAMP.length - 1)))], heat: 0 });
      }
      mark.width = W * dpr; mark.height = H * dpr; mark.style.height = H + 'px';
      mark.closest('footer').classList.add('drawn');
      kick();
    };
    function paint(now) {
      raf = 0;
      const t = (now || 0) / 1000, sweep = ((t * .12) % 1.6 - .3) * W;
      mx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mx.clearRect(0, 0, W, H);
      mx.font = `600 ${cell}px "Source Code Pro", monospace`; mx.textBaseline = 'top';
      let hot = false;
      for (const c of cells) {
        if (ptr && Math.hypot(c.x - ptr.x, c.y - ptr.y) < 100) c.heat = 1;
        const band = reduce ? 0 : Math.max(0, 1 - Math.abs(c.x + c.y * .4 - sweep) / 140);
        let ch = c.ch;
        if (c.heat > .02) { hot = true; c.heat *= .93; if (c.heat > .4 && Math.random() < .35) ch = RAMP[2 + ((Math.random() * 8) | 0)]; }
        const k = Math.max(band, c.heat);
        // Ink (#e4e4e1) warming to raspberry (#e0679a) under the light or the pointer.
        mx.fillStyle = `rgb(${228 - 4 * k},${228 - 125 * k},${225 - 71 * k})`;
        mx.globalAlpha = .35 + .65 * c.c;
        mx.fillText(ch, c.x, c.y);
      }
      mx.globalAlpha = 1;
      if (!reduce && (hot || ptr || visible)) raf = requestAnimationFrame(paint);
    }
    let visible = false;
    const kick = () => { if (!raf) raf = requestAnimationFrame(paint); };
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(mark);
    mark.addEventListener('pointermove', e => { const r = mark.getBoundingClientRect(); ptr = { x: e.clientX - r.left, y: e.clientY - r.top }; kick(); });
    mark.addEventListener('pointerleave', () => { ptr = null; });
    let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(build, 150); });
    (document.fonts ? Promise.all([document.fonts.load('700 100px "DM Sans"'), document.fonts.load('600 10px "Source Code Pro"')]) : Promise.resolve()).then(build);
  }

  /* ---------- The live page: 17 designs (core/src/themes.rs) ---------- */
  // [key, name, body face, heading face, pt, leading, numbers, title, colours, ornament, scene break, drop cap, options, trim]
  const D = [
    { k: 'classic-fiction', n: 'Classic fiction', b: 'Gelasio', h: 'Gelasio', pt: 10.5, l: 1.38, num: 'none', ts: 1.7, sc: true, brk: '* * *' },
    { k: 'literary', n: 'Literary', b: 'EB Garamond', h: 'EB Garamond', pt: 12, l: 1.32, num: 'roman', ts: 1.9, it: true, brk: '❦\uFE0E', dc: 3 },
    { k: 'thriller', n: 'Thriller', b: 'Gelasio', h: 'Libre Franklin', pt: 10, l: 1.3, num: 'numeric', ts: 1.35, up: true, left: true, dc: 2, brk: '* * *' },
    { k: 'romance', n: 'Romance', b: 'PT Serif', h: 'Gelasio', pt: 10.5, l: 1.4, num: 'written', ts: 1.9, it: true, c: '#7d2f45', orn: 'flourish', brk: '❧\uFE0E', dc: 2 },
    { k: 'fantasy', n: 'Epic fantasy', b: 'EB Garamond', h: 'Cinzel', pt: 12, l: 1.35, num: 'roman', ts: 1.5, up: true, oc: '#5e4518', orn: 'diamond', brk: '⁂', dc: 3, sc: true, trim: [6, 9] },
    { k: 'romantasy', n: 'Romantasy', b: 'Lora', h: 'Cormorant', pt: 11, l: 1.42, num: 'written', ts: 2.1, oc: '#46603a', orn: 'vine', brk: '✦\uFE0E ✦\uFE0E ✦\uFE0E', dc: 3 },
    { k: 'gothic-romance', n: 'Gothic romance', b: 'Lora', h: 'Cinzel Decorative', nf: 'Cinzel', pt: 10.5, l: 1.38, num: 'roman', ts: 1.6, oc: '#352b45', dcc: '#5c2230', orn: 'moon', brk: '☾\uFE0E', dc: 4 },
    { k: 'horror', n: 'Horror', b: 'Alegreya', h: 'Playfair Display', pt: 11.5, l: 1.35, num: 'numeric', ts: 1.9, it: true, oc: '#5c2230', brk: '• • •', dc: 3 },
    { k: 'sci-fi', n: 'Science fiction', b: 'PT Serif', h: 'Source Code Pro', pt: 10.5, l: 1.35, num: 'numeric', ts: 1.25, up: true, left: true, c: '#285063', oc: '#285063', orn: 'compass', brk: '✧\uFE0E', block: .6, trim: [6, 9] },
    { k: 'memoir', n: 'Memoir', b: 'PT Serif', h: 'PT Serif', pt: 11, l: 1.4, num: 'written', ts: 1.7, it: true, brk: '~' },
    { k: 'clean-nonfiction', n: 'Clean non-fiction', b: 'PT Serif', h: 'Libre Franklin', pt: 10.5, l: 1.4, num: 'none', ts: 1.7, left: true, brk: '◆', dc: 3, block: .6, trim: [6, 9] },
    { k: 'modern-minimal', n: 'Minimal', b: 'Instrument Sans', h: 'Instrument Sans', pt: 10, l: 1.45, num: 'none', ts: 1.7, left: true, rag: true, brk: '—', dc: 3, block: .8, trim: [6, 9] },
    { k: 'academic', n: 'Academic', b: 'Source Serif 4', h: 'Source Serif 4', pt: 11, l: 1.4, num: 'numeric', ts: 1.5, left: true, brk: '* * *', trim: [6, 9] },
    { k: 'poetry', n: 'Poetry', b: 'EB Garamond', h: 'EB Garamond', pt: 11.5, l: 1.45, num: 'none', ts: 1.6, it: true, rag: true, brk: '⁂', block: 1 },
    { k: 'childrens', n: "Children's", b: 'Gelasio', h: 'Libre Franklin', pt: 13, l: 1.45, num: 'written', ts: 1.8, c: '#285063', oc: '#b87a14', rag: true, brk: '✦\uFE0E ✦\uFE0E ✦\uFE0E', block: .6, trim: [6, 9] },
    { k: 'large-print', n: 'Large print', b: 'Gelasio', h: 'Gelasio', pt: 16, l: 1.4, num: 'numeric', ts: 1.5, rag: true, brk: '* * *', dc: 3, block: .6, trim: [6, 9] },
    { k: 'dyslexia-friendly', n: 'Easy reading', b: 'Instrument Sans', h: 'Instrument Sans', pt: 13, l: 1.5, num: 'numeric', ts: 1.5, left: true, rag: true, brk: '* * *', dc: 3, block: 1, trim: [6, 9] },
  ];
  const ORN = {
    diamond: '<svg viewBox="0 0 140 12" fill="currentColor"><rect x="0" y="5.5" width="58" height="1"/><path d="M70 0l6 6-6 6-6-6z"/><circle cx="60" cy="6" r="1.4"/><circle cx="80" cy="6" r="1.4"/><rect x="82" y="5.5" width="58" height="1"/></svg>',
    flourish: '<svg viewBox="0 0 140 14" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M8 7c14-8 26 8 40 0s18-6 22 0c4-6 8-8 22 0s26 8 40 0"/><path d="M70 2l3 5-3 5-3-5z" fill="currentColor" stroke="none"/></svg>',
    vine: '<svg viewBox="0 0 140 16" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M10 9c18 0 30-6 46-2s10 6 14 6 0-10 0-10 0 10 0 10 4-2 14-6 28 2 46 2"/><path d="M38 6c2-4 6-5 9-4-1 3-5 5-9 4zM102 6c-2-4-6-5-9-4 1 3 5 5 9 4z" fill="currentColor"/></svg>',
    moon: '<svg viewBox="0 0 140 16" fill="currentColor"><path d="M74 1a7 7 0 1 0 0 14 6 6 0 0 1 0-14z"/><circle cx="80" cy="5" r="1"/><circle cx="83" cy="10" r=".8"/></svg>',
    compass: '<svg viewBox="0 0 140 16" fill="currentColor"><path d="M70 0l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></svg>',
  };
  const WORDS = ['One', 'Two', 'Three'];
  const ROMAN = ['I', 'II', 'III'];
  const REST = [
    "The fishwives saw it first. A cry went up along the quay at Lowmere, then another, and then the whole market was crowding the river wall to watch the water slow, and stop, and begin, with the patience of something that had made up its mind, to climb.",
    "It went up the weir steps like a congregation. It went up the tanners' lane and the long hill past the bell tower, carrying leaves and gulls and one astonished rowing boat, and it did not spill a drop.",
    "“Rivers don't do that,” said the man holding her compass.",
    "“No,” Iske agreed. She took the compass back out of his hand, because she had a feeling she was going to need it. “They don't.”",
    "By noon there were soldiers on the bridges, and by evening there were notices nailed to every door in the lower town. They were short, and the ink was still wet.",
  ];

  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let fontsLoaded = false;

  function loadFonts() {
    if (fontsLoaded) return; fontsLoaded = true;
    const fam = ['Gelasio:ital,wght@0,400;0,700;1,400', 'EB+Garamond:ital,wght@0,400;1,400', 'Libre+Franklin:wght@400;600', 'PT+Serif:ital,wght@0,400;1,400',
      'Cinzel', 'Lora:ital@0;1', 'Cormorant:ital,wght@0,500;1,500', 'Cinzel+Decorative', 'Alegreya:ital@0;1', 'Playfair+Display:ital@0;1',
      'Instrument+Sans', 'Source+Serif+4:ital,opsz@0,8..60;1,8..60'];
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?${fam.map(f => 'family=' + f).join('&')}&display=swap`;
    document.head.append(l);
  }

  /* Shared with demos.js: page variables, a chapter head and an opening paragraph in any design. */
  const trimOf = d => d.trim || [5.5, 8.5];
  function setPageVars(el, d) {
    const [tw, th] = trimOf(d), st = el.style;
    st.setProperty('--tw', tw); st.setProperty('--th', th); st.setProperty('--pt', d.pt); st.setProperty('--lead', d.l);
    st.setProperty('--ts', d.ts); st.setProperty('--tc', d.c || 'inherit'); st.setProperty('--numc', d.c || 'inherit');
    st.setProperty('--orn', d.oc || d.c || 'currentColor'); st.setProperty('--dcc', d.dcc || d.oc || d.c || 'inherit');
    st.setProperty('--dcl', d.dc || 0); st.setProperty('--hf', `"${d.h}"`);
    st.setProperty('--align', d.rag ? 'left' : 'justify'); st.setProperty('--indent', d.block ? '0' : '1.2em');
    st.setProperty('--gapp', (d.block || 0) + 'em');
    st.fontFamily = `"${d.b}", Georgia, serif`;
    el.classList.toggle('block', !!d.block);
  }
  function headHTML(d, title, n = 1) {
    const num = { none: '', roman: ROMAN[n - 1], numeric: 'Chapter ' + n, written: 'Chapter ' + WORDS[n - 1] }[d.num];
    const titleStyle = `font-family:&quot;${d.h}&quot;,Georgia,serif;${d.up ? 'text-transform:uppercase;letter-spacing:.04em;' : ''}${d.it ? 'font-style:italic;' : ''}`;
    return `<div class="pg-head${d.left ? ' left' : ''}">` +
      (d.orn ? `<span class="pg-orn" aria-hidden="true">${ORN[d.orn]}</span>` : '') +
      (num ? `<span class="pg-num" style="font-family:&quot;${d.nf || d.h}&quot;,Georgia,serif">${num}</span>` : '') +
      `<span class="pg-title" style="${titleStyle}">${esc(title)}</span>` +
    `</div>`;
  }
  // The opening paragraph's drop cap and small caps; `ink` escapes (and may typeset) a run of text.
  function openHTML(d, first, ink = esc) {
    const words = first.split(' ');
    if (!d.dc && !d.sc) return ink(first);
    const head = d.dc ? `<span class="dc">${esc(first[0])}</span>${ink(words[0].slice(1))}` : ink(words[0]);
    return d.sc ? `<span class="sc">${head} ${ink(words.slice(1, 3).join(' '))}</span> ${ink(words.slice(3).join(' '))}`
      : `${head} ${ink(words.slice(1).join(' '))}`;
  }
  window.BTL = { D, ORN, esc, loadFonts, trimOf, setPageVars, headHTML, openHTML, onOpening: fn => listeners.add(fn) };

  const page = $('[data-page]'), chips = $('[data-chips]'), titleIn = $('[data-title]'), spec = $('[data-spec]');
  if (!page) return;
  let cur = D.findIndex(d => d.k === 'fantasy');
  let first = opening;

  D.forEach((d, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip';
    b.innerHTML = `${esc(d.n)} <small>${d.pt} pt</small>`;
    b.addEventListener('click', () => set(i));
    chips.append(b);
  });

  function render() {
    const d = D[cur], [tw, th] = trimOf(d);
    const title = (titleIn.value.trim() || 'The River That Climbed');
    setPageVars(page, d);
    page.innerHTML =
      headHTML(d, title) +
      `<p class="first">${openHTML(d, first)}</p>` +
      REST.slice(0, 2).map(p => `<p>${esc(p)}</p>`).join('') +
      `<div class="brk" aria-hidden="true">${d.brk}</div>` +
      REST.slice(2).map(p => `<p>${esc(p)}</p>`).join('') +
      `<span class="folio">1</span>`;
    spec.textContent = `${d.n} · ${d.b} ${d.pt} pt · ${tw} × ${th} in`;
    $$('.chip', chips).forEach((c, i) => c.setAttribute('aria-pressed', i === cur));
  }
  function set(i) {
    cur = (i + D.length) % D.length;
    if (reduce) return render();
    page.classList.add('swap');
    setTimeout(() => { render(); page.classList.remove('swap'); }, 180);
  }
  titleIn.addEventListener('input', render);
  $('[data-next]').addEventListener('click', () => set(cur + 1));
  listeners.add(v => { first = v; render(); });

  if ('IntersectionObserver' in window) {
    const fio = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { loadFonts(); fio.disconnect(); } }, { rootMargin: '800px 0px' });
    fio.observe(page);
  } else loadFonts();
  render();
})();
