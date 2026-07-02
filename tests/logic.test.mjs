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

test('乘法進位題 ×500：個位總和 10~19、積<=99、人數 2~4', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new GL.Rng(s);
    const p = GL.genMul(rng, { carry: true, maxResult: 99 });
    assert(p.a >= 11 && p.a <= 48, `每人金額二位數: ${p.a}`);
    assert(p.b >= 2 && p.b <= 4, `人數 2~4: ${p.b}`);
    assert(p.answer === p.a * p.b && p.answer <= 99, `積: ${p.answer}`);
    const onesTotal = GL.onesOf(p.a) * p.b;
    assert(onesTotal >= 10 && onesTotal <= 19, `個位總和 10~19: ${p.a}×${p.b}=${onesTotal}`);
    assert(GL.tensOf(p.a) * p.b <= 9, '十位格子放得下（9 格）');
    assert(p.exchange === true, 'exchange 旗標');
  }
});

test('乘法不進位題 ×500', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new GL.Rng(s + 7000);
    const p = GL.genMul(rng, { carry: false, maxResult: 59 });
    assert(p.answer <= 59, `積<=59: ${p.a}×${p.b}`);
    assert(GL.onesOf(p.a) * p.b <= 9, `不進位: ${p.a}×${p.b}`);
    assert(GL.onesOf(p.a) > 0, '有個位');
  }
});

test('除法換錢題 ×500：十位分完恰剩 1、輪數上限、商與餘數正確', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new GL.Rng(s);
    const p = GL.genDiv(rng, { exchange: true });
    assert(p.a >= 13 && p.a <= 59, `A: ${p.a}`);
    assert(p.b >= 2 && p.b <= 4, `人數: ${p.b}`);
    assert(p.answer === Math.floor(p.a / p.b), `商: ${p.a}÷${p.b}`);
    assert(p.remainder === p.a % p.b, `餘數: ${p.a}÷${p.b}`);
    assert(p.remainder < p.b, '餘數 < 人數');
    assert(GL.tensOf(p.a) % p.b === 1, `十位恰剩 1 個: ${p.a}÷${p.b}`);
    assert(GL.onesOf(p.a) + 10 <= 19, '換開後個位 <=19（20 格放得下）');
    assert(Math.floor((GL.onesOf(p.a) + 10) / p.b) <= 6, '分 1 元最多 6 輪');
    assert(Math.floor(GL.tensOf(p.a) / p.b) <= 2, '分 10 元最多 2 輪');
  }
});

test('除法不換錢題 ×500：十位整除', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new GL.Rng(s + 3000);
    const p = GL.genDiv(rng, { exchange: false });
    assert(GL.tensOf(p.a) % p.b === 0, `十位整除: ${p.a}÷${p.b}`);
    assert(p.answer === Math.floor(p.a / p.b) && p.remainder === p.a % p.b);
  }
});

test('除法 wantRemainder 過濾', () => {
  for (let s = 0; s < 200; s++) {
    const rng = new GL.Rng(s);
    assert(GL.genDiv(rng, { exchange: true, wantRemainder: true }).remainder > 0);
    assert(GL.genDiv(rng, { exchange: true, wantRemainder: false }).remainder === 0);
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

test('乘法場：第 1 題暖身、其餘進位', () => {
  for (let s = 0; s < 200; s++) {
    const ps = GL.generateSession('mul', { seed: s });
    assert(ps.length === 5);
    assert(!ps[0].exchange, '第 1 題不進位');
    for (let i = 1; i < 5; i++) assert(ps[i].exchange, `第 ${i + 1} 題進位`);
    for (const p of ps) assert(p.op === 'mul');
  }
});

test('除法場：第 1 題暖身、其餘換錢、第 3/5 題必有餘數', () => {
  for (let s = 0; s < 200; s++) {
    const ps = GL.generateSession('div', { seed: s });
    assert(!ps[0].exchange, '第 1 題不換錢');
    for (let i = 1; i < 5; i++) assert(ps[i].exchange, `第 ${i + 1} 題換錢`);
    assert(ps[2].remainder > 0 && ps[4].remainder > 0, '第 3/5 題有餘數');
    for (const p of ps) assert(p.op === 'div');
  }
});

test('同 seed 出題可重現（測試用）', () => {
  for (const mode of ['mix', 'mul', 'div']) {
    const a = GL.generateSession(mode, { seed: 42 });
    const b = GL.generateSession(mode, { seed: 42 });
    assert.deepStrictEqual(a, b);
  }
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

test('除法分錢裁決：先分十、不夠換錢、剩的是餘數', () => {
  // 十位夠一輪 → 分到盤子 OK、投換錢機被擋
  assert(GL.divVerdict('plate', 10, { tens: 3, ones: 5 }, 2).ok);
  assert(GL.divVerdict('machine', 10, { tens: 3, ones: 5 }, 2).reason === 'still-shareable');
  // 十位剩 1 個不夠分 → 盤子擋、換錢機收
  assert(GL.divVerdict('plate', 10, { tens: 1, ones: 5 }, 2).reason === 'need-exchange');
  assert(GL.divVerdict('machine', 10, { tens: 1, ones: 5 }, 2).ok);
  // 1 元永遠不能進換錢機
  assert(GL.divVerdict('machine', 1, { tens: 1, ones: 5 }, 2).reason === 'one-not-needed');
  // 十位還有 → 先分 10 元
  assert(GL.divVerdict('plate', 1, { tens: 2, ones: 5 }, 2).reason === 'tens-first');
  // 個位夠一輪 → 分
  assert(GL.divVerdict('plate', 1, { tens: 0, ones: 5 }, 2).ok);
  // 個位不夠一輪 → 餘數
  assert(GL.divVerdict('plate', 1, { tens: 0, ones: 1 }, 2).reason === 'remainder');
});

test('除法完整流程模擬 ×300：盤子均分、餘數正確、格子不爆', () => {
  for (let s = 0; s < 300; s++) {
    for (const p of GL.generateSession('div', { seed: s * 11 })) {
      let b = GL.boardOf(p.a);
      const n = p.b;
      const plates = Array.from({ length: n }, () => 0);
      let guard = 0;
      while (guard++ < 50) {
        if (b.tens >= n) {
          for (let k = 0; k < n; k++) plates[k] += 10;
          b = { tens: b.tens - n, ones: b.ones };
        } else if (b.tens > 0) {
          assert(GL.divVerdict('machine', 10, b, n).ok, `可換錢: ${p.a}÷${n}`);
          b = GL.exchangeBigToSmall(b);
          assert(b.ones <= 19, `個位格子放得下: ${p.a}÷${n}`);
        } else if (b.ones >= n) {
          for (let k = 0; k < n; k++) plates[k] += 1;
          b = { tens: b.tens, ones: b.ones - n };
        } else break;
      }
      for (const v of plates) assert(v === p.answer, `每盤=商: ${p.a}÷${n} 盤=${plates[0]}`);
      assert(b.ones === p.remainder && b.tens === 0, `餘數: ${p.a}÷${n}`);
    }
  }
});

test('乘法完整流程模擬 ×300：倒錢合併 → 換錢 → 盤面=積', () => {
  for (let s = 0; s < 300; s++) {
    for (const p of GL.generateSession('mul', { seed: s * 13 })) {
      let b = { tens: GL.tensOf(p.a) * p.b, ones: GL.onesOf(p.a) * p.b };
      assert(b.ones <= 19, `個位放得下: ${p.a}×${p.b}`);
      if (GL.needsExchange(p)) b = GL.exchangeSmallToBig(b);
      assert(b.ones <= 9 && b.tens <= 9, `換完不爆格: ${p.a}×${p.b}`);
      assert(GL.boardValue(b) === p.answer, `盤面=積: ${p.a}×${p.b}`);
    }
  }
});

test('餘數選項：3 個、含正解、不重複、非負', () => {
  for (let s = 0; s < 300; s++) {
    const rng = new GL.Rng(s);
    const p = GL.genDiv(rng, { exchange: true, wantRemainder: true });
    const opts = GL.makeRemainderOptions(p, rng);
    assert(opts.length === 3 && opts.includes(p.remainder));
    assert(new Set(opts).size === 3);
    for (const v of opts) assert(v >= 0 && v <= 3);
  }
});

test('點數序列：先十後一', () => {
  assert.deepStrictEqual(GL.countSequence({ tens: 4, ones: 2 }), [10, 20, 30, 40, 41, 42]);
  assert.deepStrictEqual(GL.countSequence({ tens: 0, ones: 3 }), [1, 2, 3]);
  assert.deepStrictEqual(GL.countSequence({ tens: 2, ones: 0 }), [10, 20]);
});

console.log('\n結果：' + passed + ' 通過, ' + failed + ' 失敗');
process.exit(failed ? 1 : 0);
