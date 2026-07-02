/* 換錢大冒險 — 遊戲邏輯單元測試（node tests/logic.test.mjs） */
import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);
const GL = require('../js/logic.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}

console.log('== 出題器 ==');

test('加法進位題 ×500：範圍與進位保證', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new GL.Rng(s);
    const p = GL.genAdd(rng, { carry: true, maxResult: 99 });
    assert(p.a >= 10 && p.a <= 99, `a 二位數: ${p.a}`);
    assert(p.b >= 3, `b>=3: ${p.b}`);
    assert(p.answer === p.a + p.b, '答案正確');
    assert(p.answer <= 99, `和<=99: ${p.answer}`);
    assert(GL.onesOf(p.a) + GL.onesOf(p.b) >= 10, `必須進位: ${p.a}+${p.b}`);
    assert(GL.onesOf(p.a) + GL.onesOf(p.b) <= 18, '個位總數<=18（棋盤放得下）');
    assert(GL.onesOf(p.a) > 0 && GL.onesOf(p.b) > 0, '兩邊都有個位');
  }
});

test('加法不進位題 ×500', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new GL.Rng(s + 9000);
    const p = GL.genAdd(rng, { carry: false, maxResult: 59 });
    assert(p.answer <= 59, `和<=59: ${p.a}+${p.b}`);
    assert(GL.onesOf(p.a) + GL.onesOf(p.b) < 10, `不可進位: ${p.a}+${p.b}`);
  }
});

test('減法退位題 ×500：範圍與退位保證', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new GL.Rng(s);
    const p = GL.genSub(rng, { borrow: true, maxA: 99 });
    assert(p.a >= 21 && p.a <= 99, `a: ${p.a}`);
    assert(p.b >= 3 && p.b < p.a, `b: ${p.b}`);
    assert(p.answer === p.a - p.b && p.answer >= 1, `差: ${p.answer}`);
    assert(GL.onesOf(p.a) < GL.onesOf(p.b), `必須退位: ${p.a}-${p.b}`);
    // 換開一個 10 後，十位一定夠付
    assert(GL.tensOf(p.a) - 1 >= GL.tensOf(p.b), `退位後十位夠付: ${p.a}-${p.b}`);
    // 換開後個位一定夠付
    assert(GL.onesOf(p.a) + 10 >= GL.onesOf(p.b), '換開後個位夠付');
  }
});

test('減法不退位題 ×500', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new GL.Rng(s + 5000);
    const p = GL.genSub(rng, { borrow: false, maxA: 59 });
    assert(GL.onesOf(p.a) >= GL.onesOf(p.b), `不退位: ${p.a}-${p.b}`);
    assert(GL.tensOf(p.a) >= GL.tensOf(p.b), `十位夠: ${p.a}-${p.b}`);
    assert(p.answer >= 1, '差>=1');
  }
});

console.log('== 一場 5 題 ==');

test('加法場：第 1 題暖身、其餘進位、不重複', () => {
  for (let s = 0; s < 200; s++) {
    const ps = GL.generateSession('add', { seed: s });
    assert(ps.length === 5);
    assert(!ps[0].exchange, '第 1 題不進位');
    for (let i = 1; i < 5; i++) assert(ps[i].exchange, `第 ${i + 1} 題進位`);
    const keys = new Set(ps.map((p) => p.a + p.op + p.b));
    assert(keys.size === 5, '題目不重複');
  }
});

test('減法場：第 1 題暖身、其餘退位', () => {
  for (let s = 0; s < 200; s++) {
    const ps = GL.generateSession('sub', { seed: s });
    assert(!ps[0].exchange);
    for (let i = 1; i < 5; i++) assert(ps[i].exchange);
    for (const p of ps) assert(p.op === 'sub');
  }
});

test('混合場：加減都有', () => {
  for (let s = 0; s < 100; s++) {
    const ps = GL.generateSession('mix', { seed: s });
    const ops = new Set(ps.map((p) => p.op));
    assert(ops.has('add') && ops.has('sub'), '兩種運算都出現');
  }
});

test('同 seed 出題可重現（測試用）', () => {
  const a = GL.generateSession('mix', { seed: 42 });
  const b = GL.generateSession('mix', { seed: 42 });
  assert.deepStrictEqual(a, b);
});

console.log('== 答案選項 ==');

test('選項：3 個、含正解、不重複、範圍 1..99 ×400', () => {
  for (let s = 0; s < 400; s++) {
    const rng = new GL.Rng(s);
    const p = s % 2 ? GL.genAdd(rng, { carry: true }) : GL.genSub(rng, { borrow: true });
    const opts = GL.makeOptions(p, rng);
    assert(opts.length === 3, '3 個選項');
    assert(opts.includes(p.answer), '含正解');
    assert(new Set(opts).size === 3, '不重複');
    for (const v of opts) assert(v >= 1 && v <= 99, `範圍: ${v}`);
  }
});

console.log('== 盤面與換錢 ==');

test('加法盤面流：合併 → 換錢 → 數值不變', () => {
  const p = { op: 'add', a: 27, b: 15, answer: 42, exchange: true };
  let b = GL.boardAfterMerge(p);
  assert.deepStrictEqual(b, { tens: 3, ones: 12 });
  assert(GL.needsExchange(p));
  b = GL.exchangeSmallToBig(b);
  assert.deepStrictEqual(b, { tens: 4, ones: 2 });
  assert(GL.boardValue(b) === 42, '換錢前後總值不變');
});

test('減法盤面流：退位 → 付款 → 剩餘=答案', () => {
  const p = { op: 'sub', a: 32, b: 15, answer: 17, exchange: true };
  assert(GL.needsExchange(p));
  let b = GL.boardOf(p.a);
  b = GL.exchangeBigToSmall(b);
  assert.deepStrictEqual(b, { tens: 2, ones: 12 });
  const pay = GL.paymentFor(p);
  b = { tens: b.tens - pay.tens, ones: b.ones - pay.ones };
  assert(GL.boardValue(b) === p.answer);
});

test('所有生成題目走完整流程後盤面=答案 ×300', () => {
  for (let s = 0; s < 300; s++) {
    for (const mode of ['add', 'sub']) {
      for (const p of GL.generateSession(mode, { seed: s * 7 })) {
        let b;
        if (p.op === 'add') {
          b = GL.boardAfterMerge(p);
          if (GL.needsExchange(p)) b = GL.exchangeSmallToBig(b);
          assert(b.ones <= 9, `換完個位<=9: ${p.a}+${p.b}`);
          assert(b.tens <= 9, `十位<=9: ${p.a}+${p.b}`);
        } else {
          b = GL.boardOf(p.a);
          if (GL.needsExchange(p)) b = GL.exchangeBigToSmall(b);
          const pay = GL.paymentFor(p);
          assert(b.tens >= pay.tens && b.ones >= pay.ones, `夠付: ${p.a}-${p.b}`);
          b = { tens: b.tens - pay.tens, ones: b.ones - pay.ones };
        }
        assert(GL.boardValue(b) === p.answer, `盤面=答案: ${p.a}${p.op}${p.b}`);
        assert(b.ones <= 19, '個位格子放得下（20 格）');
      }
    }
  }
});

test('個位滿版不爆格：加法個位最多 18、減法換開最多 19', () => {
  for (let s = 0; s < 300; s++) {
    const rng = new GL.Rng(s);
    const pa = GL.genAdd(rng, { carry: true });
    assert(GL.onesOf(pa.a) + GL.onesOf(pa.b) <= 18);
    const ps = GL.genSub(rng, { borrow: true });
    assert(GL.onesOf(ps.a) + 10 <= 19);
  }
});

console.log('== 換錢機裁決 ==');

test('加法進位：只收 10 個一元的群組', () => {
  assert(GL.exchangeVerdict('s2b', 1, { tens: 3, ones: 12 }).ok);
  assert(!GL.exchangeVerdict('s2b', 10, { tens: 3, ones: 12 }).ok);
  assert(GL.exchangeVerdict('s2b', 10, { tens: 3, ones: 12 }).reason === 'ten-not-needed');
  assert(!GL.exchangeVerdict('s2b', 1, { tens: 3, ones: 8 }).ok);
});

test('減法退位：只在缺 1 元時收 10 元', () => {
  assert(GL.exchangeVerdict('b2s', 10, { tens: 3, ones: 2 }, true).ok);
  assert(GL.exchangeVerdict('b2s', 1, { tens: 3, ones: 2 }, true).reason === 'one-not-needed');
  assert(GL.exchangeVerdict('b2s', 10, { tens: 2, ones: 12 }, false).reason === 'already-enough');
  // 不需換錢時投 1 元也回 already-enough，不能誘導孩子去換 10 元
  assert(GL.exchangeVerdict('b2s', 1, { tens: 2, ones: 12 }, false).reason === 'already-enough');
  assert(GL.exchangeVerdict('b2s', 10, { tens: 0, ones: 2 }, true).reason === 'no-tens');
});

test('點數序列：先十後一', () => {
  assert.deepStrictEqual(GL.countSequence({ tens: 4, ones: 2 }), [10, 20, 30, 40, 41, 42]);
  assert.deepStrictEqual(GL.countSequence({ tens: 0, ones: 3 }), [1, 2, 3]);
  assert.deepStrictEqual(GL.countSequence({ tens: 2, ones: 0 }), [10, 20]);
});

console.log('\n結果：' + passed + ' 通過, ' + failed + ' 失敗');
process.exit(failed ? 1 : 0);
