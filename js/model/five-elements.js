/*
 * Mountain Life — five elements (五行) palette
 * js/model/five-elements.js
 *
 * Birth moment → day stem (日干, the "day master") → element + yin/yang.
 * Day or night comes from the birth hour (06:00–17:59 = day).
 * Births from 23:00 count as the next day (子時 starts the new day).
 *
 * 5 elements × (yang/yin) × (day/night) = 20 palettes.
 * Palette roles:
 *   sky0 top of sky        sky1 horizon haze (also the fog colour)
 *   far  farthest ridge    near nearest ridge
 *   sea  water body        foam wave highlights
 *   cloud cloud body       river river marks      sun sun / moon
 */
(function (ML) {
  'use strict';
  const STEMS = '甲乙丙丁戊己庚辛壬癸';
  const ELEMENTS = [
    { zh: '木', en: 'Wood' }, { zh: '火', en: 'Fire' }, { zh: '土', en: 'Earth' },
    { zh: '金', en: 'Metal' }, { zh: '水', en: 'Water' },
  ];
  // [yang-day, yang-night, yin-day, yin-night] per element
  const P = (zh, en, sky0, sky1, far, near, sea, foam, cloud, river, sun) =>
    ({ zh, en, sky0, sky1, far, near, sea, foam, cloud, river, sun });
  const PALETTES = [
    [ // 木 Wood
      P('青山', 'Green peaks', '#9CC3C9', '#E8EEDC', '#A9C4B0', '#1F4A3A', '#4F8C92', '#E6F2EC', '#FBFBF4', '#F2FBF7', '#F4E7B4'),
      P('夜林', 'Night forest', '#0F1E24', '#2E4A48', '#3D5C55', '#0A1714', '#183238', '#9FC4BA', '#8FA9A2', '#CDE8D9', '#EDE6C8'),
      P('苔', 'Moss', '#D3DCCB', '#F2F1E6', '#C2CDB4', '#55684A', '#9DB5A8', '#F7F6EE', '#FFFFFF', '#FBFCF4', '#E9D9A0'),
      P('竹影', 'Bamboo shade', '#1C2622', '#3F4F45', '#55665A', '#16201B', '#24352F', '#A9BCA9', '#A0B0A2', '#D5E3D2', '#D9D3B0'),
    ],
    [ // 火 Fire
      P('丹霞', 'Danxia', '#F1B48C', '#FBE6CF', '#E2A27E', '#7A2318', '#9C5A57', '#FFE3C9', '#FFF1E4', '#FFE6C4', '#FFF3D6'),
      P('火山夜', 'Ember night', '#1A0B0E', '#4A1A1C', '#5C2420', '#160709', '#2A1214', '#F08A5D', '#6A3A38', '#FF9A52', '#FFB46B'),
      P('桃花', 'Peach blossom', '#F2CFCF', '#FBEFEA', '#E7B9B6', '#8E3A4E', '#C98E95', '#FFF5F0', '#FFFFFF', '#FFF2EE', '#F7D9A8'),
      P('晚霞', 'Dusk glow', '#2B1426', '#B0533F', '#7A3B3E', '#2A1019', '#4A2230', '#FFC38A', '#E39B7C', '#FFD08F', '#FFE1A6'),
    ],
    [ // 土 Earth
      P('黃土', 'Loess', '#BFD0D6', '#F2E6CC', '#D6BC8E', '#6B4A27', '#7F9C9E', '#F6EEDC', '#FFFAF0', '#F9EFD8', '#F7E2A8'),
      P('赭夜', 'Ochre night', '#14110D', '#3E3224', '#5A4630', '#120D08', '#2A251D', '#E0B04C', '#6E5C44', '#E8C27A', '#F0D69A'),
      P('沙丘', 'Dune', '#E3DCCB', '#F7F1E4', '#E2CFAE', '#A2774A', '#B9B7A6', '#FFFBF2', '#FFFFFF', '#FFF7E8', '#EBCB8B'),
      P('窯', 'Kiln', '#22140D', '#6E3E26', '#7A4A30', '#22140D', '#3A2418', '#E8A86C', '#A0664A', '#F4C98E', '#F7D3A0'),
    ],
    [ // 金 Metal
      P('白金', 'Platinum', '#C9D3DC', '#F5F5F2', '#CFD1D0', '#3C3E44', '#8A96A0', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#EFE3C2'),
      P('鐵', 'Iron', '#0D0F12', '#2E333A', '#444A52', '#0B0C0E', '#1B1F24', '#C9CFD6', '#5A6068', '#E8ECEF', '#E6E6E2'),
      P('銀', 'Silver', '#DADDE2', '#F2F2F0', '#BFC3C8', '#6D727A', '#A9AFB6', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#E3D3A8'),
      P('青銅', 'Bronze', '#17130D', '#4C4230', '#5E5038', '#17120B', '#2C271E', '#D4B26A', '#7A6C52', '#E6CF8E', '#F1DFAE'),
    ],
    [ // 水 Water
      P('靛', 'Indigo', '#8FA6CC', '#E4E9F1', '#9FAECB', '#1A2550', '#3C5A8E', '#EEF2FA', '#FFFFFF', '#EEF3FF', '#F4E3B0'),
      P('深海', 'Deep sea', '#070D18', '#1C3350', '#2A4568', '#060B14', '#0F1E33', '#7FD1D9', '#3E5876', '#9FE3EA', '#DCEBF2'),
      P('墨', 'Ink wash', '#D8DADB', '#F3F3F0', '#BCC0C3', '#23272C', '#8E979E', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#D8C9A4'),
      P('夜雨', 'Night rain', '#0E1A1F', '#36505A', '#3E5A64', '#0B1418', '#1A2C33', '#B7D1D6', '#6F8C94', '#DCE8EA', '#E6C79C'),
    ],
  ];

  /** Julian Day Number of a Gregorian date. */
  function jdn(y, m, d) {
    const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }

  /**
   * @param {string} date 'YYYY-MM-DD'   @param {string} time 'HH:MM'
   * @returns {{stem, element, yang, day, palette, index}}
   */
  function fromBirth(date, time) {
    const [y, m, d] = date.split('-').map(Number);
    const hour = parseInt(time.split(':')[0], 10);
    let j = jdn(y, m, d);
    if (hour >= 23) j += 1; // 子時 belongs to the next day
    const stem = (((j + 9) % 10) + 10) % 10; // 2000-01-01 → 戊 (4)
    const el = Math.floor(stem / 2), yang = stem % 2 === 0, day = hour >= 6 && hour < 18;
    const variant = (yang ? 0 : 2) + (day ? 0 : 1);
    const raw = PALETTES[el][variant];
    const pal = { zh: raw.zh, en: raw.en };
    for (const k of ['sky0', 'sky1', 'far', 'near', 'sea', 'foam', 'cloud', 'river', 'sun']) pal[k] = ML.color.hex(raw[k]);
    return { stem: STEMS[stem], element: ELEMENTS[el], yang, day, palette: pal, index: el * 4 + variant };
  }

  ML.elements = { fromBirth, PALETTES, ELEMENTS };
})((window.ML = window.ML || {}));
