/* 湊十小火車 — 遊戲邏輯單元測試（node tests/train.test.mjs） */
import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);
const TL = require('../js/train.logic.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}

console.log('== 出題器 ==');

test('Lv1 湊 5 ×500：a∈1..4、need=answer=5−a、5 座 5 隻月台', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new TL.Rng(s);
    const p = TL.genLv1(rng);
    assert(p.lv === 'lv1');
    assert(p.a >= 1 && p.a <= 4, `a∈1..4: ${p.a}`);
    assert(p.cap === 5 && p.pool === 5, 'cap=5、pool=5');
    assert(p.need === 5 - p.a, `need=5−a: ${p.need}`);
    assert(p.answer === p.need && p.b === p.need, 'answer=b=need');
    assert(p.a + p.need === 5, '湊 5 拆解正確');
  }
});

test('Lv1 暖身題 ×500：need ≤ 2', () => {
  for (let s = 0; s < 500; s++) {
    const p = TL.genLv1(new TL.Rng(s), { easy: true });
    assert(p.a >= 3 && p.a <= 4 && p.need <= 2, `暖身 a≥3: ${p.a}`);
  }
});

test('Lv2 湊 10 ×500：a∈1..9、need=answer=10−a、10 座 10 隻月台', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new TL.Rng(s);
    const p = TL.genLv2(rng);
    assert(p.lv === 'lv2');
    assert(p.a >= 1 && p.a <= 9, `a∈1..9: ${p.a}`);
    assert(p.cap === 10 && p.pool === 10, 'cap=10、pool=10');
    assert(p.need === 10 - p.a && p.answer === p.need && p.b === p.need, 'need=answer=10−a');
    assert(p.a + p.need === 10, '湊 10 拆解正確');
  }
});

test('Lv2 暖身題 ×500：need ≤ 2', () => {
  for (let s = 0; s < 500; s++) {
    const p = TL.genLv2(new TL.Rng(s), { easy: true });
    assert(p.a >= 8 && p.a <= 9 && p.need <= 2, `暖身 a≥8: ${p.a}`);
  }
});

test('Lv3 湊十法 ×500：a∈6..9、b∈2..9、和∈11..18', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new TL.Rng(s);
    const p = TL.genLv3(rng);
    assert(p.lv === 'lv3');
    assert(p.a >= 6 && p.a <= 9, `a∈6..9: ${p.a}`);
    assert(p.b >= 2 && p.b <= 9, `b∈2..9: ${p.b}`);
    assert(p.answer === p.a + p.b, '答案=a+b');
    assert(p.answer >= 11 && p.answer <= 18, `和∈11..18: ${p.answer}`);
    assert(p.cap === 10 && p.pool === p.b, 'cap=10、月台=b 隻');
  }
});

test('Lv3 湊十拆解 ×500：a+need=10、need+leftover=b、10+leftover=答案', () => {
  for (let s = 0; s < 500; s++) {
    const p = TL.genLv3(new TL.Rng(s));
    const d = TL.tenSplit(p);
    assert(d.toFill === p.need && d.leftover === p.leftover, 'tenSplit 與題目欄位一致');
    assert(p.a + p.need === 10, `a 湊 need 是 10: ${p.a}+${p.need}`);
    assert(p.need >= 1 && p.need <= 4, `need∈1..4: ${p.need}`);
    assert(p.need + p.leftover === p.b, `月台拆成 上車+剩下: ${p.b}`);
    assert(p.leftover >= 1 && p.leftover <= 8, `leftover∈1..8: ${p.leftover}`);
    assert(10 + p.leftover === p.answer, `10+剩下=答案: ${p.answer}`);
  }
});

test('Lv3 暖身題 ×500：need ≤ 2', () => {
  for (let s = 0; s < 500; s++) {
    const p = TL.genLv3(new TL.Rng(s), { easy: true });
    assert(p.a >= 8 && p.need <= 2, `暖身 a≥8: ${p.a}`);
  }
});

console.log('== 一場 5 題 ==');

test('Lv1 場 ×500：5 題、第 1 題較易、前 4 題涵蓋 1..4、無相鄰重複', () => {
  // a 只有 4 種值，5 題無法完全不重複（見 train.logic.js 註解），
  // 改驗證：涵蓋全部 4 種 ＋ 相鄰兩題不同
  for (let s = 0; s < 500; s++) {
    const ps = TL.generateSession('lv1', { seed: s });
    assert(ps.length === 5, '5 題');
    assert(ps[0].need <= 2, `第 1 題較易: need=${ps[0].need}`);
    const first4 = new Set(ps.slice(0, 4).map((p) => p.a));
    assert(first4.size === 4, '前 4 題涵蓋 a=1..4');
    for (let i = 1; i < 5; i++) assert(ps[i].a !== ps[i - 1].a, `相鄰不重複: 第${i}/${i + 1}題`);
    for (const p of ps) assert(p.lv === 'lv1');
  }
});

test('Lv2 場 ×500：5 題不重複、第 1 題較易', () => {
  for (let s = 0; s < 500; s++) {
    const ps = TL.generateSession('lv2', { seed: s });
    assert(ps.length === 5, '5 題');
    assert(ps[0].need <= 2, `第 1 題較易: need=${ps[0].need}`);
    assert(new Set(ps.map((p) => p.a)).size === 5, '題目不重複');
    for (const p of ps) assert(p.lv === 'lv2');
  }
});

test('Lv3 場 ×500：5 題不重複、第 1 題較易', () => {
  for (let s = 0; s < 500; s++) {
    const ps = TL.generateSession('lv3', { seed: s });
    assert(ps.length === 5, '5 題');
    assert(ps[0].need <= 2, `第 1 題較易: need=${ps[0].need}`);
    assert(new Set(ps.map((p) => p.a + '+' + p.b)).size === 5, '題目不重複');
    for (const p of ps) assert(p.lv === 'lv3');
  }
});

test('同 seed 出題可重現（測試用）', () => {
  for (const lv of ['lv1', 'lv2', 'lv3']) {
    const a = TL.generateSession(lv, { seed: 42 });
    const b = TL.generateSession(lv, { seed: 42 });
    assert.deepStrictEqual(a, b, lv);
  }
});

console.log('== 答案選項 ==');

test('選項 ×500×三檔：3 個、含正解、不重複、干擾項 ±1/±2、範圍合法', () => {
  for (let s = 0; s < 500; s++) {
    for (const lv of ['lv1', 'lv2', 'lv3']) {
      const rng = new TL.Rng(s * 3 + lv.length);
      const p = lv === 'lv1' ? TL.genLv1(rng) : lv === 'lv2' ? TL.genLv2(rng) : TL.genLv3(rng);
      const opts = TL.makeOptions(p, rng);
      assert(opts.length === 3, '3 個選項');
      assert(opts.includes(p.answer), '含正解');
      assert(new Set(opts).size === 3, '不重複');
      const max = lv === 'lv3' ? 20 : p.cap;
      for (const v of opts) {
        assert(Number.isInteger(v) && v >= 1 && v <= max, `範圍 1..${max}: ${v}`);
        assert(Math.abs(v - p.answer) <= 2, `干擾項在 ±2 內: ${v} vs ${p.answer}`);
      }
    }
  }
});

console.log('== 上車裁決 ==');

test('boardVerdict：沒坐滿可上車、坐滿拒收', () => {
  assert(TL.boardVerdict(0, 5).ok);
  assert(TL.boardVerdict(4, 5).ok);
  assert(!TL.boardVerdict(5, 5).ok);
  assert(TL.boardVerdict(5, 5).reason === 'full');
  assert(TL.boardVerdict(9, 10).ok);
  assert(!TL.boardVerdict(10, 10).ok);
});

test('固定案例：8+5 的湊十法 → 8 湊 2 是 10、剩 3、答案 13', () => {
  const p = TL.lv3Problem(8, 5);
  assert(p.need === 2 && p.leftover === 3 && p.answer === 13);
  assert.deepStrictEqual(TL.tenSplit(p), { toFill: 2, leftover: 3 });
});

console.log('\n結果：' + passed + ' 通過, ' + failed + ' 失敗');
process.exit(failed ? 1 : 0);
