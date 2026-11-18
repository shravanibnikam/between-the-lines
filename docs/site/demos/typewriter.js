/* Typewriter, Dim and Focus: a small working copy of the Write screen's editor modes.
   mount(root) fills an empty <div class="demo demo-typewriter">; nothing outside root is touched. */
(function () {
  'use strict';

  // core/src/sample.rs, chapter 1, "The River That Climbed" (footnote marker dropped).
  var OPENING = [
    "On the morning the Tamsel turned around, Iske Varrow was selling her last good compass for the price of a week's bread.",
    'The fishwives saw it first. A cry went up along the quay at Lowmere, then another, and then the whole market was crowding the river wall to watch the water slow, and stop, and begin, with the patience of something that had made up its mind, to climb.',
    "It went up the weir steps like a congregation. It went up the tanners' lane and the long hill past the bell tower, carrying leaves and gulls and one astonished rowing boat, and it did not spill a drop.",
    '"Rivers don\'t do that," said the man holding her compass.',
    '"No," Iske agreed. She took the compass back out of his hand, because she had a feeling she was going to need it. "They don\'t."',
    'By noon there were soldiers on the bridges, and by evening there were notices nailed to every door in the lower town. They were short, and the ink was still wet. <em>By order of the Ninefold Gate: all charts, maps and surveys of the Saltmarch are to be surrendered for burning.</em>'
  ];
  // What the autoplay types, a few words at a time, as the next paragraph.
  var NEXT = 'Iske read it twice by lamplight. Then she went home, lifted the loose board under her bed, and unrolled the one map she had sworn never to look at again.';
  var RAIL = 0.7; // the carriage rail, as a share of the editor's height

  // lucide icons (text-cursor-input, sun-dim, focus), 16px at 1.5 stroke
  function icon(paths) {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + paths + '</svg>';
  }
  var MODES = [
    ['typewriter', 'Typewriter', "Keep the line you're typing a third of the way down",
      icon('<path d="M12 20h-1a2 2 0 0 1-2-2 2 2 0 0 1-2 2H6"/><path d="M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7"/><path d="M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1"/><path d="M6 4h1a2 2 0 0 1 2 2 2 2 0 0 1 2-2h1"/><path d="M9 6v12"/>')],
    ['dim', 'Dim', "Dim every paragraph but the one you're in",
      icon('<circle cx="12" cy="12" r="4"/><path d="M12 4h.01"/><path d="M20 12h.01"/><path d="M12 20h.01"/><path d="M4 12h.01"/><path d="M17.657 6.343h.01"/><path d="M17.657 17.657h.01"/><path d="M6.343 17.657h.01"/><path d="M6.343 6.343h.01"/>')],
    ['focus', 'Focus', 'Hide everything but the page (Esc leaves)',
      icon('<circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>')]
  ];

  function mount(root) {
    var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var state = { typewriter: true, dim: true, focus: false };

    root.innerHTML =
      '<div class="tw-bar">' +
        '<span class="tw-crumb">Chapter I <span aria-hidden="true">/</span> The River That Climbed</span>' +
        '<div class="tw-tools" role="group" aria-label="Writing modes">' +
          MODES.map(function (m) {
            return '<button type="button" class="tw-toggle" data-mode="' + m[0] + '" aria-label="' + m[1] + '" title="' + m[2] + '">' + m[3] + '<span class="tw-label">' + m[1] + '</span></button>';
          }).join('') +
          '<span class="tw-count"></span>' +
        '</div>' +
      '</div>' +
      '<div class="tw-body">' +
        '<div class="tw-outline" aria-hidden="true">' +
          '<p class="tw-outline-h">Story</p>' +
          '<p class="tw-row is-on"><span>1</span><span class="tw-name">The River That Climbed</span><span class="tw-n1"></span></p>' +
          '<p class="tw-row"><span>2</span><span class="tw-name">A Ledger of Names</span><span>145</span></p>' +
          '<p class="tw-row"><span>3</span><span class="tw-name">The Warden of the Ninefold Gate</span><span>107</span></p>' +
        '</div>' +
        '<div class="tw-desk" aria-hidden="true"></div>' +
        '<div class="tw-rail" aria-hidden="true"></div>' +
        '<div class="tw-stage">' +
          '<div class="tw-track">' +
            '<div class="tw-title" aria-hidden="true"><span>Chapter I</span>The River That Climbed</div>' +
            '<div class="tw-text" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="false" aria-label="Chapter text: The River That Climbed. Type to write; Enter starts a new paragraph.">' +
              OPENING.map(function (p) { return '<p>' + p + '</p>'; }).join('') +
            '</div>' +
            '<span class="tw-caret" aria-hidden="true" hidden></span>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="tw-head" aria-label="Leave focus" title="Leave focus (Esc)" hidden><i></i><i></i><i></i></button>' +
      '</div>';

    function q(s) { return root.querySelector(s); }
    var bar = q('.tw-bar'), stage = q('.tw-stage'), track = q('.tw-track'), text = q('.tw-text');
    var fake = q('.tw-caret'), count = q('.tw-count'), n1 = q('.tw-n1'), head = q('.tw-head');
    var toggles = root.querySelectorAll('.tw-toggle');
    var cur = text.lastElementChild; // the paragraph with the caret
    var saved = null;                // the caret, kept while the editor is blurred
    var carriage = false;

    function focused() { return document.activeElement === text; }
    function blockOf(n) {
      while (n && n.parentNode !== text) n = n.parentNode;
      return n && n.nodeType === 1 ? n : null;
    }
    function lastText(el) {
      var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), t = null;
      while (w.nextNode()) t = w.currentNode;
      return t;
    }

    // Where the caret is on screen: the real selection while typing, else the end of the current paragraph.
    function caretRect() {
      var sel = window.getSelection(), r = document.createRange(), t;
      if (focused() && sel.rangeCount && text.contains(sel.focusNode)) {
        r.setStart(sel.focusNode, sel.focusOffset);
      } else if ((t = lastText(cur))) {
        r.setStart(t, t.data.length);
      } else r = null;
      var rects = r ? r.getClientRects() : [];
      if (rects.length) return rects[rects.length - 1];
      var b = cur.getBoundingClientRect(), lh = parseFloat(getComputedStyle(text).lineHeight) || 28;
      return { left: b.left, top: b.top + lh * 0.15, bottom: b.top + lh * 0.85 };
    }

    // Keep the caret where the active mode wants it.
    function place() {
      if (!root.isConnected) return;
      if (carriage) {
        stage.scrollTop = 0;
        stage.scrollLeft = 0;
        track.style.paddingBottom = '';
      } else {
        track.style.transform = '';
        track.style.paddingBottom = state.typewriter ? Math.round(stage.clientHeight * 0.67) + 'px' : '';
      }
      var c = caretRect(), t = track.getBoundingClientRect(), s = stage.getBoundingClientRect();
      if (carriage) {
        var x = stage.clientWidth / 2 - (c.left - t.left);
        var y = stage.clientHeight * RAIL - 8 - (c.bottom - t.top);
        track.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
      } else if (state.typewriter) {
        stage.scrollTop += c.top - (s.top + stage.clientHeight / 3);
      } else if (c.bottom > s.bottom - 16) {
        stage.scrollTop += c.bottom - s.bottom + 40;
      } else if (c.top < s.top + 8) {
        stage.scrollTop -= s.top + 8 - c.top;
      }
      if (!fake.hidden) {
        fake.style.height = Math.round(c.bottom - c.top) + 'px';
        fake.style.transform = 'translate(' + Math.round(c.left - t.left) + 'px,' + Math.round(c.top - t.top) + 'px)';
      }
    }

    function sync() {
      if (!text.firstElementChild) { // everything deleted: keep one empty paragraph to type into
        text.innerHTML = '<p><br></p>';
        var r = document.createRange();
        r.setStart(text.firstChild, 0);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(r);
      }
      var b = focused() ? blockOf(window.getSelection().focusNode) : null;
      if (!b) b = cur && cur.parentNode === text ? cur : text.lastElementChild;
      if (b !== cur && cur) cur.classList.remove('is-current');
      cur = b;
      cur.classList.add('is-current');
      var n = 0;
      for (var i = 0; i < text.children.length; i++) {
        var m = text.children[i].textContent.match(/\S+/g);
        n += m ? m.length : 0;
      }
      count.textContent = n.toLocaleString('en-US') + ' words';
      n1.textContent = n.toLocaleString('en-US');
      place();
    }

    function focusEditor() {
      text.focus({ preventScroll: true });
      var sel = window.getSelection(), r = saved;
      if (!r || !text.contains(r.startContainer)) {
        r = document.createRange();
        r.selectNodeContents(cur);
        r.collapse(false);
      }
      sel.removeAllRanges();
      sel.addRange(r);
      sync();
    }

    function render() {
      carriage = state.focus && state.typewriter;
      for (var i = 0; i < toggles.length; i++) toggles[i].setAttribute('aria-pressed', String(state[toggles[i].dataset.mode]));
      root.classList.toggle('is-tw', state.typewriter);
      root.classList.toggle('is-dim', state.dim);
      root.classList.toggle('is-focus', state.focus);
      root.classList.toggle('is-carriage', carriage);
      root.classList.remove('is-quiet');
      head.hidden = !carriage;
      place();
    }

    function set(mode, on) {
      var was = carriage;
      state[mode] = on;
      render();
      if (carriage && !was) focusEditor(); // the carriage is for typing: carry on where the caret was
    }

    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]');
      if (b) set(b.dataset.mode, !state[b.dataset.mode]);
    });
    head.addEventListener('click', function () { set('focus', false); focusEditor(); });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.focus) { set('focus', false); if (!focused()) focusEditor(); }
    });

    // Editing: the browser does the typing; keep one paragraph per Enter and plain text only.
    text.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); document.execCommand('insertParagraph'); }
      requestAnimationFrame(sync); // arrows, Home/End: the caret has moved by the next frame
    });
    text.addEventListener('paste', function (e) {
      e.preventDefault();
      var s = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
      s.split(/\r?\n/).forEach(function (line, i) {
        if (i) document.execCommand('insertParagraph');
        if (line) document.execCommand('insertText', false, line);
      });
    });
    text.addEventListener('drop', function (e) { e.preventDefault(); });
    text.addEventListener('input', function () {
      sync();
      if (carriage) root.classList.add('is-quiet'); // the toolbar steps aside while you type
    });
    text.addEventListener('pointerup', function () { requestAnimationFrame(sync); });
    text.addEventListener('focus', function () { requestAnimationFrame(sync); });
    text.addEventListener('blur', function () {
      var sel = window.getSelection();
      if (sel.rangeCount && text.contains(sel.focusNode)) saved = sel.getRangeAt(0).cloneRange();
    });
    // A click on the empty desk or below the text keeps writing where the caret was.
    stage.addEventListener('mousedown', function (e) {
      if (e.target === stage || e.target === track) { e.preventDefault(); focusEditor(); }
    });
    root.addEventListener('pointermove', function () { root.classList.remove('is-quiet'); });
    bar.addEventListener('focusin', function () { root.classList.remove('is-quiet'); });

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { requestAnimationFrame(place); });
      ro.observe(stage);
      ro.observe(text); // the book font arriving late reflows the text
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);

    // Autoplay: types the next paragraph a few words at a time while nobody is using the demo.
    var auto = !reduce, visible = false, timer = 0, node = null, words = NEXT.split(' '), wi = 0, chunk = '';
    function stopAuto() {
      if (!auto) return;
      auto = false;
      clearTimeout(timer);
      fake.hidden = true;
      if (io) io.disconnect();
      root.removeEventListener('pointerdown', stopAuto, true);
      root.removeEventListener('keydown', stopAuto, true);
      root.removeEventListener('focusin', stopAuto, true);
    }
    function tick() {
      if (!auto) return;
      if (!root.isConnected) return stopAuto();
      if (!visible || document.hidden) { timer = setTimeout(tick, 600); return; }
      if (!node) { // "Enter": a new paragraph at the end
        var p = document.createElement('p');
        node = p.appendChild(document.createTextNode(''));
        text.appendChild(p);
        cur.classList.remove('is-current');
        cur = p;
        sync();
        timer = setTimeout(tick, 700);
        return;
      }
      if (!chunk) {
        if (wi >= words.length) return; // done; the caret keeps blinking
        var n = 2 + Math.floor(Math.random() * 3);
        chunk = (wi ? ' ' : '') + words.slice(wi, wi + n).join(' ');
        wi += n;
      }
      node.data += chunk.charAt(0);
      chunk = chunk.slice(1);
      fake.style.animation = chunk ? 'none' : ''; // solid while typing, blinking in the pauses
      sync();
      timer = setTimeout(tick, chunk ? 40 + Math.random() * 70 : 1400 + Math.random() * 1400);
    }
    var io = null;
    if (auto) {
      fake.hidden = false;
      root.addEventListener('pointerdown', stopAuto, true);
      root.addEventListener('keydown', stopAuto, true);
      root.addEventListener('focusin', stopAuto, true);
      if (window.IntersectionObserver) {
        io = new IntersectionObserver(function (es) {
          var was = visible;
          visible = es[es.length - 1].isIntersecting;
          if (visible && !was && !timer) timer = setTimeout(tick, 1200);
        }, { threshold: 0.35 });
        io.observe(root);
      } else {
        visible = true;
        timer = setTimeout(tick, 1200);
      }
    }

    render();
    sync();
  }

  window.BTLDemos = window.BTLDemos || {};
  window.BTLDemos.typewriter = mount;
})();
