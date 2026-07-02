/* 換錢大冒險 — 純遊戲邏輯（瀏覽器 window.GameLogic / Node module.exports 共用）
 * 出題、進退位判斷、換錢驗證、計數序列。不碰 DOM，方便單元測試。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GameLogic = factory();
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

  const tensOf = (n) => Math.floor(n / 10);
  const onesOf = (n) => n % 10;

  /* ---------- 出題 ---------- */
  // 加法：a 為二位數，b ≥ 3（可一位或二位），和 ≤ maxResult ≤ 99
  // carry=true 時保證個位相加 ≥ 10（需要進位）
  function genAdd(rng, opts) {
    const carry = !!(opts && opts.carry);
    const maxResult = Math.min((opts && opts.maxResult) || 99, 99);
    for (let tries = 0; tries < 800; tries++) {
      const a = rng.int(11, Math.min(88, maxResult - 3));
      const bMax = maxResult - a;
      if (bMax < 3) continue;
      const b = rng.int(3, Math.min(88, bMax));
      const sum = a + b;
      const isCarry = onesOf(a) + onesOf(b) >= 10;
      if (carry !== isCarry) continue;
      if (carry && (onesOf(a) === 0 || onesOf(b) === 0)) continue; // 兩邊都要有個位才有換錢感
      if (!carry && onesOf(b) === 0 && tensOf(b) === 0) continue;  // 避免 +0
      return { op: 'add', a, b, answer: sum, exchange: isCarry };
    }
    return carry
      ? { op: 'add', a: 27, b: 15, answer: 42, exchange: true }
      : { op: 'add', a: 23, b: 14, answer: 37, exchange: false };
  }

  // 減法：a 為二位數（≥21 保持二位數感），b ≥ 3，差 ≥ 1
  // borrow=true 時保證個位不夠減（需要退位換錢）
  function genSub(rng, opts) {
    const borrow = !!(opts && opts.borrow);
    const maxA = Math.min((opts && opts.maxA) || 99, 99);
    for (let tries = 0; tries < 800; tries++) {
      const a = rng.int(21, maxA);
      const b = rng.int(3, a - 1);
      const diff = a - b;
      if (diff < 1) continue;
      const isBorrow = onesOf(a) < onesOf(b);
      if (borrow !== isBorrow) continue;
      if (borrow && onesOf(b) === 0) continue; // 不可能，保險
      if (!borrow && onesOf(b) === 0 && tensOf(b) === 0) continue;
      return { op: 'sub', a, b, answer: diff, exchange: isBorrow };
    }
    return borrow
      ? { op: 'sub', a: 32, b: 15, answer: 17, exchange: true }
      : { op: 'sub', a: 38, b: 12, answer: 26, exchange: false };
  }

  // 一場 5 題：第 1 題暖身（不進退位），之後都需要換錢；前段數字較小
  function generateSession(mode, opts) {
    opts = opts || {};
    const rng = opts.rng || new Rng(opts.seed);
    const n = opts.count || 5;
    const problems = [];
    const used = new Set();
    const firstOp = mode === 'mix' ? rng.pick(['add', 'sub']) : mode;
    for (let i = 0; i < n; i++) {
      let op = mode === 'mix' ? (i % 2 === 0 ? firstOp : (firstOp === 'add' ? 'sub' : 'add')) : mode;
      const hard = i > 0;
      const size = i < 2 ? 59 : 99;
      let p, guard = 0;
      do {
        p = op === 'add'
          ? genAdd(rng, { carry: hard, maxResult: size })
          : genSub(rng, { borrow: hard, maxA: size });
        guard++;
      } while (used.has(p.a + p.op + '' + p.b) && guard < 60);
      used.add(p.a + p.op + '' + p.b);
      problems.push(p);
    }
    return problems;
  }

  // 三個答案選項（含正解），干擾項是常見錯誤：±1、±10、忘記進退位
  function makeOptions(p, rng) {
    rng = rng || new Rng();
    const ans = p.answer;
    const wrongCarry = p.op === 'add' ? ans - 10 : ans + 10; // 忘記進位/退位
    const pool = [ans + 1, ans - 1, wrongCarry, ans + 10, ans - 10, ans + 2, ans - 2]
      .filter((v) => v >= 1 && v <= 99 && v !== ans);
    const uniq = [...new Set(pool)];
    rng.shuffle(uniq);
    const opts = [ans, uniq[0], uniq[1]];
    return rng.shuffle(opts);
  }

  /* ---------- 盤面狀態 ---------- */
  function boardOf(n) { return { tens: tensOf(n), ones: onesOf(n) }; }
  function boardValue(b) { return b.tens * 10 + b.ones; }
  // 加法：兩數錢幣全上桌後的盤面
  function boardAfterMerge(p) {
    return { tens: tensOf(p.a) + tensOf(p.b), ones: onesOf(p.a) + onesOf(p.b) };
  }
  function needsExchange(p) {
    if (p.op === 'add') return onesOf(p.a) + onesOf(p.b) >= 10;
    return onesOf(p.a) < onesOf(p.b);
  }
  // 小換大：10 個 1 元 → 1 個 10 元
  function exchangeSmallToBig(b) {
    if (b.ones < 10) throw new Error('ones < 10');
    return { tens: b.tens + 1, ones: b.ones - 10 };
  }
  // 大換小：1 個 10 元 → 10 個 1 元
  function exchangeBigToSmall(b) {
    if (b.tens < 1) throw new Error('no tens');
    return { tens: b.tens - 1, ones: b.ones + 10 };
  }
  // 減法要付的錢
  function paymentFor(p) { return { tens: tensOf(p.b), ones: onesOf(p.b) }; }
  // 點數序列：先十個十個數，再一個一個數 → [10,20,30,31,32,...]
  function countSequence(b) {
    const seq = [];
    for (let i = 1; i <= b.tens; i++) seq.push(i * 10);
    for (let j = 1; j <= b.ones; j++) seq.push(b.tens * 10 + j);
    return seq;
  }

  /* ---------- 換錢機投幣裁決（給拖曳 drop 用） ----------
   * kind: 's2b'（加法進位，要投 1 元群）或 'b2s'（減法退位，要投 10 元）
   * denom: 玩家投的面額；board: 目前盤面；needMoreOnes: 減法時是否還缺 1 元 */
  function exchangeVerdict(kind, denom, board, needMoreOnes) {
    if (kind === 's2b') {
      if (denom === 10) return { ok: false, reason: 'ten-not-needed' };
      if (board.ones < 10) return { ok: false, reason: 'not-enough-ones' };
      return { ok: true };
    }
    if (kind === 'b2s') {
      // 先判「根本不需要換」：不退位題投任何幣都回 already-enough，
      // 避免對 1 元回「把 10 元換開才對」反而誘導下一個錯誤操作
      if (!needMoreOnes) return { ok: false, reason: 'already-enough' };
      if (denom === 1) return { ok: false, reason: 'one-not-needed' };
      if (board.tens < 1) return { ok: false, reason: 'no-tens' };
      return { ok: true };
    }
    return { ok: false, reason: 'not-now' };
  }

  return {
    Rng, tensOf, onesOf,
    genAdd, genSub, generateSession, makeOptions,
    boardOf, boardValue, boardAfterMerge, needsExchange,
    exchangeSmallToBig, exchangeBigToSmall, paymentFor,
    countSequence, exchangeVerdict,
  };
});
