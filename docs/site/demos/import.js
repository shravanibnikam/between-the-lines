/* Import demo: bring a manuscript onto the bookshelf. Files are read in the browser; nothing is uploaded. */
(function () {
  'use strict';

  var MAX_BYTES = 5 * 1024 * 1024;
  var SHELF = 4;
  var WPP = 250; // words per printed page, roughly
  var TEXT = /\.(md|markdown|txt)$/i;
  var WORD = /\.(docx|odt)$/i;

  // The three chapters of the app's sample book (core/src/sample.rs), verbatim.
  var SAMPLE = "# Where the Rivers Run Upward\n\n## The River That Climbed\n\nOn the morning the Tamsel turned around, Iske Varrow was selling her last good compass for the price of a week's bread.\nThe fishwives saw it first. A cry went up along the quay at Lowmere, then another, and then the whole market was crowding the river wall to watch the water slow, and stop, and begin, with the patience of something that had made up its mind, to climb.[^lowmere]\nIt went up the weir steps like a congregation. It went up the tanners' lane and the long hill past the bell tower, carrying leaves and gulls and one astonished rowing boat, and it did not spill a drop.\n\"Rivers don't do that,\" said the man holding her compass.\n\"No,\" Iske agreed. She took the compass back out of his hand, because she had a feeling she was going to need it. \"They don't.\"\n***\nBy noon there were soldiers on the bridges, and by evening there were notices nailed to every door in the lower town. They were short, and the ink was still wet. *By order of the Ninefold Gate: all charts, maps and surveys of the Saltmarch are to be surrendered for burning.*\nIske read it twice by lamplight. Then she went home, lifted the loose board under her bed, and unrolled the one map she had sworn never to look at again.\n[^lowmere]: *Lowmere* is the old marsh tongue for \"the low lake.\" There has been no lake there for three hundred years.\n\n## A Ledger of Names\n\nTen years ago she had drawn every river in the Saltmarch, and the empire had paid her in silver and then in disgrace, because the map was too honest about where the border ran.\nShe had drawn it carefully. She remembered every line, and the ledger in the case still held the figures:\n| River | Charted | Leagues |\n|---|:-:|--:|\n| Tamsel | spring | 42 |\n| Orrin | summer | 17 |\n| Lesser Vey | autumn | 9 |\nShe did not remember the mountain.\nIt sat at the very top of the sheet where there should have been nothing but salt flats and the blank, polite space a cartographer leaves for what she has not seen. A dark peak, inked in a hand very like her own, and around it, like the spokes of a wheel, every river she had ever charted, all of them bending toward it.\nBeneath it, in letters so small she needed her glass to read them, someone had written: *Not yet. Not until the water remembers.*\nOutside, in the dark, the Tamsel went on climbing.\n\n## The Warden of the Ninefold Gate\n\nCorran Ash had arrested a great many people in his nine years as a warden, and he had never once been offered tea.\n\"You're here for the map,\" said the cartographer, pouring. She did not look up. \"Sit down. You'll want to see it before you burn it.\"\n\"I'm here for you,\" said Corran, who had rehearsed this on the stairs. \"The map is a separate matter.\"\n\"It isn't,\" she said, and turned the sheet toward him, and he saw the mountain, and the rivers bending toward it, and his own name written in the margin in a hand he knew very well, because it was his.\n";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var fmt = function (n) { return n.toLocaleString('en-US'); };

  // Same rule as core::model::count_words: split on whitespace and dashes, keep tokens with a letter or digit.
  function countWords(text) {
    return text.split(/[\s—–]+/).filter(function (w) { return /[\p{L}\p{N}]/u.test(w); }).length;
  }

  function fromFilename(name) {
    var t = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Untitled book';
  }

  // A usable title line: short, not a heading marker, stripped of emphasis.
  function titleLine(line) {
    var t = line.replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim();
    return t && t.length <= 80 ? t : '';
  }

  function parseMarkdown(text, name) {
    var lines = text.split('\n');
    var h1 = [], h2 = 0, body = [], title = '', firstUsed = -1;
    lines.forEach(function (l, i) {
      if (/^#\s+\S/.test(l)) h1.push(i);
      else if (/^##\s+\S/.test(l)) h2++;
    });
    if (h1.length === 1) title = titleLine(lines[h1[0]]);
    if (!title) {
      var first = lines.findIndex(function (l) { return l.trim(); });
      if (first >= 0 && !/^#/.test(lines[first])) { title = titleLine(lines[first]); if (title) firstUsed = first; }
    }
    lines.forEach(function (l, i) { if (!/^#{1,6}\s/.test(l) && i !== firstUsed) body.push(l); });
    var words = countWords(body.join('\n'));
    // One "#" is the book's title and "##" are chapters; several "#" are the chapters themselves.
    var chapters = h1.length > 1 ? h1.length : h2;
    return { title: title || fromFilename(name), words: words, chapters: chapters || (words ? 1 : 0) };
  }

  function parseText(text, name) {
    var lines = text.split('\n');
    var first = lines.findIndex(function (l) { return l.trim(); });
    var title = first >= 0 && countWords(lines[first]) <= 12 ? titleLine(lines[first]) : '';
    var rest = title ? lines.slice(first + 1).join('\n') : text;
    // "Chapter 3", "Prologue", "IV."... on their own line; otherwise sections split by two or more blank lines.
    var isHead = function (l) { return /^\s*(chapter\b.{0,60}|prologue|epilogue|[ivxlc]+\.?|\d+\.?)\s*$/i.test(l); };
    var heads = rest.split('\n').filter(isHead).length;
    var words = countWords(rest.split('\n').filter(function (l) { return !isHead(l); }).join('\n'));
    var sections = rest.split(/\n[ \t]*\n(?:[ \t]*\n)+/).filter(function (s) { return countWords(s); }).length;
    return { title: title || fromFilename(name), words: words, chapters: heads || sections };
  }

  // A cover is the book's real title page: title, ornament, author, in book type.
  function cover(b) {
    var n = b.title.length;
    var size = n <= 16 ? 12 : n <= 34 ? 10 : n <= 60 ? 8.5 : 7;
    return '<div class="imp-cover" aria-hidden="true">' +
      '<p class="imp-c-title" style="font-size:' + size + 'px">' + esc(b.title) + '</p>' +
      (b.subtitle ? '<p class="imp-c-sub">' + esc(b.subtitle) + '</p>' : '') +
      '<svg class="imp-c-orn" viewBox="0 0 60 6" width="46" height="5"><path d="M0 3h25M35 3h25" stroke="currentColor" stroke-width=".6"/><path d="M30 .6 32.4 3 30 5.4 27.6 3z" fill="currentColor"/></svg>' +
      (b.author ? '<p class="imp-c-author">' + esc(b.author) + '</p>' : '') +
      (b.publisher ? '<p class="imp-c-pub">' + esc(b.publisher) + '</p>' : '') +
      '</div>';
  }

  function card(b, fresh) {
    var dash = '<span class="imp-missing">—</span>';
    var known = b.words != null;
    var pages = known ? (b.words ? Math.ceil(b.words / WPP) : 0) : null;
    return '<li class="imp-book' + (fresh ? ' is-new' : '') + '" data-id="' + b.id + '">' +
      '<div class="imp-cover-box">' + cover(b) +
      '<button type="button" class="imp-remove" data-remove="' + b.id + '" aria-label="Remove ' + esc(b.title) + ' from the shelf">' +
      '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></div>' +
      '<p class="imp-title">' + esc(b.title) + '</p>' +
      '<p class="imp-author">' + esc(b.author || 'No author yet') + '</p>' +
      '<p class="imp-meta">' + (known ? fmt(b.words) + (b.words === 1 ? ' word' : ' words') : dash + ' words') +
      ' · ' + (known ? fmt(b.chapters) : dash) + ' ch.</p>' +
      (known
        ? '<p class="imp-meta">about ' + fmt(pages) + (pages === 1 ? ' page' : ' pages') + '</p>'
        : '<p class="imp-meta"><span class="imp-pill">Name only</span></p>') +
      '</li>';
  }

  window.BTLDemos = window.BTLDemos || {};
  window.BTLDemos.import = function mount(root) {
    var books = [];
    var seq = 0;
    root.innerHTML =
      '<div class="imp-head">' +
        '<dl class="imp-figs">' +
          '<div><dt>Books</dt><dd data-f="books">0</dd></div>' +
          '<div><dt>Words</dt><dd data-f="words">0</dd></div>' +
        '</dl>' +
        '<button type="button" class="imp-sample">Use the sample</button>' +
      '</div>' +
      '<p class="imp-status" role="status" aria-live="polite"></p>' +
      '<ul class="imp-shelf" aria-label="Bookshelf">' +
        '<li class="imp-drop-li"><button type="button" class="imp-drop">' +
          '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M12 7v6M9 10h6"/></svg>' +
          '<span class="imp-drop-t">Drop a manuscript, or choose a file</span>' +
          '<span class="imp-drop-s">.md, .txt, .docx or .odt</span>' +
        '</button>' +
        '<input class="imp-input" type="file" accept=".md,.markdown,.txt,.docx,.odt,text/markdown,text/plain" multiple tabindex="-1" aria-hidden="true"></li>' +
      '</ul>';

    var $ = function (s) { return root.querySelector(s); };
    var shelf = $('.imp-shelf'), status = $('.imp-status'), input = $('.imp-input'), drop = $('.imp-drop');
    var idle = 'Files are read in your browser. Nothing is uploaded.';

    function say(msg, tone) {
      status.className = 'imp-status' + (tone ? ' is-' + tone : '');
      status.innerHTML = esc(msg) + (tone === 'error' ? ' <button type="button" class="imp-retry">Retry</button>' : '');
    }
    say(idle);

    function render(freshId) {
      shelf.querySelectorAll('.imp-book').forEach(function (el) { el.remove(); });
      shelf.insertAdjacentHTML('beforeend', books.map(function (b) { return card(b, b.id === freshId); }).join(''));
      $('[data-f="books"]').textContent = fmt(books.length);
      $('[data-f="words"]').textContent = fmt(books.reduce(function (s, b) { return s + (b.words || 0); }, 0));
    }

    function add(b) {
      b.id = 'b' + (++seq);
      // The same book again replaces itself; past four, the oldest leaves the shelf.
      books = books.filter(function (x) { return x.title !== b.title || x.author !== b.author; });
      books.unshift(b);
      var gone = books.length > SHELF ? books.pop() : null;
      render(b.id);
      shelf.scrollLeft = 0;
      return gone;
    }

    // Resolves once the file has been handled, so several files land in the order they were chosen.
    function readFile(file) {
      var name = file.name || 'Untitled';
      if (WORD.test(name)) {
        add({ title: fromFilename(name), author: '', words: null, chapters: null });
        say('Word files are imported in the app; this demo only reads .md and .txt.', 'note');
        return Promise.resolve();
      }
      if (!TEXT.test(name)) {
        say('“' + name + '” isn’t a manuscript. Bring a .md, .txt, .docx or .odt file.', 'error');
        return Promise.resolve();
      }
      if (file.size > MAX_BYTES) {
        say('“' + name + '” is over 5 MB, more than this demo reads.', 'error');
        return Promise.resolve();
      }
      return new Promise(function (done) {
        var r = new FileReader();
        r.onload = function () {
          var text = String(r.result).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
          var info = /\.txt$/i.test(name) ? parseText(text, name) : parseMarkdown(text, name);
          info.author = '';
          var gone = add(info);
          say('Added “' + info.title + '”: ' + fmt(info.words) + ' words in ' + fmt(info.chapters) +
            (info.chapters === 1 ? ' chapter.' : ' chapters.') + (gone ? ' “' + gone.title + '” left the shelf.' : ''), 'ok');
        };
        r.onerror = function () { say('Couldn’t read “' + name + '”.', 'error'); };
        r.onloadend = function () { done(); };
        r.readAsText(file);
      });
    }

    function take(files) {
      Array.prototype.reduce.call(files || [], function (p, f) { return p.then(function () { return readFile(f); }); }, Promise.resolve());
    }

    drop.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () { take(input.files); input.value = ''; });

    $('.imp-sample').addEventListener('click', function () {
      var info = parseMarkdown(SAMPLE, 'sample.md');
      info.author = 'Imre Calloway';
      info.subtitle = 'Book One of the Saltmarch Cycle';
      info.publisher = 'Windle & Thorn';
      var gone = add(info);
      say('Added the sample: ' + fmt(info.words) + ' words in ' + fmt(info.chapters) + ' chapters.' +
        (gone ? ' “' + gone.title + '” left the shelf.' : ''), 'ok');
    });

    root.addEventListener('click', function (e) {
      if (e.target.closest('.imp-retry')) { say(idle); input.click(); return; }
      var rm = e.target.closest('[data-remove]');
      if (!rm) return;
      var i = books.findIndex(function (b) { return b.id === rm.dataset.remove; });
      if (i < 0) return;
      var b = books.splice(i, 1)[0];
      render();
      say('Removed “' + b.title + '” from the shelf.');
      var next = shelf.querySelectorAll('.imp-remove')[Math.min(i, books.length - 1)];
      (next || drop).focus();
    });

    // Drops anywhere on the demo count; the drop tile lights up while a file is over it.
    var depth = 0;
    function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
    root.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; e.preventDefault(); depth++; root.classList.add('is-over'); });
    root.addEventListener('dragover', function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    root.addEventListener('dragleave', function () { if (--depth <= 0) { depth = 0; root.classList.remove('is-over'); } });
    root.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      root.classList.remove('is-over');
      take(e.dataTransfer.files);
    });
  };
})();
