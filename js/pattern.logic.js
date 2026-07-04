/* 小鳥過河 — 等差數列（找規律）純邏輯
 * 石頭排成數線、間距相等；每次跳的「公差」固定，可增可減、間隔不同。
 * lv1 找下一顆（遞增、小公差）｜lv2 補中間（增減都有）｜lv3 看間隔＋預測（大公差）
 * 瀏覽器 window.PatternLogic / Node module.exports 共用，不碰 DOM。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PatternLogic = factory();
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

  const LEN = 5; // 一條河 5 顆石頭

  function stepsFor(lv) {
    if (lv === 1) return [1, 2, 5, 10];
    if (lv === 2) return [2, 3, 4, 5, 10];
    return [2, 3, 4, 6, 10]; // lv3
  }

  // 生一條等差數列：start、step、dir(+1/-1)、terms[]、missingIndex、answer、askDiff
  function genPattern(rng, lv, opts) {
    opts = opts || {};
    const steps = stepsFor(lv);
    const step = opts.step || rng.pick(steps);
    // lv1 只遞增（最溫和）；lv2/3 增減都有
    const increasing = lv === 1 ? true : (opts.increasing != null ? opts.increasing : rng.pick([true, false]));
    const dir = increasing ? 1 : -1;
    const span = (LEN - 1) * step;
    const maxTerm = lv === 1 ? 60 : 99;

    let start;
    if (increasing) {
      // 所有項落在 [1, maxTerm]
      start = rng.int(1, maxTerm - span);
    } else {
      // 遞減：最小項 = start - span ≥ 0
      start = rng.int(span, maxTerm);
    }
    const terms = [];
    for (let i = 0; i < LEN; i++) terms.push(start + dir * step * i);

    let missing;
    if (lv === 1) missing = LEN - 1;                 // 預測下一顆（最後一顆）
    else if (lv === 2) missing = rng.int(1, LEN - 2); // 中間某一顆（1~3）
    else missing = LEN - 1;                            // lv3 預測最後 + 先問公差

    return {
      lv, step, dir, increasing,
      start, length: LEN, terms,
      missingIndex: missing,
      answer: terms[missing],
      askDiff: lv === 3,
    };
  }

  // 一場 5 題：第 1 題較易（遞增、小公差），題目不重複
  function generateSession(lv, opts) {
    opts = opts || {};
    const rng = opts.rng || new Rng(opts.seed);
    const n = opts.count || 5;
    const out = [];
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      let p, guard = 0;
      do {
        if (i === 0) p = genPattern(rng, lv, { increasing: true, step: rng.pick(lv === 1 ? [1, 2] : [2, 3]) });
        else p = genPattern(rng, lv);
        guard++;
      } while (seen.has(p.terms.join(',')) && guard < 60);
      seen.add(p.terms.join(','));
      out.push(p);
    }
    return out;
  }

  // 缺項的三個選項：優先「差一跳」（±step，最典型的錯誤），再補 ±1 / ±2step
  function makeOptions(p, rng) {
    rng = rng || new Rng();
    const ans = p.answer, s = p.step;
    const primary = [ans + s, ans - s].filter((v) => v >= 0 && v <= 99 && v !== ans);
    const extra = [ans + 1, ans - 1, ans + 2 * s, ans - 2 * s]
      .filter((v) => v >= 0 && v <= 99 && v !== ans && !primary.includes(v));
    const pool = [...primary, ...rng.shuffle([...new Set(extra)])];
    const picks = [...new Set(pool)].slice(0, 2);
    return rng.shuffle([ans, picks[0], picks[1]]);
  }

  // 公差問題（lv3）的三個選項：正解 step，干擾 ±1/±2…
  // 候選補到 ±6，保證即使 step 很大也一定湊得到兩個相異干擾值（防未來擴充 step）
  function makeDiffOptions(p, rng) {
    rng = rng || new Rng();
    const s = p.step;
    const cand = [s + 1, s - 1, s + 2, s - 2, s + 3, s - 3, s + 4, s + 5, s + 6]
      .filter((v) => v >= 1 && v !== s);
    const uniq = rng.shuffle([...new Set(cand)]);
    return rng.shuffle([s, uniq[0], uniq[1]]);
  }

  return {
    Rng, LEN, stepsFor,
    genPattern, generateSession, makeOptions, makeDiffOptions,
  };
});
