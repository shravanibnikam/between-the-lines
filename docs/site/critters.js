// The garden behind the page: butterflies and blooms rendered as lit 3D surfaces in type.
// Nothing is ever drawn under text: every line of text is cut out of the layer each frame.
// Also: the custom cursor and its ink trail, the bookmark ribbon, and small hover physics.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;

  // Palette: index → colour. Glow sprites are made once per colour.
  const PAL = [
    [236, 90, 160], [255, 190, 225], [255, 244, 250], [176, 156, 255], [255, 205, 120],
    [245, 232, 210], [190, 40, 110], [130, 200, 150], [255, 150, 80],
  ];
  const P = { pink: 0, rose: 1, white: 2, lilac: 3, gold: 4, cream: 5, deep: 6, green: 7, amber: 8 };
  const FILL = PAL.map(c => `rgb(${c})`);
  const GLOW = PAL.map(c => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const x = cv.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, `rgba(${c},1)`); gr.addColorStop(.35, `rgba(${c},.35)`); gr.addColorStop(1, `rgba(${c},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 32, 32); return cv;
  });

  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const hash = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };

  /* ---------- 3D in type: lit surfaces, z-buffered into a character grid ---------- */
  // Each object is a surface sampled with normals. Every cell keeps its nearest sample, and its
  // brightness under one light picks a glyph from the ramp and a colour from the object's tone scale.
  const RAMP3 = '.,-~:;=!*#$@';
  const SOFT = '.\u00b7:;~=+*o';
  const TONES = {
    pink: [[110, 28, 70], [214, 70, 140], [250, 160, 205], [255, 236, 246]],
    lilac: [[60, 50, 130], [140, 120, 240], [200, 190, 255], [245, 242, 255]],
    amber: [[120, 50, 20], [230, 120, 60], [255, 190, 120], [255, 240, 210]],
    gold: [[110, 80, 30], [220, 170, 80], [255, 215, 140], [255, 245, 215]],
    cream: [[90, 80, 70], [180, 170, 150], [235, 225, 205], [255, 250, 240]],
    cover: [[80, 20, 50], [160, 40, 100], [224, 103, 154], [250, 190, 215]],
    deep: [[90, 15, 50], [180, 40, 110], [236, 90, 160], [255, 190, 225]],
  };
  const TONE_LIST = Object.values(TONES), TONE_ID = Object.fromEntries(Object.keys(TONES).map((k, i) => [k, i]));
  const tone = (ti, l) => {
    const s = TONE_LIST[ti], x = Math.min(.999, l) * 3, i = x | 0, f = x - i, a = s[i], b = s[i + 1];
    return `rgb(${a[0] + (b[0] - a[0]) * f | 0},${a[1] + (b[1] - a[1]) * f | 0},${a[2] + (b[2] - a[2]) * f | 0})`;
  };
  const LIGHT = (() => { const v = [-.7, .45, -.55], m = Math.hypot(...v); return v.map(x => x / m); })();
  const GMAX = 120 * 80, zb = new Float32Array(GMAX), lb = new Float32Array(GMAX), tb = new Uint8Array(GMAX);
  const off = document.createElement('canvas'), oc = off.getContext('2d');
  const canFilter = 'filter' in oc;
  let G = null; // current grid

  function gridBegin(ox, oy, S, ext, yaw, pitch, soft) {
    const cell = Math.max(5.5, Math.min(9, S / 12)), cw = cell * .6;
    const cols = Math.min(120, Math.ceil(ext[0] * 2 * S / cw)), rows = Math.min(80, Math.ceil(ext[1] * 2 * S / cell));
    zb.fill(-1, 0, cols * rows);
    G = { soft, ox, oy, S, cell, cw, cols, rows, cy: Math.cos(yaw), sy: Math.sin(yaw), cp: Math.cos(pitch), sp: Math.sin(pitch) };
  }
  // A surface sample: position, normal, a shade multiplier (patterns) and a tone.
  function emit(x, y, z, nx, ny, nz, shade, ti) {
    const o = G;
    const x1 = x * o.cy + z * o.sy, z1 = -x * o.sy + z * o.cy, y2 = y * o.cp - z1 * o.sp, z2 = y * o.sp + z1 * o.cp;
    const f = 3.2 / (3.2 + z2);
    const c = Math.floor((x1 * f * o.S) / o.cw + o.cols / 2), r = Math.floor((-y2 * f * o.S) / o.cell + o.rows / 2);
    if (c < 0 || r < 0 || c >= o.cols || r >= o.rows) return;
    const i = r * o.cols + c;
    if (f <= zb[i]) return;
    const n1x = nx * o.cy + nz * o.sy, n1z = -nx * o.sy + nz * o.cy, n2y = ny * o.cp - n1z * o.sp, n2z = ny * o.sp + n1z * o.cp;
    const d = Math.abs(n1x * LIGHT[0] + n2y * LIGHT[1] + n2z * LIGHT[2]);
    zb[i] = f; lb[i] = Math.min(.96, (.06 + .86 * Math.pow(d, 1.4)) * shade * (.85 + (f - .8) * .8)); tb[i] = ti;
  }
  function gridEnd(ctx, alpha) {
    const o = G, d = Math.min(2, devicePixelRatio || 1), w = o.cols * o.cw, h = o.rows * o.cell;
    off.width = Math.ceil(w * d); off.height = Math.ceil(h * d);
    oc.setTransform(d, 0, 0, d, 0, 0);
    oc.font = `500 ${o.cell}px "Source Code Pro", ui-monospace, monospace`; oc.textBaseline = 'top';
    for (let r = 0; r < o.rows; r++) for (let c = 0; c < o.cols; c++) {
      const i = r * o.cols + c;
      if (zb[i] < 0) continue;
      const l = lb[i];
      oc.fillStyle = tone(tb[i], l);
      oc.fillText(o.soft ? SOFT[Math.min(SOFT.length - 1, (l * SOFT.length) | 0)] : RAMP3[Math.min(11, (l * 12) | 0)], c * o.cw, r * o.cell);
    }
    const x = o.ox - w / 2, y = o.oy - h / 2;
    if (canFilter) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * (o.soft ? 1 : .8); ctx.filter = `blur(${o.cell * (o.soft ? 1.2 : .7)}px)`;
      ctx.drawImage(off, x, y, w, h); ctx.restore();
    }
    ctx.globalAlpha = alpha * (o.soft ? .75 : 1); ctx.drawImage(off, x, y, w, h); ctx.globalAlpha = 1;
  }

  const ell = (x, y, cx, cy, rx, ry, rot) => {
    const c = Math.cos(rot), s = Math.sin(rot), dx = x - cx, dy = y - cy;
    const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry; return u * u + v * v;
  };
  // Butterfly wing samples, with a pattern: darker core, bright middle, dark border band with pale spots.
  const WING = [];
  for (let v = -.64; v <= .64; v += .03) for (let u = .04; u <= .96; u += .03) {
    const dd = Math.min(ell(u, v, .42, -.2, .44, .3, -.5), ell(u, v, .3, .27, .28, .22, .6));
    if (dd > 1) continue;
    const rim = Math.sqrt(dd), band = rim > .82;
    const veins = .85 + .15 * Math.cos(Math.atan2(v + .05, u) * 10);
    WING.push({ u, v, sh: band ? (hash(u * 9, v * 9) > .6 ? 1.3 : .5) : (rim < .35 ? .7 : 1.05) * veins });
  }
  const FLY_TONE = [TONE_ID.pink, TONE_ID.lilac, TONE_ID.amber];
  function butterfly(ctx, ox, oy, S, yaw, t, variant, alpha) {
    gridBegin(ox, oy, S, [1.15, .95], yaw, -.7);
    const flap = Math.sin(t) * .9 + .3, cf = Math.cos(flap), sf = Math.sin(flap), ti = FLY_TONE[variant];
    for (const p of WING) {
      emit(p.u * cf, -p.v, p.u * sf, -sf, 0, cf, p.sh, ti);
      emit(-p.u * cf, -p.v, p.u * sf, sf, 0, cf, p.sh, ti);
    }
    for (let v = -.4; v <= .44; v += .03) for (let a = 0; a < 6.28; a += .7) {
      const rr = .045 * (1 - Math.abs(v) * .6);
      emit(Math.cos(a) * rr, -v, Math.sin(a) * rr, Math.cos(a), 0, Math.sin(a), 1.1, TONE_ID.cream);
    }
    for (let s = 0; s <= 1; s += .06) { emit(.03 + s * .2, .4 + s * .28, s * .05, 0, 0, -1, 1.2, TONE_ID.cream); emit(-.03 - s * .2, .4 + s * .28, s * .05, 0, 0, -1, 1.2, TONE_ID.cream); }
    gridEnd(ctx, alpha);
  }

  // Bloom: three rings of cupped petals around a gold centre.
  const RINGS = [[8, 1, .45, 0, 0, TONE_ID.pink], [6, .74, .95, .06, .4, TONE_ID.deep], [5, .48, 1.5, .12, .9, TONE_ID.cover]];
  function petalPoint(th, s, w, len, cup, lift) {
    const r = s * len, y = lift + s * s * cup * .55, c = Math.cos(th), sn = Math.sin(th);
    return [c * r - sn * w, y, sn * r + c * w];
  }
  function bloom(ctx, ox, oy, S, t, open, alpha, ph) {
    gridBegin(ox, oy, S, [1.15, .95], t * .25 + ph, -.95, true);
    for (const [count, len0, cup0, lift, offA, ti] of RINGS) {
      const len = len0 * (.55 + .45 * open), cup = cup0 * (1.9 - .9 * open);
      for (let k = 0; k < count; k++) {
        const th = k / count * Math.PI * 2 + offA;
        for (let s = .06; s <= 1; s += .04) {
          const half = Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.02)), .6) * .34 * len;
          for (let w = -half; w <= half; w += .03) {
            const p = petalPoint(th, s, w, len, cup, lift), a = petalPoint(th, s + .02, w, len, cup, lift), b = petalPoint(th, s, w + .02, len, cup, lift);
            const ux = a[0] - p[0], uy = a[1] - p[1], uz = a[2] - p[2], vx = b[0] - p[0], vy = b[1] - p[1], vz = b[2] - p[2];
            let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const m = Math.hypot(nx, ny, nz) || 1;
            emit(p[0], p[1], p[2], nx / m, ny / m, nz / m, .75 + .45 * (1 - Math.abs(w) / (half || 1)) * (s > .75 ? 1.1 : 1), ti);
          }
        }
      }
    }
    for (let a = 0; a < 6.28; a += .35) for (let b = 0; b < 1.57; b += .25) {
      const nx = Math.cos(a) * Math.cos(b), ny = Math.sin(b), nz = Math.sin(a) * Math.cos(b);
      emit(nx * .14, .2 + ny * .12, nz * .14, nx, ny, nz, 1.2, TONE_ID.gold);
    }
    gridEnd(ctx, alpha);
  }

  function spark(ctx, x, y, s, a, ci) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(GLOW[ci], x - s * 2, y - s * 2, s * 4, s * 4);
    ctx.fillStyle = FILL[P.white];
    ctx.fillRect(x - s * .9, y - .5, s * 1.8, 1); ctx.fillRect(x - .5, y - s * .9, 1, s * 1.8);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  /* ---------- The page layer ---------- */
  const bg = document.createElement('canvas');
  bg.className = 'garden'; bg.setAttribute('aria-hidden', 'true');
  document.body.prepend(bg);
  const g = bg.getContext('2d');
  let W = 0, H = 0, dpr = 1, things = [], dust = [], holes = [];
  let mouse = { x: -999, y: -999, on: false };

  // Every line of text, every control and picture is a hole the garden never draws in.
  function collectHoles() {
    const next = [];
    const add = (r, pad) => { if (r.width && r.height) next.push([r.left - pad, r.top + scrollY - pad, r.right + pad, r.bottom + scrollY + pad]); };
    document.querySelectorAll('h1 .rise, h2, h3, p, dt, dd, li, label, .hint').forEach(el => {
      const rg = document.createRange(); rg.selectNodeContents(el);
      for (const r of rg.getClientRects()) add(r, 16);
    });
    document.querySelectorAll('.nav, .carriage, .btn, .plate, .panel, .ev, .tree, .designs, .download, .mark-ascii, .figures > div').forEach(el => add(el.getBoundingClientRect(), 10));
    holes = next;
  }
  const inHole = (x, y) => holes.some(h => x > h[0] && x < h[2] && y > h[1] && y < h[3]);
  // Art is never cut: anything drifting over text fades back whole, and comes up again once it's clear.
  const overText = (x, y, r) => holes.some(h => x + r > h[0] && x - r < h[2] && y + r * .8 > h[1] && y - r * .8 < h[3]);
  const fadeFor = (o, x, y, r) => { o.f = (o.f ?? 1) + ((overText(x, y, r) ? .1 : 1) - (o.f ?? 1)) * .08; return o.f; };

  function plant() {
    const docH = document.documentElement.scrollHeight;
    seed = 7; things = [];
    collectHoles();
    const box = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top + scrollY, b: r.bottom + scrollY, w: r.width, h: r.height }; };
    const mobile = W <= 560;
    const garden = (x0, x1, y, count, S) => {
      for (let j = 0; j < count; j++) things.push({ k: 'bloom', x: x0 + (x1 - x0) * (count === 1 ? .5 : j / (count - 1)), y: y + (j % 2) * 30, ph: rnd() * 6, open: j % 3 === 0 ? 1 : 0, o: j % 3 === 0 ? 1 : .15, S: S * (.8 + rnd() * .4) });
    };
    // Blooms live only where the page leaves room.
    const name = box('.name .r2'), l2 = box('.name .l2'), foot = box('.hero-foot');
    if (name && !mobile && W - name.r > 260) garden(name.r + 130, W - 130, l2.t + l2.h * .45, W - name.r > 420 ? 2 : 1, 80);
    if (foot && mobile) garden(60, W - 60, foot.t - 70, 3, 40);
    const fh = box('.features > h2');
    if (fh && W > 960) { garden(W * .64, W - 150, fh.t + 40, 2, 72); }
    const how = box('.how h2'), howEnd = box('.how');
    if (how && W > 1100) {
      const gx = Math.max(110, how.l - 170);
      for (let y = how.t + 220, i = 0; y < howEnd.b - 120; y += 460, i++) {
        if (i % 2 === 0) garden(gx, gx, y, 1, 80);
      }
    }
    const faq = box('.faq > h2');
    if (faq && !mobile) garden(W * .6, W - 150, faq.t + 30, 3, 66);
    if (W > 900) things.push({ k: 'fly', x: W * .84, y: 230, a: 2.6, sp: .25, v: 0, home: 240, S: 100 });
    for (let y = 160, i = 0; y < docH - 200; y += 600, i++) {
      if (W > 700 || i % 2 === 0) things.push({ k: 'fly', x: rnd() * W, y: y + rnd() * 300, a: rnd() * 6.28, sp: .35 + rnd() * .35, v: i % 3, home: y + 150, S: 48 + rnd() * 30 });
      for (let s = 0; s < 3; s++) things.push({ k: 'spark', x: rnd() * W, y: y + rnd() * 600, ph: rnd() * 6, ci: [P.white, P.pink, P.lilac, P.gold][(rnd() * 4) | 0] });
    }
  }
  function size() {
    dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    bg.width = W * dpr; bg.height = H * dpr;
    plant();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last); last = now;
    const t = now / 1000, sy = scrollY;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    for (const o of things) {
      let vy = o.y - sy;
      const near = mouse.on ? Math.hypot(o.x - mouse.x, vy - mouse.y) : 1e9;
      if (o.k === 'fly') {
        let sp = o.sp;
        o.a += Math.sin(t * .6 + o.home) * .02 + (rnd() - .5) * .06;
        if (near < 160) { o.a = Math.atan2(vy - mouse.y, o.x - mouse.x) + (rnd() - .5) * .5; sp = 2.8; }
        if (inHole(o.x + Math.cos(o.a) * 70, o.y + Math.sin(o.a) * 70)) { o.a += .18; sp = Math.max(sp, 1.2); } // steer around text
        o.x += Math.cos(o.a) * sp * dt / 16;
        o.y += Math.sin(o.a) * sp * dt / 16 + (o.home - o.y) * .002;
        if (o.x < -80) o.x = W + 60; if (o.x > W + 80) o.x = -60;
        vy = o.y - sy;
        if (vy < -120 || vy > H + 120) continue;
        butterfly(g, o.x, vy, o.S, -o.a + Math.PI / 2, t * (sp > 1 ? 16 : 7) + o.home, o.v, .95 * fadeFor(o, o.x, o.y, o.S * .9));
        if (rnd() < .3) dust.push({ x: o.x + (rnd() - .5) * o.S, y: o.y + (rnd() - .5) * o.S * .6, vx: -Math.cos(o.a) * .4, vy: -.2 - rnd() * .3, life: 1000, ci: rnd() < .5 ? P.white : P.pink });
      } else if (vy > -160 && vy < H + 160) {
        if (o.k === 'bloom') {
          if (near < 220) o.open = 1;
          o.o += (o.open - o.o) * .04;
          bloom(g, o.x, vy, o.S * (.75 + .25 * o.o), t, o.o, (.55 + o.o * .4) * fadeFor(o, o.x, o.y, o.S), o.ph);
        } else if (o.k === 'spark') {
          const tw = (Math.sin(t * 1.6 + o.ph) + 1) / 2;
          spark(g, o.x, vy, 3 + tw * 4, .15 + tw * .5 + (near < 160 ? .3 : 0), o.ci);
        }
      }
    }
    g.globalCompositeOperation = 'lighter';
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i]; d.x += d.vx; d.y += d.vy; d.life -= dt;
      if (d.life <= 0) { dust.splice(i, 1); continue; }
      if (inHole(d.x, d.y)) continue;
      g.globalAlpha = d.life / 1000 * .8; g.drawImage(GLOW[d.ci], d.x - 5, d.y - sy - 5, 10, 10);
    }
    g.globalAlpha = 1;
    if (!document.hidden && !reduce) requestAnimationFrame(frame);
  }

  size();
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(size, 200); });
  addEventListener('load', () => setTimeout(plant, 400));
  document.fonts?.ready.then(() => setTimeout(collectHoles, 300));
  setInterval(() => { if (!document.hidden) collectHoles(); }, 1500); // entrances move text as it rises in
  requestAnimationFrame(frame);
  if (!reduce) document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = performance.now(); requestAnimationFrame(frame); } });
  addEventListener('pointermove', e => { mouse = { x: e.clientX, y: e.clientY, on: true }; }, { passive: true });
  document.addEventListener('pointerleave', () => { mouse.on = false; });

  // Click on empty page: a butterfly takes off from there.
  addEventListener('click', e => {
    if (reduce || e.target.closest('a, button, input, label, canvas[data-ascii-mark], .designs, figure, dialog')) return;
    things.push({ k: 'fly', x: e.clientX, y: e.clientY + scrollY, a: -Math.PI / 2 + (rnd() - .5), sp: 1.6, v: (rnd() * 3) | 0, home: e.clientY + scrollY - 160, S: 40 });
  });

  /* ---------- Bookmark ribbon: grows as you read down the page ---------- */
  const ribbon = document.createElement('div');
  ribbon.className = 'ribbon'; ribbon.setAttribute('aria-hidden', 'true');
  document.body.append(ribbon);
  const setRibbon = () => ribbon.style.setProperty('--p', Math.min(1, scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)));
  addEventListener('scroll', setRibbon, { passive: true }); setRibbon();

  /* ---------- Hero letters lift under the pointer ---------- */
  document.querySelectorAll('.name .rise').forEach(el => {
    el.innerHTML = [...el.textContent].map(ch => ch === ' ' ? ' ' : `<span class="ltr">${ch}</span>`).join('');
  });

  if (!fine || reduce) return;

  /* ---------- Magnetic buttons, tilting pictures ---------- */
  document.querySelectorAll('.btn, .cell, .chip').forEach(b => {
    b.addEventListener('pointermove', e => {
      const r = b.getBoundingClientRect();
      b.style.translate = `${(e.clientX - r.left - r.width / 2) * .12}px ${(e.clientY - r.top - r.height / 2) * .2}px`;
    });
    b.addEventListener('pointerleave', () => { b.style.translate = ''; });
  });
  document.querySelectorAll('.panel, .page-wrap, .ev').forEach(p => {
    p.addEventListener('pointermove', e => {
      const r = p.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      p.style.transform = `perspective(1200px) rotateY(${x * 5}deg) rotateX(${-y * 5}deg)`;
    });
    const flat = () => { p.style.transform = ''; };
    p.addEventListener('pointerleave', flat); p.addEventListener('click', flat);
  });

  /* ---------- Cursor: an ink dot, a ring that follows, and a trail of the book's letters ---------- */
  const INK = 'OnthemorningtheTamselturnedaroundIskeVarrowwassellinghergoodcompass';
  const dot = document.createElement('div'), ringEl = document.createElement('div');
  dot.className = 'cur-dot'; ringEl.className = 'cur-ring';
  [dot, ringEl].forEach(el => { el.setAttribute('aria-hidden', 'true'); document.body.append(el); });
  document.documentElement.classList.add('has-cursor');
  let rx = 0, ry = 0, px = 0, py = 0, lastX = 0, lastY = 0, k = 0;
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    px = e.clientX; py = e.clientY;
    dot.style.transform = `translate(${px}px, ${py}px)`;
    if (Math.hypot(px - lastX, py - lastY) > 28) {
      const l = document.createElement('span');
      l.className = k % 3 === 0 ? 'ink ink-pink' : 'ink'; l.textContent = INK[k++ % INK.length];
      l.style.left = px + 'px'; l.style.top = py + 'px';
      l.setAttribute('aria-hidden', 'true');
      l.addEventListener('animationend', () => l.remove());
      document.body.append(l);
      lastX = px; lastY = py;
    }
    const t = e.target, field = t.closest('input, textarea');
    document.documentElement.classList.toggle('cur-text', !!field);
    ringEl.classList.toggle('hot', !field && !!t.closest('a, button, .chip, [data-shot], canvas[data-ascii-mark], .ltr'));
  }, { passive: true });
  addEventListener('pointerdown', () => ringEl.classList.add('down'));
  addEventListener('pointerup', () => ringEl.classList.remove('down'));
  document.addEventListener('pointerleave', () => document.documentElement.classList.add('cur-out'));
  document.addEventListener('pointerenter', () => document.documentElement.classList.remove('cur-out'));
  (function follow() {
    rx += (px - rx) * .18; ry += (py - ry) * .18;
    ringEl.style.transform = `translate(${rx}px, ${ry}px)`;
    requestAnimationFrame(follow);
  })();
})();
