/* 七巧板邏輯單元測試：node tests/tangram.test.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const T = require('../js/tangram.logic.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + '\n    ' + e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert'); }

console.log('== 幾何核心 ==');

test('placePiece：st 各旋轉都是合法小三角形（邊長 2√2,2√2,4）', () => {
  for (let rot = 0; rot < 8; rot++) {
    const pts = T.placePiece('st', [3, 5], rot, false);
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const sides = [d(pts[0], pts[1]), d(pts[1], pts[2]), d(pts[2], pts[0])].sort((a, b) => a - b);
    assert(Math.abs(sides[0] - 2 * T.SQ2) < 1e-9 && Math.abs(sides[2] - 4) < 1e-9, 'rot=' + rot);
    assert(Math.abs(T.polyArea(pts) - 4) < 1e-9, '面積 rot=' + rot);
  }
});

test('resolvePiece：placePiece 來回一致（含 par 鏡像）×全型×8 轉', () => {
  for (const type of Object.keys(T.PIECES)) {
    for (const flip of [false, true]) {
      for (let rot = 0; rot < 8; rot++) {
        const pts = T.placePiece(type, [2, 3], rot, flip);
        const r = T.resolvePiece(type, pts);
        assert(r.ok, type + ' rot=' + rot + ' flip=' + flip + ' 解不出來');
        // 解出的 (rot,flip) 重擺後應與原頂點集合一致（對稱塊可能解出等價轉角）
        const back = T.placePiece(type, [0, 0], r.rot, r.flip);
        const c1 = T.polyCentroid(pts), c2 = T.polyCentroid(back);
        const moved = back.map(([x, y]) => [x - c2[0] + c1[0], y - c2[1] + c1[1]]);
        for (const [mx, my] of moved) {
          assert(pts.some(([px, py]) => Math.abs(px - mx) < 0.03 && Math.abs(py - my) < 0.03),
            type + ' rot=' + rot + ' flip=' + flip + ' 重擺不重合');
        }
      }
    }
  }
});

test('resolvePiece：par 有手性——鏡像不會被誤判為未鏡像', () => {
  const pts = T.placePiece('par', [0, 0], 0, true);
  const r = T.resolvePiece('par', pts);
  assert(r.ok && r.flip === true, '應解出 flip=true，得到 ' + JSON.stringify(r));
});

test('resolvePiece：亂七八糟的頂點要拒絕', () => {
  const r = T.resolvePiece('st', [[0, 0], [5, 0], [2, 2]]);
  assert(!r.ok, '邊長不對應該拒絕');
});

test('pointInPoly / polyArea 基準', () => {
  const sq = [[0, 0], [4, 0], [4, 4], [0, 4]];
  assert(T.pointInPoly(2, 2, sq) && !T.pointInPoly(5, 2, sq));
  assert(Math.abs(T.polyArea(sq) - 16) < 1e-9);
});

console.log('== 圖案驗證 ==');

test('lv1 五題全部通過驗證（不重疊、相連、面積守恆）', () => {
  for (const f of T.FIGURES_LV1) {
    const v = T.validateFigure(f);
    assert(v.ok, f.id + ': ' + v.errors.join('；'));
  }
});

test('驗證器抓得到重疊', () => {
  const bad = {
    id: 'x', zh: 'x',
    pieces: [
      { type: 'st', pts: [[0, 2], [4, 2], [2, 0]] },
      { type: 'st', pts: [[0.5, 2], [4.5, 2], [2.5, 0]] },
    ],
  };
  const v = T.validateFigure(bad);
  assert(!v.ok && v.errors.some((e) => e.includes('重疊')), v.errors.join('；'));
});

test('驗證器抓得到分離', () => {
  const bad = {
    id: 'x', zh: 'x',
    pieces: [
      { type: 'st', pts: [[0, 2], [4, 2], [2, 0]] },
      { type: 'st', pts: [[8, 2], [12, 2], [10, 0]] },
    ],
  };
  const v = T.validateFigure(bad);
  assert(!v.ok && v.errors.some((e) => e.includes('相連')), v.errors.join('；'));
});

test('驗證器抓得到超量用塊', () => {
  const bad = {
    id: 'x', zh: 'x',
    pieces: [
      { type: 'mt', pts: [[0, 4], [4, 4], [0, 0]] },
      { type: 'mt', pts: [[4, 4], [8, 4], [8, 0]] },
    ],
  };
  const v = T.validateFigure(bad);
  assert(!v.ok && v.errors.some((e) => e.includes('超過')), v.errors.join('；'));
});

console.log('== 圖案庫（lv2/lv3） ==');

test('lv2 圖案庫：≥6 個、4~5 塊、三角形 2~5、全部驗證通過', () => {
  assert(T.FIGURES_LV2.length >= 6, '只有 ' + T.FIGURES_LV2.length + ' 個');
  for (const f of T.FIGURES_LV2) {
    const v = T.validateFigure(f);
    assert(v.ok, f.id + ': ' + v.errors.join('；'));
    assert(f.pieces.length >= 4 && f.pieces.length <= 5, f.id + ' 塊數 ' + f.pieces.length);
    const n = T.triCount(v.fig);
    assert(n >= 2 && n <= 5, f.id + ' 三角形 ' + n + ' 塊');
    assert(f.zh && f.say, f.id + ' 缺中文名或台詞');
  }
});

test('lv3 圖案庫：≥6 個、3~6 塊、有暖身（≤4 塊 ≥2 個）、全部驗證通過', () => {
  assert(T.FIGURES_LV3.length >= 6, '只有 ' + T.FIGURES_LV3.length + ' 個');
  let easy = 0;
  for (const f of T.FIGURES_LV3) {
    const v = T.validateFigure(f);
    assert(v.ok, f.id + ': ' + v.errors.join('；'));
    assert(f.pieces.length >= 3 && f.pieces.length <= 6, f.id + ' 塊數 ' + f.pieces.length);
    if (f.pieces.length <= 4) easy++;
    assert(f.zh && f.say, f.id + ' 缺中文名或台詞');
  }
  assert(easy >= 2, '≤4 塊的暖身圖案只有 ' + easy + ' 個');
});

console.log('== 一場 5 題 ==');

test('lv1 場：固定 5 題、選項含正解、可重現', () => {
  const s1 = T.generateSession(1, { rng: new T.Rng(42) });
  const s2 = T.generateSession(1, { rng: new T.Rng(42) });
  assert(s1.length === 5);
  for (let i = 0; i < 5; i++) {
    const q = s1[i];
    assert(q.type === 'shape' && q.options.length === 3, '題 ' + i);
    assert(q.options.includes(q.answer), '題 ' + i + ' 選項缺正解');
    assert(new Set(q.options).size === 3, '題 ' + i + ' 選項重複');
    assert(JSON.stringify(q.options) === JSON.stringify(s2[i].options), '不可重現');
  }
});

test('lv2/lv3 場 ×200：5 題不重複、塊數遞增、count 選項正確', () => {
  if (T.FIGURES_LV2.length < 6 || T.FIGURES_LV3.length < 6) {
    throw new Error('圖案庫未就緒，先跳過（圖案齊了要回來補跑）');
  }
  for (let seed = 0; seed < 200; seed++) {
    for (const lv of [2, 3]) {
      const s = T.generateSession(lv, { rng: new T.Rng(seed) });
      assert(s.length === 5, 'lv' + lv + ' seed=' + seed);
      const ids = new Set(s.map((q) => q.fig.id));
      assert(ids.size === 5, 'lv' + lv + ' 圖案重複 seed=' + seed);
      for (let i = 1; i < 5; i++) {
        assert(s[i].fig.pieces.length >= s[i - 1].fig.pieces.length, 'lv' + lv + ' 塊數沒遞增');
      }
      if (lv === 2) {
        for (const q of s) {
          assert(q.options.length === 3 && new Set(q.options).size === 3, 'count 選項');
          assert(q.options.includes(q.answer), 'count 缺正解');
          assert(q.options.every((o) => o >= 1), 'count 選項出現 0');
        }
      }
    }
  }
});

test('makeCountOptions ×400：3 個、含正解、不重複、≥1', () => {
  for (let seed = 0; seed < 400; seed++) {
    const rng = new T.Rng(seed);
    const n = rng.int(1, 6);
    const o = T.makeCountOptions(n, rng);
    assert(o.length === 3 && new Set(o).size === 3 && o.includes(n) && o.every((x) => x >= 1),
      'n=' + n + ' → ' + o);
  }
});

test('makeShapeOptions ×400：3 個、含正解、不重複、都在題庫', () => {
  for (let seed = 0; seed < 400; seed++) {
    const rng = new T.Rng(seed);
    const ans = rng.pick(T.SHAPE_POOL);
    const o = T.makeShapeOptions(ans, rng);
    assert(o.length === 3 && new Set(o).size === 3 && o.includes(ans), ans + ' → ' + o);
    assert(o.every((x) => T.SHAPE_POOL.includes(x)));
  }
});

console.log('\n結果：' + pass + ' 通過, ' + fail + ' 失敗');
process.exit(fail ? 1 : 0);
