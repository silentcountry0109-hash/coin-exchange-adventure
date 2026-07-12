/* 一位小數邏輯單元測試：node tests/decimal.test.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const D = require('../js/decimal.logic.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + '\n    ' + e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert'); }

console.log('== 顯示 ==');

test('format：十分之一格數 → 一位小數字串', () => {
  assert(D.format(7) === '0.7', D.format(7));
  assert(D.format(13) === '1.3', D.format(13));
  assert(D.format(10) === '1.0', D.format(10));
  assert(D.format(20) === '2.0', D.format(20));
  assert(D.wholeOf(13) === 1 && D.tenthOf(13) === 3);
});

console.log('== lv1 讀小數 ==');

test('genRead 暖身 ×500：純十分之幾、2~5 格', () => {
  for (let s = 0; s < 500; s++) {
    const q = D.genRead(new D.Rng(s), { warm: true });
    assert(q.T >= 2 && q.T <= 5, 'T=' + q.T);
    assert(q.answer === D.format(q.T));
    assert(q.whole === 0 && q.tenth === q.T);
  }
});

test('genRead overOne ×500：一整杯又幾格（tenth≠0）', () => {
  for (let s = 0; s < 500; s++) {
    const q = D.genRead(new D.Rng(s), { overOne: true });
    assert(q.T >= 11 && q.T <= 19, 'T=' + q.T);
    assert(q.tenth !== 0, '整數格不該出現在 overOne：T=' + q.T);
    assert(q.whole === 1);
  }
});

test('makeReadOptions ×800：3 個、含正解、不重複、正解為一位小數', () => {
  for (let s = 0; s < 800; s++) {
    const rng = new D.Rng(s);
    const T = rng.int(1, 19);
    const o = D.makeReadOptions(T, rng);
    assert(o.length === 3, 'len ' + o.length);
    assert(new Set(o).size === 3, '重複 ' + o);
    assert(o.includes(D.format(T)), '缺正解 T=' + T + ' → ' + o);
  }
});

test('makeReadOptions：純十分之幾一定放「忘小數點」干擾（整數字串）', () => {
  for (let T = 1; T <= 9; T++) {
    let found = false;
    for (let s = 0; s < 40; s++) {
      const o = D.makeReadOptions(T, new D.Rng(s));
      if (o.includes(String(T))) { found = true; break; }
    }
    assert(found, 'T=' + T + ' 從沒出現忘小數點干擾');
  }
});

console.log('== lv2 數線找家 ==');

test('genPlace ×500：目標在線內、非整數格、lineMax∈{10,20}', () => {
  for (let s = 0; s < 500; s++) {
    const small = D.genPlace(new D.Rng(s), {});
    assert(small.lineMax === 10 && small.T >= 1 && small.T <= 9, 'small T=' + small.T);
    assert(small.T % 10 !== 0, '不該落在整數格');
    const big = D.genPlace(new D.Rng(s), { big: true });
    assert(big.lineMax === 20 && big.T >= 1 && big.T <= 19, 'big T=' + big.T);
    assert(big.T % 10 !== 0, 'big 不該落在整數格：' + big.T);
    assert(big.answer === D.format(big.T));
  }
});

console.log('== lv3 小數加法 ==');

test('genAdd 暖身 ×500：不進位、和 3~9', () => {
  for (let s = 0; s < 500; s++) {
    const q = D.genAdd(new D.Rng(s), { warm: true });
    assert(q.a >= 1 && q.b >= 1 && q.a <= 9 && q.b <= 9, q.a + '+' + q.b);
    assert(q.sum >= 3 && q.sum <= 9, 'sum=' + q.sum);
    assert(q.carry === false, '暖身不該進位');
    assert(q.answer === D.format(q.sum));
  }
});

test('genAdd exact ×500：剛好湊成一整瓶（和＝10）', () => {
  for (let s = 0; s < 500; s++) {
    const q = D.genAdd(new D.Rng(s), { exact: true });
    assert(q.sum === 10, 'sum=' + q.sum);
    assert(q.answer === '1.0');
  }
});

test('genAdd 進位 ×500：和 11~18、a/b 合法', () => {
  for (let s = 0; s < 500; s++) {
    const q = D.genAdd(new D.Rng(s), {});
    assert(q.a >= 1 && q.a <= 9 && q.b >= 1 && q.b <= 9, q.a + '+' + q.b);
    assert(q.sum >= 11 && q.sum <= 18, 'sum=' + q.sum);
    assert(q.carry === true, '應進位');
  }
});

test('makeAddOptions ×800：3 個、含正解、不重複、進位題必含「忘進位」干擾', () => {
  for (let s = 0; s < 800; s++) {
    const rng = new D.Rng(s);
    const a = rng.int(1, 9), b = rng.int(1, 9);
    const o = D.makeAddOptions(a, b, rng);
    assert(o.length === 3 && new Set(o).size === 3, o.join(','));
    assert(o.includes(D.format(a + b)), '缺正解 ' + a + '+' + b + ' → ' + o);
  }
  // 忘進位干擾：0.7+0.5 應能出現 0.2
  let hit = false;
  for (let s = 0; s < 60; s++) {
    const o = D.makeAddOptions(7, 5, new D.Rng(s));
    if (o.includes('0.2')) { hit = true; break; }
  }
  assert(hit, '0.7+0.5 從沒出現忘進位干擾 0.2');
});

console.log('== 一場 5 題 ==');

test('lv1 場 ×200：5 題 read、第 1 題暖身、後兩題含整數位、值不重複、可重現', () => {
  for (let s = 0; s < 200; s++) {
    const a = D.generateSession(1, { rng: new D.Rng(s) });
    const b = D.generateSession(1, { rng: new D.Rng(s) });
    assert(a.length === 5);
    assert(a.every((q) => q.type === 'read'));
    assert(a[0].T >= 2 && a[0].T <= 5, '第1題暖身 s=' + s);
    assert(a[3].whole >= 1 && a[4].whole >= 1, '第4/5題應有整數位 s=' + s);
    assert(new Set(a.map((q) => q.T)).size === 5, '值重複 s=' + s);
    assert(JSON.stringify(a.map((q) => [q.T, q.options])) === JSON.stringify(b.map((q) => [q.T, q.options])), '不可重現');
  }
});

test('lv2 場 ×200：5 題 place、第 3~5 題到 0..2、不重複', () => {
  for (let s = 0; s < 200; s++) {
    const a = D.generateSession(2, { rng: new D.Rng(s) });
    assert(a.length === 5 && a.every((q) => q.type === 'place'));
    assert(a[0].lineMax === 10 && a[2].lineMax === 20, 's=' + s);
    assert(new Set(a.map((q) => q.lineMax + ':' + q.T)).size === 5, '重複 s=' + s);
  }
});

test('lv3 場 ×200：5 題 add、第 1 題不進位、第 3 題湊整、至少 2 題進位、不重複', () => {
  for (let s = 0; s < 200; s++) {
    const a = D.generateSession(3, { rng: new D.Rng(s) });
    assert(a.length === 5 && a.every((q) => q.type === 'add'));
    assert(a[0].carry === false, '第1題不進位 s=' + s);
    assert(a[2].sum === 10, '第3題湊整 s=' + s);
    assert(a.filter((q) => q.carry).length >= 2, '進位題太少 s=' + s);
    assert(new Set(a.map((q) => q.a + '+' + q.b)).size === 5, '重複 s=' + s);
  }
});

console.log('\n結果：' + pass + ' 通過, ' + fail + ' 失敗');
process.exit(fail ? 1 : 0);
