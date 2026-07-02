/* 湊十小火車 — 純遊戲邏輯（瀏覽器 window.TrainLogic / Node module.exports 共用）
 * 出題、湊十拆解、上車裁決、答案選項。不碰 DOM，方便單元測試。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TrainLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 可種子化亂數（mulberry32），測試可重現 ---------- */
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

  const CAPS = { lv1: 5, lv2: 10, lv3: 10 };

  /* ---------- 題目建構 ----------
   * 共同欄位：lv / a（已坐）/ b / cap（座位數）/ pool（月台隻數）/
   *           need（要再上車幾隻才坐滿）/ answer（三選一的正解）
   * Lv3 另有 leftover（湊滿 10 後月台剩幾隻）＝ a+b−10 */
  function lv1Problem(a) {
    return { lv: 'lv1', a, b: 5 - a, cap: 5, pool: 5, need: 5 - a, answer: 5 - a };
  }
  function lv2Problem(a) {
    return { lv: 'lv2', a, b: 10 - a, cap: 10, pool: 10, need: 10 - a, answer: 10 - a };
  }
  function lv3Problem(a, b) {
    return { lv: 'lv3', a, b, cap: 10, pool: b, need: 10 - a, leftover: a + b - 10, answer: a + b };
  }

  /* ---------- 出題 ----------
   * easy=true 是每場第 1 題的暖身：need ≤ 2（拖 1~2 隻就坐滿） */
  function genLv1(rng, opts) {
    const easy = !!(opts && opts.easy);
    return lv1Problem(easy ? rng.int(3, 4) : rng.int(1, 4));
  }
  function genLv2(rng, opts) {
    const easy = !!(opts && opts.easy);
    return lv2Problem(easy ? rng.int(8, 9) : rng.int(1, 9));
  }
  // Lv3 湊十法：a∈6..9、b∈2..9、a+b∈11..18（b 下限 11−a 保證要進位）
  function genLv3(rng, opts) {
    const easy = !!(opts && opts.easy);
    const a = easy ? rng.int(8, 9) : rng.int(6, 9);
    const b = rng.int(Math.max(2, 11 - a), 9);
    return lv3Problem(a, b);
  }

  /* ---------- 一場 5 題：第 1 題較易、題目不重複 ----------
   * Lv1 特例：a 只有 1..4 共 4 種，5 題「完全不重複」在數學上不可能。
   * 改為：前 4 題涵蓋全部 4 種（第 1 題取 a≥3 較易），
   * 第 5 題避開與第 4 題相同 → 保證沒有相鄰重複。 */
  function keyOf(p) { return p.lv === 'lv3' ? (p.a + '+' + p.b) : String(p.a); }

  function generateSession(lv, opts) {
    opts = opts || {};
    const rng = opts.rng || new Rng(opts.seed);
    const n = opts.count || 5;

    if (lv === 'lv1') {
      const first = rng.int(3, 4);
      const rest = rng.shuffle([1, 2, 3, 4].filter((v) => v !== first));
      const seq = [first].concat(rest);
      const fifthPool = [1, 2, 3, 4].filter((v) => v !== seq[seq.length - 1]);
      seq.push(rng.pick(fifthPool));
      return seq.slice(0, n).map(lv1Problem);
    }

    const problems = [];
    const used = new Set();
    for (let i = 0; i < n; i++) {
      let p, guard = 0;
      do {
        p = lv === 'lv3' ? genLv3(rng, { easy: i === 0 }) : genLv2(rng, { easy: i === 0 });
        guard++;
      } while (used.has(keyOf(p)) && guard < 200);
      used.add(keyOf(p));
      problems.push(p);
    }
    return problems;
  }

  /* ---------- 三個答案選項（含正解），干擾項 ±1、±2 ---------- */
  function makeOptions(p, rng) {
    rng = rng || new Rng();
    const ans = p.answer;
    const max = p.lv === 'lv3' ? 20 : p.cap;
    const pool = [ans + 1, ans - 1, ans + 2, ans - 2]
      .filter((v) => v >= 1 && v <= max && v !== ans);
    const uniq = [...new Set(pool)];
    rng.shuffle(uniq);
    return rng.shuffle([ans, uniq[0], uniq[1]]);
  }

  /* ---------- 上車裁決：坐滿就不能再擠 ---------- */
  function boardVerdict(filled, cap) {
    if (filled >= cap) return { ok: false, reason: 'full' };
    return { ok: true };
  }

  /* ---------- Lv3 湊十拆解（點數計畫）：整節車廂算 10，月台剩的逐隻算 1 ---------- */
  function tenSplit(p) {
    return { toFill: 10 - p.a, leftover: p.a + p.b - 10 };
  }

  return {
    Rng, CAPS,
    lv1Problem, lv2Problem, lv3Problem,
    genLv1, genLv2, genLv3,
    generateSession, makeOptions, boardVerdict, tenSplit,
  };
});
