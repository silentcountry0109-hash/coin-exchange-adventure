/* 周長邏輯單元測試：node tests/perimeter.test.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const P = require('../js/perimeter.logic.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + '\n    ' + e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert'); }

console.log('== 幾何核心 ==');

test('rect：周長 2(w+h)、面積 w·h、頂點合法', () => {
  for (let w = 2; w <= 7; w++) for (let h = 2; h <= 7; h++) {
    const v = P.rect(w, h);
    assert(P.perimeterOf(v) === 2 * (w + h), 'perim ' + w + 'x' + h);
    assert(P.areaOf(v) === w * h, 'area ' + w + 'x' + h);
    assert(P.isValidRectilinear(v), 'valid ' + w + 'x' + h);
  }
});

test('所有模板 ×隨機參數：邊交替水平垂直、封閉、周長=邊長和', () => {
  const rng = new P.Rng(1);
  for (let i = 0; i < 400; i++) {
    const mk = P.POLY_MAKERS[i % P.POLY_MAKERS.length];
    const v = P.normVerts(mk(rng));
    assert(P.isValidRectilinear(v), 'invalid template ' + (i % 5) + ' : ' + JSON.stringify(v));
    const e = P.edgesOf(v);
    assert(e.reduce((s, x) => s + x.len, 0) === P.perimeterOf(v), 'edge sum');
    // 每條邊純水平或純垂直
    for (const x of e) assert((x.dx === 0) !== (x.dy === 0), '邊非軸向');
  }
});

test('L 形周長＝外框周長 2(w+h)', () => {
  assert(P.perimeterOf(P.lshape(6, 5, 2, 2)) === 2 * (6 + 5));
  assert(P.perimeterOf(P.lshape(4, 4, 1, 1)) === 16);
});

test('凸形 bump 周長＝2(w+h)+2·bh；凹形 notch 周長＝2(w+h)+2·nd', () => {
  assert(P.perimeterOf(P.bump(5, 4, 1, 2, 2)) === 2 * (5 + 4) + 2 * 2);
  assert(P.perimeterOf(P.notch(5, 4, 1, 2, 2)) === 2 * (5 + 4) + 2 * 2);
});

console.log('== lv1 長方形 ==');

test('genRect 暖身 ×500：2..4、type=count、answer=周長', () => {
  for (let s = 0; s < 500; s++) {
    const q = P.genRect(new P.Rng(s), { warm: true });
    assert(q.w >= 2 && q.w <= 4 && q.h >= 2 && q.h <= 4, q.w + 'x' + q.h);
    assert(q.type === 'count' && q.answer === q.perimeter);
    assert(q.answer === 2 * (q.w + q.h));
  }
});

test('genRect ×500：2..7、選項 3 個含正解、面積干擾（若在範圍）', () => {
  let areaDistractorSeen = 0;
  for (let s = 0; s < 500; s++) {
    const q = P.genRect(new P.Rng(s), {});
    assert(q.w >= 2 && q.w <= 7 && q.h >= 2 && q.h <= 7);
    assert(q.options.length === 3 && new Set(q.options).size === 3, 'opts ' + q.options);
    assert(q.options.includes(q.answer), '缺正解');
    assert(q.options.every((o) => o >= 1), '選項 <1');
    if (q.area !== q.perimeter && q.options.includes(q.area)) areaDistractorSeen++;
  }
  assert(areaDistractorSeen > 50, '面積干擾幾乎沒出現：' + areaDistractorSeen);
});

console.log('== lv2 複雜圖形 ==');

test('genPoly ×500：合法直角形、周長≥8、sides≥5、選項含正解、含漏邊干擾機會', () => {
  let missSeen = 0;
  for (let s = 0; s < 500; s++) {
    const q = P.genPoly(new P.Rng(s), {});
    assert(P.isValidRectilinear(q.verts), '非法形 s=' + s);
    assert(q.perimeter >= 8, 'perim ' + q.perimeter);
    assert(q.sides.length >= 5, 'sides ' + q.sides.length);
    assert(q.answer === q.perimeter);
    assert(q.options.length === 3 && new Set(q.options).size === 3 && q.options.includes(q.answer), 'opts');
    if (q.sides.some((sd) => q.options.includes(q.perimeter - sd))) missSeen++;
  }
  assert(missSeen > 100, '漏邊干擾太少：' + missSeen);
});

console.log('== lv3 比周長 ==');

test('genCompare ×500：兩形周長不同、winner=較長者、選項含 A/B/一樣長', () => {
  for (let s = 0; s < 500; s++) {
    const q = P.genCompare(new P.Rng(s));
    assert(q.shapes.length === 2, 'shapes');
    assert(q.shapes[0].perimeter !== q.shapes[1].perimeter, '周長相同 s=' + s);
    const bigger = q.shapes[0].perimeter > q.shapes[1].perimeter ? q.shapes[0].key : q.shapes[1].key;
    assert(q.answer === bigger, 'winner 錯 s=' + s);
    const keys = q.options.map((o) => o.key).sort().join(',');
    assert(keys === 'A,B,same', 'options ' + keys);
  }
});

test('lv3 至少常出現「面積大但周長短」的反例（攻堅迷思）', () => {
  let trap = 0;
  for (let s = 0; s < 500; s++) {
    const q = P.genCompare(new P.Rng(s));
    const win = q.shapes.find((x) => x.key === q.answer);
    const lose = q.shapes.find((x) => x.key !== q.answer);
    if (lose.area > win.area) trap++; // 輸的那個面積反而比較大
  }
  assert(trap > 30, '面積陷阱反例太少：' + trap);
});

console.log('== 一場 5 題 ==');

test('lv1 場 ×200：5 題 count、第 1 題暖身、不重複、可重現', () => {
  for (let s = 0; s < 200; s++) {
    const a = P.generateSession(1, { rng: new P.Rng(s) });
    const b = P.generateSession(1, { rng: new P.Rng(s) });
    assert(a.length === 5 && a.every((q) => q.type === 'count'));
    assert(a[0].w <= 4 && a[0].h <= 4, '第1題暖身 s=' + s);
    const keys = a.map((q) => q.w + 'x' + q.h);
    assert(new Set(keys).size >= 4, '太多重複 s=' + s);
    assert(JSON.stringify(a.map((q) => q.options)) === JSON.stringify(b.map((q) => q.options)), '不可重現');
  }
});

test('lv2 場 ×200：5 題 add、前 4 題模板不同、皆合法', () => {
  for (let s = 0; s < 200; s++) {
    const a = P.generateSession(2, { rng: new P.Rng(s) });
    assert(a.length === 5 && a.every((q) => q.type === 'add'));
    for (const q of a) assert(P.isValidRectilinear(q.verts), 's=' + s);
  }
});

test('lv3 場 ×200：5 題 compare、每題兩形周長不同', () => {
  for (let s = 0; s < 200; s++) {
    const a = P.generateSession(3, { rng: new P.Rng(s) });
    assert(a.length === 5 && a.every((q) => q.type === 'compare'));
    for (const q of a) assert(q.shapes[0].perimeter !== q.shapes[1].perimeter, 's=' + s);
  }
});

console.log('\n結果：' + pass + ' 通過, ' + fail + ' 失敗');
process.exit(fail ? 1 : 0);
