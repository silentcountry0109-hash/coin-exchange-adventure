/* 小鳥過河 — 等差數列邏輯單元測試（node tests/pattern.test.mjs） */
import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);
const PL = require('../js/pattern.logic.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}

function assertPattern(p) {
  assert(p.length === 5, '5 顆石頭');
  // 等差：相鄰差固定 = dir*step
  for (let i = 1; i < p.length; i++) {
    assert(p.terms[i] - p.terms[i - 1] === p.dir * p.step, `等差: ${p.terms.join(',')}`);
  }
  // 全部落在 0..99
  for (const v of p.terms) assert(v >= 0 && v <= 99, `範圍 0~99: ${v}`);
  assert(p.answer === p.terms[p.missingIndex], '答案=缺項');
}

console.log('== 出題器 ==');

test('lv1 ×500：遞增、小公差、預測最後一顆', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new PL.Rng(s);
    const p = PL.genPattern(rng, 1);
    assertPattern(p);
    assert(p.increasing === true, 'lv1 遞增');
    assert(p.dir === 1, 'dir=+1');
    assert([1, 2, 5, 10].includes(p.step), `step: ${p.step}`);
    assert(p.terms.every((v) => v <= 60), 'lv1 <=60');
    assert(p.missingIndex === 4, '缺最後一顆');
  }
});

test('lv2 ×500：增減都出現、缺中間一顆', () => {
  let sawInc = false, sawDec = false;
  for (let s = 0; s < 500; s++) {
    const rng = new PL.Rng(s + 1000);
    const p = PL.genPattern(rng, 2);
    assertPattern(p);
    assert(p.missingIndex >= 1 && p.missingIndex <= 3, `缺中間: ${p.missingIndex}`);
    assert([2, 3, 4, 5, 10].includes(p.step));
    if (p.increasing) sawInc = true; else sawDec = true;
  }
  assert(sawInc && sawDec, 'lv2 增減都出現');
});

test('lv3 ×500：大公差、預測最後、要問公差', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new PL.Rng(s + 2000);
    const p = PL.genPattern(rng, 3);
    assertPattern(p);
    assert(p.missingIndex === 4, '缺最後');
    assert(p.askDiff === true, 'lv3 問公差');
    assert([2, 3, 4, 6, 10].includes(p.step));
  }
});

test('遞減不會出現負數 ×500', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new PL.Rng(s + 7);
    const p = PL.genPattern(rng, 3, { increasing: false });
    assert(p.dir === -1);
    for (const v of p.terms) assert(v >= 0, `遞減不負: ${p.terms.join(',')}`);
  }
});

console.log('== 一場 5 題 ==');

test('場結構 ×200：5 題、第 1 題遞增小公差、不重複', () => {
  for (const lv of [1, 2, 3]) {
    for (let s = 0; s < 200; s++) {
      const ps = PL.generateSession(lv, { seed: s * 3 + lv });
      assert(ps.length === 5);
      assert(ps[0].increasing === true, '第 1 題遞增');
      assert(ps[0].step <= 3, '第 1 題小公差');
      const keys = new Set(ps.map((p) => p.terms.join(',')));
      assert(keys.size === 5, '題目不重複');
      for (const p of ps) assertPattern(p);
    }
  }
});

test('同 seed 可重現', () => {
  for (const lv of [1, 2, 3]) {
    assert.deepStrictEqual(PL.generateSession(lv, { seed: 42 }), PL.generateSession(lv, { seed: 42 }));
  }
});

console.log('== 選項 ==');

test('缺項選項 ×800：3 個、含正解、不重複、0..99、含差一跳干擾', () => {
  for (let s = 0; s < 800; s++) {
    const rng = new PL.Rng(s);
    const p = PL.genPattern(rng, (s % 3) + 1);
    const opts = PL.makeOptions(p, rng);
    assert(opts.length === 3, '3 個');
    assert(opts.includes(p.answer), '含正解');
    assert(new Set(opts).size === 3, '不重複');
    for (const v of opts) assert(v >= 0 && v <= 99, `範圍: ${v}`);
    // 差一跳（±step）在有效範圍時至少要有一個當干擾
    const hasAdj = opts.some((v) => v === p.answer + p.step || v === p.answer - p.step);
    if (p.answer - p.step >= 0 && p.answer + p.step <= 99) assert(hasAdj, '含差一跳干擾');
  }
});

test('公差選項 ×400：3 個、含正解、皆 >=1', () => {
  for (let s = 0; s < 400; s++) {
    const rng = new PL.Rng(s);
    const p = PL.genPattern(rng, 3);
    const opts = PL.makeDiffOptions(p, rng);
    assert(opts.length === 3 && opts.includes(p.step));
    assert(new Set(opts).size === 3, '不重複');
    for (const v of opts) assert(v >= 1, `公差>=1: ${v}`);
  }
});

console.log('\n結果：' + passed + ' 通過, ' + failed + ' 失敗');
process.exit(failed ? 1 : 0);
