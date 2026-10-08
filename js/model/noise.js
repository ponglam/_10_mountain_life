/*
 * Mountain Life — p5.js Perlin noise, seeded
 * js/model/noise.js
 *
 * p5's noise() is the only noise source in the piece. One p5 instance is
 * created with no canvas; ML.noise.seed(n) calls noiseSeed(n), and each
 * field (terrain, drift, clouds, waves…) sets its own noiseDetail() and uses
 * its own third coordinate, so the fields never line up with each other.
 */
(function (ML) {
  'use strict';
  let P = null;
  function ensure() {
    if (!P) {
      // eslint-disable-next-line no-undef
      P = new p5((s) => { s.setup = () => { s.noCanvas(); s.noLoop(); }; });
    }
    return P;
  }
  // p5 sums octaves with amplitudes 0.5, 0.5·f, 0.5·f²…, so raw values never reach 1.
  // We divide by that sum to get roughly 0..1 (median ≈ 0.5) for any noiseDetail.
  let norm = 1;
  const N = {
    seed(n) { ensure().noiseSeed(n >>> 0); },
    detail(oct, fall) {
      ensure().noiseDetail(oct, fall);
      let s = 0, a = 0.5;
      for (let i = 0; i < oct; i++) { s += a; a *= fall; }
      norm = 1 / s;
    },
    /** noise(x, y, z), normalised to about 0..1 */
    at(x, y, z) { return P.noise(x, y, z) * norm; },
  };
  ML.noise = N;
})((window.ML = window.ML || {}));
