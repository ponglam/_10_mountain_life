/*
 * Mountain Life — logical frame. All drawing happens in logical units
 * (F.W × F.H); the renderer scales to the real pixel size.
 * js/core/frame.js
 */
(function (ML) {
  'use strict';
  const FORMATS = { '4:3': [1600, 1200], '3:4': [1200, 1600], '1:1': [1400, 1400] };
  const F = { W: 1600, H: 1200, aspect: '4:3', FORMATS };
  F.setAspect = (a) => {
    const f = FORMATS[a] || FORMATS['4:3'];
    F.aspect = FORMATS[a] ? a : '4:3';
    F.W = f[0];
    F.H = f[1];
  };
  ML.frame = F;
})((window.ML = window.ML || {}));
