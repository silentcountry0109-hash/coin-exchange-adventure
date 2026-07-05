/* 量量看長度 — 純邏輯（測量、對齊零點、長度＝末端−起點）
 * lv1 對齊零點讀刻度（短物）｜lv2 量長物（同機制、較長）｜lv3 從刻度量（起點≠0，要用減的）
 * 瀏覽器 window.MeasureLogic / Node module.exports 共用，不碰 DOM。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MeasureLogic = factory();
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

  // 要量的物品（顏色用於長條；emoji 當右端頭）
  const OBJECTS = [
    { key: 'pencil', name: '鉛筆', emoji: '✏️', color: '#f0a832' },
    { key: 'crayon', name: '蠟筆', emoji: '🖍️', color: '#ef6a5a' },
    { key: 'spoon', name: '湯匙', emoji: '🥄', color: '#9bb0c9' },
    { key: 'leaf', name: '葉子', emoji: '🍃', color: '#58b368' },
    { key: 'fish', name: '小魚', emoji: '🐟', color: '#4a7cc9' },
    { key: 'carrot', name: '胡蘿蔔', emoji: '🥕', color: '#e8833a' },
    { key: 'caterpillar', name: '毛毛蟲', emoji: '🐛', color: '#7cb342' },
    { key: 'brush', name: '牙刷', emoji: '🪥', color: '#5ac8e0' },
    { key: 'ribbon', name: '緞帶', emoji: '🎀', color: '#e0709a' },
    { key: 'key', name: '鑰匙', emoji: '🗝️', color: '#c9a227' },
  ];

  // 尺最長 14 公分（手機一屏放得下），物品最長 ~12 公分
  function genMeasure(rng, lv, opts) {
    opts = opts || {};
    const obj = opts.obj || rng.pick(OBJECTS);
    if (lv === 1) {
      const length = opts.length || rng.int(3, 9);
      return { lv, obj, length, start: 0, end: length, rulerMax: 12, answer: length };
    }
    if (lv === 2) {
      const length = opts.length || rng.int(6, 12);
      return { lv, obj, length, start: 0, end: length, rulerMax: 14, answer: length };
    }
    // lv3：物品從刻度 start 開始（尺的 0 被蓋住），長度 = end − start
    const start = opts.start || rng.int(1, 4);
    const length = opts.length || rng.int(3, 9);
    const end = start + length;
    return { lv, obj, length, start, end, rulerMax: 14, answer: length };
  }

  // 一場 5 題：第 1 題較短，物品不連續重複
  function generateSession(lv, opts) {
    opts = opts || {};
    const rng = opts.rng || new Rng(opts.seed);
    const n = opts.count || 5;
    const out = [];
    let lastKey = null;
    for (let i = 0; i < n; i++) {
      let p, guard = 0;
      do {
        if (i === 0) p = genMeasure(rng, lv, { length: rng.int(3, 5) });
        else p = genMeasure(rng, lv);
        guard++;
      } while (p.obj.key === lastKey && guard < 30);
      lastKey = p.obj.key;
      out.push(p);
    }
    return out;
  }

  // 三個選項（含正解）。
  // lv3 的關鍵干擾＝直接讀末端刻度 end（沒有用減的）；lv1/2 用 ±1/±2。
  function makeOptions(p, rng) {
    rng = rng || new Rng();
    const ans = p.answer;
    let pool;
    if (p.lv === 3) {
      pool = [p.end, ans + 1, ans - 1, p.start, ans + 2];
    } else {
      pool = [ans + 1, ans - 1, ans + 2, ans - 2];
    }
    pool = pool.filter((v) => v >= 1 && v <= 20 && v !== ans);
    const uniq = [...new Set(pool)];
    const primary = p.lv === 3 ? uniq.filter((v) => v === p.end) : [];
    const rest = rng.shuffle(uniq.filter((v) => !primary.includes(v)));
    const picks = [...primary, ...rest].slice(0, 2);
    return rng.shuffle([ans, picks[0], picks[1]]);
  }

  // 點數公分格：1..length
  function unitSequence(length) {
    const seq = [];
    for (let i = 1; i <= length; i++) seq.push(i);
    return seq;
  }

  return {
    Rng, OBJECTS,
    genMeasure, generateSession, makeOptions, unitSequence,
  };
});
