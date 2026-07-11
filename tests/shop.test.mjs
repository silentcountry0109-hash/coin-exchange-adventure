/* 柑仔店 — 邏輯單元測試（node tests/shop.test.mjs） */
import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);
const SL = require('../js/shop.logic.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}

console.log('== 錢的工具 ==');

test('canMake：面額組合可行性（含 5 元的角色）', () => {
  assert(SL.canMake(37, { c10: 3, c5: 1, c1: 2 }), '30+5+2');
  assert(!SL.canMake(37, { c10: 3, c5: 1, c1: 1 }), '個位湊不出 2');
  assert(SL.canMake(37, { c10: 2, c5: 3, c1: 2 }), '20+15+2');
  assert(SL.canMake(15, { c10: 0, c5: 3, c1: 0 }), '5×3');
  assert(!SL.canMake(3, { c10: 5, c5: 5, c1: 2 }), '1 元不夠');
  assert(SL.canMake(50, { c10: 5, c5: 0, c1: 0 }));
});

test('suggestCombo：給得出合法組合且總額正確 ×500', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new SL.Rng(s);
    const amount = rng.int(2, 49);
    const w = { c10: rng.int(0, 5), c5: rng.int(0, 3), c1: rng.int(0, 9) };
    const combo = SL.suggestCombo(amount, w);
    if (SL.canMake(amount, w)) {
      assert(combo, `可湊必有解: ${amount}`);
      assert(SL.total(combo) === amount, '組合總額=目標');
      assert(combo.c10 <= w.c10 && combo.c5 <= w.c5 && combo.c1 <= w.c1, '不超過持有');
    } else {
      assert(combo === null, '不可湊回 null');
    }
  }
});

console.log('== 出題器 ==');

test('lv1 剛好付錢 ×500：價格範圍、錢包必可湊、且有餘裕要做選擇', () => {
  for (let s = 0; s < 500; s++) {
    const p = SL.genPay(new SL.Rng(s));
    assert(p.price >= 12 && p.price <= 49, `價格: ${p.price}`);
    assert(SL.canMake(p.price, p.wallet), `錢包可湊: ${p.price} ${JSON.stringify(p.wallet)}`);
    assert(SL.total(p.wallet) > p.price, '錢包比價格多（要挑）');
    assert(p.wallet.c5 >= 1, '有 5 元可用');
    assert(p.answer === p.price);
  }
});

test('lv2 幫忙找錢 ×500：找 2..29、收銀機必可找', () => {
  for (let s = 0; s < 500; s++) {
    const p = SL.genChange(new SL.Rng(s));
    assert([30, 40, 50].includes(p.pay), `付整十: ${p.pay}`);
    assert(p.change === p.pay - p.price, '找錢=付-價');
    assert(p.change >= 2 && p.change <= 29, `找錢範圍: ${p.change}`);
    assert(p.price >= 10, '價格二位數');
    assert(SL.canMake(p.change, p.till), `收銀機可找: ${p.change} ${JSON.stringify(p.till)}`);
    assert(p.answer === p.change);
  }
});

test('lv3 往上數 ×500：個位≠0、toTen/tens 拆解正確', () => {
  for (let s = 0; s < 500; s++) {
    const p = SL.genCountUp(new SL.Rng(s));
    assert(p.pay === 50);
    assert(p.price % 10 !== 0, `個位≠0: ${p.price}`);
    assert(p.toTen === 10 - (p.price % 10), 'toTen 正確');
    assert(p.tens >= 0 && Number.isInteger(p.tens), `tens: ${p.tens}`);
    assert(p.price + p.toTen + p.tens * 10 === 50, '湊到 50');
    assert(p.change === p.toTen + p.tens * 10, '找錢=1元數+10元數×10');
    assert(p.answer === p.change);
  }
});

console.log('== 一場 5 題 ==');

test('場結構 ×200：5 題、第 1 題較易、商品不連續重複', () => {
  for (const lv of [1, 2, 3]) {
    for (let s = 0; s < 200; s++) {
      const ps = SL.generateSession(lv, { seed: s * 3 + lv });
      assert(ps.length === 5);
      if (lv === 1) assert(ps[0].price <= 25, '第 1 題價格較低');
      if (lv === 2) assert(ps[0].pay === 30, '第 1 題付 30（找得少）');
      if (lv === 3) assert(ps[0].price >= 41, '第 1 題價格高（找得少）');
      for (let i = 1; i < 5; i++) assert(ps[i].item.key !== ps[i - 1].item.key, '商品不連續重複');
      const prices = new Set(ps.map((p) => p.price));
      assert(prices.size === 5, `價格整場不重複: ${ps.map((p) => p.price)}`);
    }
  }
});

test('同 seed 可重現', () => {
  for (const lv of [1, 2, 3]) {
    assert.deepStrictEqual(SL.generateSession(lv, { seed: 42 }), SL.generateSession(lv, { seed: 42 }));
  }
});

console.log('== 找錢選項 ==');

test('makeChangeOptions ×600：3 個、含正解、不重複、含忘記退位干擾（範圍內）', () => {
  for (let s = 0; s < 600; s++) {
    const rng = new SL.Rng(s);
    const p = s % 2 ? SL.genChange(rng) : SL.genCountUp(rng);
    const opts = SL.makeChangeOptions(p, rng);
    assert(opts.length === 3, '3 個');
    assert(opts.includes(p.change), '含正解');
    assert(new Set(opts).size === 3, `不重複: ${opts}`);
    for (const v of opts) assert(v >= 1 && v <= 49, `範圍: ${v}`);
    const adj = opts.some((v) => Math.abs(v - p.change) === 10);
    if (p.change + 10 <= 49 || p.change - 10 >= 1) assert(adj, `含 ±10 干擾: ${p.change} ${opts}`);
  }
});

console.log('\n結果：' + passed + ' 通過, ' + failed + ' 失敗');
process.exit(failed ? 1 : 0);
