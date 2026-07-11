/* 平分蛋糕 — 邏輯單元測試（node tests/cake.test.mjs） */
import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);
const CK = require('../js/cake.logic.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}

console.log('== 出題器 ==');

test('lv1 公平切 ×500：n∈{2,4}、刀數=n/2、每刀 1 正解過圓心＋2 干擾', () => {
  for (let s = 0; s < 500; s++) {
    const p = CK.genFair(new CK.Rng(s));
    assert([2, 4].includes(p.n), `n: ${p.n}`);
    assert(p.cuts.length === p.n / 2, '刀數 = n/2');
    for (const cut of p.cuts) {
      assert(cut.correct.offset === 0, '正解過圓心');
      assert(cut.wrongs.length === 2, '2 個干擾');
      for (const w of cut.wrongs) {
        // 干擾必須「不平分」：偏移弦，或（第二刀）過圓心但 45° 斜切
        assert(w.offset !== 0 || w.kind === 'skew', `干擾不平分: ${JSON.stringify(w)}`);
        if (w.kind === 'offset') assert(Math.abs(w.offset) >= 0.3, '偏移夠明顯');
      }
      assert(cut.correct.angle >= 0 && cut.correct.angle < 180, '角度正規化');
    }
    if (p.n === 4) {
      const d = Math.abs(p.cuts[1].correct.angle - p.cuts[0].correct.angle) % 180;
      assert(d === 90, `第二刀垂直第一刀: ${d}`);
      const skew = p.cuts[1].wrongs.find((w) => w.kind === 'skew');
      assert(skew && skew.offset === 0, 'skew 干擾過圓心（兩大兩小迷思）');
    }
  }
});

test('lv2 幾分之一 ×500：n 合法、answer=1/n、有夥伴', () => {
  for (let s = 0; s < 500; s++) {
    const p = CK.genUnit(new CK.Rng(s));
    assert(CK.UNIT_NS.includes(p.n), `n: ${p.n}`);
    assert(p.answer === '1/' + p.n);
    assert(p.friend && p.friend.img, '有夥伴');
    assert(p.flavor && p.flavor.body, '有口味');
  }
});

test('lv3 比大小 ×500：a≠b、winner=份數少的、answer=贏家 key', () => {
  for (let s = 0; s < 500; s++) {
    const p = CK.genCompare(new CK.Rng(s));
    const [a, b] = p.parts;
    assert(a !== b, 'a≠b');
    assert(CK.UNIT_NS.includes(a) && CK.UNIT_NS.includes(b));
    const w = a < b ? 0 : 1;
    assert(p.winner === w, 'winner 正確（份數少→每份大）');
    assert(p.answer === p.friends[w].key, 'answer=贏家');
    assert(p.friends[0].key !== p.friends[1].key, '兩位不同夥伴');
  }
});

console.log('== 一場 5 題 ==');

test('場結構 ×200：lv1 先2後4、lv2 先1/2、lv3 先2vs8、題目不重複', () => {
  for (let s = 0; s < 200; s++) {
    const p1 = CK.generateSession(1, { seed: s });
    assert(p1.length === 5);
    assert(p1[0].n === 2 && p1[1].n === 2 && p1[2].n === 4, 'lv1 先 2 份再 4 份');
    const p2 = CK.generateSession(2, { seed: s });
    assert(p2[0].n === 2, 'lv2 第 1 題 1/2');
    assert(new Set(p2.map((p) => p.n)).size === 5, 'lv2 份數不重複');
    const p3 = CK.generateSession(3, { seed: s });
    assert(p3[0].parts.includes(2) && p3[0].parts.includes(8), 'lv3 第 1 題 2 vs 8');
  }
});

test('同 seed 可重現', () => {
  for (const lv of [1, 2, 3]) {
    assert.deepStrictEqual(CK.generateSession(lv, { seed: 42 }), CK.generateSession(lv, { seed: 42 }));
  }
});

console.log('== 選項 ==');

test('lv2 分數選項 ×400：3 個、含正解、不重複、都是 1/n 形式', () => {
  for (let s = 0; s < 400; s++) {
    const rng = new CK.Rng(s);
    const p = CK.genUnit(rng);
    const opts = CK.makeUnitOptions(p, rng);
    assert(opts.length === 3 && opts.includes('1/' + p.n));
    assert(new Set(opts).size === 3, '不重複');
    for (const o of opts) assert(/^1\/[2-9]$/.test(o), `形式: ${o}`);
  }
});

test('lv3 比較選項 ×400：兩夥伴＋一樣大、含正解', () => {
  for (let s = 0; s < 400; s++) {
    const rng = new CK.Rng(s);
    const p = CK.genCompare(rng);
    const opts = CK.makeCompareOptions(p, rng);
    assert(opts.length === 3);
    const keys = opts.map((o) => o.key);
    assert(keys.includes(p.friends[0].key) && keys.includes(p.friends[1].key) && keys.includes('same'));
    assert(keys.includes(p.answer), '含正解');
  }
});

console.log('\n結果：' + passed + ' 通過, ' + failed + ' 失敗');
process.exit(failed ? 1 : 0);
