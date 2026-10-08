/*
 * Mountain Life — colour helpers. Colours are [r, g, b] arrays in 0–255.
 * js/core/color.js
 */
(function (ML) {
  'use strict';
  const { clamp, lerp } = ML.math;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const css = (c, a = 1) =>
    `rgba(${clamp(c[0], 0, 255) | 0},${clamp(c[1], 0, 255) | 0},${clamp(c[2], 0, 255) | 0},${clamp(a, 0, 1).toFixed(4)})`;
  const luma = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  ML.color = { hex, mix, scale, css, luma };
})((window.ML = window.ML || {}));
