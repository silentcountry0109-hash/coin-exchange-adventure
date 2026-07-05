/* 量量看長度 — 邏輯單元測試（node tests/measure.test.mjs） */
import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);
const ML = require('../js/measure.logic.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}

console.log('== 出題器 ==');

test('lv1 ×500：0 起點、短物、答案=長度、放得下尺', () => {
  for (let s = 0; s < 500; s++) {
    const p = ML.genMeasure(new ML.Rng(s), 1);
    assert(p.start === 0 && p.end === p.length, '0 起點');
    assert(p.length >= 3 && p.length <= 9, `長度 3~9: ${p.length}`);
    assert(p.answer === p.length, '答案=長度');
    assert(p.end <= p.rulerMax, '放得下尺');
    assert(p.obj && p.obj.emoji, '有物品');
  }
});

test('lv2 ×500：0 起點、較長', () => {
  for (let s = 0; s < 500; s++) {
    const p = ML.genMeasure(new ML.Rng(s + 500), 2);
    assert(p.start === 0);
    assert(p.length >= 6 && p.length <= 12, `長度 6~12: ${p.length}`);
    assert(p.end <= p.rulerMax);
  }
});

test('lv3 ×500：起點≠0、長度=末端−起點、放得下尺', () => {
  for (let s = 0; s < 500; s++) {
    const p = ML.genMeasure(new ML.Rng(s + 1000), 3);
    assert(p.start >= 1 && p.start <= 4, `起點 1~4: ${p.start}`);
    assert(p.length >= 3 && p.length <= 9);
    assert(p.end === p.start + p.length, '末端=起點+長度');
    assert(p.answer === p.end - p.start, '答案=末端−起點');
    assert(p.end <= p.rulerMax, `末端<=尺長: ${p.end}`);
  }
});

console.log('== 一場 5 題 ==');

test('場結構 ×200：5 題、第 1 題短、物品不連續重複', () => {
  for (const lv of [1, 2, 3]) {
    for (let s = 0; s < 200; s++) {
      const ps = ML.generateSession(lv, { seed: s * 3 + lv });
      assert(ps.length === 5);
      assert(ps[0].length <= 5, '第 1 題較短');
      for (let i = 1; i < 5; i++) assert(ps[i].obj.key !== ps[i - 1].obj.key, '物品不連續重複');
    }
  }
});

test('同 seed 可重現', () => {
  for (const lv of [1, 2, 3]) {
    assert.deepStrictEqual(ML.generateSession(lv, { seed: 42 }), ML.generateSession(lv, { seed: 42 }));
  }
});

console.log('== 選項 ==');

test('選項 ×800：3 個、含正解、不重複、範圍 1..20', () => {
  for (let s = 0; s < 800; s++) {
    const rng = new ML.Rng(s);
    const p = ML.genMeasure(rng, (s % 3) + 1);
    const opts = ML.makeOptions(p, rng);
    assert(opts.length === 3, '3 個');
    assert(opts.includes(p.answer), '含正解');
    assert(new Set(opts).size === 3, `不重複: ${opts}`);
    for (const v of opts) assert(v >= 1 && v <= 20, `範圍: ${v}`);
  }
});

test('lv3 選項必含「直接讀末端」干擾 end ×400', () => {
  for (let s = 0; s < 400; s++) {
    const rng = new ML.Rng(s + 3);
    const p = ML.genMeasure(rng, 3);
    const opts = ML.makeOptions(p, rng);
    // end 與 answer 不同（start>=1），必為干擾項之一
    assert(opts.includes(p.end), `含末端干擾 end=${p.end}: ${opts}`);
  }
});

test('unitSequence', () => {
  assert.deepStrictEqual(ML.unitSequence(5), [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(ML.unitSequence(1), [1]);
});

console.log('\n結果：' + passed + ' 通過, ' + failed + ' 失敗');
process.exit(failed ? 1 : 0);
