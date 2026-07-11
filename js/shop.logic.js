/* 柑仔店 — 純邏輯（付錢與找錢，面額 1/5/10/50）
 * lv1 剛好付錢（面額組合）｜lv2 幫忙找錢（算找多少＋湊出來）｜lv3 往上數找錢（37→40→50）
 * 瀏覽器 window.ShopLogic / Node module.exports 共用，不碰 DOM。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShopLogic = factory();
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

  // 商品（key 對應 shop.art.js 的插畫）
  const ITEMS = [
    { key: 'candy', name: '糖果' },
    { key: 'lollipop', name: '棒棒糖' },
    { key: 'cookie', name: '餅乾' },
    { key: 'milk', name: '牛奶' },
    { key: 'juice', name: '果汁' },
    { key: 'bread', name: '麵包' },
    { key: 'car', name: '小汽車' },
    { key: 'ball', name: '皮球' },
  ];

  /* ---------- 錢的工具 ---------- */
  // 錢包 {c10,c5,c1} 能否剛好湊出 amount（枚舉 10、5 的用量）
  function canMake(amount, w) {
    for (let t = 0; t <= Math.min(w.c10, Math.floor(amount / 10)); t++) {
      const r10 = amount - t * 10;
      for (let f = 0; f <= Math.min(w.c5, Math.floor(r10 / 5)); f++) {
        const r5 = r10 - f * 5;
        if (r5 <= w.c1) return true;
      }
    }
    return false;
  }
  // 湊出 amount 的一組建議（提示用）：優先大面額
  function suggestCombo(amount, w) {
    for (let t = Math.min(w.c10, Math.floor(amount / 10)); t >= 0; t--) {
      const r10 = amount - t * 10;
      for (let f = Math.min(w.c5, Math.floor(r10 / 5)); f >= 0; f--) {
        const r5 = r10 - f * 5;
        if (r5 <= w.c1) return { c10: t, c5: f, c1: r5 };
      }
    }
    return null;
  }
  const total = (w) => w.c10 * 10 + w.c5 * 5 + w.c1;

  /* ---------- 出題 ---------- */
  // lv1 剛好付錢：價格 12..49，錢包保證可湊且要「做選擇」（有 5 元、枚數有剩餘）
  function genPay(rng, opts) {
    opts = opts || {};
    const maxPrice = opts.maxPrice || 49;
    const price = opts.price || rng.int(12, maxPrice);
    // 錢包：夠湊、且比剛好多一些（孩子要挑，不是全倒）
    const wallet = {
      c10: Math.floor(price / 10) + rng.int(1, 2),
      c5: rng.int(1, 2),
      c1: Math.max(price % 5, 4) + rng.int(1, 3),
    };
    return { lv: 1, type: 'pay', item: opts.item || rng.pick(ITEMS), price, wallet, answer: price };
  }

  // lv2 幫忙找錢：客人付 pay（50 或 30/40 整十），找 change = pay − price
  function genChange(rng, opts) {
    opts = opts || {};
    for (let tries = 0; tries < 400; tries++) {
      const pay = opts.pay || rng.pick([50, 50, 40, 30]); // 50 為主
      const price = opts.price || rng.int(pay - 29, pay - 2); // 找 2..29 元
      const change = pay - price;
      if (change < 2 || change > 29) continue;
      if (price < 10) continue;
      // 收銀機：保證能找（給充足面額）
      const till = {
        c10: Math.floor(change / 10) + rng.int(1, 2),
        c5: rng.int(1, 2),
        c1: Math.max(change % 5, 4) + rng.int(1, 2),
      };
      return { lv: 2, type: 'change', item: opts.item || rng.pick(ITEMS), price, pay, change, till, answer: change };
    }
    return { lv: 2, type: 'change', item: ITEMS[0], price: 37, pay: 50, change: 13,
      till: { c10: 2, c5: 1, c1: 5 }, answer: 13 };
  }

  // lv3 往上數找錢：price 個位 ≠ 0（要先湊到整十），pay = 50
  // 路徑：price →(1元×k)→ 下一個整十 →(10元×m)→ 50
  function genCountUp(rng, opts) {
    opts = opts || {};
    for (let tries = 0; tries < 400; tries++) {
      const price = opts.price || rng.int(21, 48);
      if (price % 10 === 0) continue;
      const pay = 50;
      const change = pay - price;
      const toTen = 10 - (price % 10);        // 先補幾個 1 元
      const tens = (pay - (price + toTen)) / 10; // 再放幾個 10 元
      if (tens < 0 || !Number.isInteger(tens)) continue;
      return { lv: 3, type: 'countup', item: opts.item || rng.pick(ITEMS),
        price, pay, change, toTen, tens, answer: change };
    }
    return { lv: 3, type: 'countup', item: ITEMS[1], price: 37, pay: 50, change: 13, toTen: 3, tens: 1, answer: 13 };
  }

  // 一場 5 題：第 1 題較簡單；商品不連續重複、價格整場不重複
  function generateSession(lv, opts) {
    opts = opts || {};
    const rng = opts.rng || new Rng(opts.seed);
    const out = [];
    const usedPrice = new Set();
    let lastKey = null;
    for (let i = 0; i < 5; i++) {
      let p, guard = 0;
      do {
        if (lv === 1) p = genPay(rng, i === 0 ? { maxPrice: 25 } : {});
        else if (lv === 2) p = genChange(rng, i === 0 ? { pay: 30 } : {});
        else p = genCountUp(rng, i === 0 ? { price: rng.int(41, 48) } : {}); // 第 1 題找得少
        guard++;
      } while ((p.item.key === lastKey || usedPrice.has(p.price)) && guard < 60);
      lastKey = p.item.key;
      usedPrice.add(p.price);
      out.push(p);
    }
    return out;
  }

  // 找錢金額的三個選項：干擾＝忘記退位(±10)、±1
  function makeChangeOptions(p, rng) {
    rng = rng || new Rng();
    const ans = p.change;
    const pool = [ans + 10, ans - 10, ans + 1, ans - 1, ans + 5, ans - 5]
      .filter((v) => v >= 1 && v <= 49 && v !== ans);
    const uniq = [...new Set(pool)];
    // 優先放「忘記退位」型（±10）
    const primary = uniq.filter((v) => Math.abs(v - ans) === 10);
    const rest = rng.shuffle(uniq.filter((v) => Math.abs(v - ans) !== 10));
    const picks = [...primary.slice(0, 1), ...rest].slice(0, 2);
    return rng.shuffle([ans, picks[0], picks[1]]);
  }

  return {
    Rng, ITEMS,
    canMake, suggestCombo, total,
    genPay, genChange, genCountUp, generateSession, makeChangeOptions,
  };
});
