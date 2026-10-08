/*
 * Mountain Life — seed → genome  (v0.2, "ink line" form)
 * js/model/genome.js
 *
 * The genome holds every decision the seed makes: how many slices, how the
 * terrain folds, where the massifs rise out of the mist, the ink, the paper,
 * and how each stroke trembles along its length. Nothing here depends on
 * time or canvas size. Each subsystem has its own named random stream.
 */
(function (ML) {
  'use strict';
  const { makeRng, cyrb128 } = ML.random;
  const { mix } = ML.color;

  /*
   * Ink families by element (五行). The seed picks one ink inside the family
   * and nudges it, so two people of the same element never share an exact ink.
   */
  const INKS = [
    [['松煙', 'Pine soot', '#1C2420'], ['石綠', 'Malachite shadow', '#24423A'], ['苔墨', 'Moss ink', '#2E3A26']], // 木 Wood
    [['朱砂', 'Cinnabar', '#7E2216'], ['胭脂', 'Rouge', '#6A1E2C'], ['赭墨', 'Ember ink', '#3A1A14']], // 火 Fire
    [['焦墨', 'Burnt ink', '#2A221B'], ['赭石', 'Sienna', '#5A3A22'], ['土黃', 'Ochre dark', '#4C3A1C']], // 土 Earth
    [['鉛灰', 'Graphite', '#26282C'], ['銀墨', 'Silver ink', '#4A4E55'], ['鐵黑', 'Iron black', '#15171A']], // 金 Metal
    [['靛青', 'Indigo', '#1B2747'], ['花青', 'Prussian', '#1D3550'], ['墨', 'Sumi', '#141518']], // 水 Water
  ];
  const PAPERS = [
    ['宣紙', 'Xuan cream', '#F2ECDF'], ['骨白', 'Bone', '#EEE8DC'], ['霧白', 'Mist white', '#F3F2EE'],
    ['舊紙', 'Aged', '#ECE2CE'], ['月白', 'Moon white', '#EDF0F0'],
  ];

  /**
   * @param master 64-hex SHA-256 of the inputs, or a 10-hex seed code. Only the first
   *               10 hex characters are used, so the seed code ML-xxxxxxxxxx-E alone
   *               reproduces a piece (E = element digit, which picks the ink family).
   */
  function makeGenome(master, birth) {
    master = master.slice(0, 10);
    const G = { master, birth };
    G.noiseSeed = cyrb128(master + '/noise')[0];

    // ---- Slices, spacing, perspective -----------------------------------------------------
    let R = makeRng(master + '/frame');
    G.slices = R.int(1200, 2600); // at least a thousand: the drawing is built from these lines
    G.persp = R.chance(0.45) ? R.range(0, 0.12) : R.range(0.15, 0.45); // mostly a flat, layered view
    G.zfar = 1 + 3 * G.persp;
    G.yFar = R.range(0.16, 0.3); // farthest baseline, × H
    G.yNear = R.range(0.98, 1.12); // nearest baseline, × H
    G.amp = R.range(0.26, 0.42); // tallest summit, × H
    G.widen = R.range(0.4, 0.7);

    // ---- Terrain: ridged fBm on p5 noise, domain-warped ---------------------------------------
    R = makeRng(master + '/terrain');
    G.fx = R.range(2.2, 5.0); // ridge frequency across one canvas width
    G.zSpan = R.range(3.5, 9.0); // noise distance from far slice to near slice
    G.oct = R.int(4, 5);
    G.spire = R.range(1.15, 1.6); // >1 = thinner, sharper crests (spires)
    G.midF = R.range(1.6, 3.2);  // middle-frequency layers, relative to the ridge noise
    G.midOct = R.int(3, 5);
    G.midW = R.range(0.25, 0.45); // share of the silhouette from the middle layers
    G.ground = R.range(0.03, 0.07); // relief of the low ground
    G.lac = R.range(1.9, 2.3);
    G.gain = R.range(0.42, 0.58);
    G.warp = R.range(0.15, 1.1);
    G.fw = R.range(0.8, 2.4);
    G.base = R.range(0.3, 0.55); // how much a massif shows below its jagged detail
    G.x0 = R.range(0, 500);
    G.z0 = R.range(0, 500);

    // ---- Variable slice interval: calm stretches and sudden changes --------------------------
    R = makeRng(master + '/interval');
    G.dzVar = R.range(0.1, 0.45); // 0 = even steps; near 1 = some steps almost stall, some leap
    G.dzF = R.range(1, 3.5);

    // ---- Massifs: low-frequency islands of mountain in a sea of mist -------------------------
    R = makeRng(master + '/massif');
    G.fmx = R.range(0.9, 2.2);
    G.fmz = R.range(0.35, 0.9);
    G.mth = R.range(0.3, 0.44);
    G.peakExp = R.range(1.0, 1.6);
    G.envMin = R.range(0.35, 0.6); // the massif scales detail between this and 1
    G.mWarp = R.range(0.3, 1.2); // higher = more pointed summits

    // ---- Ink, paper and the stroke ---------------------------------------------------------
    R = makeRng(master + '/ink');
    const el = ML.elements.ELEMENTS.indexOf(birth.element);
    const fam = INKS[Math.max(0, el)];
    const pick = fam[R.int(0, fam.length - 1)];
    let ink = ML.color.hex(pick[2]);
    ink = ink.map((v) => v * R.range(0.85, 1.12));
    G.ink = ink;
    G.inkAlt = mix(ink, R.chance(0.3) ? [0, 0, 0] : ML.color.hex(fam[(fam.indexOf(pick) + 1) % fam.length][2]), R.range(0.25, 0.55));
    G.inkName = { zh: pick[0], en: pick[1] };
    const paper = PAPERS[R.int(0, PAPERS.length - 1)];
    G.paper = ML.color.hex(paper[2]).map((v) => v * R.range(0.985, 1.01));
    G.paperName = { zh: paper[0], en: paper[1] };
    G.alpha = R.range(0.62, 0.92); // ink per stroke (strokes pile up on steep faces)
    G.width = R.range(0.38, 0.62); // stroke width, logical px (frame long side 1600)
    G.f0 = R.range(0.06, 0.16); // below this height a stroke has faded into mist
    G.f1 = R.range(0.38, 0.62); // above this height it is at full ink
    G.farA = R.range(0.22, 0.45); // ink of the farthest slices (aerial perspective)
    G.sideFade = R.range(0, 0.12);
    G.inkFloor = R.range(0.12, 0.22); // solid ground is never fainter than this
    G.solidAt = R.range(0.15, 0.35); // where mist turns into ground that hides what is behind
    G.crest = R.range(1.5, 3.0); // extra ink where a stroke turns over a crest
    G.crestK = R.range(0.6, 1.6);

    // ---- The travelling bits: how ink, width and tone change along each stroke ---------------
    R = makeRng(master + '/travel');
    G.tx = R.range(4, 14);
    G.tz = R.range(3, 12);
    G.travel = R.range(0.35, 0.8);
    G.wx = R.range(2, 9);
    G.wVar = R.range(0.3, 0.8);
    G.toneF = R.range(1, 4);

    // ---- Drips: hairlines hanging from the ink into the mist below ---------------------------
    R = makeRng(master + '/drips');
    G.dripRate = R.chance(0.25) ? 0 : R.range(0.0004, 0.003);
    G.dripLen = R.range(0.015, 0.06); // × H
    G.dripF = R.range(20, 60);

    // ---- Water: a lake mirrors each slice below its base -----------------------------------
    // ---- Sea: water between the mountain groups ------------------------------------------
    R = makeRng(master + '/sea');
    G.sea = ['lake', 'ocean'][R.weighted([0.55, 0.45])]; // water is always part of the scene
    const lakeS = G.sea === 'lake';
    G.waterLevel = R.range(0.04, 0.1); // terrain height below which the ground is water
    G.waveF = lakeS ? R.range(2, 6) : R.range(9, 22); // lake: low–mid frequency; ocean: mid–high
    G.waveZ = lakeS ? R.range(1, 3) : R.range(4, 10);
    // lake: still, pale, few soft lines (a mirror); ocean: busy ripples, deeper colder tone, more ink
    G.waveA = lakeS ? R.range(0.0008, 0.002) : R.range(0.005, 0.011); // × H
    G.waveInk = lakeS ? R.range(0.08, 0.18) : R.range(0.4, 0.65);
    const HUES = ['#6E8A9C', '#6F9C8C', '#4A5C86', '#9C8466', '#B07A7A', '#707A80', '#B89A5A', '#5E7F6E'];
    const hi = R.int(0, HUES.length - 1);
    G.waterHue = ML.color.hex(HUES[hi]);
    G.tint = mix(G.paper, G.waterHue, lakeS ? R.range(0.05, 0.12) : R.range(0.16, 0.28)); // tone on tone, opaque
    G.tintA = R.range(0.8, 1);
    G.waveCol = mix(G.waterHue, G.ink, R.range(0.2, 0.55));
    // clouds: the same colour family as the water, or a counter tone
    G.cloudFam = R.chance(0.5) ? 'same' : 'counter';
    const cHue = G.cloudFam === 'same' ? G.waterHue : ML.color.hex(HUES[(hi + 4) % HUES.length]);
    G.cloudCol = mix(mix(G.paper, [255, 255, 255], 0.55), cHue, R.range(0.04, 0.14));

    R = makeRng(master + '/water');
    G.water = lakeS && R.chance(0.9); // a calm lake may mirror the range beyond it
    G.lakeU = R.range(0.45, 0.72); // depth of the open water (0 far .. 1 near)
    G.lakeW = R.range(0.22, 0.36);
    G.waterK = R.range(0.55, 0.85); // vertical squash of the reflection
    G.waterA = R.range(0.55, 0.85); // ink of the reflection
    G.waterW = R.range(1.2, 1.8); // reflections are softer, a little wider
    G.ripple = R.range(1.0, 3.5); // logical px of sideways ripple
    G.gapF = R.range(0.6, 2.0);
    G.gapTh = R.range(0.25, 0.42); // breaks along each reflected line

    // ---- Clouds: groups of slices that float at mid to high altitude -----------------------
    R = makeRng(master + '/clouds');
    G.clouds = [];
    const nCl = R.int(1, 4); // clouds are always part of the scene
    for (let i = 0; i < nCl; i++) {
      G.clouds.push({
        uc: R.range(0.1, 0.85), // depth of its centre
        du: R.range(0.02, 0.16), // half-depth: short or long in Y
        cx: R.range(-0.45, 0.45), // centre across the frame (canvas widths)
        wx: R.range(0.12, 0.6), // narrow or wide
        alt: R.range(0.45, 1.15), // mid to high on the mountains (× height)
        thick: R.range(0.025, 0.07), // × H
        f: R.range(1.5, 5), // puff frequency
        alpha: R.range(0.12, 0.26), // per slice; overlapping slices build the body
        th: R.range(0.3, 0.55), // puff threshold: lower = fuller bank
        ox: R.range(0, 100),
      });
    }
    G.cloudBlur = R.range(0, 0.5); // dots stay crisp: the grain is the point // logical px; some seeds very soft

    // ---- Time ----------------------------------------------------------------------------
    G.zPhi = G.zSpan * R.range(0.008, 0.015); // noise distance per year: a century slowly remakes the range
    G.grain = R.range(0.05, 0.09);
    G.lightK = R.range(0.6, 1.1);
    G.nightPick = makeRng(master + '/nightsky').chance(0.7); // night births may get a dark sky
    // ---- Trees: small conifers on flat land, in clumps; not every seed, never everywhere ----------
    R = makeRng(master + '/trees');
    G.treeRate = R.chance(0.2) ? 0 : R.range(0.08, 0.35); // chance per flat vertex inside a grove
    G.groveF = R.range(2, 6); G.groveTh = R.range(0.5, 0.65);
    G.treeSize = R.range(0.012, 0.03); // × H at the nearest slice: small
    G.treeFlat = R.range(0.25, 0.5); // max |slope| counted as flat
    G.treeShape = R.chance(0.5) ? 'circle' : 'square';
    G.treeA = R.range(0.1, 0.3); // dot opacity, max 30%
    G.treeDot = R.range(0.4, 0.9); // very tiny dots (logical px)
    G.treeDots = R.range(1.5, 4); // dots per square px of bound
    G.treeHue = R.range(-1, 1); G.treeMix = R.range(0.35, 0.6); // how strongly the sun/moon colours the slopes
    // the painting: how long the layers take to arrive, how long one stroke takes to cross, which way
    G.paint = { spread: R.range(4.5, 6.5), dur: R.range(0.9, 1.6), dir: R.chance(0.5) ? 1 : -1 };
    G.grainSeed = cyrb128(master + '/grain')[0];
    return G;
  }

  function describe(G) {
    const p = G.persp < 0.13 ? 'flat layers' : 'gentle perspective';
    const sea = { none: '', lake: G.water ? ', a mirror lake' : ', a lake', ocean: ', open sea' }[G.sea];
    const cl = G.clouds.length ? `, ${G.clouds.length} cloud bank${G.clouds.length > 1 ? 's' : ''}` : '';
    return `${G.slices.toLocaleString('en-US')} slices, ${p}${sea}${cl}. Ink ${G.inkName.zh} ${G.inkName.en} on ${G.paperName.zh} ${G.paperName.en} paper.`;
  }

  ML.genome = { makeGenome, describe, INKS, PAPERS };
})((window.ML = window.ML || {}));
