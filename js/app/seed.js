/*
 * Mountain Life — form inputs → seed
 * js/app/seed.js
 *
 * seedString = name | YYYYMMDD | HHMM   (name trimmed, spaces collapsed, NFC)
 * master     = SHA-256(seedString), 64 hex chars
 * Everything in the piece is derived from master. "A life A moment" is the
 * only non-deterministic part of the app, and it only fills the form.
 */
(function (ML) {
  'use strict';
  const normName = (s) => s.trim().replace(/\s+/g, ' ').normalize('NFC');
  function seedString(name, date, time) {
    return [normName(name), date.replace(/-/g, ''), time.replace(':', '')].join('|');
  }
  const master = (name, date, time) => ML.random.sha256Hex(seedString(name, date, time));

  const NAMES = ['林怡君', '陳志明', '王雅婷', '張家豪', '李淑芬', '黃建宏', '吳佳穎', '劉冠廷', '蔡宜蓁', '許承恩',
    'Ada Lindqvist', 'Mateo Rivera', 'Ingrid Holm', 'Kofi Mensah', 'Yuki Tanaka', 'Elena Petrova', 'Noor Haddad',
    'Rafael Costa', 'Amara Obi', 'Theo Laurent'];
  const crand = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; };
  function randomLife() {
    const name = NAMES[Math.floor(crand() * NAMES.length)];
    const t0 = Date.UTC(1930, 0, 1), t1 = Date.now();
    const date = new Date(t0 + crand() * (t1 - t0)).toISOString().slice(0, 10);
    const time = String(Math.floor(crand() * 24)).padStart(2, '0') + ':' + String(Math.floor(crand() * 60)).padStart(2, '0');
    return { name, date, time };
  }
  ML.seed = { normName, seedString, master, randomLife };
})((window.ML = window.ML || {}));
