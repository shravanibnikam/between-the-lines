/* Export demo: the app's pre-flight checks and export rows, run on the visitor's own numbers.
   Rules mirror core/src/preflight.rs and core/src/themes.rs; nothing is written or downloaded. */
(function () {
  'use strict';

  // core/src/themes.rs TRIMS (key, name, w, h, inside margin applied when the trim is picked)
  var TRIMS = [
    ['5x8', '5 × 8 in', 5, 8, 0.8], ['5.25x8', '5.25 × 8 in', 5.25, 8, 0.8], ['5.5x8.5', '5.5 × 8.5 in', 5.5, 8.5, 0.8],
    ['6x9', '6 × 9 in', 6, 9, 0.85], ['4x6', '4 × 6 in (mass market)', 4, 6, 0.65],
    ['4.12x6.75', '4.12 × 6.75 in (mass market)', 4.12, 6.75, 0.65], ['4.25x7', '4.25 × 7 in (mass market)', 4.25, 7, 0.65],
    ['4.37x7', '4.37 × 7 in (A-format)', 4.37, 7, 0.65], ['a6', 'A6 (4.13 × 5.83 in)', 4.13, 5.83, 0.6],
    ['5.12x7.09', '5.12 × 7.09 in (pocket)', 5.12, 7.09, 0.8], ['4.72x7.48', '4.72 × 7.48 in (pocket)', 4.72, 7.48, 0.8],
    ['5.31x8.07', '5.31 × 8.07 in', 5.31, 8.07, 0.8], ['a5', 'A5 (5.83 × 8.27 in)', 5.83, 8.27, 0.85],
    ['5.31x8.46', '5.31 × 8.46 in', 5.31, 8.46, 0.8], ['b-format', '5.06 × 7.81 in (B-format)', 5.06, 7.81, 0.8],
    ['7x10', '7 × 10 in', 7, 10, 1], ['8x10', '8 × 10 in', 8, 10, 1], ['8.25x11', '8.25 × 11 in', 8.25, 11, 1],
    ['8.5x11', '8.5 × 11 in (letter)', 8.5, 11, 1], ['a4', 'A4 (8.27 × 11.69 in)', 8.27, 11.69, 1]
  ];

  // themes::min_inside_margin_in (Amazon KDP's published gutter minimums)
  function minInside(pages) {
    return pages <= 150 ? 0.375 : pages <= 300 ? 0.5 : pages <= 500 ? 0.625 : pages <= 700 ? 0.75 : 0.875;
  }

  // preflight::preflight, limited to what the visitor can change here
  function preflight(s) {
    var v = [], t = s.trim;
    if (!s.title.trim() || s.title === 'Untitled book') v.push(['warn', 'The book has no title yet (Book details).']);
    else v.push(['ok', 'Title: ' + s.title]);
    if (!s.author.trim()) v.push(['warn', 'No author name yet (Book details).']);
    if (s.pages < 24) v.push(['warn', s.pages + ' pages: most print-on-demand services need at least 24.']);
    else if (s.pages > 828) v.push(['problem', s.pages + ' pages: too many for most paperback printers (828 at most).']);
    else v.push(['ok', s.pages + ' pages at ' + t[2].toFixed(2) + ' × ' + t[3].toFixed(2) + ' in']);
    var min = minInside(s.pages), m = s.inside.toFixed(3);
    if (s.inside + 0.0001 < min) v.push(['problem', 'The inside margin is ' + m + ' in; a ' + s.pages + '-page book needs at least ' + min + ' in.']);
    else v.push(['ok', 'Inside margin ' + m + ' in (at least ' + min + ' in needed)']);
    // The sample book's design (fantasy) colours its ornaments and drop cap #5e4518.
    if (s.pdfx) v.push(['warn', "PDF/X is on, so the ornament, drop cap colour will print in CMYK; check it on a printer's proof."]);
    var order = { problem: 0, warn: 1, ok: 2 };
    return v.sort(function (a, b) { return order[a[0]] - order[b[0]]; });
  }

  // storage::safe_file_name
  function safeName(s) {
    var t = s.replace(/[^\p{L}\p{N} _-]/gu, ' ').split(/\s+/).filter(Boolean).join(' ');
    return t || 'Book';
  }
  var size = function (b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; };
  var dim = function (n) { return String(+n.toFixed(2)); };

  function h(tag, attrs) {
    var el = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) el.append(arguments[i]);
    return el;
  }

  var uid = 0;

  window.BTLDemos = window.BTLDemos || {};
  window.BTLDemos.export = function mount(root) {
    var id = 'btl-ex' + ++uid + '-';
    var s = { title: 'Where the Rivers Run Upward', author: 'Imre Calloway', trim: TRIMS[3], pages: 212, inside: 0.9, bleed: false, pdfx: false };
    var files = [], busy = {};
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- Your book: the inputs ---- */
    function field(label, control, extra) {
      return h('div', { class: 'x-field' }, h('label', { for: control.id, class: 'x-label' }, label, extra), control);
    }
    var title = h('input', { id: id + 'title', type: 'text', value: s.title, autocomplete: 'off', spellcheck: 'false' });
    var author = h('input', { id: id + 'author', type: 'text', value: s.author, autocomplete: 'off', spellcheck: 'false' });
    var trim = h('select', { id: id + 'trim' });
    TRIMS.forEach(function (t, i) { trim.append(h('option', { value: i, text: t[1] })); });
    trim.value = '3';
    var pages = h('input', { id: id + 'pages', type: 'range', min: 8, max: 900, step: 1, value: s.pages });
    var pagesOut = h('span', { class: 'x-val', 'aria-hidden': 'true' });
    var inside = h('input', { id: id + 'inside', type: 'range', min: 0.25, max: 1.25, step: 0.025, value: s.inside });
    var insideOut = h('span', { class: 'x-val', 'aria-hidden': 'true' });

    var form = h('div', { class: 'x-try', role: 'group', 'aria-labelledby': id + 'try' },
      h('p', { id: id + 'try', class: 'x-try-h', text: 'Your book' }),
      h('p', { class: 'x-note', text: 'Change these and watch the checks.' }),
      h('div', { class: 'x-pair' }, field('Title', title), field('Author', author)),
      field('Trim size', trim),
      field('Page count', pages, pagesOut),
      field('Inside margin', inside, insideOut));

    /* ---- The Export screen ---- */
    var sub = h('p', { class: 'x-sub' });
    var summary = h('span', { class: 'x-sum', 'aria-live': 'polite' });
    var checks = h('ul', { class: 'x-list', 'aria-label': 'Checks before publishing' });

    function toggle(label, key, hint) {
      var b = h('button', { type: 'button', role: 'switch', class: 'x-switch', 'aria-checked': 'false', onclick: function () {
        s[key] = !s[key]; b.setAttribute('aria-checked', String(s[key])); update();
      } }, h('span', { class: 'x-track', 'aria-hidden': 'true' }), h('span', { text: label }), hint && h('span', { class: 'x-hint', text: hint }));
      return b;
    }

    var FORMATS = [
      { key: 'print', name: 'Print PDF', primary: true },
      { key: 'large', name: 'Large-print PDF', about: 'The same book in larger type with ragged-right lines, for easier reading.' },
      { key: 'kindle', name: 'EPUB for Kindle', about: 'A reflowable ebook with a linked contents list, tuned for Kindle.', label: 'Kindle' },
      { key: 'apple', name: 'EPUB for Apple Books', about: 'A reflowable ebook tuned for Apple Books.', label: 'Apple Books' },
      { key: 'generic', name: 'EPUB for other stores', about: 'A standard EPUB for Kobo, Google Play and the rest.', label: 'Other stores' }
    ];
    var formatList = h('ul', { class: 'x-list x-formats' });
    var printAbout, printWhy;
    FORMATS.forEach(function (f) {
      var about = h('p', { class: 'x-about', text: f.about || '' });
      f.btn = h('button', { type: 'button', class: 'x-btn' + (f.primary ? ' x-primary' : ''), 'aria-label': 'Export ' + f.name, onclick: function () { run(f); } }, 'Export');
      var row = h('li', { class: 'x-format' }, h('div', { class: 'x-text' }, h('p', { class: 'x-name', text: f.name }), about), f.btn);
      if (f.primary) {
        printAbout = about;
        printWhy = h('p', { id: id + 'why', class: 'x-why', hidden: '' });
        f.btn.setAttribute('aria-describedby', id + 'why');
        row.append(h('div', { class: 'x-opts' }, toggle('Include bleed', 'bleed'), toggle('PDF/X-1a', 'pdfx', 'For printers such as IngramSpark.')), printWhy);
      }
      formatList.append(row);
    });

    var fileRows = h('div', { role: 'rowgroup' });
    var status = h('p', { class: 'x-sr', role: 'status' });
    var screen = h('div', { class: 'x-screen' },
      h('div', { class: 'x-top' }, h('h4', { class: 'x-h1', text: 'Export' }), h('span', { class: 'x-demo', text: 'Demo · no file is created' })),
      sub,
      h('section', { class: 'x-sec', 'aria-labelledby': id + 'pre' },
        h('div', { class: 'x-h2row' }, h('h5', { id: id + 'pre', class: 'x-h2', text: 'Before you publish' }), summary), checks),
      h('section', { class: 'x-sec', 'aria-labelledby': id + 'fmt' }, h('h5', { id: id + 'fmt', class: 'x-h2', text: 'Formats' }), formatList),
      h('section', { class: 'x-sec', 'aria-labelledby': id + 'files' }, h('h5', { id: id + 'files', class: 'x-h2', text: 'Files' }),
        h('div', { class: 'x-table', role: 'table', 'aria-labelledby': id + 'files' },
          h('div', { role: 'rowgroup' }, h('div', { class: 'x-row x-head', role: 'row' },
            h('span', { role: 'columnheader', text: 'Name' }), h('span', { role: 'columnheader', class: 'x-num', text: 'Size' }),
            h('span', { role: 'columnheader', text: 'Exported' }))),
          fileRows)),
      status);

    root.textContent = '';
    root.append(h('div', { class: 'x-app' }, form, screen));

    /* ---- State → view ---- */
    var problems = [];
    function update() {
      var t = s.trim, list = preflight(s);
      pagesOut.textContent = s.pages;
      pages.setAttribute('aria-valuetext', s.pages + ' pages');
      insideOut.textContent = s.inside.toFixed(3) + ' in';
      inside.setAttribute('aria-valuetext', s.inside.toFixed(3) + ' inches');
      sub.textContent = dim(t[2]) + ' × ' + dim(t[3]) + ' in · ' + s.pages + ' pages · ' + (files.length ? 'last exported just now' : 'not exported yet');
      printAbout.textContent = 'For a printer or print-on-demand service: ' + dim(t[2]) + ' × ' + dim(t[3]) + ' in, ' + s.pages + ' pages, fonts embedded.';

      checks.textContent = '';
      var n = { ok: 0, warn: 0, problem: 0 };
      list.forEach(function (c) {
        n[c[0]]++;
        checks.append(h('li', { class: 'x-check' },
          h('span', { class: 'x-pill x-' + c[0], text: { ok: 'Ready', warn: 'Check', problem: 'Fix' }[c[0]] }), h('span', { text: c[1] })));
      });
      var sumText = [n.problem && n.problem + ' to fix', n.warn && n.warn + ' to check', n.ok && n.ok + ' ready'].filter(Boolean).join(' · ');
      if (summary.textContent !== sumText) summary.textContent = sumText;

      problems = list.filter(function (c) { return c[0] === 'problem'; });
      var blocked = problems.length > 0, pb = FORMATS[0].btn;
      printWhy.hidden = !blocked;
      printWhy.textContent = blocked ? 'Fix this first: ' + problems.map(function (c) { return c[1]; }).join(' ') : '';
      if (!busy.print) pb.setAttribute('aria-disabled', String(blocked));
    }

    function bytes(f) {
      var p = s.pages;
      if (f.key === 'print') return Math.round((160000 + p * 4300) * (s.bleed ? 1.04 : 1) + (s.pdfx ? 38000 : 0));
      if (f.key === 'large') return 170000 + Math.round(p * 1.7) * 3900;
      return 270000 + p * 1800 + 420000 + (f.key === 'kindle' ? 6000 : f.key === 'apple' ? 2000 : 0); // text + fonts + cover
    }
    function fileName(f) {
      var base = safeName(s.title);
      if (f.key === 'print') return base + ' - ' + (s.bleed ? 'print with bleed' : 'print') + '.pdf';
      if (f.key === 'large') return base + ' - large print.pdf';
      return base + ' - ' + f.label + '.epub';
    }

    function run(f) {
      if (busy[f.key]) return;
      if (f.key === 'print' && problems.length) { printWhy.hidden = false; return; }
      busy[f.key] = true;
      f.btn.setAttribute('aria-disabled', 'true');
      f.btn.setAttribute('aria-busy', 'true');
      f.btn.textContent = '';
      f.btn.append(h('span', { class: 'x-spin', 'aria-hidden': 'true' }), 'Exporting…');
      status.textContent = 'Exporting ' + f.name + '…';
      setTimeout(function () {
        var name = fileName(f), b = bytes(f);
        files = files.filter(function (x) { return x.name !== name; }); // the app overwrites the same path
        files.unshift({ name: name, bytes: b });
        renderFiles(name);
        busy[f.key] = false;
        f.btn.textContent = 'Export';
        f.btn.removeAttribute('aria-busy');
        f.btn.setAttribute('aria-disabled', 'false');
        update();
        status.textContent = 'Exported ' + name + ', ' + size(b) + '. Demo only: no file was created.';
      }, reduce ? 600 : 1100);
    }

    function renderFiles(fresh) {
      fileRows.textContent = '';
      if (!files.length) { fileRows.append(h('div', { class: 'x-row x-empty', role: 'row' }, h('span', { role: 'cell', text: 'Nothing exported yet.' }))); return; }
      files.forEach(function (x) {
        fileRows.append(h('div', { class: 'x-row' + (x.name === fresh ? ' x-new' : ''), role: 'row' },
          h('span', { role: 'cell', class: 'x-fname', title: x.name, text: x.name }),
          h('span', { role: 'cell', class: 'x-num x-dim', text: size(x.bytes) }),
          h('span', { role: 'cell', class: 'x-dim', text: 'just now' })));
      });
    }

    title.addEventListener('input', function () { s.title = title.value; update(); });
    author.addEventListener('input', function () { s.author = author.value; update(); });
    trim.addEventListener('change', function () {
      s.trim = TRIMS[+trim.value];
      s.inside = s.trim[4]; // picking a trim applies its margins, as in the app
      inside.value = s.inside;
      update();
    });
    pages.addEventListener('input', function () { s.pages = +pages.value; update(); });
    inside.addEventListener('input', function () { s.inside = +inside.value; update(); });

    renderFiles();
    update();
  };
})();
