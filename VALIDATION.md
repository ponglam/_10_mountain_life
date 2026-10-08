# Geo Art UI validation — 2026-10-08

Reference: `_08_geo_art` (the requested `_geo_art` has only `.gitattributes`).

- Geo Art stylesheet, Cormorant Garamond font and OFL license copied byte-for-byte.
- All Mountain Life JavaScript files unchanged.
- Chromium comparison: original and new UI render identical PNG pixels for
  Mountain Test / 1990-08-23 / 14:37 at age 35, 600 × 800 canvas.
- Passed: missing-name validation, invalid/valid seed loading, random life,
  age slider, start/stop time drift, 3:4 / 4:3 / 1:1 formats.
- Actual PNG downloads verified at 3072 × 4096 and 6144 × 8192.
- No horizontal overflow at 1440, 900, 768, 390 and 320 pixels wide.
- Desktop and mobile screenshots inspected. Automatic initial generation passed.
- No JavaScript errors during the successful browser run.

The initial software graphics test timed out on the original app; the successful
run used Chrome's normal graphics path. Tests used reduced motion for stable
render comparisons. The artwork still requires WebGL2. Geo Art's light paper
theme replaces Mountain Life's previous automatic dark theme.
