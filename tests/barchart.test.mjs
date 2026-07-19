/* 長條圖邏輯單元測試：node tests/barchart.test.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const B = require('../js/barchart.logic.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + '\n    ' + e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert'); }

function checkCategories(q, maxValue) {
  assert(q.categories.length >= 3 && q.categories.length <= 4, '類別數 ' + q.categories.length);
  assert(new Set(q.categories.map((c) => c.key)).size === q.categories.length, '類別重複');
  assert(q.categories.every((c) => c.name && c.emoji && c.value >= 1 && c.value <= maxValue), '類別資料越界');
  assert(new Set(q.categories.map((c) => c.value)).size === q.categories.length, '高度應不同');
  assert(q.yMax >= Math.max(...q.categories.map((c) => c.value)), 'yMax 太小');
}

function checkOptions(q, min, max) {
  assert(q.options.length === 3, '選項不是 3 個：' + JSON.stringify(q.options));
  assert(new Set(q.options).size === 3, '選項重複：' + JSON.stringify(q.options));
  assert(q.options.includes(q.answer), '選項缺正解');
  assert(q.options.includes(q.requiredDistractor), '缺指定干擾：' + q.requiredDistractor);
  if (typeof q.answer === 'number') {
    assert(q.options.every((v) => Number.isInteger(v) && v >= min && v <= max), '數字選項越界');
  } else {
    const keys = new Set(q.categories.map((c) => c.key));
    assert(q.options.every((v) => keys.has(v)), '類別選項非法');
  }
}

console.log('== 隨機工具與選項 ==');

test('Rng 同 seed 可重現，shuffle 不改原陣列', () => {
  const a = new B.Rng(123), b = new B.Rng(123);
  const src = [1, 2, 3, 4];
  assert(JSON.stringify([a.int(1, 9), a.pick(src), a.shuffle(src)])
    === JSON.stringify([b.int(1, 9), b.pick(src), b.shuffle(src)]));
  assert(src.join(',') === '1,2,3,4', 'shuffle 改到原陣列');
});

test('makeOptions ×500：3 個、含正解與指定干擾、不重複且範圍合法', () => {
  for (let s = 0; s < 500; s++) {
    const answer = 1 + (s % 30), required = answer === 30 ? 29 : answer + 1;
    const opts = B.makeOptions(answer, [required], new B.Rng(s), { min: 0, max: 40 });
    assert(opts.length === 3 && new Set(opts).size === 3, 's=' + s);
    assert(opts.includes(answer) && opts.includes(required), 's=' + s);
    assert(opts.every((v) => v >= 0 && v <= 40), '範圍 s=' + s);
  }
});

console.log('== lv1 讀長條圖 ==');

test('genRead ×500：約束、答案正確、選項含相鄰值或相鄰名次干擾', () => {
  for (let s = 0; s < 500; s++) {
    const q = B.genRead(new B.Rng(s));
    checkCategories(q, 8);
    assert(q.type === 'read' && ['read', 'most', 'least'].includes(q.kind), '題型');
    if (q.kind === 'read') {
      const target = q.categories.find((c) => c.key === q.targetKey);
      assert(target && q.answer === target.value, '讀值答案錯 s=' + s);
      checkOptions(q, 1, 9);
      assert(Math.abs(q.requiredDistractor - q.answer) === 1, '不是相鄰數干擾');
    } else {
      const sorted = q.categories.slice().sort((a, b) => q.kind === 'most' ? b.value - a.value : a.value - b.value);
      assert(q.answer === sorted[0].key && q.requiredDistractor === sorted[1].key, '最多最少答案錯');
      checkOptions(q, 0, 0);
    }
  }
});

test('genRead 暖身 ×500：固定 3 類、讀值、高度 1..5', () => {
  for (let s = 0; s < 500; s++) {
    const q = B.genRead(new B.Rng(s), { warm: true });
    assert(q.warm && q.kind === 'read' && q.categories.length === 3);
    checkCategories(q, 5);
  }
});

console.log('== lv2 蓋長條圖 ==');

test('genBuild ×500：目標與類別一致、總格數正確、選項含少蓋一格', () => {
  for (let s = 0; s < 500; s++) {
    const q = B.genBuild(new B.Rng(s));
    checkCategories(q, 7);
    assert(q.type === 'build' && q.kind === 'stack');
    assert(JSON.stringify(q.targets) === JSON.stringify(q.categories.map((c) => c.value)), 'targets 不一致');
    assert(q.answer === q.targets.reduce((a, b) => a + b, 0), '總格數錯');
    assert(q.requiredDistractor === q.answer - 1, '少蓋一格干擾錯');
    checkOptions(q, 1, 36);
  }
});

test('genBuild 暖身 ×500：固定 3 類且高度不超過 4', () => {
  for (let s = 0; s < 500; s++) {
    const q = B.genBuild(new B.Rng(s), { warm: true });
    assert(q.warm && q.categories.length === 3);
    checkCategories(q, 4);
  }
});

console.log('== lv3 比較問答 ==');

test('genCompare ×500：相差／總和／極差答案與典型干擾正確', () => {
  for (let s = 0; s < 500; s++) {
    const q = B.genCompare(new B.Rng(s));
    checkCategories(q, 9);
    assert(q.type === 'compare' && ['difference', 'total', 'range'].includes(q.kind));
    if (q.kind === 'total') {
      const total = q.categories.reduce((n, c) => n + c.value, 0);
      const omitted = q.categories.find((c) => c.key === q.omittedKey);
      assert(q.answer === total && omitted && q.requiredDistractor === total - omitted.value, '總和／漏算錯');
    } else {
      const a = q.categories.find((c) => c.key === q.leftKey);
      const b = q.categories.find((c) => c.key === q.rightKey);
      assert(a && b && a.value > b.value, '比較順序錯');
      assert(q.answer === a.value - b.value, '相差答案錯');
      assert(q.requiredDistractor === a.value + b.value, '加法迷思干擾錯');
    }
    checkOptions(q, 0, 40);
  }
});

test('genCompare 暖身 ×500：固定 3 類、相差題、高度 1..5', () => {
  for (let s = 0; s < 500; s++) {
    const q = B.genCompare(new B.Rng(s), { warm: true });
    assert(q.warm && q.kind === 'difference' && q.categories.length === 3);
    checkCategories(q, 5);
  }
});

console.log('== 一場 5 題 ==');

test('三關場次 ×200：各 5 題、第 1 題暖身、不重複、同 seed 可重現', () => {
  for (let lv = 1; lv <= 3; lv++) for (let s = 0; s < 200; s++) {
    const a = B.generateSession(lv, { rng: new B.Rng(s) });
    const b = B.generateSession(lv, { rng: new B.Rng(s) });
    assert(a.length === 5, '題數 lv=' + lv + ' s=' + s);
    assert(a[0].warm === true && a.slice(1).every((q) => !q.warm), '暖身位置錯');
    assert(new Set(a.map(B.questionKey)).size === 5, '題目重複 lv=' + lv + ' s=' + s);
    assert(JSON.stringify(a) === JSON.stringify(b), '不可重現 lv=' + lv + ' s=' + s);
    assert(a.every((q) => q.type === (lv === 1 ? 'read' : lv === 2 ? 'build' : 'compare')), '關卡 type 錯');
  }
});

test('場次題型配置：lv1 含讀值／最多／最少，lv3 含相差／總和／極差', () => {
  for (let s = 0; s < 200; s++) {
    const l1 = new Set(B.generateSession(1, { rng: new B.Rng(s) }).map((q) => q.kind));
    const l3 = new Set(B.generateSession(3, { rng: new B.Rng(s) }).map((q) => q.kind));
    assert(['read', 'most', 'least'].every((k) => l1.has(k)), 'lv1 缺題型 s=' + s);
    assert(['difference', 'total', 'range'].every((k) => l3.has(k)), 'lv3 缺題型 s=' + s);
  }
});

console.log('\n結果：' + pass + ' 通過, ' + fail + ' 失敗');
process.exit(fail ? 1 : 0);
