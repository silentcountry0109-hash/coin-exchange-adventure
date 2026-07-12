/* ============================================================
   周長 — 邏輯模組（純函式，Node 測試與瀏覽器共用）
   圖形＝格線直角多邊形（邊都是水平/垂直、整數格長）。
   頂點順時針排列（y 向下）；周長＝繞一圈邊長總和。
   lv1 螞蟻數格子（長方形/正方形，逐格數）
   lv2 邊長加加看（L/凸/凹/十字形，邊長相加）
   lv3 誰的周長比較長（兩形比總長）
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PerimeterLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- 可播種的隨機數（mulberry32） ---------------- */
  class Rng {
    constructor(seed) {
      this.s = (seed == null ? Math.floor(Math.random() * 2 ** 31) : seed) >>> 0;
    }
    next() {
      let t = (this.s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    int(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); }
    pick(arr) { return arr[this.int(0, arr.length - 1)]; }
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = this.int(0, i);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
  }

  /* ---------------- 直角多邊形工具 ---------------- */
  // 由頂點串（封閉）取邊：每條邊都是純水平或純垂直
  function edgesOf(verts) {
    const out = [];
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i], b = verts[(i + 1) % verts.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      out.push({ a, b, dx, dy, len: Math.abs(dx) + Math.abs(dy), dir: dx !== 0 ? 'h' : 'v' });
    }
    return out;
  }
  function perimeterOf(verts) { return edgesOf(verts).reduce((s, e) => s + e.len, 0); }
  function areaOf(verts) {
    let s = 0;
    for (let i = 0; i < verts.length; i++) {
      const [x1, y1] = verts[i], [x2, y2] = verts[(i + 1) % verts.length];
      s += x1 * y2 - x2 * y1;
    }
    return Math.abs(s) / 2;
  }
  function bboxOf(verts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of verts) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }
  // 平移到左上角原點
  function normVerts(verts) {
    const bb = bboxOf(verts);
    return verts.map(([x, y]) => [x - bb.minX, y - bb.minY]);
  }
  // 驗證：邊交替水平/垂直、封閉、無零長邊
  function isValidRectilinear(verts) {
    const e = edgesOf(verts);
    if (e.length < 4) return false;
    for (let i = 0; i < e.length; i++) {
      if (e[i].len <= 0) return false;
      if (e[i].dir === e[(i + 1) % e.length].dir) return false; // 相鄰邊不可同方向
    }
    return true;
  }

  /* ---------------- 圖形模板（頂點順時針，y 向下） ---------------- */
  function rect(w, h) { return [[0, 0], [w, 0], [w, h], [0, h]]; }
  // 右上角挖掉 a×b 的 L 形（周長＝2(w+h)）
  function lshape(w, h, a, b) {
    return [[0, 0], [w - a, 0], [w - a, b], [w, b], [w, h], [0, h]];
  }
  // 上緣中段凸出 bw×bh 的凸形（周長＝2(w+h)+2bh）
  function bump(w, h, ox, bw, bh) {
    return [[0, 0], [ox, 0], [ox, -bh], [ox + bw, -bh], [ox + bw, 0], [w, 0], [w, h], [0, h]];
  }
  // 上緣中段凹進 nw×nd 的凹形（周長＝2(w+h)+2nd）
  function notch(w, h, ox, nw, nd) {
    return [[0, 0], [ox, 0], [ox, nd], [ox + nw, nd], [ox + nw, 0], [w, 0], [w, h], [0, h]];
  }
  // 十字/加號：中央 w×h 直條與橫條交叉（用外框列點）
  function plus(a, arm) {
    // a＝中央方塊邊、arm＝四臂長；總跨度 a+2arm
    const m = arm, n = arm + a;
    return [
      [m, 0], [n, 0], [n, m], [n + m, m], [n + m, n], [n, n],
      [n, n + m], [m, n + m], [m, n], [0, n], [0, m], [m, m],
    ];
  }
  // 階梯（兩階）
  function stairs(w, h, s) {
    return [[0, 0], [w, 0], [w, h], [w - s, h], [w - s, h + s], [0, h + s]];
  }

  /* ---------------- 出題：lv1 長方形數格子 ---------------- */
  function genRect(rng, opts) {
    opts = opts || {};
    let w, h;
    if (opts.warm) { w = rng.int(2, 4); h = rng.int(2, 4); }
    else { w = rng.int(2, 7); h = rng.int(2, 7); }
    const verts = normVerts(rect(w, h));
    const perimeter = perimeterOf(verts);
    return {
      type: 'count', kind: 'rect', verts, w, h,
      perimeter, area: areaOf(verts),
      answer: perimeter, options: makePerimOptions(perimeter, areaOf(verts), rng),
    };
  }

  /* ---------------- 出題：lv2 邊長相加（複雜直角形） ---------------- */
  const POLY_MAKERS = [
    (rng) => lshape(rng.int(4, 6), rng.int(4, 6), rng.int(1, 2), rng.int(1, 2)),
    (rng) => {                                   // 凸形：凸出物嚴格落在上緣中段
      const bw = rng.int(1, 2), w = rng.int(bw + 3, 7);
      return bump(w, rng.int(3, 5), rng.int(1, w - bw - 1), bw, rng.int(1, 2));
    },
    (rng) => {                                   // 凹形：缺口嚴格落在上緣中段、深度 < 高
      const nw = rng.int(1, 2), w = rng.int(nw + 3, 7), h = rng.int(3, 5);
      return notch(w, h, rng.int(1, w - nw - 1), nw, rng.int(1, Math.min(2, h - 1)));
    },
    (rng) => plus(rng.int(1, 2), rng.int(1, 2)),
    (rng) => stairs(rng.int(3, 5), rng.int(2, 3), rng.int(1, 2)),
  ];
  function genPoly(rng, opts) {
    opts = opts || {};
    let verts, tries = 0;
    do {
      const mk = opts.maker || rng.pick(POLY_MAKERS);
      verts = normVerts(mk(rng));
      tries++;
    } while ((!isValidRectilinear(verts) || perimeterOf(verts) < 8) && tries < 40);
    const perimeter = perimeterOf(verts);
    const edges = edgesOf(verts);
    return {
      type: 'add', kind: 'poly', verts,
      sides: edges.map((e) => e.len),
      perimeter, area: areaOf(verts),
      answer: perimeter, options: makePerimOptions(perimeter, areaOf(verts), rng, edges.map((e) => e.len)),
    };
  }

  /* ---------------- 出題：lv3 比周長 ---------------- */
  function genCompare(rng, opts) {
    opts = opts || {};
    let s1, s2, tries = 0;
    do {
      s1 = shapeAny(rng);
      s2 = shapeAny(rng);
      tries++;
    } while (s1.perimeter === s2.perimeter && tries < 40);
    if (s1.perimeter === s2.perimeter) s2.perimeter += 2; // 保底不同（理論上到不了）
    // key 依「位置」定：A＝左、B＝右（先隨機決定哪個形放左/右，再按位置給 key）
    const ord = rng.shuffle([s1, s2]);
    const shapes = [
      { key: 'A', verts: ord[0].verts, perimeter: ord[0].perimeter, area: ord[0].area },
      { key: 'B', verts: ord[1].verts, perimeter: ord[1].perimeter, area: ord[1].area },
    ];
    const winner = shapes[0].perimeter > shapes[1].perimeter ? 'A' : 'B';
    return { type: 'compare', shapes, answer: winner, options: makeCompareOptions(winner, rng) };
  }
  function shapeAny(rng) {
    const verts = normVerts(rng.next() < 0.4 ? rect(rng.int(2, 6), rng.int(2, 6)) : rng.pick(POLY_MAKERS)(rng));
    return { verts, perimeter: perimeterOf(verts), area: areaOf(verts) };
  }

  /* ---------------- 選項 ---------------- */
  // 周長數字選項：正解＋面積干擾（混淆周長/面積）＋漏一邊干擾＋±2
  function makePerimOptions(perimeter, area, rng, sides) {
    const set = new Set([perimeter]);
    const cand = [];
    if (area !== perimeter && area >= 1) cand.push(area);            // 面積混淆
    if (sides && sides.length) cand.push(perimeter - rng.pick(sides)); // 漏一邊
    cand.push(perimeter + 2, perimeter - 2, perimeter + 1, perimeter - 1);
    for (const c of rng.shuffle(cand)) {
      if (set.size >= 3) break;
      if (c >= 1 && !set.has(c)) set.add(c);
    }
    let extra = perimeter + 3;
    while (set.size < 3) { if (extra >= 1) set.add(extra); extra++; }
    return rng.shuffle(Array.from(set));
  }
  function makeCompareOptions(winner, rng) {
    // winner ∈ {A,B}；選項＝A/B/一樣長（此題不會一樣長，但當干擾）
    return rng.shuffle([
      { key: 'A', label: '左邊' },
      { key: 'B', label: '右邊' },
      { key: 'same', label: '一樣長' },
    ]);
  }

  /* ---------------- 一場 5 題 ---------------- */
  function generateSession(lv, opts) {
    const rng = (opts && opts.rng) || new Rng();
    const out = [];
    const seen = new Set();
    const keyOf = (q) => q.type === 'compare'
      ? q.shapes.map((s) => s.verts.length + ':' + s.perimeter).join('|')
      : q.kind + ':' + q.verts.map((v) => v.join(',')).join(';');

    if (lv === 1) {
      const specs = [{ warm: true }, {}, {}, {}, {}];
      for (const sp of specs) {
        let q, guard = 0;
        do { q = genRect(rng, sp); guard++; } while (seen.has(keyOf(q)) && guard < 40);
        seen.add(keyOf(q)); out.push(q);
      }
    } else if (lv === 2) {
      // 前 4 題輪不同模板，第 5 題隨機
      const order = rng.shuffle([0, 1, 2, 3, 4]);
      for (let i = 0; i < 5; i++) {
        const maker = POLY_MAKERS[i < 4 ? order[i] : rng.int(0, 4)];
        let q, guard = 0;
        do { q = genPoly(rng, { maker }); guard++; } while (seen.has(keyOf(q)) && guard < 40);
        seen.add(keyOf(q)); out.push(q);
      }
    } else {
      for (let i = 0; i < 5; i++) {
        let q, guard = 0;
        do { q = genCompare(rng); guard++; } while (seen.has(keyOf(q)) && guard < 40);
        seen.add(keyOf(q)); out.push(q);
      }
    }
    return out;
  }

  return {
    Rng, edgesOf, perimeterOf, areaOf, bboxOf, normVerts, isValidRectilinear,
    rect, lshape, bump, notch, plus, stairs, POLY_MAKERS,
    genRect, genPoly, genCompare, makePerimOptions, makeCompareOptions, generateSession,
  };
});
