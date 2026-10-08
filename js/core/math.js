/*
 * Mountain Life — small math helpers
 * js/core/math.js
 */
(function (ML) {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  /** Hermite smoothstep between edges a and b. */
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  ML.math = { clamp, lerp, smooth, sleep };
})((window.ML = window.ML || {}));
