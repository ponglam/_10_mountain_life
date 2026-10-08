# Changelog
## v0.11 — 2026-10-08
Trees are abstract: a circle or square bound (per seed) filled with tiny random dots, opacity seeded up to 30%.
Night sky (most night births): a dark noise field in the element's dark tone (Wood dark green, Fire dark red,
Earth dark umber, Metal dark grey, Water dark indigo), varying 20 darker to 20 brighter, fading softly into the ridges.
## v0.10 — 2026-10-08
Every piece has mountain, water, clouds and a sun/moon (the orb shrinks to fit clear sky if needed).
Trees: small conifers on visible flat land, in seeded groves (some seeds none). Tree colour follows the birth
season (spring/summer/autumn/winter) mixed tone-on-tone with paper and ink, shifted per seed. Stippled cloud form kept.
## v0.9 — 2026-10-08
Light: each segment n→n+1 is tinted by its slope toward the sun/moon — 45° facing the light takes the sun/moon colour
(highlight), 45° facing away a darker tone (shadow), flat keeps the ink. Side follows where the sun/moon sits.
Cloud dots get the same light (sun-facing side and tops bright). Time slider is now age 0–100, opening at today's age.
## v0.8 — 2026-10-08
Clouds are stippled: one dot per slice vertex where the cloud value clears the threshold, in the darker sun/moon tone; denser value = more and stronger dots. No blur.
## v0.7 — 2026-10-08
Clouds: each slice vertex is filled only where the cloud value clears the threshold, opaque, in a darker tone of the sun/moon; light blur.
## v0.6 — 2026-10-08
Sun/moon: size varies by seed (small orb = huge scene); always placed in clear sky with breathing room above
ink and clouds, moving sideways or shrinking if needed. Moon shadow edge is a broad soft gradient with earthshine.
Clouds stronger and tinted toward the sun/moon tone. Lake vs ocean: lakes are still, pale and mirrored;
oceans have busy ripples, more ink and a deeper tint. Reflections rebuilt per slice: each ridge mirrored about
the water surface as a filled shape, so nearer reflections hide farther ones (no inverted landscape).
## v0.5 — 2026-10-08
Sun or moon from the birth moment: east→west across the frame, height by hour and season, moon phase from the date
(eyebrow → full), warm summer / cool, desaturated winter moon, textured discs (granulation, maria), placed in clear sky.
Lake reflections moved to their own layer: blurred and multiplied into the water tone (no late dark pop-in).
Duotone inks more common (70% of seeds; ref ML-41ff8099a6-1).
## v0.4 — 2026-10-08
Seed code is now the real seed: ML-<10 hex>-<element digit> alone reproduces a piece (new "Seed code" field).
Sea: none / lake (low–mid frequency waves) / open sea (mid–high), water fills ground below a seeded level,
with an opaque tone-on-tone tint whose stretches fade out at both ends. Mirror lakes are part of lake seeds.
Clouds: 0–4 banks built from slices at mid–high altitude, wide/narrow, short/long in depth, puffy, blurred;
cloud colour in the water's family or a counter tone. Less over-sharp terrain (spire, octaves capped).
## v0.3 — 2026-10-08
Silhouettes from packed middle-frequency layers; the massif only gates and scales detail (no smooth "sine" humps).
Mist no longer hides what is behind (only solid ground does); solid ground has a minimum ink; low ground keeps relief.
Composition check: tries up to 8 fixed framings per seed and keeps one with at most 60% blank paper.
Stronger ink. Lakes (30% of seeds): an open-water band mirrors the far range, squashed, rippled and broken.
Painting ends with a soft crossfade into the finished piece.
## v0.2 — 2026-10-08
Ink-line form after the reference drawing: 1,200–2,600 hairline slices, ridged warped terrain, massifs in mist,
height/depth ink fade, crest pressure, travelling ink/width/tone, seeded ink + paper, drips, variable dz.
CPU horizon occlusion + WebGL2 hairlines. Layer-by-layer painting animation. Default format 3:4.
v0.1 (colour landscape: sea, clouds, rivers) kept in backups/v0.1.
## v0.1 — 2026-10-07
First version: noise slices, seeded perspective, drift, sea, rivers, clouds, five-element palettes,
Time slider, Landscape / Lines views, 4:3 / 3:4 / 1:1, 4K / 8K PNG.
