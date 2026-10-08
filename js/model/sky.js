/*
 * Mountain Life — the birth moment as sun or moon
 * js/model/sky.js
 *
 * Day births (sunrise..sunset) show the sun, night births the moon.
 *  - Across the frame: east (left) at rise → west (right) at set.
 *  - Height: an arc over the day/night, its peak higher in summer (solar declination).
 *  - Moon phase from the date (synodic month, ref. new moon 2000-01-06 18:14 UTC):
 *    a thin eyebrow near new moon, round at full moon.
 *  - Moon tone: warmer in summer, cooler and less saturated in winter.
 * Northern-hemisphere seasons. A seed code without a date gets a seeded moment.
 */
(function (ML) {
  'use strict';
  const { clamp, lerp } = ML.math;

  function dayOfYear(y, m, d) { return (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5; }

  /** @returns {{kind, x, y, r, phase, waxing, summer, col}} x,y,r in 0..1 frame units */
  function fromMoment(date, time, master) {
    let y, m, d, hh, mm;
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      [y, m, d] = date.split('-').map(Number);
      [hh, mm] = time.split(':').map(Number);
    } else { // seed code only: a seeded moment
      const R = ML.random.makeRng(master + '/moment');
      y = R.int(1940, 2025); m = R.int(1, 12); d = R.int(1, 28); hh = R.int(0, 23); mm = R.int(0, 59);
    }
    const doy = dayOfYear(y, m, d), h = hh + mm / 60;
    const decl = 23.44 * Math.sin((2 * Math.PI * (doy - 81)) / 365); // degrees
    const summer = (decl + 23.44) / 46.88; // 0 winter solstice .. 1 summer solstice
    const half = 6 + (decl / 23.44) * 1.2; // half day length in hours (~Taiwan latitude)
    const rise = 12 - half, set = 12 + half;
    const day = h >= rise && h < set;
    let t; // 0 east .. 1 west
    if (day) t = (h - rise) / (set - rise);
    else { const nh = (h - set + 24) % 24; t = nh / (24 - (set - rise)); }
    const arc = Math.sin(Math.PI * clamp(t, 0, 1));
    const peak = day ? lerp(0.55, 1, summer) : lerp(1, 0.6, summer); // winter moon rides high
    const lift = arc * peak; // 0 at the horizon .. 1 high
    const ms = Date.UTC(y, m - 1, d, hh - 8, mm); // birth time read as Taiwan time
    const age = ((((ms - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % 29.530588) + 29.530588) % 29.530588;
    const phase = (1 - Math.cos((2 * Math.PI * age) / 29.530588)) / 2; // 0 new .. 1 full
    const S = {
      year: y, month: m, day: d,
      kind: day ? 'sun' : 'moon', t, lift, phase: Math.max(0.06, phase), waxing: age < 14.765, summer,
      x: lerp(0.1, 0.9, t),
      // small orb = a huge scene, big orb = an intimate one
      r: ML.random.makeRng(master + '/orbsize').range(0.012, 0.05),
    };
    S.col = day
      ? [lerp(222, 238, summer), lerp(150, 120, summer), lerp(110, 80, summer)] // pale vermilion sun
      : [lerp(206, 244, summer), lerp(214, 222, summer), lerp(222, 176, summer)]; // cool grey → warm moon
    S.sat = day ? 1 : lerp(0.45, 1, summer);
    return S;
  }
  ML.sky = { fromMoment };
})((window.ML = window.ML || {}));
