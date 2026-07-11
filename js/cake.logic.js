/* 平分蛋糕 — 純邏輯（平分概念與分數初步）
 * lv1 公平切蛋糕（過圓心才平分）｜lv2 幾分之一（1/n）｜lv3 誰的比較大（1/a vs 1/b）
 * 瀏覽器 window.CakeLogic / Node module.exports 共用，不碰 DOM。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CakeLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  class Rng {
    constructor(seed) {
      this.seed = (seed == null ? (Math.floor(Math.random() * 2 ** 31)) : seed) >>> 0;
      this.next = mulberry32(this.seed);
    }
    int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
    pick(arr) { return arr[this.int(0, arr.length - 1)]; }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.int(0, i);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
  }

  // 拿蛋糕的小夥伴（對應 assets）
  const FRIENDS = [
    { key: 'bird', name: '小鳥', img: 'deco_bird.png' },
    { key: 'hedgehog', name: '刺蝟', img: 'deco_hedgehog.png' },
    { key: 'mammoth', name: '長毛象', img: 'deco_news_mammoth.png' },
    { key: 'astro', name: '太空人', img: 'deco_location_people.png' },
  ];

  // 蛋糕口味（顏色主題，main 端畫）
  const FLAVORS = [
    { key: 'strawberry', name: '草莓蛋糕', body: '#f7c6d9', top: '#f76d8e' },
    { key: 'chocolate', name: '巧克力蛋糕', body: '#c89162', top: '#8a5a2b' },
    { key: 'matcha', name: '抹茶蛋糕', body: '#cfe3b8', top: '#7cb356' },
    { key: 'lemon', name: '檸檬蛋糕', body: '#fbe8a8', top: '#f0b429' },
    { key: 'blueberry', name: '藍莓蛋糕', body: '#cdd8f2', top: '#6f8fd6' },
  ];

  /* ---------- lv1 公平切蛋糕 ----------
   * n ∈ {2,4}（4 份＝兩刀）。每一刀給 3 條候選切線：
   *   correct：過圓心；wrong：offset（平移弦）或 skew（過圓心但錯角度，只在第二刀）
   * 角度單位＝度。第二刀 correct＝第一刀 +90°；skew＝第一刀 +45°（四塊兩大兩小）。 */
  function genFair(rng, opts) {
    opts = opts || {};
    const n = opts.n || rng.pick([2, 2, 4]);
    const baseAngle = rng.pick([0, 30, 60, 90, 120, 150]);
    const cuts = [];
    // 第一刀
    cuts.push({
      correct: { angle: baseAngle, offset: 0 },
      wrongs: [
        { angle: baseAngle, offset: 0.38, kind: 'offset' },
        { angle: (baseAngle + rng.pick([20, 340])) % 360 % 180, offset: -0.34, kind: 'offset' },
      ],
    });
    if (n === 4) {
      cuts.push({
        correct: { angle: (baseAngle + 90) % 180, offset: 0 },
        wrongs: [
          { angle: (baseAngle + 45) % 180, offset: 0, kind: 'skew' }, // 過圓心但 45°→兩大兩小
          { angle: (baseAngle + 90) % 180, offset: 0.36, kind: 'offset' },
        ],
      });
    }
    return { lv: 1, type: 'fair', n, flavor: opts.flavor || rng.pick(FLAVORS), cuts };
  }

  /* ---------- lv2 幾分之一 ---------- */
  const UNIT_NS = [2, 3, 4, 6, 8];
  function genUnit(rng, opts) {
    opts = opts || {};
    const n = opts.n || rng.pick(UNIT_NS);
    const friend = opts.friend || rng.pick(FRIENDS);
    return { lv: 2, type: 'unit', n, friend, flavor: opts.flavor || rng.pick(FLAVORS), answer: '1/' + n };
  }

  /* ---------- lv3 誰的比較大 ---------- */
  function genCompare(rng, opts) {
    opts = opts || {};
    let a, b, guard = 0;
    do {
      a = opts.a || rng.pick(UNIT_NS);
      b = opts.b || rng.pick(UNIT_NS);
      guard++;
    } while (a === b && guard < 40);
    if (a === b) { a = 2; b = 8; }
    // 洗牌兩位夥伴
    const fs = rng.shuffle(FRIENDS.slice()).slice(0, 2);
    // answer：份數少的那份比較大
    const winner = a < b ? 0 : 1;
    return {
      lv: 3, type: 'compare',
      parts: [a, b], friends: fs, winner,
      flavor: opts.flavor || rng.pick(FLAVORS),
      answer: fs[winner].key,
    };
  }

  /* ---------- 一場 5 題 ---------- */
  function generateSession(lv, opts) {
    opts = opts || {};
    const rng = opts.rng || new Rng(opts.seed);
    const out = [];
    const seen = new Set();
    for (let i = 0; i < 5; i++) {
      let p, guard = 0;
      do {
        if (lv === 1) p = genFair(rng, { n: i < 2 ? 2 : 4 });        // 先 2 份再 4 份
        else if (lv === 2) p = genUnit(rng, i === 0 ? { n: 2 } : {}); // 先 1/2 暖身
        else p = genCompare(rng, i === 0 ? { a: 2, b: 8 } : {});      // 先差最大的
        guard++;
      } while (seen.has(keyOf(p)) && guard < 60);
      seen.add(keyOf(p));
      out.push(p);
    }
    return out;
  }
  function keyOf(p) {
    if (p.type === 'fair') return 'f' + p.n + ':' + p.cuts[0].correct.angle;
    if (p.type === 'unit') return 'u' + p.n;
    return 'c' + Math.min(...p.parts) + '-' + Math.max(...p.parts);
  }

  /* ---------- 選項 ---------- */
  // lv2：分數三選一（字串 '1/n'），干擾＝鄰近份數
  function makeUnitOptions(p, rng) {
    rng = rng || new Rng();
    const pool = UNIT_NS.filter((x) => x !== p.n);
    const picks = rng.shuffle(pool).slice(0, 2).map((x) => '1/' + x);
    return rng.shuffle(['1/' + p.n, picks[0], picks[1]]);
  }
  // lv3：兩位夥伴＋「一樣大」
  function makeCompareOptions(p, rng) {
    rng = rng || new Rng();
    const opts = [
      { key: p.friends[0].key, label: p.friends[0].name },
      { key: p.friends[1].key, label: p.friends[1].name },
      { key: 'same', label: '一樣大' },
    ];
    return rng.shuffle(opts);
  }

  return {
    Rng, FRIENDS, FLAVORS, UNIT_NS,
    genFair, genUnit, genCompare, generateSession,
    makeUnitOptions, makeCompareOptions,
  };
});
