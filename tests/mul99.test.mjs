/* 九九乘法星球 — 遊戲邏輯單元測試（node tests/mul99.test.mjs） */
import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);
const ML = require('../js/mul99.logic.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}

console.log('== 口訣句 ==');

test('中文口訣句：得字規則與十位', () => {
  assert.strictEqual(ML.chant(2, 2), '二二得四');
  assert.strictEqual(ML.chant(3, 3), '三三得九');
  assert.strictEqual(ML.chant(3, 4), '三四十二');
  assert.strictEqual(ML.chant(7, 3), '七三二十一');
  assert.strictEqual(ML.chant(9, 9), '九九八十一');
  assert.strictEqual(ML.chant(5, 2), '五二一十'); // 積恰為 10 唸「一十」
  assert.strictEqual(ML.chant(5, 6), '五六三十');
});

test('zhNum 邊界', () => {
  assert.strictEqual(ML.zhNum(10), '十');
  assert.strictEqual(ML.zhNum(21), '二十一');
  assert.strictEqual(ML.zhNum(81), '八十一');
  assert.strictEqual(ML.zhNum(40), '四十');
});

console.log('== 出題器 ==');

test('排陣列題 ×500：a=段、b 3~5、積正確', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new ML.Rng(s);
    const d = ML.SEGMENTS[s % 8];
    const p = ML.genBuild(rng, d);
    assert(p.a === d, 'a=段');
    assert(p.b >= 3 && p.b <= 5, `b 3~5: ${p.b}`);
    assert(p.answer === d * p.b, '積正確');
  }
});

test('跳數填空 ×500：序列正確、挖洞在中段', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new ML.Rng(s);
    const d = ML.SEGMENTS[s % 8];
    const p = ML.genGap(rng, d);
    assert(p.seq.length === 6, '6 個倍數');
    for (let i = 0; i < 6; i++) assert(p.seq[i] === d * (i + 1), '倍數序列');
    assert(p.missIdx >= 2 && p.missIdx <= 4, `挖洞 2~4: ${p.missIdx}`);
    assert(p.answer === p.seq[p.missIdx], '答案=被挖的倍數');
  }
});

test('快答題 ×500：b 範圍可指定', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new ML.Rng(s);
    const p = ML.genQuick(rng, 7, { bMin: 6, bMax: 9 });
    assert(p.b >= 6 && p.b <= 9, `b 6~9: ${p.b}`);
    assert(p.answer === 7 * p.b);
  }
});

console.log('== 一場 5 題 ==');

test('場結構 ×200：build×2(不同 b)→gap→quick×2(不同 b、第5題偏難)', () => {
  for (let s = 0; s < 200; s++) {
    for (const d of ML.SEGMENTS) {
      const ps = ML.generateSession(d, { seed: s * 8 + d });
      assert(ps.length === 5);
      assert(ps[0].type === 'build' && ps[1].type === 'build');
      assert(ps[0].b !== ps[1].b, '兩題排數不同');
      assert(ps[2].type === 'gap');
      assert(ps[3].type === 'quick' && ps[4].type === 'quick');
      assert(ps[4].b >= 6, '第 5 題偏難');
      assert(ps[3].b !== ps[4].b || ps[3].b < 6, '快答兩題不同（除非撞範圍護欄）');
      for (const p of ps) assert(p.a === d && p.answer === p.a * (p.type === 'gap' ? (p.missIdx + 1) : p.b || (p.missIdx + 1)), '答案正確');
    }
  }
});

test('同 seed 可重現', () => {
  assert.deepStrictEqual(ML.generateSession(7, { seed: 42 }), ML.generateSession(7, { seed: 42 }));
  assert.deepStrictEqual(ML.generateMixSession({ seed: 42 }), ML.generateMixSession({ seed: 42 }));
});

test('混合挑戰 ×300：5 題背誦、段落全不同、b 2~9、積正確', () => {
  for (let s = 0; s < 300; s++) {
    const ps = ML.generateMixSession({ seed: s });
    assert(ps.length === 5, '5 題');
    const segs = new Set(ps.map((p) => p.a));
    assert(segs.size === 5, '5 個不同段落');
    for (const p of ps) {
      assert(p.type === 'recite', '背誦題型');
      assert(ML.SEGMENTS.includes(p.a), 'a 在 2~9');
      assert(p.b >= 2 && p.b <= 9, `b 2~9: ${p.b}`);
      assert(p.answer === p.a * p.b, '積正確');
    }
  }
});

console.log('== 選項 ==');

test('選項 ×800：3 個、含正解、不重複、1..99、優先相鄰倍數', () => {
  for (let s = 0; s < 800; s++) {
    const rng = new ML.Rng(s);
    const d = ML.SEGMENTS[s % 8];
    const p = s % 2 ? ML.genQuick(rng, d) : ML.genGap(rng, d);
    const opts = ML.makeOptions(p, rng);
    assert(opts.length === 3, '3 個');
    assert(opts.includes(p.answer), '含正解');
    assert(new Set(opts).size === 3, '不重複');
    for (const v of opts) assert(v >= 1 && v <= 99, `範圍: ${v}`);
    // 至少一個干擾項是相鄰倍數（背錯一句），除非邊界濾掉
    const adj = opts.filter((v) => v === p.answer - d || v === p.answer + d);
    if (p.answer - d >= 1 && p.answer + d <= 99) assert(adj.length >= 1, '含相鄰倍數干擾');
  }
});

console.log('== 跳數 ==');

test('skipSequence', () => {
  assert.deepStrictEqual(ML.skipSequence(3, 4), [3, 6, 9, 12]);
  assert.deepStrictEqual(ML.skipSequence(9, 2), [9, 18]);
});

console.log('\n結果：' + passed + ' 通過, ' + failed + ' 失敗');
process.exit(failed ? 1 : 0);
