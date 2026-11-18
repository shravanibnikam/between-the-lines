/* Preview demo: page through the sample book as print, large print and a phone ebook.
   Pages are typeset at 1 CSS px per point (a 6 × 9 in page is 432 × 648 px), paginated by
   measuring the text into the page boxes, then scaled to fit with a transform, so the layout is
   identical at every size. Numbers follow core/src/themes.rs and core/src/layout. */
(function () {
  'use strict';
  const PT = 72, W = 6 * PT, H = 9 * PT;   // reference page
  const EW = 360, EH = 740, EGAP = 52;     // reference phone screen; text column 308 + gap = 360
  const ESIZES = [14, 16, 18, 20, 22, 24];
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const smart = s => s.replace(/(^|[\s(—])"/g, '$1“').replace(/"/g, '”').replace(/'/g, '’');
  const FN = '‡';

  // The sample book (core/src/sample.rs).
  const BOOK = {
    title: 'Where the Rivers Run Upward', sub: 'Book One of the Saltmarch Cycle', author: 'Imre Calloway', pub: 'Windle & Thorn',
    copyright: ['All rights reserved. No part of this book may be reproduced without written permission, except for brief quotations in reviews.',
      'This is a work of fiction. Names, characters and places are products of the author\'s imagination.'],
    dedication: 'For the ones who drew the map anyway.',
    note: '*Lowmere* is the old marsh tongue for "the low lake." There has been no lake there for three hundred years.',
    chapters: [
      { title: 'The River That Climbed', pov: 'Iske', text: [
        'On the morning the Tamsel turned around, Iske Varrow was selling her last good compass for the price of a week\'s bread.',
        'The fishwives saw it first. A cry went up along the quay at Lowmere, then another, and then the whole market was crowding the river wall to watch the water slow, and stop, and begin, with the patience of something that had made up its mind, to climb.[^lowmere]',
        'It went up the weir steps like a congregation. It went up the tanners\' lane and the long hill past the bell tower, carrying leaves and gulls and one astonished rowing boat, and it did not spill a drop.',
        '"Rivers don\'t do that," said the man holding her compass.',
        '"No," Iske agreed. She took the compass back out of his hand, because she had a feeling she was going to need it. "They don\'t."',
        '***',
        'By noon there were soldiers on the bridges, and by evening there were notices nailed to every door in the lower town. They were short, and the ink was still wet. *By order of the Ninefold Gate: all charts, maps and surveys of the Saltmarch are to be surrendered for burning.*',
        'Iske read it twice by lamplight. Then she went home, lifted the loose board under her bed, and unrolled the one map she had sworn never to look at again.'] },
      { title: 'A Ledger of Names', pov: 'Iske', text: [
        'Ten years ago she had drawn every river in the Saltmarch, and the empire had paid her in silver and then in disgrace, because the map was too honest about where the border ran.',
        'She had drawn it carefully. She remembered every line, and the ledger in the case still held the figures:',
        { table: [['River', 'Charted', 'Leagues'], ['Tamsel', 'spring', '42'], ['Orrin', 'summer', '17'], ['Lesser Vey', 'autumn', '9']] },
        'She did not remember the mountain.',
        'It sat at the very top of the sheet where there should have been nothing but salt flats and the blank, polite space a cartographer leaves for what she has not seen. A dark peak, inked in a hand very like her own, and around it, like the spokes of a wheel, every river she had ever charted, all of them bending toward it.',
        'Beneath it, in letters so small she needed her glass to read them, someone had written: *Not yet. Not until the water remembers.*',
        'Outside, in the dark, the Tamsel went on climbing.'] },
      { title: 'The Warden of the Ninefold Gate', pov: 'Corran', text: [
        'Corran Ash had arrested a great many people in his nine years as a warden, and he had never once been offered tea.',
        '"You\'re here for the map," said the cartographer, pouring. She did not look up. "Sit down. You\'ll want to see it before you burn it."',
        '"I\'m here for you," said Corran, who had rehearsed this on the stairs. "The map is a separate matter."',
        '"It isn\'t," she said, and turned the sheet toward him, and he saw the mountain, and the rivers bending toward it, and his own name written in the margin in a hand he knew very well, because it was his.'] },
    ],
    about: 'Imre Calloway lives in a narrow house full of borrowed atlases and has never once returned one on time. This is the first book of the Saltmarch Cycle.',
  };

  // The two print designs (themes.rs): fantasy, and the large-print profile.
  const ED = {
    print: { name: 'Epic fantasy', body: 'EB Garamond', head: 'Cinzel', pt: 12, lead: 1.35, m: [0.85, 0.95, 0.9, 0.65],
      num: n => ['I', 'II', 'III'][n], numScale: 1.2, titleScale: 1.5, upper: true, orn: true, sc: 3, indent: 1.3, gap: 0, rag: false,
      tint: '#5e4518', scene: 'asterism' },
    large: { name: 'Large print', body: 'Gelasio', head: 'Gelasio', pt: 16, lead: 1.4, m: [0.7, 0.8, 0.75, 0.6],
      num: n => String(n + 1), numScale: 0.85, titleScale: 1.5, upper: false, orn: false, sc: 0, indent: 0, gap: 0.6, rag: true,
      tint: '#222222', scene: 'glyph' },
  };

  // Ornaments from core/src/ornaments.rs.
  const star = ([cx, cy]) => {
    const p = [];
    for (let i = 0; i < 12; i++) {
      const r = i % 2 ? 4 : 11, a = -Math.PI / 2 + i * Math.PI / 6;
      p.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
    }
    return `<polygon points="${p.join(' ')}"/>`;
  };
  const DIAMOND = '<svg viewBox="0 0 200 20" fill="currentColor" aria-hidden="true"><path d="M8 10H84M116 10H192" stroke="currentColor" stroke-width="1.2"/>' +
    '<circle cx="88" cy="10" r="1.8"/><circle cx="112" cy="10" r="1.8"/><path d="M91 10 100 2.5 109 10 100 17.5Z"/></svg>';
  const ASTERISM = `<svg viewBox="0 0 60 52" fill="currentColor" aria-hidden="true">${[[30, 13], [14, 39], [46, 39]].map(star).join('')}</svg>`;

  // Words with their inline markup (*italic*, a footnote reference) as HTML, one entry per word.
  function words(raw) {
    let it = false;
    return smart(raw).trim().split(/\s+/).map(w => {
      let html = '', run = '';
      const flush = () => { if (run) html += it ? `<i>${esc(run)}</i>` : esc(run); run = ''; };
      for (const ch of w) { if (ch === '*') { flush(); it = !it; } else run += ch; }
      flush();
      return html.replace(FN, '<sup class="fr">1</sup>');
    });
  }
  const NOTE = '<p class="fn"><sup>1</sup> ' + words(BOOK.note).join(' ') + '</p>';
  function blocks(text, first) {
    let after = true;
    return text.map(t => {
      if (t === '***') { after = true; return { k: 'sb' }; }
      if (t.table) return { k: 'tb', rows: t.table };
      const w = words(t.replace('[^lowmere]', FN)), notes = {};
      w.forEach((x, i) => { if (x.includes('class="fr"')) notes[i] = NOTE; });
      const b = { k: 'p', w, notes, ni: after, first: first && after && !text.indexOf(t) };
      after = false;
      return b;
    });
  }

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  function pageVars(e, ed) {
    const s = e.style;
    s.setProperty('--bf', `"${ed.body}", Georgia, serif`);
    s.setProperty('--hf', `"${ed.head}", Georgia, serif`);
    s.setProperty('--fs', ed.pt + 'px');
    s.setProperty('--lh', (ed.pt * ed.lead).toFixed(2) + 'px');
    s.setProperty('--ind', ed.indent + 'em');
    s.setProperty('--gap', ed.gap + 'em');
    s.setProperty('--al', ed.rag ? 'left' : 'justify');
    s.setProperty('--tint', ed.tint);
  }

  /* Lay out one edition into `host` (which must be rendered). Returns its pages. */
  function typeset(ed, host) {
    host.textContent = '';
    const [mt, mb, mi, mo] = ed.m.map(x => x * PT);
    const tw = W - mi - mo, th = H - mt - mb, L = ed.pt * ed.lead;
    const ornW = Math.min(tw * 0.55, 240);
    const pages = [];
    let pg;

    // Seat the drop cap: put its baseline on the third line's (fonts differ in where it lands).
    const cal = el('div', 'pp');
    pageVars(cal, ed);
    cal.innerHTML = '<div class="pp-tx" style="width:300px"><p class="first"><span class="dc">O<i class="bl"></i></span>n<i class="bl"></i> the</p></div>';
    host.append(cal);
    const [capBase, lineBase] = [...cal.querySelectorAll('.bl')].map(b => b.getBoundingClientRect().bottom);
    const dct = (lineBase + 2 * L - capBase).toFixed(2) + 'px';
    cal.remove();

    function mk(sec, o) {
      const n = pages.length + 1, recto = n % 2 === 1;
      const e = el('div', 'pp');
      pageVars(e, ed);
      e.style.setProperty('--dct', dct);
      const tx = el('div', 'pp-tx');
      tx.style.cssText = `top:${mt}px;left:${recto ? mi : mo}px;width:${tw}px;height:${th}px`;
      const flow = el('div', 'pp-flow'), notes = el('div', 'pp-notes');
      tx.append(flow, notes);
      e.append(tx);
      host.append(e);
      return { el: e, flow, notes, recto, sec, opener: !!o.opener, front: !!o.front, blank: !!o.blank, noteList: [] };
    }
    function page(sec, o = {}) {
      if (o.recto && pages.length % 2) pages.push(mk(pages[pages.length - 1].sec, { blank: true }));
      pg = mk(sec, o);
      pages.push(pg);
      return pg;
    }
    const fits = p => {
      const last = p.flow.lastElementChild;
      return !last || last.getBoundingClientRect().bottom <= p.flow.getBoundingClientRect().bottom + 0.5;
    };
    const ornHTML = (scale) => ed.orn ? `<div class="op-orn" style="width:${ornW * scale}px">${DIAMOND}</div>` : '';

    // A chapter-style heading sunk five lines, its bottom snapped to the baseline grid.
    function opener(label, title, pov) {
      const o = el('div', 'op' + (ed.upper ? ' up' : ''));
      o.style.paddingTop = 5 * L + 'px';
      o.innerHTML = ornHTML(1) +
        (label ? `<div class="op-num" style="font-size:${ed.numScale}em">${label}</div>` : '') +
        `<div class="op-t" style="font-size:${ed.titleScale}em">${esc(title)}</div>` +
        (pov ? `<div class="op-pov">${esc(pov)}</div>` : '');
      pg.flow.append(o);
      const h = o.getBoundingClientRect().height + 2 * ed.pt;
      o.style.paddingBottom = (Math.ceil(h / L - 0.02) * L - h + 2 * ed.pt).toFixed(2) + 'px';
    }

    const notesIn = (b, a, e) => Object.keys(b.notes).filter(i => i >= a && i < e).map(i => b.notes[i]);
    function setNotes(p, extra = []) { p.notes.innerHTML = p.noteList.concat(extra).join(''); }
    function pHTML(b, a, e) {
      let w = b.w.slice(a, e);
      if (a !== 0 || !b.first) return w.join(' ');
      // a three-line drop cap (a float: initial-letter still misrenders in Chromium), then small capitals
      const cap = `<span class="dc" aria-hidden="true">${w[0][0]}</span><span class="sr-only">${w[0][0]}</span>`;
      w = [w[0].slice(1)].concat(w.slice(1));
      if (ed.sc) w = [`<span class="sc">${w.slice(0, ed.sc).join(' ')}</span>`].concat(w.slice(ed.sc));
      return cap + w.join(' ');
    }
    function blockEl(b) {
      if (b.k === 'sb') return el('div', 'sb', ed.scene === 'asterism' ? ASTERISM : '*&#8202;&#8202;*&#8202;&#8202;*');
      return el('table', 'tb', b.rows.map((r, i) => '<tr>' + r.map(c => `<${i ? 'td' : 'th'}>${esc(c)}</${i ? 'td' : 'th'}>`).join('') + '</tr>').join(''));
    }
    // Place a block, splitting a paragraph across pages at the last word that still fits.
    function place(b, sec) {
      if (b.k !== 'p') {
        const e = blockEl(b);
        pg.flow.append(e);
        if (!fits(pg)) { e.remove(); page(sec); pg.flow.append(e); }
        return;
      }
      let a = 0;
      while (a < b.w.length) {
        const p = el('p', [a ? 'cont' : '', !a && b.first ? 'first' : '', !a && b.ni ? 'ni' : ''].join(' ').trim());
        pg.flow.append(p);
        const tryTo = e => { p.innerHTML = pHTML(b, a, e); setNotes(pg, notesIn(b, a, e)); return fits(pg); };
        if (tryTo(b.w.length)) { pg.noteList.push(...notesIn(b, a, b.w.length)); return; }
        let lo = a, hi = b.w.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (tryTo(mid)) lo = mid; else hi = mid - 1; }
        if (lo === a) {
          p.remove(); setNotes(pg);
          if (pg.flow.children.length) { page(sec); continue; }
          lo = b.w.length; // nothing fits on an empty page: set it anyway rather than loop
        }
        tryTo(lo);
        p.classList.add('cut');
        pg.noteList.push(...notesIn(b, a, lo));
        if (lo === b.w.length) return;
        a = lo;
        page(sec);
      }
    }

    // Front matter (pages.rs): title page, copyright, dedication, contents.
    page('front', { recto: true, front: true });
    const title = ed.upper ? BOOK.title.toUpperCase() : BOOK.title;
    pg.flow.innerHTML = `<div class="tp${ed.upper ? ' up' : ''}"><div class="tp-top" style="top:${th * 0.22}px"><div class="tp-t">${esc(title)}</div>` +
      `<div class="tp-s">${esc(BOOK.sub)}</div>${ed.orn ? ornHTML(0.8) : ''}</div>` +
      `<div class="tp-a" style="top:${th * 0.6}px">${esc(ed.upper ? BOOK.author.toUpperCase() : BOOK.author)}</div><div class="tp-p">${esc(BOOK.pub.toUpperCase())}</div></div>`;
    page('front', { front: true });
    pg.flow.innerHTML = '<div class="cp">' + [BOOK.title, 'Copyright © ' + BOOK.author, ...BOOK.copyright.map(smart), 'Published by ' + BOOK.pub]
      .map(t => `<p>${esc(t)}</p>`).join('') + '</div>';
    page('front', { recto: true, front: true });
    pg.flow.innerHTML = `<p class="ded" style="margin-top:${th * 0.28}px">${esc(BOOK.dedication)}</p>`;
    page('front', { recto: true, front: true, opener: true });
    opener(null, 'Contents');
    const toc = el('div', 'toc');
    pg.flow.append(toc);

    // The story starts on a right-hand page numbered 1.
    BOOK.chapters.forEach((c, i) => {
      const sec = 'ch' + i;
      page(sec, { recto: i === 0, opener: true });
      opener(ed.num(i), c.title, c.pov.toUpperCase());
      blocks(c.text, true).forEach(b => place(b, sec));
    });
    page('about', { recto: true, opener: true });
    opener(null, 'About the author');
    blocks([BOOK.about], false).forEach(b => place(b, 'about'));

    // Running heads (author left, title right, small caps) and folios at the foot.
    const start = pages.findIndex(p => p.sec === 'ch0');
    const fs = ed.pt * 0.8;
    pages.forEach((p, i) => {
      if (p.blank || p.front || i < start) return;
      p.folio = i - start + 1;
      const left = p.recto ? mi : mo;
      if (!p.opener) {
        const rh = el('div', 'pp-rh', esc(p.recto ? BOOK.title : BOOK.author));
        rh.style.cssText = `top:${mt * 0.55 - fs * 0.8}px;left:${left}px;width:${tw}px`;
        p.el.append(rh);
      }
      const fo = el('div', 'pp-fo', String(p.folio));
      fo.style.cssText = `top:${H - mb * 0.5 - fs * 0.8}px;left:${left}px;width:${tw}px`;
      p.el.append(fo);
    });
    const firstOf = sec => pages.find(p => p.sec === sec).folio;
    toc.innerHTML = BOOK.chapters.map((c, i) => [c.title, firstOf('ch' + i)]).concat([['About the author', firstOf('about')]])
      .map(([t, f]) => `<div><span>${esc(t)}</span><span>${f}</span></div>`).join('');

    pages.forEach((p, i) => { p.el.dataset.sec = p.sec; p.n = i + 1; });
    return pages;
  }

  /* The ebook: one reflowable column, paginated by CSS columns inside the phone screen. */
  function ebookHTML() {
    const ed = ED.print;
    let h = `<section class="eb-tp"><div class="eb-tp-t">${esc(BOOK.title)}</div><div class="eb-tp-s">${esc(BOOK.sub)}</div>` +
      `<div class="eb-orn">${DIAMOND}</div><div class="eb-tp-a">${esc(BOOK.author)}</div></section>`;
    BOOK.chapters.forEach((c, i) => {
      h += `<section class="eb-ch" data-sec="ch${i}"><div class="eb-orn">${DIAMOND}</div><div class="eb-num">${ed.num(i)}</div><h3 class="eb-t">${esc(c.title)}</h3>`;
      h += blocks(c.text, true).map(b => {
        if (b.k === 'sb') return `<div class="sb">${ASTERISM}</div>`;
        if (b.k === 'tb') return '<table class="tb">' + b.rows.map((r, j) => '<tr>' + r.map(x => `<${j ? 'td' : 'th'}>${esc(x)}</${j ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>';
        const w = b.first ? [`<span class="sc">${b.w.slice(0, 3).join(' ')}</span>`].concat(b.w.slice(3)) : b.w;
        return `<p class="${b.ni ? 'ni' : ''}">${w.join(' ')}</p>`;
      }).join('');
      if (i === 0) h += `<aside class="eb-note">${NOTE}</aside>`;
      h += '</section>';
    });
    h += `<section class="eb-ch" data-sec="about"><h3 class="eb-t">About the author</h3><p class="ni">${words(BOOK.about).join(' ')}</p></section>`;
    return h;
  }

  const CHEV = d => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const MODES = { print: 'Print', large: 'Large print', ebook: 'Ebook' };

  window.BTLDemos = window.BTLDemos || {};
  window.BTLDemos.preview = function mount(root) {
    root.lang = root.lang || 'en';
    root.innerHTML =
      '<div class="pv-bar">' +
        '<div class="pv-seg" role="group" aria-label="Edition">' +
          Object.entries(MODES).map(([k, v], i) => `<button type="button" data-mode="${k}" aria-pressed="${!i}">${v}</button>`).join('') +
        '</div>' +
        '<div class="pv-nav">' +
          '<span class="pv-size" data-sizes hidden><button type="button" class="pv-ib pv-a" data-size="-1" aria-label="Smaller text">A−</button>' +
          '<button type="button" class="pv-ib pv-a" data-size="1" aria-label="Larger text">A+</button></span>' +
          `<button type="button" class="pv-ib" data-step="-1">${CHEV('M10 3.5 5.5 8l4.5 4.5')}</button>` +
          '<span class="pv-at" data-at aria-live="polite" aria-atomic="true"></span>' +
          `<button type="button" class="pv-ib" data-step="1">${CHEV('M6 3.5 10.5 8 6 12.5')}</button>` +
        '</div>' +
      '</div>' +
      '<p class="pv-label"><span data-label>Setting type…</span><span class="pv-diff" data-diff hidden></span></p>' +
      '<div class="pv-stage" data-stage role="group" tabindex="0" aria-label="Book pages. Left and right arrow keys turn the page."></div>' +
      '<div class="pv-thumbs" data-thumbs role="group" aria-label="All pages"></div>' +
      '<div class="pv-measure" data-measure aria-hidden="true"></div>';

    const $ = s => root.querySelector(s);
    const stage = $('[data-stage]'), thumbs = $('[data-thumbs]'), measure = $('[data-measure]');
    const at = $('[data-at]'), label = $('[data-label]'), diff = $('[data-diff]'), sizes = $('[data-sizes]');
    const prev = $('[data-step="-1"]'), next = $('[data-step="1"]');
    const cache = {};
    let mode = 'print', spread = 0, eSize = 2, eIdx = 0, eCount = 1, ready = false, eb = null;

    const book = m => cache[m] || (cache[m] = (() => {
      const pages = typeset(ED[m], measure);
      const spreads = [[null, pages[0]]];
      for (let i = 1; i < pages.length; i += 2) spreads.push([pages[i], pages[i + 1] || null]);
      const minis = spreads.map(pair => pair.map(p => p && p.el.cloneNode(true)));
      return { pages, spreads, minis };
    })());

    function fit() {
      const sw = stage.clientWidth - 24, sh = stage.clientHeight - 24;
      if (mode === 'ebook') {
        const scr = Math.max(120, sh - 14) / EH;
        const k = Math.min(scr, (sw - 14) / EW);
        stage.style.setProperty('--ek', k.toFixed(4));
        stage.style.setProperty('--sw', (EW * k).toFixed(1) + 'px');
        stage.style.setProperty('--sh', (EH * k).toFixed(1) + 'px');
      } else {
        const pw = Math.max(60, Math.min(sw / 2, sh * 2 / 3));
        stage.style.setProperty('--k', (pw / W).toFixed(4));
        stage.style.setProperty('--pw', pw.toFixed(1) + 'px');
        stage.style.setProperty('--ph', (pw * 1.5).toFixed(1) + 'px');
      }
    }

    function centreThumb() {
      const t = thumbs.children[mode === 'ebook' ? eIdx : spread];
      if (!t) return;
      thumbs.scrollTo({ left: t.offsetLeft - thumbs.clientWidth / 2 + t.offsetWidth / 2, behavior: reduced() ? 'auto' : 'smooth' });
    }
    function markThumbs(i) {
      [...thumbs.children].forEach((t, j) => t.setAttribute('aria-current', j === i ? 'true' : 'false'));
      centreThumb();
    }

    // aria-disabled keeps focus on the button at the limit (a real disabled one would drop it to body).
    function dis(b, on) { if (on) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled'); }

    function status() {
      if (mode === 'ebook') {
        at.textContent = `Screen ${eIdx + 1} of ${eCount}`;
        label.textContent = `Ebook · phone · reflowable · ${eCount} screens at ${ESIZES[eSize]} px`;
        diff.hidden = true;
        dis(prev, eIdx === 0); dis(next, eIdx >= eCount - 1);
        prev.setAttribute('aria-label', 'Previous screen'); next.setAttribute('aria-label', 'Next screen');
        dis(sizes.children[0], eSize === 0); dis(sizes.children[1], eSize === ESIZES.length - 1);
        return;
      }
      const b = book(mode), [l, r] = b.spreads[spread], n = b.pages.length;
      at.textContent = l && r ? `Pages ${l.n}–${r.n} of ${n}` : `Page ${(l || r).n} of ${n}`;
      label.textContent = `${ED[mode].name} · 6 × 9 in · ${n} pages`;
      const story = x => x.pages.length - x.pages.findIndex(p => p.sec === 'ch0');
      const pr = book('print'), extra = n - pr.pages.length;
      diff.hidden = mode !== 'large';
      diff.textContent = `${extra >= 0 ? '+' : '−'}${Math.abs(extra)} pages · the story runs ${story(b)} pages, ${story(pr)} in print`;
      dis(prev, spread === 0); dis(next, spread >= b.spreads.length - 1);
      prev.setAttribute('aria-label', 'Previous pages'); next.setAttribute('aria-label', 'Next pages');
    }

    function showSpread(dir) {
      const b = book(mode);
      const s = el('div', 'pv-spread' + (dir ? ' turn' : ''));
      if (dir) s.style.setProperty('--dir', dir);
      b.spreads[spread].forEach((p, i) => {
        const slot = el('div', 'pv-slot ' + (i ? 'rec' : 'v') + (p ? '' : ' none'));
        if (p) { slot.append(p.el); slot.setAttribute('aria-label', `Page ${p.n}${p.folio ? ', folio ' + p.folio : ''}`); slot.setAttribute('role', 'img'); }
        s.append(slot);
      });
      stage.replaceChildren(s);
      markThumbs(spread);
      status();
    }

    function buildThumbs() {
      if (mode === 'ebook') {
        thumbs.replaceChildren(...Array.from({ length: eCount }, (_, i) => {
          const t = el('button', 'pv-th pv-th-e', '<span class="pv-scr"></span>');
          t.type = 'button'; t.setAttribute('aria-label', `Screen ${i + 1}`);
          t.addEventListener('click', () => goEbook(i));
          return t;
        }));
        return;
      }
      const b = book(mode);
      thumbs.replaceChildren(...b.minis.map((pair, i) => {
        const t = el('button', 'pv-th');
        t.type = 'button';
        const [l, r] = b.spreads[i];
        t.setAttribute('aria-label', l && r ? `Pages ${l.n}–${r.n}` : `Page ${(l || r).n}`);
        pair.forEach(c => { const m = el('span', 'pv-mini' + (c ? '' : ' none')); if (c) m.append(c); t.append(m); });
        t.addEventListener('click', () => go(i));
        return t;
      }));
    }

    function go(i) {
      const b = book(mode);
      i = Math.max(0, Math.min(b.spreads.length - 1, i));
      if (i === spread && stage.firstChild && stage.firstChild.classList.contains('pv-spread')) return;
      const dir = Math.sign(i - spread);
      spread = i;
      showSpread(dir);
    }

    // Ebook
    function ebookCount() {
      const view = eb.querySelector('.eb-view');
      eCount = Math.max(1, Math.round((view.scrollWidth + EGAP) / (EW - 52 + EGAP)));
      eIdx = Math.min(eIdx, eCount - 1);
    }
    function goEbook(i, instant) {
      eIdx = Math.max(0, Math.min(eCount - 1, i));
      eb.querySelector('.eb-view').scrollTo({ left: eIdx * EW, behavior: instant || reduced() ? 'auto' : 'smooth' });
      eb.querySelector('.eb-foot').textContent = `${eIdx + 1} of ${eCount}`;
      markThumbs(eIdx);
      status();
    }
    function screenOf(sec) {
      const view = eb.querySelector('.eb-view'), t = view.querySelector(`[data-sec="${sec}"]`);
      if (!t) return 0;
      const k = parseFloat(stage.style.getPropertyValue('--ek')) || 1;
      return Math.round((t.getBoundingClientRect().left - view.getBoundingClientRect().left) / k / EW + view.scrollLeft / EW);
    }
    function secOfScreen() {
      let best = 'ch0';
      for (const s of ['ch0', 'ch1', 'ch2', 'about']) if (screenOf(s) <= eIdx) best = s;
      return eIdx === 0 ? 'front' : best;
    }
    function showEbook(sec) {
      if (!eb) {
        eb = el('div', 'pv-phone',
          `<div class="pv-screen"><div class="eb" style="--efs:${ESIZES[eSize]}px"><div class="eb-notch"></div>` +
          `<div class="eb-head">${esc(BOOK.title)}</div><div class="eb-view"><div class="eb-flow">${ebookHTML()}</div></div><div class="eb-foot"></div></div></div>`);
      }
      stage.replaceChildren(eb);
      fit();
      ebookCount();
      if (sec) eIdx = sec === 'front' ? 0 : screenOf(sec);
      buildThumbs();
      goEbook(eIdx, true);
    }
    function resize(d) {
      const frac = eCount > 1 ? eIdx / (eCount - 1) : 0;
      eSize = Math.max(0, Math.min(ESIZES.length - 1, eSize + d));
      eb.querySelector('.eb').style.setProperty('--efs', ESIZES[eSize] + 'px');
      ebookCount();
      eIdx = Math.round(frac * (eCount - 1));
      buildThumbs();
      goEbook(eIdx, true);
    }

    function currentSec() {
      if (mode === 'ebook') return secOfScreen();
      const [l, r] = book(mode).spreads[spread];
      return (r && !r.blank ? r : l || r).sec;
    }
    function setMode(m, keepSec) {
      const sec = ready ? keepSec || currentSec() : 'front';
      mode = m;
      root.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
      sizes.hidden = m !== 'ebook';
      if (m === 'ebook') { showEbook(sec); return; }
      fit();
      const b = book(m);
      const i = sec === 'front' && spread === 0 ? 0 : b.spreads.findIndex(pair => pair.some(p => p && p.sec === sec));
      buildThumbs();
      spread = Math.max(0, i);
      showSpread(0);
    }

    root.addEventListener('click', e => {
      const t = e.target.closest('button');
      if (!t || !ready || t.getAttribute('aria-disabled') === 'true') return;
      if (t.dataset.mode && t.dataset.mode !== mode) setMode(t.dataset.mode);
      else if (t.dataset.step) { const d = +t.dataset.step; if (mode === 'ebook') goEbook(eIdx + d); else go(spread + d); }
      else if (t.dataset.size) resize(+t.dataset.size);
    });
    root.addEventListener('keydown', e => {
      if (!ready || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.target.closest('.pv-seg')) return;
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      e.preventDefault();
      if (mode === 'ebook') goEbook(eIdx + d); else go(spread + d);
    });

    // Typeset once the box has a size and the book faces are in; again if they arrive later.
    const FACES = ['400 12px "EB Garamond"', 'italic 400 12px "EB Garamond"', '400 12px "Cinzel"', '400 16px "Gelasio"', 'italic 400 16px "Gelasio"'];
    function fontsIn() {
      if (window.BTL && typeof window.BTL.loadFonts === 'function') window.BTL.loadFonts();
      if (!document.fonts) return Promise.resolve();
      return Promise.race([Promise.all(FACES.map(f => document.fonts.load(f).catch(() => null))), new Promise(r => setTimeout(r, 2500))]);
    }
    function retypeset() {
      if (!ready) return;
      const sec = currentSec();
      Object.keys(cache).forEach(k => delete cache[k]);
      if (eb) { eb.remove(); eb = null; }
      setMode(mode, sec);
    }
    let started = false, timer = 0;
    const ro = new ResizeObserver(() => {
      if (!stage.clientWidth) return;
      if (!started) {
        started = true;
        fontsIn().then(() => { ready = true; setMode('print'); });
        return;
      }
      if (!ready) return;
      fit();
      if (mode === 'ebook') goEbook(eIdx, true); else centreThumb();
    });
    ro.observe(stage);
    if (document.fonts && document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingdone', e => {
        if (!e.fontfaces.some(f => /Garamond|Cinzel|Gelasio/.test(f.family))) return;
        clearTimeout(timer);
        timer = setTimeout(retypeset, 150);
      });
    }
  };
})();
