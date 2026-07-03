/* 九九乘法星球 — 純遊戲邏輯（瀏覽器 window.Mul99Logic / Node module.exports 共用）
 * 一場＝一段口訣（d ∈ 2..9）5 題：排陣列×2 → 跳數填空 → 口訣快答×2。
 * 不碰 DOM，方便單元測試。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Mul99Logic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 可種子化亂數（mulberry32），與其他遊戲一致 ---------- */
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

  const SEGMENTS = [2, 3, 4, 5, 6, 7, 8, 9]; // 可選的口訣段

  // 中文口訣句：「三四十二」/「三七二十一」（積 < 10 用「得」：三一得三）
  const ZH_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  function zhNum(n) {
    if (n < 10) return ZH_DIGIT[n];
    const tens = Math.floor(n / 10), ones = n % 10;
    return (tens === 1 ? '十' : ZH_DIGIT[tens] + '十') + (ones ? ZH_DIGIT[ones] : '');
  }
  function chant(a, b) {
    const prod = a * b;
    if (prod < 10) return zhNum(a) + zhNum(b) + '得' + zhNum(prod);
    if (prod === 10) return zhNum(a) + zhNum(b) + '一十'; // 二五一十
    return zhNum(a) + zhNum(b) + zhNum(prod);
  }

  /* ---------- 出題 ---------- */
  // 排陣列：每排 a=d 個，排 b 排（3~5 排，拖曳量才不會累）
  function genBuild(rng, d, opts) {
    const bMin = (opts && opts.bMin) || 3;
    const bMax = (opts && opts.bMax) || 5;
    const b = rng.int(bMin, bMax);
    return { type: 'build', a: d, b, answer: d * b };
  }

  // 跳數填空：顯示 d 的前 6 個倍數，挖掉第 missIdx 個（0-based 2..4）
  function genGap(rng, d) {
    const missIdx = rng.int(2, 4);
    const seq = [];
    for (let i = 1; i <= 6; i++) seq.push(d * i);
    return { type: 'gap', a: d, count: 6, missIdx, seq, answer: d * (missIdx + 1) };
  }

  // 口訣快答：a=d、b 任意（可指定範圍拉難度）
  function genQuick(rng, d, opts) {
    const bMin = (opts && opts.bMin) || 2;
    const bMax = (opts && opts.bMax) || 9;
    const b = rng.int(bMin, bMax);
    return { type: 'quick', a: d, b, answer: d * b };
  }

  // 一場：排陣列×2（不同排數）→ 跳數填空 → 快答×2（第 5 題偏難、不同 b）
  function generateSession(d, opts) {
    opts = opts || {};
    if (SEGMENTS.indexOf(d) < 0) d = 3;
    const rng = opts.rng || new Rng(opts.seed);
    const p1 = genBuild(rng, d);
    let p2, guard = 0;
    do { p2 = genBuild(rng, d); } while (p2.b === p1.b && guard++ < 30);
    const p3 = genGap(rng, d);
    const p4 = genQuick(rng, d);
    let p5, g2 = 0;
    do { p5 = genQuick(rng, d, { bMin: 6, bMax: 9 }); } while (p5.b === p4.b && g2++ < 30);
    return [p1, p2, p3, p4, p5];
  }

  // 混合挑戰：5 段各出一題（段落洗牌保證多樣），直接考背誦
  function generateMixSession(opts) {
    opts = opts || {};
    const rng = opts.rng || new Rng(opts.seed);
    const segs = rng.shuffle(SEGMENTS.slice()).slice(0, 5);
    return segs.map((d) => {
      const b = rng.int(2, 9);
      return { type: 'recite', a: d, b, answer: d * b };
    });
  }

  // 三個選項：干擾項首選「背錯一句」（±d，相鄰倍數），再補 ±1
  function makeOptions(p, rng) {
    rng = rng || new Rng();
    const ans = p.answer, d = p.a;
    const pool = [ans - d, ans + d, ans - 1, ans + 1, ans + d * 2, ans - d * 2]
      .filter((v) => v >= 1 && v <= 99 && v !== ans);
    const uniq = [...new Set(pool)];
    // 保留前兩個「相鄰倍數」優先，其餘洗牌備援
    const primary = uniq.slice(0, 2);
    const backup = rng.shuffle(uniq.slice(2));
    const picks = [...primary, ...backup].slice(0, 2);
    return rng.shuffle([ans, picks[0], picks[1]]);
  }

  // 跳數序列（點第 i 排跳出的數字）：d, 2d, ..., bd
  function skipSequence(d, b) {
    const seq = [];
    for (let i = 1; i <= b; i++) seq.push(d * i);
    return seq;
  }

  return {
    Rng, SEGMENTS, zhNum, chant,
    genBuild, genGap, genQuick, generateSession, generateMixSession,
    makeOptions, skipSequence,
  };
});
