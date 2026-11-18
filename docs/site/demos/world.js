/* World notes demo: a searchable list of the sample book's world entries, the selected entry with
   editable aliases, and live mention counts per chapter. Data from core/src/sample.rs. */
(function () {
  'use strict';

  // The three sample chapters; markdown marks (emphasis, footnote refs, the table header) stripped.
  var CHAPTERS = [
    { title: 'The River That Climbed', text: [
      "On the morning the Tamsel turned around, Iske Varrow was selling her last good compass for the price of a week's bread.",
      'The fishwives saw it first. A cry went up along the quay at Lowmere, then another, and then the whole market was crowding the river wall to watch the water slow, and stop, and begin, with the patience of something that had made up its mind, to climb.',
      "It went up the weir steps like a congregation. It went up the tanners' lane and the long hill past the bell tower, carrying leaves and gulls and one astonished rowing boat, and it did not spill a drop.",
      '"Rivers don\'t do that," said the man holding her compass.',
      '"No," Iske agreed. She took the compass back out of his hand, because she had a feeling she was going to need it. "They don\'t."',
      'By noon there were soldiers on the bridges, and by evening there were notices nailed to every door in the lower town. They were short, and the ink was still wet. By order of the Ninefold Gate: all charts, maps and surveys of the Saltmarch are to be surrendered for burning.',
      'Iske read it twice by lamplight. Then she went home, lifted the loose board under her bed, and unrolled the one map she had sworn never to look at again.',
      'Lowmere is the old marsh tongue for "the low lake." There has been no lake there for three hundred years.'
    ].join('\n') },
    { title: 'A Ledger of Names', text: [
      'Ten years ago she had drawn every river in the Saltmarch, and the empire had paid her in silver and then in disgrace, because the map was too honest about where the border ran.',
      'She had drawn it carefully. She remembered every line, and the ledger in the case still held the figures:',
      '| Tamsel | spring | 42 |',
      '| Orrin | summer | 17 |',
      '| Lesser Vey | autumn | 9 |',
      'She did not remember the mountain.',
      "It sat at the very top of the sheet where there should have been nothing but salt flats and the blank, polite space a cartographer leaves for what she has not seen. A dark peak, inked in a hand very like her own, and around it, like the spokes of a wheel, every river she had ever charted, all of them bending toward it.",
      'Beneath it, in letters so small she needed her glass to read them, someone had written: Not yet. Not until the water remembers.',
      'Outside, in the dark, the Tamsel went on climbing.'
    ].join('\n') },
    { title: 'The Warden of the Ninefold Gate', text: [
      'Corran Ash had arrested a great many people in his nine years as a warden, and he had never once been offered tea.',
      '"You\'re here for the map," said the cartographer, pouring. She did not look up. "Sit down. You\'ll want to see it before you burn it."',
      '"I\'m here for you," said Corran, who had rehearsed this on the stairs. "The map is a separate matter."',
      '"It isn\'t," she said, and turned the sheet toward him, and he saw the mountain, and the rivers bending toward it, and his own name written in the margin in a hand he knew very well, because it was his.'
    ].join('\n') }
  ];

  var KINDS = [
    ['Character', 'Character', 'Characters'],
    ['Place', 'Place', 'Places'],
    ['Item', 'Object', 'Objects'],
    ['Group', 'Group', 'Groups'],
    ['Lore', 'Lore', 'Lore']
  ];
  var kindLabel = function (k) { return KINDS.filter(function (x) { return x[0] === k; })[0][1]; };

  var SEED = [
    ['Character', 'Iske Varrow', 'Iske, the cartographer', 'A cartographer disgraced for drawing the border where it really runs.'],
    ['Character', 'Corran Ash', 'Corran, the warden', 'A warden of the Ninefold Gate, sent to collect the maps and the woman who drew them.'],
    ['Place', 'Saltmarch', '', 'A borderland of salt flats and braided rivers at the edge of the empire.'],
    ['Place', 'Lowmere', 'Tamsel', 'A river town on the Tamsel, where the water first turns uphill.'],
    ['Group', 'The Ninefold Gate', 'Ninefold', "The empire's wardens, who keep its borders and burn its inconvenient maps."]
  ];

  // Four hues 60 degrees apart (oklch), at least 60 degrees from the brand raspberry (~355), none violet.
  var HUES = [60, 120, 180, 240];

  var ICON = {
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
  };
  var icon = function (name) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('class', 'w-ico');
    s.innerHTML = ICON[name];
    return s;
  };

  // Tiny element helper. Text always goes in as text nodes, never as HTML.
  function h(tag, attrs) {
    var el = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'on') for (var ev in attrs.on) el.addEventListener(ev, attrs.on[ev]);
      else if (k === 'text') el.textContent = attrs.text;
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) el.append(arguments[i]);
    return el;
  }

  var isWordChar = function (c) { return !!c && /[\p{L}\p{N}]/u.test(c); };

  // Whole-word, case-insensitive spans of any name; overlapping hits count once (the longest wins),
  // so "The Ninefold Gate" and its alias "Ninefold" at the same spot are one mention.
  function findMentions(text, names) {
    var low = text.toLowerCase(), found = [];
    names.forEach(function (name) {
      var n = name.toLowerCase();
      for (var at = low.indexOf(n); at !== -1; at = low.indexOf(n, at + 1)) {
        var end = at + n.length;
        if (!isWordChar(low[at - 1]) && !isWordChar(low[end])) found.push([at, end]);
      }
    });
    found.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
    var out = [], upTo = -1;
    found.forEach(function (f) { if (f[0] >= upTo) { out.push(f); upTo = f[1]; } });
    return out;
  }

  var namesOf = function (e) {
    return [e.name].concat(e.aliases).map(function (s) { return s.trim(); }).filter(function (s) { return s.length >= 2; });
  };
  var times = function (n) { return n === 1 ? '1 time' : n + ' times'; };

  // One sentence around a chapter's first prose mention, split into before / hit / after.
  function excerpt(text, names) {
    var lines = text.split('\n');
    var pick = lines.filter(function (l) { return l[0] !== '|' && findMentions(l, names).length; })[0]
      || lines.filter(function (l) { return findMentions(l, names).length; })[0];
    if (!pick) return null;
    var m = findMentions(pick, names)[0];
    var start = Math.max(pick.lastIndexOf('. ', m[0]) + 2, pick.lastIndexOf('? ', m[0]) + 2, pick.lastIndexOf('! ', m[0]) + 2, 0);
    if (start === 1) start = 0;
    var stop = pick.indexOf('. ', m[1]);
    stop = stop === -1 ? pick.length : stop + 1;
    var pre = pick.slice(start, m[0]), post = pick.slice(m[1], stop);
    if (pre.length > 70) pre = '…' + pre.slice(-70).replace(/^\S*\s/, '');
    if (post.length > 90) post = post.slice(0, 90).replace(/\s\S*$/, '') + '…';
    return [pre, pick.slice(m[0], m[1]), post];
  }

  window.BTLDemos = window.BTLDemos || {};
  window.BTLDemos.world = function mount(root) {
    var uid = 'w' + Math.random().toString(36).slice(2, 7);
    var entries = SEED.map(function (s, i) {
      return { id: 'seed-' + i, hue: HUES[i % HUES.length], kind: s[0], name: s[1], aliases: s[2] ? s[2].split(', ') : [], summary: s[3] };
    });
    var state = { q: '', kind: 'all', sel: entries[0].id, open: null, adding: false };
    var byId = function (id) { return entries.filter(function (e) { return e.id === id; })[0]; };
    var counts = function (e) { var ns = namesOf(e); return CHAPTERS.map(function (c) { return findMentions(c.text, ns).length; }); };
    var total = function (e) { return counts(e).reduce(function (a, b) { return a + b; }, 0); };

    // Static frame.
    var search = h('input', { type: 'search', id: uid + '-q', placeholder: 'Search notes', autocomplete: 'off',
      on: { input: function () { state.q = search.value.trim().toLowerCase(); renderList(); } } });
    var newBtn = h('button', { type: 'button', class: 'w-btn', 'aria-expanded': 'false', on: { click: function () { toggleAdd(!state.adding); } } },
      icon('plus'), h('span', { text: 'New note' }));
    var noteCount = h('p', { class: 'w-count', 'aria-live': 'polite' });
    var chips = h('div', { class: 'w-chips', role: 'group', 'aria-label': 'Filter by kind' });
    var list = h('ul', { class: 'w-list', 'aria-label': 'World notes' });

    var newName = h('input', { type: 'text', id: uid + '-new', maxlength: '40', placeholder: 'A name, like Orrin', autocomplete: 'off',
      on: { keydown: function (ev) { if (ev.key === 'Escape') toggleAdd(false); } } });
    var newKind = h('select', { id: uid + '-kind', 'aria-label': 'Kind' });
    KINDS.forEach(function (k) { newKind.append(h('option', { value: k[0], text: k[1] })); });
    var addForm = h('form', { class: 'w-new', hidden: true, on: { submit: function (ev) {
      ev.preventDefault();
      var name = newName.value.trim();
      if (!name) { newName.focus(); return; }
      var e = { id: 'new-' + Date.now(), hue: HUES[entries.length % HUES.length], kind: newKind.value, name: name, aliases: [], summary: 'A note you added. It lives only on this page.' };
      entries.push(e);
      state.sel = e.id; state.open = null; state.kind = 'all'; state.q = ''; search.value = '';
      newName.value = '';
      toggleAdd(false);
      render();
    } } },
      h('label', { class: 'w-sr', for: uid + '-new', text: 'Name of the new note' }),
      newName, newKind,
      h('button', { type: 'submit', class: 'w-btn w-primary', text: 'Add' }));

    var detail = h('section', { class: 'w-detail', 'aria-label': 'Selected note' });

    function toggleAdd(on) {
      state.adding = on;
      addForm.hidden = !on;
      newBtn.setAttribute('aria-expanded', String(on));
      if (on) newName.focus(); else newBtn.focus();
    }

    root.textContent = '';
    root.append(h('div', { class: 'w' },
      h('div', { class: 'w-side' },
        h('div', { class: 'w-top' },
          h('div', { class: 'w-search' }, icon('search'), h('label', { class: 'w-sr', for: uid + '-q', text: 'Search world notes' }), search),
          newBtn),
        addForm, chips, noteCount, list),
      detail));

    function renderList() {
      var by = {}; entries.forEach(function (e) { by[e.kind] = (by[e.kind] || 0) + 1; });
      if (state.kind !== 'all' && !by[state.kind]) state.kind = 'all';
      chips.textContent = '';
      [['all', 'All', 'All']].concat(KINDS.filter(function (k) { return by[k[0]]; })).forEach(function (k) {
        chips.append(h('button', { type: 'button', class: 'w-chip', 'aria-pressed': String(state.kind === k[0]),
          on: { click: function () { state.kind = k[0]; renderList(); } } },
          k[2] + ' ', h('span', { class: 'w-num', text: k[0] === 'all' ? entries.length : by[k[0]] })));
      });

      var q = state.q;
      var shown = entries.filter(function (e) {
        return (state.kind === 'all' || e.kind === state.kind)
          && (!q || [e.name, e.aliases.join(' '), e.summary].some(function (t) { return t.toLowerCase().indexOf(q) !== -1; }));
      });
      noteCount.textContent = shown.length === entries.length
        ? entries.length + (entries.length === 1 ? ' note' : ' notes')
        : shown.length + ' of ' + entries.length + ' notes';
      list.textContent = '';
      if (!shown.length) list.append(h('li', { class: 'w-empty', text: 'No notes match. Try another name.' }));
      shown.forEach(function (e) {
        var on = e.id === state.sel;
        list.append(h('li', null, h('button', { type: 'button', class: 'w-row', 'aria-current': on ? 'true' : false,
          on: { click: function () { state.sel = e.id; state.open = null; render(); list.querySelector('[aria-current]').focus(); } } },
          h('span', { class: 'w-av', 'aria-hidden': 'true', style: '--h:' + e.hue, text: (e.name.trim()[0] || '?').toUpperCase() }),
          h('span', { class: 'w-who' }, h('span', { class: 'w-name', text: e.name }), h('span', { class: 'w-kind', text: kindLabel(e.kind) })),
          h('span', { class: 'w-num w-total', title: 'Mentions in the story', 'aria-label': times(total(e)) + ' in the story', text: total(e) }))));
      });
    }

    function renderDetail(focusAlias) {
      var e = byId(state.sel);
      detail.textContent = '';
      if (!e) return;
      var c = counts(e), sum = c.reduce(function (a, b) { return a + b; }, 0), max = Math.max.apply(null, c.concat(1));

      var aliasInput = h('input', { type: 'text', id: uid + '-alias', maxlength: '40', placeholder: 'Add alias', autocomplete: 'off' });
      var aliasMsg = h('p', { class: 'w-hint', 'aria-live': 'polite', text: 'Mentions count these too.' });
      var aliasChips = h('ul', { class: 'w-aliases', 'aria-label': 'Other names' });
      e.aliases.forEach(function (a, i) {
        aliasChips.append(h('li', { class: 'w-alias' }, h('span', { text: a }),
          h('button', { type: 'button', 'aria-label': 'Remove alias ' + a, on: { click: function () {
            e.aliases.splice(i, 1); state.open = null; render(true);
          } } }, icon('x'))));
      });

      var rows = h('ul', { class: 'w-mentions' });
      CHAPTERS.forEach(function (ch, i) {
        var open = state.open === i && c[i] > 0;
        var row = h('li', null, h('button', { type: 'button', class: 'w-ment', disabled: !c[i], 'aria-expanded': c[i] ? String(open) : false,
          on: { click: function () { state.open = open ? null : i; renderDetail(); detail.querySelectorAll('.w-ment')[i].focus(); } } },
          h('span', { class: 'w-ch', text: ch.title }),
          h('span', { class: 'w-bar', 'aria-hidden': 'true' }, h('span', { style: 'width:' + (c[i] / max * 100) + '%' })),
          h('span', { class: 'w-num w-times', text: c[i] ? times(c[i]) : '0' })));
        if (open) {
          var x = excerpt(ch.text, namesOf(e));
          if (x) row.append(h('p', { class: 'w-quote' }, x[0], h('mark', { text: x[1] }), x[2]));
        }
        rows.append(row);
      });

      detail.append(
        h('div', { class: 'w-head' },
          h('p', { class: 'w-title', text: e.name }),
          h('span', { class: 'w-pill', text: kindLabel(e.kind) })),
        h('p', { class: 'w-summary', text: e.summary }),
        h('p', { class: 'w-sub', text: 'Other names' }),
        e.aliases.length ? aliasChips : h('p', { class: 'w-hint', text: 'No other names yet.' }),
        h('form', { class: 'w-addalias', on: { submit: function (ev) {
          ev.preventDefault();
          var added = 0, msg = '';
          aliasInput.value.split(',').map(function (s) { return s.trim(); }).forEach(function (a) {
            if (!a) return;
            if (a.length < 2) { msg = 'Aliases need at least 2 letters.'; return; }
            var all = [e.name].concat(e.aliases).map(function (s) { return s.toLowerCase(); });
            if (all.indexOf(a.toLowerCase()) !== -1) { msg = '“' + a + '” is already a name for this note.'; return; }
            e.aliases.push(a); added++;
          });
          if (added) { state.open = null; render(true); if (msg) detail.querySelector('.w-hint').textContent = msg; }
          else if (msg) aliasMsg.textContent = msg;
        } } },
          h('label', { class: 'w-sr', for: uid + '-alias', text: 'Add alias' }),
          aliasInput,
          h('button', { type: 'submit', class: 'w-btn', text: 'Add' })),
        aliasMsg,
        h('p', { class: 'w-sub' }, 'Mentioned in ', h('span', { class: 'w-num w-sum', 'aria-live': 'polite',
          text: sum ? times(sum) + ' across ' + c.filter(Boolean).length + (c.filter(Boolean).length === 1 ? ' chapter' : ' chapters') : 'not in the story yet' })),
        rows);
      if (focusAlias) detail.querySelector('#' + uid + '-alias').focus();
    }

    function render(focusAlias) { renderList(); renderDetail(focusAlias); }
    render();
  };
})();
