/*
 * Mountain Life — genome + time → line field  (v0.2)
 * js/model/landscape.js
 *
 * The backbone is unchanged: slice i of N at depth u = i/(N-1), 0 = farthest.
 * Each slice walks x across the frame and samples p5 noise; slices are drawn
 * far → near and each one hides what lies below its ridge.
 *
 * What makes the ink form:
 *  - thousands of slices, each only a hairline;
 *  - ridged, domain-warped fBm, so crests are sharp and gullies fold;
 *  - a low-frequency massif mask, so mountains rise as islands out of mist;
 *  - ink fades with height: valley floors and the feet of each massif
 *    dissolve into the paper, crests stay dark;
 *  - the slice interval dz itself varies with depth (calm runs, sudden leaps).
 *
 * Output: one packed Float32Array of points, 7 floats each:
 *   x, y, ink, width, tone, depth, id
 * Consecutive points with the same id form one stroke. Drips are packed the
 * same way in a second array.
 */
(function (ML) {
  'use strict';
  const { clamp, lerp, smooth } = ML.math;
  const N = ML.noise;
  const STRIDE = 7;

  /** Fast integer hash → 0..1 (drip placement). */
  function hash2(a, b, s) {
    let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x165667b1, 0x9e3779b1) ^ s) | 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** Ridged multifractal from single-octave p5 noise. Returns 0..1. */
  function ridged(G, x, z) {
    let sum = 0, norm = 0, amp = 1, f = 1, w = 1;
    for (let o = 0; o < G.oct; o++) {
      const n = N.at(x * f, z * f, 3.3 + o * 7.13);
      let r = 1 - Math.abs((n - 0.5) * 2.2);
      r = r < 0 ? 0 : r;
      r *= r;
      r *= w;
      w = clamp(r * 3, 0.35, 1); // soft cascade: detail stays on crests, no pockmarks in valleys
      sum += r * amp;
      norm += amp;
      amp *= G.gain;
      f *= G.lac;
    }
    return clamp(sum / norm / 0.72, 0, 1);
  }

  /** z of every slice: the integral of a varying interval dz(u). */
  function sliceZ(G) {
    N.detail(1, 0.5);
    const n = G.slices, z = new Float32Array(n);
    const dz = new Float32Array(n);
    let tot = 0;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const v = N.at(u * G.dzF, 0.5, 61.7); // ~0.2..0.8
      dz[i] = Math.max(0.02, 1 + G.dzVar * (v - 0.5) * 3.2);
      tot += dz[i];
    }
    let acc = 0;
    for (let i = n - 1; i >= 0; i--) { z[i] = (acc / tot) * G.zSpan; acc += dz[i]; } // far slices get the larger z
    return z;
  }

  /**
   * Build the visible line field.
   *
   * Pass 1 samples every slice. Pass 2 sweeps slices from near to far with a
   * per-column horizon (the highest ridge seen so far): a farther stroke is kept
   * only where it rises above that horizon, clipped exactly where it crosses.
   * Occlusion is therefore solved on the CPU and only visible ink reaches the GPU.
   *
   * @param opts {stride: use every k-th slice, step: column spacing in logical px}
   */
  function buildField(G, F, phi, opts) {
    const stride = Math.max(1, opts.stride | 0), step = opts.step;
    N.seed(G.noiseSeed);
    const W = F.W, H = F.H;
    const nx = Math.ceil((W + 4 * step) / step) + 1, x0 = -2 * step;
    const zs = G._z || (G._z = sliceZ(G));
    const nS = Math.ceil(G.slices / stride);
    const Y = new Float32Array(nS * nx), K = new Float32Array(nS * nx), Wd = new Float32Array(nS * nx), Tn = new Float32Array(nS * nx);
    const HT = new Float32Array(nS * nx), Sc = new Float32Array(nS), Zr = new Float32Array(nS), Ir = new Int32Array(nS);
    const Bs = new Float32Array(nS), Am = new Float32Array(nS); // baseline and height scale per slice
    const SOL = new Uint8Array(nS * nx);
    const WA = new Float32Array(nS * nx); // water depth 0..1 (0 = land); drives the tint and its shore fade // 1 = solid ground (hides what is behind), 0 = mist (lets it through)
    const zP = phi * G.zPhi, sFar = 1 / G.zfar;

    // ---- pass 1: sample ----------------------------------------------------------------
    for (let r = 0, i = 0; r < nS; r++, i += stride) {
      const u = i / (G.slices - 1);
      const Z = 1 + (G.zfar - 1) * (1 - u), s = 1 / Z;
      const t = G.zfar > 1.0001 ? lerp((s - sFar) / (1 - sFar), u, 0.35) : u;
      const base = lerp(G.yFar, G.yNear, t) * H;
      const amp = G.amp * H * s;
      const z = G.z0 + zs[i] + zP;
      const xsc = Math.pow(Z, G.widen);
      const farK = lerp(G.farA, 1, Math.pow(u, 0.75));
      // lake seeds: an open-water band where no mountain rises, so the range behind is mirrored in it
      const lake = G.water ? 1 - smooth(G.lakeW * 0.5, G.lakeW, Math.abs(u - G.lakeU)) : 0;
      Sc[r] = s; Zr[r] = z; Ir[r] = i; Bs[r] = base; Am[r] = amp;
      for (let c = 0, o = r * nx; c < nx; c++, o++) {
        const fx = (x0 + c * step) / W;
        const xw = (fx - 0.5) * xsc;
        N.detail(2, 0.5);
        const wx = G.x0 + xw * G.fx + G.warp * (N.at(xw * G.fw + 7.1, z * 0.35, 11.3) - 0.5);
        const wz = z + G.warp * 0.8 * (N.at(xw * G.fw + 2.9, z * 0.35, 23.7) - 0.5);
        // massif mask, itself warped so even the big forms bend irregularly
        const mN = N.at(xw * G.fmx + 40.2 + G.mWarp * (N.at(xw * 1.3 + 60, z * 0.4, 66.6) - 0.5), z * G.fmz, 33.1);
        // middle-frequency fBm: packed layers that shape the silhouette between crest and massif
        N.detail(G.midOct, 0.55);
        const mid = clamp((N.at(wx * G.midF + 13, wz * G.midF, 44.4) - 0.5) * 2.2 + 0.5, 0, 1);
        N.detail(1, 0.5);
        const T = ridged(G, wx, wz);
        // the massif only gates and scales the detail; it never draws the outline itself
        const m = Math.max(0, mN - G.mth) / (0.8 - G.mth);
        const gate = smooth(0, 0.22, m), scaleM = G.envMin + (1 - G.envMin) * Math.min(1.2, Math.pow(m, G.peakExp));
        const detail = G.midW * mid + (1 - G.midW) * Math.pow(T, G.spire);
        const ground = G.ground * (0.4 + 0.6 * mid) * (0.5 + T); // low ground keeps its own small relief
        const h = (gate * scaleM * detail + ground) * (1 - lake);
        Y[o] = base - amp * h;
        HT[o] = h;
        const trav = N.at(xw * G.tx + 300, z * G.tz, 77.1);
        // water: ground below the water level becomes a gently waving surface
        if (G.sea !== 'none' && h < G.waterLevel) {
          const wv = (N.at(xw * G.waveF + 11, z * G.waveZ, 91.3) - 0.5) * G.waveA * H * s;
          Y[o] = base - amp * G.waterLevel + wv;
          HT[o] = G.waterLevel;
          SOL[o] = 1;
          WA[o] = smooth(0, G.waterLevel * 0.7, G.waterLevel - h);
          K[o] = G.waveInk * farK * (0.35 + 0.9 * N.at(xw * G.waveF * 0.3 + 7, z * G.waveZ * 0.5, 92.7)) * WA[o];
          Wd[o] = G.width * 0.8;
          Tn[o] = 3.5;
          continue;
        }
        SOL[o] = h > G.f0 + (G.f1 - G.f0) * G.solidAt ? 1 : 0;
        let ink = G.alpha * Math.max(G.inkFloor * SOL[o], smooth(G.f0, G.f1, h)) * farK * (1 - G.travel + G.travel * 2 * trav);
        if (G.sideFade > 0) ink *= smooth(-0.02, G.sideFade, fx) * smooth(-0.02, G.sideFade, 1 - fx);
        K[o] = ink;
        Wd[o] = G.width * (1 - G.wVar * 0.5 + G.wVar * N.at(xw * G.wx + 500, z * G.tz * 0.5, 88.8));
        Tn[o] = N.at(xw * G.toneF + 900, z * G.toneF * 0.5, 99.9);
      }
      // crests: where the stroke turns over a ridge, the brush presses harder
      const o = r * nx, ck = G.crestK * step;
      for (let c = 1; c < nx - 1; c++) {
        const bend = Y[o + c - 1] + Y[o + c + 1] - 2 * Y[o + c]; // > 0 at a crest (y grows downward)
        if (bend > 0 && Tn[o + c] < 3) K[o + c] *= 1 + G.crest * smooth(0, ck, bend);
      }
    }

    // ---- pass 2: near → far with a horizon ------------------------------------------------
    let cap = nS * nx * 0.6 * STRIDE | 0, pts = new Float32Array(cap), p = 0;
    const drips = [];
    let piece = 0;
    let curU = 0;
    const push = (x, y, k, w, tn) => {
      if (p + STRIDE > cap) { const n = new Float32Array(cap * 2); n.set(pts); pts = n; cap *= 2; }
      pts[p++] = x; pts[p++] = y; pts[p++] = k; pts[p++] = w; pts[p++] = tn; pts[p++] = curU; pts[p++] = piece;
    };
    const hor = new Float32Array(nx).fill(H + 1e4);
    const tint = [], cloud = [], refl = [];
    // nearer mirrored slices fill [rTop, rBot] per column; water does not hide reflections, solid land does
    const rTop = new Float32Array(nx).fill(1e9), rBot = new Float32Array(nx).fill(-1e9), horL = new Float32Array(nx).fill(H + 1e4);
    let reflId = 0, shoreY = 0;
    const sunDir = G.sky && G.sky.x < 0.5 ? -1 : 1;
    let tintId = 0, cloudId = 0;
    // each cloud bank keeps at most ~140 slices, whatever its depth
    const cloudStride = G.clouds.map((cl) => Math.max(1, Math.round((2 * cl.du * G.slices) / 420)));
    let horLake = null, axisY = 0;
    const rowStart = new Int32Array(nS + 1), dripStart = new Int32Array(nS + 1);
    let out = 0;
    for (let r = nS - 1; r >= 0; r--, out++) {
      rowStart[out] = p / STRIDE;
      dripStart[out] = drips.length / STRIDE;
      const o = r * nx;
      curU = Ir[r] / (G.slices - 1);
      if (G.water && !horLake && curU < G.lakeU + G.lakeW * 0.5) horLake = hor.slice(); // foreground in front of the water
      if (G.water && !axisY && curU < G.lakeU - G.lakeW * 0.85) axisY = Bs[r]; // the far shore
      let open = false;
      for (let c = 0; c < nx - 1; c++) {
        const a = o + c, b = a + 1;
        if ((Tn[a] >= 3) !== (Tn[b] >= 3)) { open = false; continue; } // shoreline: land and water strokes do not join
        const da = Y[a] - hor[c], db = Y[b] - hor[c + 1];
        const xa = x0 + c * step, xb = xa + step;
        if (da < 0 && db < 0) {
          if (!open) { piece++; push(xa, Y[a], K[a], Wd[a], Tn[a]); open = true; }
          push(xb, Y[b], K[b], Wd[b], Tn[b]);
        } else if (da < 0 || db < 0) {
          const t = da / (da - db);
          const xm = xa + t * step, ym = Y[a] + t * (Y[b] - Y[a]);
          const km = K[a] + t * (K[b] - K[a]), wm = Wd[a] + t * (Wd[b] - Wd[a]), tm = Tn[a] + t * (Tn[b] - Tn[a]);
          if (da < 0) { // leaving the visible part
            if (!open) { piece++; push(xa, Y[a], K[a], Wd[a], Tn[a]); }
            push(xm, ym, km, wm, tm);
            open = false;
          } else { // entering
            piece++;
            push(xm, ym, km, wm, tm);
            push(xb, Y[b], K[b], Wd[b], Tn[b]);
            open = true;
          }
        } else open = false;
      }
      // trees: small conifers standing on visible, flat, solid land inside groves
      if (G.treeRate > 0) {
        const u = Ir[r] / (G.slices - 1), size = G.treeSize * H * Sc[r];
        if (size > 0.8) for (let c = 2; c < nx - 2; c += 2) {
          const q = o + c;
          if (Tn[q] >= 3 || !SOL[q] || Y[q] >= hor[c] || K[q] < G.alpha * 0.15) continue;
          if (Math.abs(Y[q + 1] - Y[q - 1]) / (2 * step) > G.treeFlat) continue;
          const xw = (x0 + c * step) / W;
          if (N.at(xw * G.groveF + 50, u * G.groveF * 2, 123.4) < G.groveTh) continue;
          if (hash2(Ir[r], c, G.noiseSeed + 77) > G.treeRate * stride) continue;
          // abstract tree: a circle or square bound (per seed) sitting on the ground, filled with tiny random dots
          const hT = size * (0.7 + 0.6 * hash2(c, Ir[r], 5)), x = x0 + c * step, R2 = hT * 0.5, cy = Y[q] - R2;
          const nd = Math.round(G.treeDots * (R2 * R2) + 4);
          for (let k = 0; k < nd; k++) {
            let dx = (hash2(c * 31 + k, Ir[r], 13) * 2 - 1), dy = (hash2(Ir[r], c * 17 + k, 29) * 2 - 1);
            if (G.treeShape === 'circle' && dx * dx + dy * dy > 1) continue;
            const px = x + dx * R2, py = cy + dy * R2;
            const pc = clamp(Math.round((px - x0) / step), 0, nx - 1);
            if (py >= hor[pc]) continue;
            const a = G.treeA * (0.4 + 0.6 * hash2(k, c, Ir[r] + 3));
            piece++;
            push(px, py, a, G.treeDot, 6.5); push(px + 0.3, py, a, G.treeDot, 6.5);
          }
        }
      }
      // drips: hang into the mist, only where nothing nearer covers them
      if (G.dripRate > 0) {
        const i = Ir[r];
        for (let c = 0; c < nx; c++) {
          const q = o + c;
          if (K[q] < G.alpha * 0.25 || Y[q] >= hor[c]) continue;
          if (hash2(i, c, G.noiseSeed) >= G.dripRate * stride) continue;
          const len = G.dripLen * H * Sc[r] * (0.25 + 0.75 * N.at(c * 0.05, Zr[r] * 2, 41.1)) * (0.4 + HT[q]);
          const yEnd = Math.min(Y[q] + len, hor[c]);
          const x = x0 + c * step, f = (yEnd - Y[q]) / len;
          const id = -1 - drips.length / (2 * STRIDE);
          drips.push(x, Y[q], K[q] * 0.8, Wd[q] * 0.8, Tn[q], 0, id, x, yEnd, K[q] * 0.8 * (1 - f), Wd[q] * 0.5, Tn[q], 0, id);
        }
      }
      // lake reflection, made with the slice itself: its ridge flipped about its own base and squashed.
      // The mirrored slice is a filled shape from its inverted tips back up to its base, so it hides
      // the reflections of farther slices (rhor) and is hidden by nearer ground (hor), like the real thing.
      if (G.water && !shoreY && curU < G.lakeU - G.lakeW * 0.5) shoreY = Bs[r]; // the far shore: water surface line
      if (G.water && shoreY && curU < G.lakeU - G.lakeW * 0.5) {
        const bs = shoreY, zq = Zr[r];
        let open = false;
        for (let c = 0; c < nx; c++) {
          const q = o + c, d = bs - Y[q];
          if (Tn[q] >= 3 || d < 0.2 || Y[q] >= hor[c]) { open = false; continue; } // only what is seen above
          const yr = bs + d * G.waterK;
          const vis = yr < horL[c] && yr > rBot[c] && K[q] > 0.003; // mirrored: nearer reflections hide farther ones
          const gap = N.at(c * step * G.gapF * 0.02, zq * 3, 71.7) < G.gapTh * 0.6;
          if (vis && !gap) {
            if (!open) { reflId++; open = true; }
            const rip = G.ripple * (N.at(yr * 0.09, c * step * 0.004, 19.9) - 0.5) * 2;
            refl.push(x0 + c * step + rip, yr, Math.max(K[q], G.alpha * 0.35) * G.waterA * (1 - 0.6 * Math.min(1, (yr - bs) / (H * 0.2))), Wd[q] * G.waterW, 5.5, 0, reflId);
          } else open = false;
          if (yr > rBot[c]) rBot[c] = yr;
        }
      }
      // water tint: an opaque tone-on-tone band under each visible water stroke, fading at the shores
      if (G.sea !== 'none') {
        const gap = r < nS - 1 ? Math.max(0.6, Bs[r + 1] - Bs[r]) : 2;
        let start = -1;
        const close = () => { // both ends of a water stretch fade into the paper
          if (start < 0) return;
          const n = (tint.length - start) / STRIDE, ramp = Math.max(2, Math.min(n / 2, 60 / step));
          for (let j = 0; j < n; j++) tint[start + j * STRIDE + 2] *= smooth(0, ramp, j) * smooth(0, ramp, n - 1 - j);
          start = -1;
        };
        for (let c = 0; c < nx; c++) {
          const q = o + c;
          if (Tn[q] < 3 || Y[q] >= hor[c]) { close(); continue; }
          if (start < 0) { tintId++; start = tint.length; }
          tint.push(x0 + c * step, Y[q] + gap * 0.9, G.tintA * Math.pow(WA[q], 1.6), gap * 2.2 + 1, 2.5, 0, tintId);
        }
        close();
      }
      // clouds: slices of each cloud bank at this depth, behind whatever nearer ground covers them
      if (G.clouds.length) {
        const u = Ir[r] / (G.slices - 1);
        for (let ci = 0; ci < G.clouds.length; ci++) {
          const cl = G.clouds[ci], du = (u - cl.uc) / cl.du;
          if (du <= -1 || du >= 1) continue;
          if ((Ir[r] % cloudStride[ci]) >= stride) continue;
          const lens = Math.sqrt(1 - du * du), xsc = Math.pow(1 + (G.zfar - 1) * (1 - u), G.widen);
          let copen = false;
          for (let c = 0; c < nx; c++) {
            const xw = ((x0 + c * step) / W - 0.5) * xsc;
            const ex = (xw - cl.cx) / cl.wx, env = Math.exp(-ex * ex * 2) * lens;
            const n = N.at(xw * cl.f + cl.ox + phi * 0.03, u * cl.f * 3, 300.3 + ci);
            const puff = smooth(cl.th, cl.th + 0.3, n);
            const T = cl.thick * H * Sc[r] * env * puff * (0.6 + 0.8 * N.at(xw * cl.f * 3 + cl.ox, u * 9, 310.7 + ci));
            const yc = Bs[r] - Am[r] * cl.alt - T * 0.45; // puffs rise from a flatter base
            // a vertex is filled only where the cloud value clears the threshold: solid, opaque body
            if (n < cl.th || T < 0.6 || yc >= hor[c]) continue;
            // one dot on the vertex: denser cloud value = more likely, stronger dot -> a grainy, light body
            const dens = smooth(cl.th, cl.th + 0.3, n);
            if (hash2(Ir[r] * 7 + ci, c, G.noiseSeed) > 0.25 + 0.6 * dens) continue;
            const jx = (hash2(c, Ir[r], 911) - 0.5) * step, jy = (hash2(Ir[r], c, 377) - 0.5) * T * 1.6;
            cloudId++;
            const x = x0 + c * step + jx, y = yc + jy, a = 0.55 + 0.4 * dens, w = 0.7 + 0.9 * dens;
            // the dot's tiny slope carries its light: the sun-facing side and the top of a bank are bright
            const L = clamp(sunDir * ex * 0.9 - jy / (T * 1.6 + 1e-3) * 0.8, -1, 1);
            cloud.push(x, y, a, w, 4.5, 0, cloudId, x + 0.35, y + L * 0.35 * sunDir, a, w, 4.5, 0, cloudId);
          }
        }
      }
      for (let c = 0; c < nx; c++) {
        if (SOL[o + c] && Y[o + c] < hor[c]) hor[c] = Y[o + c];
        if (SOL[o + c] && Tn[o + c] < 3 && Y[o + c] < horL[c]) horL[c] = Y[o + c];
      }
    }
    rowStart[out] = p / STRIDE;
    dripStart[out] = drips.length / STRIDE;

    return {
      pts, count: p / STRIDE, drips: new Float32Array(drips), dripCount: drips.length / STRIDE, rowStart, dripStart, rows: out, nx,
      tint: new Float32Array(tint), tintCount: tint.length / STRIDE,
      cloud: new Float32Array(cloud), cloudCount: cloud.length / STRIDE,
      refl: new Float32Array(refl), reflCount: refl.length / STRIDE,
      raw: { Y, K, Wd, Tn, SOL, nS, nx, x0, step }, // every slice, unclipped: for the layer-by-layer animation
    };
  }

  /**
   * Pack every slice, far → near and unclipped, for the painter animation.
   * Each segment later draws a paper-coloured fill under its ridge and then its
   * ink, so drawing the slices in order hides what lies behind, layer by layer.
   */
  function packRaw(field) {
    const R = field.raw, n = R.nS * R.nx;
    const pts = new Float32Array(n * STRIDE);
    let p = 0;
    for (let r = 0; r < R.nS; r++) {
      for (let c = 0, o = r * R.nx; c < R.nx; c++, o++) {
        pts[p++] = R.x0 + c * R.step; pts[p++] = R.Y[o]; pts[p++] = R.K[o]; pts[p++] = R.SOL[o] ? R.Wd[o] : -R.Wd[o];
        pts[p++] = R.Tn[o]; pts[p++] = r / Math.max(1, R.nS - 1); pts[p++] = r;
      }
    }
    return { pts, count: n, rows: R.nS };
  }

  /**
   * Blank paper fraction of a coarse preview: the share of grid cells that
   * receive (almost) no ink.
   */
  function blankness(G, F) {
    const fd = buildField(G, F, 0, { stride: 8, step: 14 });
    const gx = 24, gy = Math.round(24 * F.H / F.W), cell = new Float32Array(gx * gy);
    const P = fd.pts;
    for (let i = 0; i < fd.count; i++) {
      const x = P[i * STRIDE], y = P[i * STRIDE + 1], k = P[i * STRIDE + 2];
      if (x < 0 || x >= F.W || y < 0 || y >= F.H) continue;
      cell[Math.floor((y / F.H) * gy) * gx + Math.floor((x / F.W) * gx)] += k;
    }
    let blank = 0;
    for (let i = 0; i < cell.length; i++) if (cell[i] < 0.6) blank++;
    return blank / cell.length;
  }

  /**
   * Composition: try a few fixed alternative framings of the same terrain and keep
   * the first with at most 60% blank paper (or the fullest). Deterministic per seed.
   */
  function compose(G, F) {
    const key = F.aspect;
    G._comp = G._comp || {};
    if (G._comp[key]) { Object.assign(G, G._comp[key].off); G._z = null; return G._comp[key]; }
    if (G._x00 === undefined) { G._x00 = G.x0; G._z00 = G.z0; }
    const x00 = G._x00, z00 = G._z00;
    let best = null;
    for (let k = 0; k < 8; k++) {
      G.x0 = x00 + k * 3.7; G.z0 = z00 + k * 5.3; G._z = null;
      const b = blankness(G, F);
      if (!best || b < best.blank) best = { k, blank: b, off: { x0: G.x0, z0: G.z0 } };
      if (b <= 0.6) break;
    }
    Object.assign(G, best.off);
    G._z = null;
    G._comp[key] = best;
    return best;
  }

  ML.landscape = { buildField, packRaw, compose, STRIDE };
})((window.ML = window.ML || {}));
