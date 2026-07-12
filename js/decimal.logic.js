/* ============================================================
   一位小數 — 邏輯模組（純函式，Node 測試與瀏覽器共用）
   量杯：1 杯＝1 公升＝10 小格，每格＝0.1。內部一律用「十分之一格數 T」整數表示。
   lv1 讀小數（認識十分之一，含 1 又幾）
   lv2 數線找家（把青蛙跳到指定小數）
   lv3 小數加法（兩杯相倒、滿十格換一瓶＝進位）
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DecimalLogic = factory();
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

  /* ---------------- 十分之一格數 ↔ 顯示 ---------------- */
  // T 是「幾個 0.1」。format(7)="0.7"、format(13)="1.3"、format(10)="1.0"
  function format(T) {
    const whole = Math.floor(T / 10);
    const tenth = T % 10;
    return whole + '.' + tenth;
  }
  const wholeOf = (T) => Math.floor(T / 10);
  const tenthOf = (T) => T % 10;

  /* ---------------- lv1 讀小數 ---------------- */
  // 回傳 { type:'read', T, whole, tenth, answer, options }
  function genRead(rng, opts) {
    opts = opts || {};
    let T;
    if (opts.warm) {
      T = rng.int(2, 5);                 // 暖身：純十分之幾、不太多格
    } else if (opts.overOne) {
      T = rng.int(11, 19);               // 一整杯又幾格（tenth 一定非 0）
    } else {
      T = rng.int(1, 9);                 // 純十分之幾
    }
    return {
      type: 'read', T, whole: wholeOf(T), tenth: tenthOf(T),
      answer: format(T), options: makeReadOptions(T, rng),
    };
  }

  // 讀數選項（字串）；干擾＝忘小數點(7)、忘整數(0.3)、差 0.1
  function makeReadOptions(T, rng) {
    const correct = format(T);
    const set = new Set([correct]);
    const cand = [];
    if (T < 10) cand.push(String(T));           // 忘了小數點：0.7 → 7（最經典）
    if (T >= 10) cand.push(format(T % 10));      // 忘了那一整杯：1.3 → 0.3
    cand.push(format(T + 1));
    if (T - 1 >= 1) cand.push(format(T - 1));
    if (T >= 10) cand.push(format((T % 10) === 0 ? T + 2 : (T % 10)));
    for (const c of rng.shuffle(cand)) {
      if (set.size >= 3) break;
      if (!set.has(c)) set.add(c);
    }
    let extra = T + 2;
    while (set.size < 3) { set.add(format(extra)); extra++; }
    return rng.shuffle(Array.from(set));
  }

  /* ---------------- lv2 數線找家 ---------------- */
  // 回傳 { type:'place', T, lineMax(格數), answer }
  function genPlace(rng, opts) {
    opts = opts || {};
    const lineMax = opts.big ? 20 : 10;         // 0..2 或 0..1
    // 目標為非整數格（tenth≠0），落在線內、避開兩端
    let T;
    do {
      T = rng.int(1, lineMax - 1);
    } while (T % 10 === 0);
    return { type: 'place', T, lineMax, answer: format(T) };
  }

  /* ---------------- lv3 小數加法（進位） ---------------- */
  // 回傳 { type:'add', a, b, sum, carry, answer, options }
  function genAdd(rng, opts) {
    opts = opts || {};
    let a, b;
    if (opts.warm) {
      // 暖身：不進位
      do { a = rng.int(1, 8); b = rng.int(1, 9 - a); } while (a + b > 9 || a + b < 3);
    } else if (opts.exact) {
      // 剛好湊成一整瓶（和＝10）
      a = rng.int(1, 9); b = 10 - a;
    } else {
      // 進位：和 11..18
      a = rng.int(2, 9);
      const lo = Math.max(2, 11 - a), hi = 9;
      b = rng.int(lo, hi);
    }
    const sum = a + b;
    return {
      type: 'add', a, b, sum, carry: sum >= 10,
      answer: format(sum), options: makeAddOptions(a, b, rng),
    };
  }

  // 加法選項；干擾＝忘進位只看剩下的格、差 0.1/0.2
  function makeAddOptions(a, b, rng) {
    const sum = a + b;
    const correct = format(sum);
    const set = new Set([correct]);
    const cand = [];
    if (sum >= 10) cand.push(format(sum - 10));   // 忘了換來的那一瓶：1.2 → 0.2
    cand.push(format(sum + 1));
    if (sum - 1 >= 1) cand.push(format(sum - 1));
    if (sum - 2 >= 1) cand.push(format(sum - 2));
    cand.push(format(sum + 2));
    for (const c of rng.shuffle(cand)) {
      if (set.size >= 3) break;
      if (!set.has(c)) set.add(c);
    }
    let extra = sum + 3;
    while (set.size < 3) { set.add(format(extra)); extra++; }
    return rng.shuffle(Array.from(set));
  }

  /* ---------------- 一場 5 題 ---------------- */
  function generateSession(lv, opts) {
    const rng = (opts && opts.rng) || new Rng();
    const out = [];
    const seen = new Set();
    const push = (q, key) => {
      let guard = 0;
      while (seen.has(key(q)) && guard++ < 40) q = q.regen();
      seen.add(key(q));
      delete q.regen;
      out.push(q);
    };

    if (lv === 1) {
      const specs = [{ warm: true }, {}, {}, { overOne: true }, { overOne: true }];
      for (const sp of specs) {
        let q; let guard = 0;
        do { q = genRead(rng, sp); guard++; } while (seen.has(q.T) && guard < 40);
        seen.add(q.T); out.push(q);
      }
    } else if (lv === 2) {
      const specs = [{}, {}, { big: true }, { big: true }, { big: true }];
      for (const sp of specs) {
        let q; let guard = 0;
        do { q = genPlace(rng, sp); guard++; } while (seen.has(q.lineMax + ':' + q.T) && guard < 40);
        seen.add(q.lineMax + ':' + q.T); out.push(q);
      }
    } else {
      const specs = [{ warm: true }, {}, { exact: true }, {}, {}];
      for (const sp of specs) {
        let q; let guard = 0;
        do { q = genAdd(rng, sp); guard++; } while (seen.has(q.a + '+' + q.b) && guard < 40);
        seen.add(q.a + '+' + q.b); out.push(q);
      }
    }
    return out;
  }

  return {
    Rng, format, wholeOf, tenthOf,
    genRead, makeReadOptions,
    genPlace,
    genAdd, makeAddOptions,
    generateSession,
  };
});
