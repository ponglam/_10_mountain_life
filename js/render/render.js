/*
 * Mountain Life — WebGL2 ink renderer  (v0.2)
 * js/render/render.js
 *
 * Two ways to put the same drawing on paper:
 *
 * 1. draw()   — the finished piece. Occlusion was already solved on the CPU
 *               (landscape.js keeps only visible ink), so every visible segment
 *               is one instanced, antialiased hairline. Fast; used for the still
 *               image, the Time slider and the export.
 *
 * 2. paint()  — the layer-by-layer animation. Every slice, unclipped, far → near.
 *               Each segment is one instance of 12 vertices: first a paper-coloured
 *               quad from its ridge down past the bottom edge (hides what is
 *               behind), then its ink line. Instances are drawn in order, so this
 *               is a true painter's algorithm. Frames accumulate (no clear): each
 *               frame paints only the segments whose moment came in (t0, t1].
 *               A slice is laid down as a stroke travelling across the frame;
 *               nearer slices start later at the same speed, so at any x a
 *               farther slice is always painted before a nearer one.
 *
 * Width, ink and tone vary per point, so they travel along each stroke.
 * Coordinates are logical (F.W × F.H); uView selects the logical rectangle the
 * canvas covers, so big exports can be drawn in tiles. Paper colour is the clear
 * colour; mottling and grain are composited afterwards in 2D.
 */
(function (ML) {
  'use strict';
  const STRIDE = 7, BYTES = STRIDE * 4;

  const VS_HEAD = `#version 300 es
  layout(location=0) in vec3 corner;  // t (0|1 along the segment), side (-1|1), kind (0 fill, 1 line)
  layout(location=1) in vec4 A;       // x y ink width
  layout(location=2) in vec3 A2;      // tone, row (0 far .. 1 near), stroke id
  layout(location=3) in vec4 B;
  layout(location=4) in vec3 B2;
  uniform vec4 uView;    // logical x0 y0 w h
  uniform float uK;      // device px per logical px
  uniform float uBottom; // logical y below the frame
  uniform float uSunDir; // +1 light from the right, -1 from the left
  out float vInk; out float vTone; out float vD; out float vHalf; out float vKind; out float vLight;
  vec4 toClip(vec2 p){
    vec2 q = (p - uView.xy) / uView.zw;
    return vec4(q.x * 2.0 - 1.0, 1.0 - q.y * 2.0, 0.0, 1.0);
  }
  void hide(){ gl_Position = vec4(3.0, 3.0, 0.0, 1.0); }
  void lineVertex(){
    vec2 d = B.xy - A.xy; float L = length(d);
    vec2 dir = L > 1e-5 ? d / L : vec2(1.0, 0.0);
    vec2 n = vec2(-dir.y, dir.x);
    float t = corner.x, side = corner.y;
    float wpx = mix(abs(A.w), abs(B.w), t) * uK;
    float core = max(wpx, 1.0);          // never thinner than a pixel: thinner lines fade instead
    float q = core + 2.0;                // quad width incl. antialiasing margin
    vec2 p = mix(A.xy, B.xy, t) + n * side * 0.5 * q / uK;
    vInk = mix(A.z, B.z, t) * min(1.0, wpx);
    vTone = mix(A2.x, B2.x, t);
    vD = side * 0.5 * q; vHalf = 0.5 * core; vKind = 1.0;
    // slope of the segment n -> n+1 (y grows down): 45 deg toward the light = full highlight, away = full shadow
    vLight = clamp(uSunDir * d.y / max(abs(d.x), 1e-3), -1.0, 1.0);
    gl_Position = toClip(p);
  }
  void fillVertex(){
    float t = corner.x;
    vec2 top = mix(A.xy, B.xy, t);
    vec2 p = corner.y > 0.0 ? vec2(top.x, uBottom) : top + vec2(0.0, 0.3);
    vInk = 0.0; vTone = A2.x; vD = 0.0; vHalf = 1.0; vKind = 0.0; vLight = 0.0;
    gl_Position = toClip(p);
  }
  `;
  const VS_LINE = VS_HEAD + `
  void main(){
    if (A2.z != B2.z) { hide(); return; }
    lineVertex();
  }`;
  const VS_PAINT = VS_HEAD + `
  uniform vec2 uT;       // this frame paints moments in (uT.x, uT.y]
  uniform vec3 uPlan;    // spread (s), stroke duration (s), direction (+1 left→right, -1 right→left)
  uniform float uW;      // logical frame width
  void main(){
    if (A2.z != B2.z) { hide(); return; }
    float xm = 0.5 * (A.x + B.x) / uW;
    float xf = uPlan.z > 0.0 ? xm : 1.0 - xm;
    float when = A2.y * uPlan.x + clamp(xf, 0.0, 1.0) * uPlan.y;
    if (when <= uT.x || when > uT.y) { hide(); return; }
    if (corner.z < 0.5) { if (A.w > 0.0 && B.w > 0.0) fillVertex(); else hide(); } // mist lays no paper
    else lineVertex();
  }`;
  const FS = `#version 300 es
  precision highp float;
  in float vInk; in float vTone; in float vD; in float vHalf; in float vKind; in float vLight;
  uniform vec3 uInk; uniform vec3 uInkAlt; uniform vec3 uPaper;
  uniform vec3 uHi; uniform vec3 uLo; uniform float uLightK; uniform vec3 uTree;
  uniform vec3 uTint; uniform vec3 uWave; uniform vec3 uCloud;
  out vec4 o;
  // tone carries the stroke's kind: 0..1 ink (mixing ink and its alternate), 2.x water tint, 3.x wave, 4.x cloud
  void main(){
    if (vKind < 0.5) { o = vec4(vTone >= 2.0 ? uTint : uPaper, 1.0); return; }
    float cov = clamp(vHalf + 0.5 - abs(vD), 0.0, 1.0);
    float a = clamp(vInk * cov, 0.0, 1.0);
    vec3 c = vTone >= 6.0 ? uTree : vTone >= 5.0 ? mix(uInk, uTint, 0.5) : vTone >= 4.0 ? uCloud : vTone >= 3.0 ? uWave : vTone >= 2.0 ? uTint : mix(uInk, uInkAlt, smoothstep(0.3, 0.75, vTone));
    // light: tint the ink (and the cloud dots) toward the sun/moon colour or its darker tone
    if (vTone < 2.0 || (vTone >= 4.0 && vTone < 5.0)) {
      float L = vLight * uLightK;
      c = mix(c, uHi, max(L, 0.0));
      c = mix(c, uLo, max(-L, 0.0));
    }
    o = vec4(c * a, a);
  }`;

  function compile(gl, vs, fs) {
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (const n of ['uView', 'uK', 'uBottom', 'uInk', 'uInkAlt', 'uPaper', 'uTint', 'uWave', 'uCloud', 'uHi', 'uLo', 'uLightK', 'uSunDir', 'uTree', 'uT', 'uPlan', 'uW']) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }

  /** One renderer = one WebGL2 canvas. */
  function Renderer(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: true, depth: false, alpha: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('webgl2');
    this.gl = gl;
    this.canvas = canvas;
    this.line = compile(gl, VS_LINE, FS);
    this.paintP = compile(gl, VS_PAINT, FS);
    const lineCorners = [0, -1, 1, 1, -1, 1, 0, 1, 1, 0, 1, 1, 1, -1, 1, 1, 1, 1];
    const fillCorners = [0, -1, 0, 1, -1, 0, 0, 1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0];
    this.lineCornerBuf = this._buf(new Float32Array(lineCorners));
    this.paintCornerBuf = this._buf(new Float32Array(fillCorners.concat(lineCorners)));
    this.ptsBuf = gl.createBuffer();
    this.dripBuf = gl.createBuffer();
    this.rawBuf = gl.createBuffer();
    this.tintBuf = gl.createBuffer();
    this.cloudBuf = gl.createBuffer();
    this.reflBuf = gl.createBuffer();
    this.vaoPts = this._vao(this.lineCornerBuf, this.ptsBuf);
    this.vaoDrip = this._vao(this.lineCornerBuf, this.dripBuf);
    this.vaoRaw = this._vao(this.paintCornerBuf, this.rawBuf);
    this.vaoTint = this._vao(this.lineCornerBuf, this.tintBuf);
    this.vaoCloud = this._vao(this.lineCornerBuf, this.cloudBuf);
    this.vaoRefl = this._vao(this.lineCornerBuf, this.reflBuf);
    this.field = null;
    this.raw = null;
  }
  Renderer.prototype._buf = function (data) {
    const gl = this.gl, b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  };
  Renderer.prototype._vao = function (cornerBuf, buf) {
    const gl = this.gl, vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const at = (loc, size, off) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, BYTES, off);
      gl.vertexAttribDivisor(loc, 1);
    };
    at(1, 4, 0); at(2, 3, 16); at(3, 4, BYTES); at(4, 3, BYTES + 16);
    gl.bindVertexArray(null);
    return vao;
  };
  Renderer.prototype.setField = function (field) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ptsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, field.pts.subarray(0, Math.max(2, field.count) * STRIDE), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dripBuf);
    gl.bufferData(gl.ARRAY_BUFFER, field.dripCount ? field.drips : new Float32Array(STRIDE * 2), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tintBuf);
    gl.bufferData(gl.ARRAY_BUFFER, field.tintCount ? field.tint : new Float32Array(STRIDE * 2), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cloudBuf);
    gl.bufferData(gl.ARRAY_BUFFER, field.cloudCount ? field.cloud : new Float32Array(STRIDE * 2), gl.STATIC_DRAW);
    this.field = field;
    this.raw = null;
  };
  /** For a clouds-only renderer: upload just the cloud strokes. */
  Renderer.prototype.setCloudField = function (field) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.reflBuf);
    gl.bufferData(gl.ARRAY_BUFFER, field.reflCount ? field.refl : new Float32Array(STRIDE * 2), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cloudBuf);
    gl.bufferData(gl.ARRAY_BUFFER, field.cloudCount ? field.cloud : new Float32Array(STRIDE * 2), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.reflBuf);
    gl.bufferData(gl.ARRAY_BUFFER, field.reflCount ? field.refl : new Float32Array(STRIDE * 2), gl.STATIC_DRAW);
    this.field = field;
  };
  /** Upload the unclipped slices for paint(). */
  Renderer.prototype.setRaw = function (raw) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rawBuf);
    gl.bufferData(gl.ARRAY_BUFFER, raw.pts, gl.STATIC_DRAW);
    this.raw = raw;
  };
  Renderer.prototype.resize = function (w, h) {
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  };
  Renderer.prototype._common = function (prog, G, F, view, k) {
    const gl = this.gl, u = prog.u;
    gl.useProgram(prog.p);
    gl.uniform4f(u.uView, view[0], view[1], view[2], view[3]);
    gl.uniform1f(u.uK, k);
    gl.uniform1f(u.uBottom, F.H + 60);
    gl.uniform3f(u.uInk, G.ink[0] / 255, G.ink[1] / 255, G.ink[2] / 255);
    gl.uniform3f(u.uInkAlt, G.inkAlt[0] / 255, G.inkAlt[1] / 255, G.inkAlt[2] / 255);
    gl.uniform3f(u.uPaper, G.paper[0] / 255, G.paper[1] / 255, G.paper[2] / 255);
    const c3 = (loc, c) => gl.uniform3f(loc, c[0] / 255, c[1] / 255, c[2] / 255);
    c3(u.uTint, G.tint); c3(u.uWave, G.waveCol); c3(u.uCloud, G.cloudCol);
    const S = G.sky || { col: [230, 200, 160], x: 0.5, kind: 'sun' };
    c3(u.uHi, S.col);
    c3(u.uTree, G.treeCol || G.ink);
    c3(u.uLo, ML.color.mix(ML.color.scale(S.col, 0.45), G.ink, 0.35));
    gl.uniform1f(u.uLightK, (S.kind === 'sun' ? 0.8 : 0.55) * (G.lightK || 1));
    gl.uniform1f(u.uSunDir, (G._orb ? G._orb.cx / F.W : S.x) >= 0.5 ? 1 : -1);
  };
  Renderer.prototype.clearPaper = function (G) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(G.paper[0] / 255, G.paper[1] / 255, G.paper[2] / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };

  /** The finished piece: paper, then every visible segment and drip. */
  Renderer.prototype.draw = function (G, F, view, k) {
    const gl = this.gl, fd = this.field;
    this.clearPaper(G);
    if (!fd) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this._common(this.line, G, F, view, k);
    if (fd.tintCount > 1) { // the water's tone goes down first, under every stroke
      gl.bindVertexArray(this.vaoTint);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, fd.tintCount - 1);
    }
    gl.bindVertexArray(this.vaoPts);
    if (fd.count > 1) gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, fd.count - 1);
    if (fd.dripCount > 1) {
      gl.bindVertexArray(this.vaoDrip);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, fd.dripCount - 1);
    }
    gl.bindVertexArray(null);
  };

  /** Lake reflections alone, on a transparent canvas (blurred and multiplied over the water). */
  Renderer.prototype.drawRefl = function (G, F, view, k) {
    const gl = this.gl, fd = this.field;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!fd || !(fd.reflCount > 1)) return false;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this._common(this.line, G, F, view, k);
    gl.bindVertexArray(this.vaoRefl);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, fd.reflCount - 1);
    gl.bindVertexArray(null);
    return true;
  };

  /** Cloud banks alone, on a transparent canvas (blurred when composited). */
  Renderer.prototype.drawClouds = function (G, F, view, k) {
    const gl = this.gl, fd = this.field;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!fd || fd.cloudCount < 2) return false;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this._common(this.line, G, F, view, k);
    gl.bindVertexArray(this.vaoCloud);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, fd.cloudCount - 1);
    gl.bindVertexArray(null);
    return true;
  };

  /**
   * One frame of the layer-by-layer animation. Call clearPaper() once first;
   * frames accumulate. plan = {spread, dur, dir}; paints moments in (t0, t1].
   */
  Renderer.prototype.paint = function (G, F, view, k, t0, t1, plan) {
    const gl = this.gl, raw = this.raw;
    if (!raw) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this._common(this.paintP, G, F, view, k);
    gl.uniform2f(this.paintP.u.uT, t0, t1);
    gl.uniform3f(this.paintP.u.uPlan, plan.spread, plan.dur, plan.dir);
    gl.uniform1f(this.paintP.u.uW, F.W);
    gl.bindVertexArray(this.vaoRaw);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 12, raw.count - 1);
    gl.bindVertexArray(null);
  };

  // ---- Paper texture: soft mottling and fibre grain, laid over everything ------------------
  let paperTile = null, paperKey = null;
  function makePaperTile(G) {
    if (paperKey === G.grainSeed) return paperTile;
    const S = 512, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S);
    const R = ML.random.makeRng('paper/' + G.grainSeed);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (R.next() + R.next() + R.next() - 1.5) * 26;
      d[i] = d[i + 1] = d[i + 2] = 128 + v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (let f = 0; f < 900; f++) { // fibres: faint short strands
      const x = R.next() * S, y = R.next() * S, a = R.next() * Math.PI, L = 4 + R.next() * 22;
      g.strokeStyle = R.chance(0.5) ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + 0.4) * L * 0.5, y + Math.sin(a + 0.4) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L);
      g.stroke();
    }
    paperTile = c; paperKey = G.grainSeed;
    return c;
  }
  let mottle = null, mottleKey = null;
  function makeMottle(G) {
    if (mottleKey === G.grainSeed) return mottle;
    const S = 48, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S);
    const R = ML.random.makeRng('mottle/' + G.grainSeed);
    const ox = R.range(0, 100), oy = R.range(0, 100);
    ML.noise.seed(G.noiseSeed);
    ML.noise.detail(3, 0.5);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = (ML.noise.at(x * 0.05 + ox, y * 0.05 + oy, 5.5) - 0.5) * 2, i = (y * S + x) * 4;
      const cc = v > 0 ? 255 : 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = cc;
      img.data[i + 3] = Math.min(255, Math.abs(v) * 70);
    }
    g.putImageData(img, 0, 0);
    mottle = c; mottleKey = G.grainSeed;
    return c;
  }

  /**
   * Paper texture over the drawing.
   * @param ctx 2D context with transform logical → device
   */
  function drawPaperTexture(ctx, G, F) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.1;
    ctx.drawImage(makeMottle(G), 0, 0, F.W, F.H);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = G.grain * 3;
    ctx.fillStyle = ctx.createPattern(makePaperTile(G), 'repeat');
    ctx.fillRect(0, 0, F.W, F.H);
    ctx.restore();
  }

  /**
   * Lay a rendered cloud canvas over the drawing, scaled to w × h device px and blurred.
   * @param ctx 2D context (identity transform is set here)
   */
  function drawCloudLayer(ctx, G, cloudCanvas, w, h, k, alpha = 1, blur = G.cloudBlur, mode = 'source-over') {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = mode;
    ctx.imageSmoothingEnabled = true;
    ctx.filter = `blur(${(blur * k).toFixed(2)}px)`;
    ctx.drawImage(cloudCanvas, 0, 0, w, h);
    ctx.restore();
  }

  /**
   * Sun or moon, textured: granular noise across the disc, maria on the moon,
   * the phase cut by an elliptical terminator. ctx transform: logical → device.
   * @param cx,cy,r logical px
   */
  function drawOrb(ctx, G, S, cx, cy, r, k) {
    if (!(r > 0)) return;
    const px = Math.max(8, Math.ceil(r * 2 * k)), c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d'), img = g.createImageData(px, px), D = img.data;
    const R = ML.random.makeRng(G.master + '/orb');
    const ox = R.range(0, 50), oy = R.range(0, 50);
    ML.noise.seed(G.noiseSeed);
    const gray = (S.col[0] + S.col[1] + S.col[2]) / 3;
    const col = S.col.map((v) => gray + (v - gray) * S.sat);
    const ph = S.phase, dir = S.waxing ? 1 : -1;
    for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
      const u = (i + 0.5) / px * 2 - 1, v = (j + 0.5) / px * 2 - 1, rr = u * u + v * v;
      if (rr > 1) continue;
      let a = Math.min(1, (1 - Math.sqrt(rr)) * px * 0.5); // antialiased rim
      let shade = 1;
      ML.noise.detail(4, 0.55);
      const n = ML.noise.at(u * 3 + ox, v * 3 + oy, 7.7);
      ML.noise.detail(2, 0.5);
      const fine = ML.noise.at(u * 40 + ox, v * 40 + oy, 3.1);
      if (S.kind === 'moon') {
        shade = 0.82 + 0.25 * (n - 0.5) * 2 + 0.12 * (fine - 0.5);
        if (n < 0.42) shade -= 0.14; // maria
        // phase: lit where x beyond the terminator ellipse
        const sx = Math.sqrt(Math.max(0, 1 - v * v)), term = sx * (1 - 2 * ph);
        const lit = dir * u - term;
        const soft = 0.22 + 0.15 * (1 - ph); // a broad shadow gradient, not a cut
        const l = Math.min(1, Math.max(0, (lit + soft * 0.5) / soft));
        shade *= 0.55 + 0.45 * l;
        a *= 0.06 + 0.94 * l * l * (3 - 2 * l); // earthshine keeps a ghost of the dark side
      } else {
        shade = 0.9 + 0.08 * (n - 0.5) * 2 + 0.18 * (fine - 0.5) - 0.12 * rr; // granulation, limb darkening
      }
      const q = (j * px + i) * 4;
      D[q] = col[0] * shade; D[q + 1] = col[1] * shade; D[q + 2] = col[2] * shade; D[q + 3] = 255 * a;
    }
    g.putImageData(img, 0, 0);
    ctx.save();
    // soft halo, then the disc
    const halo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * (S.kind === 'sun' ? 4 : 3));
    halo.addColorStop(0, ML.color.css(col, S.kind === 'sun' ? 0.22 : 0.12 * ph));
    halo.addColorStop(1, ML.color.css(col, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(cx - r * 4, cy - r * 4, r * 8, r * 8);
    ctx.globalAlpha = 0.92;
    ctx.drawImage(c, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }

  ML.render = { Renderer, drawPaperTexture, drawCloudLayer, drawOrb };
})((window.ML = window.ML || {}));
