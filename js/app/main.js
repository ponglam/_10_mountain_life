/*
 * Mountain Life — UI controller
 * js/app/main.js
 *
 * form → seed → genome → scene at time φ → render.
 * Exposes ML.app for debugging in the console.
 */
(function (ML) {
  'use strict';
  const { clamp, sleep } = ML.math;
  const F = ML.frame;
  const $ = (id) => document.getElementById(id);
  const canvas = $('art'), ctx = canvas.getContext('2d');
  const phiEl = $('phi'), phiOut = $('phiOut');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TEST = location.search.includes('test'); // ?test: no typing, no animation (for automated checks)

  const ui = {
    G: null, input: null, phi: 0, k: 1, anim: null,
    lowQ: false, live: false, liveDir: 1, lastT: 0, raf: 0, busy: false, exportSize: 4096,
  };

  // ---- Canvas sizing --------------------------------------------------------------------
  function sizeCanvas() {
    const st = $('stage'), cs = getComputedStyle(st);
    const aw = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const narrow = matchMedia('(max-width:860px)').matches;
    const ah = narrow ? window.innerHeight * 0.78 : st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const w = Math.max(200, Math.min(aw, (ah * F.W) / F.H)), dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.width = w + 'px';
    canvas.style.height = (w * F.H) / F.W + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(((w * F.H) / F.W) * dpr);
    ui.k = canvas.width / F.W;
    ui.anim = null; ui.fade = null;
    request();
  }

  // ---- Render loop ----------------------------------------------------------------------
  // The line field is rebuilt only when the seed, time, format or quality changes.
  // A new piece is painted layer by layer: each slice laid down as a stroke
  // travelling across the frame, far slices first, each hiding what lies behind.
  const glCanvas = document.createElement('canvas');
  let R3 = null;
  const cloudCanvas = document.createElement('canvas');
  let R4 = null; // clouds are drawn on their own canvas at half size, then blurred over the drawing
  try { R3 = new ML.render.Renderer(glCanvas); R4 = new ML.render.Renderer(cloudCanvas); } catch (e) { $('glNote').hidden = false; }
  let fieldKey = '', field = null;
  function ensureField() {
    const q = ui.lowQ || ui.live ? 'low' : 'high';
    const key = ui.G.master + '|' + ui.phi.toFixed(3) + '|' + F.aspect + '|' + q;
    if (key === fieldKey) return false;
    const opts = q === 'low' ? { stride: 4, step: 6 } : { stride: 1, step: clamp(2.0 / ui.k, 1.4, 3) };
    field = ML.landscape.buildField(ui.G, F, ui.phi, opts);
    R3.setField(field);
    R4.setCloudField(field);
    fieldKey = key;
    return true;
  }
  /** Where the sky is clear above the ink: the sun or moon sits there, behind nothing. */
  function placeOrb() {
    const S = ui.G.sky, M = 64, colTop = new Float32Array(M).fill(F.H), P = field.pts;
    ui.colTop = colTop;
    for (let i = 0; i < field.count; i++) { // highest ink (or cloud) in each of M columns
      const x = P[i * 7], y = P[i * 7 + 1];
      if (P[i * 7 + 2] < 0.015 || x < 0 || x >= F.W) continue;
      const c = Math.floor((x / F.W) * M);
      if (y < colTop[c]) colTop[c] = y;
    }
    const C = field.cloud;
    for (let i = 0; i < field.cloudCount; i++) {
      const x = C[i * 7], y = C[i * 7 + 1] - C[i * 7 + 3];
      if (x < 0 || x >= F.W) continue;
      const c = Math.floor((x / F.W) * M);
      if (y < colTop[c]) colTop[c] = y;
    }
    const clearAt = (cx, r) => { // free sky above the ink across the disc and its halo
      let top = F.H;
      for (let c = 0; c < M; c++) if (Math.abs((c + 0.5) * F.W / M - cx) < r * 2.4) top = Math.min(top, colTop[c]);
      return top;
    };
    let r = S.r * Math.min(F.W, F.H);
    for (let tries = 0; tries < 6; tries++, r *= 0.75) {
      // the ideal x first, then search outward for clear sky
      for (let d = 0; d <= 0.5; d += 0.02) for (const sgn of [1, -1]) {
        const cx = (S.x + sgn * d) * F.W;
        if (cx < r * 2 || cx > F.W - r * 2) continue;
        const top = clearAt(cx, r), gap = r * 1.6; // breathing room between orb and ridge
        if (top - gap - r < r * 1.4) continue;
        const yLow = top - gap - r, yHigh = r * 1.4;
        return { cx, cy: lerpN(yLow, yHigh, S.lift), r };
      }
    }
    // the sun/moon is always there: smallest size, highest clear spot
    r = S.r * Math.min(F.W, F.H) * 0.3;
    let bx = S.x * F.W, best = -1;
    for (let c = 0; c < M; c++) if (colTop[c] > best) { best = colTop[c]; bx = (c + 0.5) * F.W / M; }
    return { cx: clamp(bx, r * 2, F.W - r * 2), cy: Math.max(r * 1.4, Math.min(best - r * 2, r * 3)), r };
  }
  const lerpN = (a, b, t) => a + (b - a) * t;
  /**
   * Night births (seeded): the sky above the ink is a dark noise field in the element's dark tone,
   * varying from 20 darker to 20 brighter, fading out just above the ridges.
   */
  const NIGHT = { Wood: [31, 51, 40], Fire: [58, 26, 28], Earth: [58, 46, 30], Metal: [42, 45, 51], Water: [20, 30, 48] };
  function drawNightSky(colTop) {
    const G = ui.G, base = NIGHT[G.birth.element.en] || NIGHT.Water;
    const w = 160, h = Math.round(160 * F.H / F.W), c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h), D = img.data, M = colTop.length;
    // a smooth skyline: lowest-ridge envelope (min over ±4 columns), then averaged, so the fade has no streaks
    const env = new Float32Array(M), sm = new Float32Array(M);
    for (let i = 0; i < M; i++) { let m = F.H; for (let j = -4; j <= 4; j++) m = Math.min(m, colTop[Math.max(0, Math.min(M - 1, i + j))]); env[i] = m; }
    for (let i = 0; i < M; i++) { let t = 0; for (let j = -5; j <= 5; j++) t += env[Math.max(0, Math.min(M - 1, i + j))]; sm[i] = t / 11; }
    ML.noise.seed(G.noiseSeed); ML.noise.detail(4, 0.5);
    const R = ML.random.makeRng(G.master + '/night'), ox = R.range(0, 99), oy = R.range(0, 99), f = R.range(0.02, 0.06);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = (ML.noise.at(x * f + ox, y * f + oy, 42.4) - 0.5) * 2 * 20; // -20 .. +20
      const fx = (x / w) * (M - 1), i0 = Math.floor(fx), top = lerpN(sm[i0], sm[Math.min(M - 1, i0 + 1)], fx - i0) / F.H * h;
      const a = 1 - ML.math.smooth(top - h * 0.18, top + h * 0.02, y); // a long, soft fade into the ridges
      const i = (y * w + x) * 4;
      D[i] = base[0] + v; D[i + 1] = base[1] + v; D[i + 2] = base[2] + v; D[i + 3] = 255 * a;
    }
    g.putImageData(img, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.filter = `blur(${(3 * ui.k).toFixed(1)}px)`;
    ctx.drawImage(c, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
  /** Sun/moon, the lake's reflections (soft, multiplied into the water) and the clouds, over the ink. */
  function overlays(alpha, withClouds) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.setTransform(ui.k, 0, 0, ui.k, 0, 0);
    const o = placeOrb();
    if (ui.G.nightSky) drawNightSky(ui.colTop);
    ui.G._orb = o; // export reuses the same placement
    ML.render.drawOrb(ctx, ui.G, ui.G.sky, o.cx, o.cy, o.r, ui.k);
    ctx.restore();
    if (!withClouds) return;
    R4.resize(canvas.width, canvas.height); // reflections at full size: soft, but the lines still read
    if (R4.drawRefl(ui.G, F, [0, 0, F.W, F.H], ui.k))
      ML.render.drawCloudLayer(ctx, ui.G, cloudCanvas, canvas.width, canvas.height, ui.k, alpha, 0.7, 'multiply');
    if (drawCloudsGL()) ML.render.drawCloudLayer(ctx, ui.G, cloudCanvas, canvas.width, canvas.height, ui.k, alpha);
  }
  function drawCloudsGL() {
    R4.resize(canvas.width, canvas.height); // full size: dots must stay dots
    return R4.drawClouds(ui.G, F, [0, 0, F.W, F.H], ui.k);
  }
  function composite(clouds = false, cloudAlpha = 1) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(glCanvas, 0, 0);
    overlays(cloudAlpha, clouds);
    ctx.setTransform(ui.k, 0, 0, ui.k, 0, 0);
    ML.render.drawPaperTexture(ctx, ui.G, F);
  }
  function blank() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--field');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  /** The finished piece. */
  function draw() {
    if (!ui.G || !R3) return blank();
    ensureField();
    R3.resize(canvas.width, canvas.height);
    R3.draw(ui.G, F, [0, 0, F.W, F.H], ui.k);
    composite(true);
  }
  /** Start the layer-by-layer painting of the current piece. */
  function startPaint() {
    if (!R3 || !ui.G) return;
    ensureField();
    R3.resize(canvas.width, canvas.height);
    R3.setRaw(ML.landscape.packRaw(field));
    R3.clearPaper(ui.G);
    const plan = ui.G.paint;
    ui.anim = { t0: performance.now(), last: -1e-3, plan, end: plan.spread + plan.dur };
    request();
  }
  function request() { if (!ui.raf) ui.raf = requestAnimationFrame(frame); }
  function frame(now) {
    ui.raf = 0;
    if (ui.anim && ui.G) {
      const A = ui.anim, t = (now - A.t0) / 1000;
      R3.paint(ui.G, F, [0, 0, F.W, F.H], ui.k, A.last, t, A.plan);
      A.last = t;
      composite();
      if (t < A.end) ui.raf = requestAnimationFrame(frame);
      else { // settle on the finished piece (drips, reflections) with a soft crossfade
        ui.anim = null;
        const snap = document.createElement('canvas');
        snap.width = glCanvas.width; snap.height = glCanvas.height;
        snap.getContext('2d').drawImage(glCanvas, 0, 0);
        R3.draw(ui.G, F, [0, 0, F.W, F.H], ui.k);
        ui.fade = { t0: now, snap, clouds: true };
        ui.raf = requestAnimationFrame(frame);
      }
      return;
    }
    if (ui.fade && ui.G) {
      const a = clamp((now - ui.fade.t0) / 900, 0, 1);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(ui.fade.snap, 0, 0);
      ctx.globalAlpha = a;
      ctx.drawImage(glCanvas, 0, 0);
      ctx.globalAlpha = 1;
      overlays(a, true);
      ctx.setTransform(ui.k, 0, 0, ui.k, 0, 0);
      ML.render.drawPaperTexture(ctx, ui.G, F);
      if (a < 1) ui.raf = requestAnimationFrame(frame); else ui.fade = null;
      return;
    }
    if (ui.live && ui.G) {
      const dt = ui.lastT ? Math.min(0.1, (now - ui.lastT) / 1000) : 0;
      ui.lastT = now;
      let ph = ui.phi + ui.liveDir * dt * 2; // two years a second
      if (ph > 100) { ph = 100; ui.liveDir = -1; }
      if (ph < 0) { ph = 0; ui.liveDir = 1; }
      setPhi(ph);
      draw();
      ui.raf = requestAnimationFrame(frame);
      return;
    }
    draw();
  }
  /** Age today from the birth date (seeded date for a code), clamped to 0..100. Default position of the time slider. */
  function currentAge(S) {
    const now = new Date(), b = Date.UTC(S.year, S.month - 1, S.day);
    return clamp((now.getTime() - b) / (365.2425 * 864e5), 0, 100);
  }
  function setPhi(v) {
    ui.phi = v;
    phiEl.value = v;
    phiOut.textContent = v < 0.05 ? 'birth' : `age ${v.toFixed(v < 10 ? 1 : 0)}`;
  }

  // ---- Generate -------------------------------------------------------------------------
  /** From the form: name + birth moment. */
  function generate() {
    const name = ML.seed.normName($('name').value), date = $('date').value, time = $('time').value;
    const err = $('err');
    if (!name) { err.textContent = 'Add a name to generate.'; $('name').focus(); return; }
    if (!date) { err.textContent = 'Add a birth date.'; $('date').focus(); return; }
    if (!time) { err.textContent = 'Add a birth time.'; $('time').focus(); return; }
    err.textContent = '';
    const master = ML.seed.master(name, date, time);
    const birth = ML.elements.fromBirth(date, time);
    const b = birth;
    show(ML.genome.makeGenome(master, birth), { name, date, time },
      `Day master <strong>${b.stem}</strong>, ${b.element.en} (${b.element.zh}), ${b.yang ? 'yang' : 'yin'}, born by ${b.day ? 'day' : 'night'}.`);
  }

  /** From a seed code ML-xxxxxxxxxx-E alone (E = element digit 0–4). */
  function loadCode(code) {
    const m = /^ML-([0-9a-f]{10})-([0-4])$/i.exec(code.trim());
    if (!m) return false;
    const el = ML.elements.ELEMENTS[+m[2]];
    show(ML.genome.makeGenome(m[1].toLowerCase(), { element: el }), { name: 'code', date: m[1].toLowerCase(), time: m[2] },
      `Element <strong>${el.en} (${el.zh})</strong>, from the seed code.`);
    return true;
  }

  function show(G, input, elementLine) {
    ui.G = G;
    G.sky = ML.sky.fromMoment(input.name === 'code' ? null : input.date, input.time, G.master);
    // trees: the birth season's colour, tone on tone with the paper and ink, shifted per seed
    const SEASON = { spring: [[122, 158, 96], [150, 168, 92]], summer: [[52, 96, 64], [70, 104, 52]],
      autumn: [[168, 104, 48], [150, 70, 52]], winter: [[86, 104, 112], [120, 120, 126]] };
    const mo = G.sky.month, season = mo >= 3 && mo <= 5 ? 'spring' : mo >= 6 && mo <= 8 ? 'summer' : mo >= 9 && mo <= 11 ? 'autumn' : 'winter';
    const sc = ML.color.mix(SEASON[season][0], SEASON[season][1], (G.treeHue + 1) / 2);
    G.treeCol = ML.color.mix(ML.color.mix(sc, G.ink, G.treeMix * 0.6), G.paper, G.treeMix * 0.35);
    G.season = season;
    G.nightSky = G.sky.kind === 'moon' && G.nightPick;
    // clouds: an opaque, darker tone of the sun or moon
    G.cloudCol = ML.color.mix(ML.color.mix(G.sky.col, G.paper, 0.45), G.ink, 0.12);
    ML.landscape.compose(ui.G, F);
    fieldKey = '';
    ui.input = input;
    setPhi(currentAge(G.sky));
    pieceColor();
    $('elementInfo').innerHTML = elementLine;
    $('sceneInfo').textContent = ML.genome.describe(ui.G);
    ui.anim = null; ui.fade = null;
    if (reduceMotion || TEST) request(); else startPaint();
  }

  /** UI accents follow the piece. */
  function pieceColor() {
    const use = ML.color.mix(ui.G.ink, ui.G.paper, 0.18);
    document.documentElement.style.setProperty('--piece', ML.color.css(use));
    document.documentElement.style.setProperty('--piece-ink', ML.color.luma(use) > 0.55 ? '#1E1D2B' : '#FFFFFF');
  }

  /** "A life A moment": fills the form with a random life, then generates. */
  async function lifeMoment() {
    if (ui.busy) return;
    ui.busy = true;
    $('moment').disabled = $('gen').disabled = true;
    const r = ML.seed.randomLife();
    const nm = $('name');
    nm.value = '';
    if (reduceMotion) nm.value = r.name;
    else { for (const ch of [...r.name]) { nm.value += ch; await sleep(55); } await sleep(160); }
    $('date').value = r.date; if (!reduceMotion) await sleep(160);
    $('time').value = r.time; if (!reduceMotion) await sleep(200);
    generate();
    $('moment').disabled = $('gen').disabled = false;
    ui.busy = false;
  }

  function setAspect(a) {
    F.setAspect(a);
    if (ui.G) ML.landscape.compose(ui.G, F);
    sizeCanvas();
  }

  // ---- Save image -----------------------------------------------------------------------
  const downloadsP = window.claude && window.claude.use ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
  const fileSafe = (s) => s.replace(/[\\/:*?"<>|\s]+/g, '_');
  async function saveImage() {
    if (!ui.G || ui.busy) return;
    const btn = $('exportBtn'), label = btn.textContent;
    ui.busy = true; btn.disabled = true; btn.textContent = 'Rendering…';
    $('saveErr').textContent = '';
    await sleep(30);
    try {
      const blob = await ML.exporter.renderPNG(ui.G, F, ui.phi, ui.exportSize, (p) => { btn.textContent = `Rendering ${Math.round(p * 100)}%`; });
      const ph = 'age' + ui.phi.toFixed(1);
      const filename = `mountain-life_${fileSafe(ui.input.name)}_${ui.input.date}_${ph}_${F.aspect.replace(':', 'x')}.png`;
      btn.textContent = 'Saving…';
      const dl = window.claude && window.claude.use ? await downloadsP : null;
      if (dl) await dl.save({ filename, data: blob });
      else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      }
    } catch (e) {
      if (e && (e.code === 'cancelled' || e.code === 'declined')) return;
      $('saveErr').textContent = ui.exportSize > 4096
        ? 'This browser could not render 8K. Try 4K.'
        : 'The image could not be saved. Try again.';
    } finally {
      btn.textContent = label; btn.disabled = false; ui.busy = false;
    }
  }

  // ---- Events ---------------------------------------------------------------------------
  const onRadio = (name, fn) =>
    document.querySelectorAll(`input[name=${name}]`).forEach((r) => r.addEventListener('change', (e) => fn(e.target.value)));
  $('form').addEventListener('submit', (e) => { e.preventDefault(); generate(); });
  $('moment').addEventListener('click', lifeMoment);
  phiEl.addEventListener('input', () => { if (!ui.G) return; ui.anim = null; ui.lowQ = true; setPhi(parseFloat(phiEl.value)); request(); });
  phiEl.addEventListener('change', () => { ui.lowQ = false; request(); });
  $('live').addEventListener('change', (e) => { ui.anim = null; ui.live = e.target.checked; ui.lastT = 0; ui.lowQ = false; request(); });
  onRadio('aspect', (v) => setAspect(v));
  onRadio('size', (v) => { ui.exportSize = parseInt(v, 10); });
  $('exportBtn').addEventListener('click', saveImage);
  new ResizeObserver(sizeCanvas).observe($('stage'));
  $('date').max = new Date().toISOString().slice(0, 10);

  // ---- Start ----------------------------------------------------------------------------
  F.setAspect('3:4');
  sizeCanvas();
  if (!TEST) lifeMoment();

  ML.app = { ui, generate, loadCode, lifeMoment, setAspect, draw, startPaint, frame };
})((window.ML = window.ML || {}));
