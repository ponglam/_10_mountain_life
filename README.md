# Mountain Life

A generative ink-line landscape seeded by a person's name, birth date and birth time.
Thousands of hairline noise slices, drawn far to near, become a mountain range with water,
clouds, trees and the sun or moon of the birth moment.

## Run it
Open `index.html` in a desktop browser (double-click works; no build step, no server).
Needs WebGL2. p5.js is bundled in `vendor/`. The Geo Art Cormorant Garamond font is bundled locally; the page works fully offline.

## Folder
```
index.html                 page markup and script order
css/styles.css             Mountain Life adapters for the shared Geo Art UI
vendor/geo-art/            unchanged Geo Art stylesheet and locally bundled font
vendor/p5.min.js           p5.js 1.9.4 (LGPL-2.1), used only for noise()

js/core/                   no artwork knowledge
  math.js                  clamp, lerp, smoothstep, sleep
  random.js                seeded PRNG streams, SHA-256
  color.js                 colour helpers
  frame.js                 logical frame size per format (3:4, 4:3, 1:1)

js/model/                  seed → numbers (no drawing)
  five-elements.js         birth moment → day master (日干) → element (五行)
  noise.js                 seeded p5 noise, normalised to 0..1
  genome.js                every seeded decision: terrain, ink, paper, sea, clouds, trees, light
  sky.js                   birth moment → sun or moon: position, height, phase, tone
  landscape.js             genome + age → visible line field (slices, occlusion, water,
                           reflections, clouds, trees, drips); composition check

js/render/render.js        WebGL2 hairline renderer, layer-by-layer painting,
                           paper texture, cloud/reflection layers, textured sun/moon
js/export/export.js        tiled 4K / 8K PNG export
js/app/seed.js             form inputs → seed; "A life A moment"
js/app/main.js             UI controller: generate, seed codes, age slider, night sky, save

backups/vX.Y/              every published version, intact
CHANGELOG.md               what changed in each version
```
All scripts are classic `<script>` files sharing one namespace, `window.ML`,
and must load in the order listed in `index.html`.

## How a piece is made
1. **Seed.** `name | YYYYMMDD | HHMM` → SHA-256. Its first 10 hex characters plus the element digit
   form the seed code `ML-xxxxxxxxxx-E`, which alone reproduces the piece (Seed code field → Load).
2. **Slices.** 1,200–2,600 hairline slices; each samples ridged, domain-warped p5 noise across the frame.
   Massifs gate where mountains rise; middle-frequency layers shape the silhouettes.
3. **Occlusion.** Slices are swept near → far with a per-column horizon; only visible ink is kept.
4. **Ink.** Duotone inks from the element family, fading with height and depth, pressed on crests.
   Each segment n → n+1 is lit by its slope toward the sun/moon: 45° facing it takes the light's colour,
   45° away a darker tone.
5. **Water** (always): lake (still, pale, mirrored per slice) or ocean (busy ripples, deeper tint).
6. **Clouds** (always): banks of stippled dots, one per slice vertex above a threshold, in a darker sun/moon tone.
7. **Trees** (most seeds): circle or square bounds on flat land filled with tiny dots, ≤ 30% opacity,
   coloured by the birth season, tone on tone.
8. **Sun / moon** (always): east → west by hour, height by hour and season, moon phase by date,
   size by seed; placed in clear sky. Night births may get a dark noise sky in the element's tone.
9. **Age.** The Time slider runs 0–100 years and opens at today's age; age slowly remakes the range.
10. **Painting.** A new piece is painted layer by layer, far to near, then settles with a crossfade.

## Backend hooks
- `ML.seed.master(name, date, time)` → 64-hex seed
- `ML.genome.makeGenome(seed, ML.elements.fromBirth(date, time))` → genome
- `ML.app.loadCode('ML-xxxxxxxxxx-E')` → load a piece from its seed code
- `ML.exporter.renderPNG(genome, ML.frame, age, longSide)` → PNG Blob (browser canvas required)
- Add `?test` to the URL to skip the intro typing and animation (automated checks).

## Geo Art UI source
The requested `_geo_art` directory is an empty Git scaffold. The actual reference is
its sibling `_08_geo_art`. `vendor/geo-art/style.css` and its `fonts/` are copied
unchanged from that project. `index.html` reuses its header, three-column
intro/gallery/impression layout, numbered sections, primary/chance/outline buttons,
art framing, timeline and footer classes. Mountain-specific seed and format controls
are adapted in `css/styles.css`. Geo Art uses a light paper theme, now shared here.
The generation, rendering, seed, animation and export JavaScript is unchanged.
