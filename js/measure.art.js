/* 量量看 — 物品的卡通 SVG 插畫（參數化，隨長度伸縮）
 * 每個 draw(w, h) 回傳一段填滿 [0..w]×[0..h] 的 SVG：
 *   物品的「量測左端」在 x=0、「量測右端」在 x=w（對齊尺的 0 與 length 刻度）。
 *   握把/身體隨 w 伸縮，頭部/端點固定大小、不失真。
 * 粗描邊卡通風（配 DanluKids）。window.ObjectArt.draw(key, w, h)。 */
(function (root) {
  'use strict';

  const INK = '#3a3844';
  const SW = 3;

  function svg(w, h, inner) {
    return '<svg class="obj-svg" viewBox="0 0 ' + w + ' ' + h + '" '
      + 'preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">'
      + '<g fill="none" stroke="' + INK + '" stroke-width="' + SW
      + '" stroke-linejoin="round" stroke-linecap="round">' + inner + '</g></svg>';
  }
  const R = (x, y, w, h, rx, fill) =>
    '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (rx || 0) + '" fill="' + fill + '"/>';
  const C = (cx, cy, r, fill) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"/>';
  const E = (cx, cy, rx, ry, fill) => '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"/>';
  const P = (pts, fill) => '<polygon points="' + pts + '" fill="' + fill + '"/>';
  const PATH = (d, fill) => '<path d="' + d + '" fill="' + (fill || 'none') + '"/>';
  const dot = (cx, cy, r, fill) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '" stroke="none"/>';

  // 每個物件：draw(w,h) → inner svg。座標 x 由 0（左端）到 w（右端）。
  const ART = {
    // 鉛筆：橡皮擦(左) → 鐵環 → 筆桿(伸縮) → 木頭 → 筆尖(右)
    pencil(w, h) {
      const p = SW / 2, cy = h / 2, th = h * 0.5, top = cy - th / 2;
      const er = h * 0.42, ferr = h * 0.14, tip = h * 0.66;
      const bodyL = p + er + ferr, bodyR = w - p - tip;
      return svg(w, h,
        R(p, top, er, th, th * 0.35, '#f39ab0') +
        R(p + er, top, ferr, th, 1, '#cfd3dd') +
        R(bodyL, top, Math.max(2, bodyR - bodyL), th, 2, '#f5c542') +
        P((bodyR) + ',' + top + ' ' + (w - p - tip * 0.34) + ',' + cy + ' ' + bodyR + ',' + (top + th), '#efd39a') +
        P((w - p - tip * 0.34) + ',' + (cy - th * 0.3) + ' ' + (w - p) + ',' + cy + ' ' + (w - p - tip * 0.34) + ',' + (cy + th * 0.3), '#4a4a55'));
    },
    // 蠟筆：平頭(左) → 標籤紙 → 錐形尖(右)
    crayon(w, h) {
      const p = SW / 2, cy = h / 2, th = h * 0.54, top = cy - th / 2;
      const tip = h * 0.6, bodyR = w - p - tip;
      return svg(w, h,
        R(p, top, Math.max(2, bodyR - p), th, 3, '#ef6a5a') +
        R(p + th * 0.4, cy - th * 0.28, Math.max(2, bodyR - p - th * 0.8), th * 0.56, 2, '#fff2ef') +
        P(bodyR + ',' + top + ' ' + (w - p) + ',' + cy + ' ' + bodyR + ',' + (top + th), '#e05545'));
    },
    // 湯匙：握把(伸縮,左) → 匙面(右, 固定橢圓)
    spoon(w, h) {
      const p = SW / 2, cy = h / 2, bowlR = h * 0.42;
      const handH = h * 0.24, bowlCx = w - p - bowlR;
      return svg(w, h,
        R(p, cy - handH / 2, Math.max(2, bowlCx - p + 2), handH, handH / 2, '#c7ccd6') +
        E(bowlCx, cy, bowlR, h * 0.44, '#dfe3ea') +
        E(bowlCx, cy, bowlR * 0.6, h * 0.26, '#c2c8d3'));
    },
    // 鑰匙：圓頭+孔(左, 固定) → 桿(伸縮) → 齒(右)
    key(w, h) {
      const p = SW / 2, cy = h / 2, bow = h * 0.42;
      const bowCx = p + bow, shaftH = h * 0.2, teethX = w - p - h * 0.5;
      let teeth = '';
      for (let i = 0; i < 3; i++) {
        const tx = teethX + i * (h * 0.16);
        teeth += R(tx, cy - shaftH / 2 - h * 0.12, h * 0.09, h * 0.12, 1, '#e8b93a');
      }
      return svg(w, h,
        R(bowCx, cy - shaftH / 2, Math.max(2, (w - p) - bowCx), shaftH, shaftH / 2, '#f0c94a') +
        teeth +
        C(bowCx, cy, bow, '#f0c94a') +
        dot(bowCx, cy, bow * 0.42, '#fff7e0') + '<circle cx="' + bowCx + '" cy="' + cy + '" r="' + (bow * 0.42) + '" fill="none" stroke="' + INK + '" stroke-width="' + SW + '"/>');
    },
    // 鏟子：握把(伸縮,左)＋握柄圓頭 → 鏟面(右, 固定)
    brush(w, h) { return ART.shovel(w, h); },
    shovel(w, h) {
      const p = SW / 2, cy = h / 2, blade = h * 0.72, gripR = h * 0.2;
      const handH = h * 0.2, bladeL = w - p - blade;
      return svg(w, h,
        C(p + gripR, cy, gripR, '#b98a4a') +
        R(p + gripR, cy - handH / 2, Math.max(2, bladeL - (p + gripR)), handH, handH / 2, '#caa05e') +
        PATH('M ' + bladeL + ' ' + (cy - blade * 0.5) + ' L ' + (w - p - blade * 0.18) + ' ' + (cy - blade * 0.5)
          + ' L ' + (w - p) + ' ' + cy + ' L ' + (w - p - blade * 0.18) + ' ' + (cy + blade * 0.5)
          + ' L ' + bladeL + ' ' + (cy + blade * 0.5) + ' Z', '#b7bec9'));
    },
    // 胡蘿蔔：葉子(左) → 橢圓錐身到尖(右)
    carrot(w, h) {
      const p = SW / 2, cy = h / 2, leaf = h * 0.42;
      const bodyL = p + leaf * 0.5;
      let leaves = '';
      for (let i = -1; i <= 1; i++) {
        leaves += P((bodyL) + ',' + cy + ' ' + (p + i * 3 + 2) + ',' + (cy - leaf + i * 2) + ' ' + (bodyL + leaf * 0.4) + ',' + (cy - leaf * 0.2), '#5aa64f');
      }
      const body = 'M ' + bodyL + ' ' + (cy - h * 0.36) + ' L ' + (w - p) + ' ' + cy + ' L ' + bodyL + ' ' + (cy + h * 0.36) + ' Q ' + (bodyL - h * 0.18) + ' ' + cy + ' ' + bodyL + ' ' + (cy - h * 0.36) + ' Z';
      let ridges = '';
      for (let i = 1; i <= 3; i++) {
        const rx = bodyL + (w - p - bodyL) * (i / 4.5);
        const ry = h * 0.3 * (1 - i / 5);
        ridges += '<line x1="' + rx + '" y1="' + (cy - ry) + '" x2="' + (rx + h * 0.12) + '" y2="' + (cy) + '" stroke="' + INK + '" stroke-width="2" opacity=".5"/>';
      }
      return svg(w, h, leaves + PATH(body, '#ef8b3a') + ridges);
    },
    // 毛毛蟲：身體節(伸縮,左) → 頭(右, 有眼睛)
    caterpillar(w, h) {
      const p = SW / 2, cy = h / 2, headR = h * 0.44;
      const headCx = w - p - headR, r = h * 0.3;
      const bodyR = headCx;
      const n = Math.max(2, Math.round((bodyR - p) / (r * 1.15)));
      let segs = '';
      for (let i = 0; i < n; i++) {
        const cx = p + r + (bodyR - p - 2 * r) * (n === 1 ? 0 : i / (n - 1));
        segs += C(cx, cy, r, i % 2 ? '#7cb342' : '#8bc34a');
      }
      return svg(w, h, segs +
        C(headCx, cy, headR, '#9ccc65') +
        dot(headCx + headR * 0.3, cy - headR * 0.3, headR * 0.22, '#fff') +
        dot(headCx + headR * 0.38, cy - headR * 0.28, headR * 0.11, INK) +
        '<path d="M ' + (headCx + headR * 0.1) + ' ' + (cy + headR * 0.35) + ' q ' + (headR * 0.3) + ' ' + (headR * 0.3) + ' ' + (headR * 0.6) + ' 0" stroke="' + INK + '" stroke-width="2.5" fill="none"/>');
    },
    // 魚：尾鰭(左) → 身體(伸縮) → 頭+眼(右)
    fish(w, h) {
      const p = SW / 2, cy = h / 2, tail = h * 0.5;
      const bodyL = p + tail * 0.8, bodyR = w - p;
      return svg(w, h,
        P(p + ',' + (cy - tail) + ' ' + (bodyL + 2) + ',' + cy + ' ' + p + ',' + (cy + tail), '#3f9ad6') +
        PATH('M ' + bodyL + ' ' + cy + ' Q ' + ((bodyL + bodyR) / 2) + ' ' + (cy - h * 0.46) + ' ' + bodyR + ' ' + cy
          + ' Q ' + ((bodyL + bodyR) / 2) + ' ' + (cy + h * 0.46) + ' ' + bodyL + ' ' + cy + ' Z', '#4aa8e0') +
        dot(bodyR - h * 0.28, cy - h * 0.12, h * 0.14, '#fff') +
        dot(bodyR - h * 0.24, cy - h * 0.12, h * 0.07, INK));
    },
    // 緞帶：波浪帶(伸縮)，右端剪成燕尾
    ribbon(w, h) {
      const p = SW / 2, cy = h / 2, th = h * 0.4, amp = h * 0.14;
      const rR = w - p, notch = h * 0.28;
      const topD = 'M ' + p + ' ' + (cy - th / 2)
        + ' Q ' + (w * 0.3) + ' ' + (cy - th / 2 - amp) + ' ' + (w * 0.55) + ' ' + (cy - th / 2)
        + ' T ' + (rR) + ' ' + (cy - th / 2)
        + ' L ' + (rR - notch) + ' ' + cy + ' L ' + rR + ' ' + (cy + th / 2)
        + ' Q ' + (w * 0.55) + ' ' + (cy + th / 2 + amp) + ' ' + (w * 0.3) + ' ' + (cy + th / 2)
        + ' T ' + p + ' ' + (cy + th / 2) + ' Z';
      return svg(w, h, PATH(topD, '#e0709a'));
    },
    // 葉子：葉柄(左) → 葉身到尖(右)，中肋
    leaf(w, h) {
      const p = SW / 2, cy = h / 2, stem = h * 0.4;
      const bladeL = p + stem;
      const d = 'M ' + bladeL + ' ' + cy + ' Q ' + ((bladeL + w) / 2) + ' ' + (cy - h * 0.44) + ' ' + (w - p) + ' ' + cy
        + ' Q ' + ((bladeL + w) / 2) + ' ' + (cy + h * 0.44) + ' ' + bladeL + ' ' + cy + ' Z';
      return svg(w, h,
        '<line x1="' + p + '" y1="' + cy + '" x2="' + bladeL + '" y2="' + cy + '" stroke="#5a8a3a" stroke-width="' + (SW + 1) + '"/>' +
        PATH(d, '#6bbf47') +
        '<line x1="' + bladeL + '" y1="' + cy + '" x2="' + (w - p) + '" y2="' + cy + '" stroke="#4e9a3a" stroke-width="2"/>');
    },
  };

  root.ObjectArt = {
    has(key) { return !!ART[key]; },
    draw(key, w, h) {
      const fn = ART[key] || ART.pencil;
      return fn(Math.max(8, w), h);
    },
  };
})(window);
