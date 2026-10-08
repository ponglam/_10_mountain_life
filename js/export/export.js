/*
 * Mountain Life — high-resolution PNG export  (v0.2)
 * js/export/export.js
 *
 * Rebuilds the line field at full quality, renders it in tiles (≤ 2048 px)
 * with a separate WebGL canvas, and composites paper + ink + grain into one
 * 2D canvas of the export size.
 */
(function (ML) {
  'use strict';
  async function renderPNG(G, F, phi, longSide, onProgress) {
    const k = longSide / Math.max(F.W, F.H);
    const outW = Math.round(F.W * k), outH = Math.round(F.H * k);
    const out = document.createElement('canvas');
    out.width = outW; out.height = outH;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.setTransform(k, 0, 0, k, 0, 0);

    const field = ML.landscape.buildField(G, F, phi, { stride: 1, step: Math.max(0.6, 2.4 / Math.min(k, 4)) });
    const glc = document.createElement('canvas');
    const R = new ML.render.Renderer(glc);
    R.setField(field);
    const T = 2048, tilesX = Math.ceil(outW / T), tilesY = Math.ceil(outH / T);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let done = 0;
    for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) {
      const px = tx * T, py = ty * T, pw = Math.min(T, outW - px), ph = Math.min(T, outH - py);
      R.resize(pw, ph);
      R.draw(G, F, [px / k, py / k, pw / k, ph / k], k);
      ctx.drawImage(glc, px, py);
      done++;
      if (onProgress) onProgress(done / (tilesX * tilesY));
      await new Promise((r) => setTimeout(r, 0));
    }
    if (G._orb) { ctx.setTransform(k, 0, 0, k, 0, 0); ML.render.drawOrb(ctx, G, G.sky, G._orb.cx, G._orb.cy, G._orb.r, Math.min(k, 3)); ctx.setTransform(1, 0, 0, 1, 0, 0); }
    if (field.reflCount > 1) {
      const cs = Math.min(1, 2048 / Math.max(outW, outH));
      R.resize(Math.round(outW * cs), Math.round(outH * cs));
      R.drawRefl(G, F, [0, 0, F.W, F.H], k * cs);
      ML.render.drawCloudLayer(ctx, G, glc, outW, outH, k, 1, 1.6, 'multiply');
    }
    // clouds: one pass at ≤ 2048 px, scaled up and blurred (they are soft anyway)
    if (field.cloudCount > 1) {
      const cs = Math.min(1, 2048 / Math.max(outW, outH)), cw = Math.round(outW * cs), ch = Math.round(outH * cs);
      R.resize(cw, ch);
      R.drawClouds(G, F, [0, 0, F.W, F.H], k * cs);
      ML.render.drawCloudLayer(ctx, G, glc, outW, outH, k);
    }
    const lose = R.gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ML.render.drawPaperTexture(ctx, G, F);
    const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
    out.width = out.height = 1;
    if (!blob) throw new Error('encode');
    return blob;
  }
  ML.exporter = { renderPNG };
})((window.ML = window.ML || {}));
