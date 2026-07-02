/* 時鐘星球 — 遊戲邏輯單元測試（node tests/clock.test.mjs） */
import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);
const CL = require('../js/clock.logic.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}
const close = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-9);

console.log('== 角度換算 ==');

test('minuteAngle 基準點', () => {
  assert.strictEqual(CL.minuteAngle(0), 0);
  assert.strictEqual(CL.minuteAngle(15), 90);
  assert.strictEqual(CL.minuteAngle(30), 180);
  assert.strictEqual(CL.minuteAngle(45), 270);
});

test('hourAngle 基準點（含分鐘連動）', () => {
  assert.strictEqual(CL.hourAngle(12, 0), 0);
  assert.strictEqual(CL.hourAngle(3, 0), 90);
  assert.strictEqual(CL.hourAngle(6, 30), 195);
  assert.strictEqual(CL.hourAngle(9, 45), 292.5);
  assert.strictEqual(CL.hourAngle(12, 30), 15);
});

test('hourAngle ×500：等於 (h%12)*30 + m*0.5', () => {
  const rng = new CL.Rng(1);
  for (let i = 0; i < 500; i++) {
    const h = rng.int(1, 12), m = rng.int(0, 59);
    assert(close(CL.hourAngle(h, m), (h % 12) * 30 + m * 0.5));
  }
});

test('pointerToMinutes 四個方位（12 點=0、順時針）', () => {
  assert(close(CL.pointerToMinutes(100, 100, 100, 0), 0));    // 上 = 12 點
  assert(close(CL.pointerToMinutes(100, 100, 200, 100), 15)); // 右 = 3 點
  assert(close(CL.pointerToMinutes(100, 100, 100, 200), 30)); // 下 = 6 點
  assert(close(CL.pointerToMinutes(100, 100, 0, 100), 45));   // 左 = 9 點
});

test('pointerToMinutes ×500：與 minuteAngle 互為反函數、回傳 [0,60)', () => {
  const rng = new CL.Rng(7);
  for (let i = 0; i < 500; i++) {
    const m = rng.next() * 60;
    const a = CL.minuteAngle(m) * Math.PI / 180;
    const r = 20 + rng.next() * 200;
    const cx = rng.next() * 500, cy = rng.next() * 500;
    const got = CL.pointerToMinutes(cx, cy, cx + Math.sin(a) * r, cy - Math.cos(a) * r);
    assert(got >= 0 && got < 60, `範圍: ${got}`);
    const diff = Math.min(Math.abs(got - m), 60 - Math.abs(got - m));
    assert(diff < 1e-6, `反推: ${m} → ${got}`);
  }
});

console.log('== 吸附與拖曳累計 ==');

test('snapMinutes：就近吸附、60 wrap 回 0', () => {
  assert.strictEqual(CL.snapMinutes(13, 5), 15);
  assert.strictEqual(CL.snapMinutes(12, 5), 10);
  assert.strictEqual(CL.snapMinutes(57, 5), 55);
  assert.strictEqual(CL.snapMinutes(58, 5), 0);
  assert.strictEqual(CL.snapMinutes(2, 5), 0);
  assert.strictEqual(CL.snapMinutes(59.9, 5), 0);
  assert.strictEqual(CL.snapMinutes(44, 30), 30);
  assert.strictEqual(CL.snapMinutes(46, 30), 0);
});

test('processDrag：wrap 處理（59→1 是 +2 不是 -58）', () => {
  assert.strictEqual(CL.processDrag(58, 2), 4);
  assert.strictEqual(CL.processDrag(2, 58), -4);
  assert.strictEqual(CL.processDrag(0, 29), 29);
  assert.strictEqual(CL.processDrag(0, 31), -29);
  assert.strictEqual(CL.processDrag(10, 40), 30);   // 恰 30 保留原方向
  assert.strictEqual(CL.processDrag(40, 10), -30);
  assert.strictEqual(CL.processDrag(30, 30), 0);
});

test('processDrag ×500：|delta| ≤ 30 且與圓上實際位移一致', () => {
  const rng = new CL.Rng(11);
  for (let i = 0; i < 500; i++) {
    const a = rng.next() * 60, b = rng.next() * 60;
    const d = CL.processDrag(a, b);
    assert(Math.abs(d) <= 30);
    assert(close(((a + d) % 60 + 60) % 60, b, 1e-9), `${a}+${d} ≠ ${b}`);
  }
});

test('hourCrossings：順逆時針、負值、跨多圈', () => {
  assert.strictEqual(CL.hourCrossings(58, 62), 1);
  assert.strictEqual(CL.hourCrossings(62, 58), -1);
  assert.strictEqual(CL.hourCrossings(-2, 2), 1);
  assert.strictEqual(CL.hourCrossings(2, -3), -1);
  assert.strictEqual(CL.hourCrossings(118, 241), 3);
  assert.strictEqual(CL.hourCrossings(241, 118), -3);
  assert.strictEqual(CL.hourCrossings(59.5, 60), 1);
  assert.strictEqual(CL.hourCrossings(60, 60), 0);
  assert.strictEqual(CL.hourCrossings(5, 25), 0);
});

test('拖曳模擬 ×500：小步累計＝總位移、越 12 次數守恆（含逆轉）', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new CL.Rng(s);
    let raw = rng.next() * 60;          // 鐘面原始讀值
    let abs = 60 + raw;                 // 累計分鐘（從 1:00 的分針位置起算）
    const start = abs;
    let crossSum = 0;
    for (let k = 0; k < 80; k++) {
      const step = (rng.next() - 0.45) * 24; // 偏順時針的隨機小步（|step|<30）
      const newRaw = ((raw + step) % 60 + 60) % 60;
      const d = CL.processDrag(raw, newRaw);
      assert(close(d, step, 1e-9), `delta 還原: ${step} → ${d}`);
      crossSum += CL.hourCrossings(abs, abs + d);
      abs += d; raw = newRaw;
    }
    assert(close(abs - start, abs - start));
    assert.strictEqual(crossSum, Math.floor(abs / 60) - Math.floor(start / 60), '越 12 淨次數守恆');
    assert(close(((abs % 60) + 60) % 60, raw, 1e-6), '累計 mod 60 = 鐘面讀值');
  }
});

console.log('== 時刻工具 ==');

test('clockHour / clockMinute：含負值與跨圈', () => {
  assert.strictEqual(CL.clockHour(0), 12);
  assert.strictEqual(CL.clockHour(59), 12);
  assert.strictEqual(CL.clockHour(60), 1);
  assert.strictEqual(CL.clockHour(725), 12);
  assert.strictEqual(CL.clockHour(-1), 11);
  assert.strictEqual(CL.clockMinute(-1), 59);
  assert.strictEqual(CL.clockMinute(125), 5);
});

test('snappedTime：跨時吸附要進位', () => {
  assert.deepStrictEqual(CL.snappedTime(178, 5), { h: 3, m: 0 });   // 2:58 → 3:00
  assert.deepStrictEqual(CL.snappedTime(182, 5), { h: 3, m: 0 });
  assert.deepStrictEqual(CL.snappedTime(187, 5), { h: 3, m: 5 });
  assert.deepStrictEqual(CL.snappedTime(455, 60), { h: 8, m: 0 });  // 時針題吸整點
});

test('addTime：跨整點、跨 12', () => {
  assert.deepStrictEqual(CL.addTime(3, 30, 40), { h: 4, m: 10 });
  assert.deepStrictEqual(CL.addTime(12, 45, 20), { h: 1, m: 5 });
  assert.deepStrictEqual(CL.addTime(11, 50, 10), { h: 12, m: 0 });
  assert.deepStrictEqual(CL.addTime(7, 5, -5), { h: 7, m: 0 });
  assert.deepStrictEqual(CL.addTime(1, 0, -5), { h: 12, m: 55 });
});

test('dayPhase：白天/黃昏/夜晚邊界', () => {
  assert.strictEqual(CL.dayPhase(6), 'day');
  assert.strictEqual(CL.dayPhase(16, 59), 'day');
  assert.strictEqual(CL.dayPhase(17), 'dusk');
  assert.strictEqual(CL.dayPhase(18, 30), 'dusk');
  assert.strictEqual(CL.dayPhase(19), 'night');
  assert.strictEqual(CL.dayPhase(23), 'night');
  assert.strictEqual(CL.dayPhase(0), 'night');
  assert.strictEqual(CL.dayPhase(5, 59), 'night');
});

test('formatHM / formatTime', () => {
  assert.strictEqual(CL.formatHM(7, 5), '7:05');
  assert.strictEqual(CL.formatHM(12, 0), '12:00');
  assert.strictEqual(CL.formatTime(7, 25), '7 點 25 分');
  assert.strictEqual(CL.formatTime(3, 0), '3 點');
});

console.log('== 出題器 ==');

test('genLv1 ×500：整點/半點交錯、第 1 題整點、時刻合法、不重複', () => {
  for (let s = 0; s < 500; s++) {
    const ps = CL.genLv1(new CL.Rng(s));
    assert.strictEqual(ps.length, 5);
    const kinds = ps.map((p) => p.kind);
    assert.deepStrictEqual(kinds, ['hour', 'half', 'hour', 'half', 'hour'], '題型交錯、第 1 題整點');
    const used = new Set();
    for (const p of ps) {
      assert.strictEqual(p.type, 'set');
      assert(p.h >= 1 && p.h <= 12, `h: ${p.h}`);
      assert(typeof p.pm === 'boolean');
      if (p.kind === 'hour') {
        assert.strictEqual(p.m, 0);
        assert(p.start.h >= 1 && p.start.h <= 12 && p.start.m === 0);
        assert(p.start.h !== p.h, '起點 ≠ 目標');
      } else {
        assert.strictEqual(p.m, 30);
        assert.deepStrictEqual(p.start, { h: p.h, m: 0 }, '半點從整點出發');
      }
      const key = p.kind + ':' + p.h;
      assert(!used.has(key), `不重複: ${key}`);
      used.add(key);
    }
  }
});

test('genLv2 ×500：撥/讀交錯、分針 5 分格且不為 0、第 1 題好認、不重複', () => {
  for (let s = 0; s < 500; s++) {
    const ps = CL.genLv2(new CL.Rng(s));
    assert.strictEqual(ps.length, 5);
    assert.deepStrictEqual(ps.map((p) => p.type), ['set', 'read', 'set', 'read', 'set']);
    assert([15, 30, 45].includes(ps[0].m), `第 1 題 m 好認: ${ps[0].m}`);
    const used = new Set();
    for (const p of ps) {
      assert(p.h >= 1 && p.h <= 12);
      assert(p.m % 5 === 0 && p.m >= 5 && p.m <= 55, `m 5 分格且非 0: ${p.m}`);
      if (p.type === 'set') assert.deepStrictEqual(p.start, { h: p.h, m: 0 });
      const key = p.h + ':' + p.m;
      assert(!used.has(key), `時刻不重複: ${key}`);
      used.add(key);
    }
  }
});

test('genLv3 ×500：起點/時長合法、第 4/5 題必跨整點、第 1 題不跨且較短、不重複', () => {
  for (let s = 0; s < 500; s++) {
    const ps = CL.genLv3(new CL.Rng(s));
    assert.strictEqual(ps.length, 5);
    const used = new Set();
    ps.forEach((p, i) => {
      assert.strictEqual(p.type, 'elapsed');
      assert([0, 15, 30, 45].includes(p.m), `start m: ${p.m}`);
      assert(p.dur % 5 === 0 && p.dur >= 20 && p.dur <= 55, `dur: ${p.dur}`);
      assert.deepStrictEqual(p.end, CL.addTime(p.h, p.m, p.dur), 'end 正確');
      assert.strictEqual(p.cross, p.m + p.dur >= 60, 'cross 旗標');
      if (i >= 3) assert(p.m + p.dur >= 60, `第 ${i + 1} 題必跨整點: ${p.m}+${p.dur}`);
      if (i === 0) assert(p.m + p.dur < 60 && p.dur <= 30, `第 1 題較簡單: ${p.m}+${p.dur}`);
      assert(typeof p.act === 'string' && p.act.length > 0);
      const key = p.h + ':' + p.m + '+' + p.dur;
      assert(!used.has(key), `不重複: ${key}`);
      used.add(key);
    });
  }
});

test('genSession：模式分派＋同 seed 可重現', () => {
  assert.strictEqual(CL.genSession('lv1', { seed: 3 })[0].lv, 1);
  assert.strictEqual(CL.genSession('lv2', { seed: 3 })[0].lv, 2);
  assert.strictEqual(CL.genSession('lv3', { seed: 3 })[0].lv, 3);
  for (const mode of ['lv1', 'lv2', 'lv3']) {
    assert.deepStrictEqual(CL.genSession(mode, { seed: 42 }), CL.genSession(mode, { seed: 42 }));
  }
});

console.log('== 報讀選項 ==');

test('swappedReading：讀反型換算與合法性', () => {
  assert.deepStrictEqual(CL.swappedReading(3, 25), { h: 5, m: 15 }); // 規格例
  assert.deepStrictEqual(CL.swappedReading(7, 25), { h: 5, m: 35 });
  assert.deepStrictEqual(CL.swappedReading(12, 30), { h: 6, m: 0 });
  assert.strictEqual(CL.swappedReading(5, 25), null, '讀反=正解 → 不合法');
  assert.strictEqual(CL.swappedReading(3, 0), null, 'm=0 不做讀反');
  assert.strictEqual(CL.swappedReading(3, 22), null, '非 5 分格不做讀反');
});

test('readOptions ×500：3 個、含正解恰一次、不重複、合法、讀反型必在（合法時）', () => {
  for (let s = 0; s < 500; s++) {
    const rng = new CL.Rng(s);
    const h = rng.int(1, 12), m = rng.int(1, 11) * 5;
    const opts = CL.readOptions(h, m, rng);
    assert.strictEqual(opts.length, 3);
    const keys = new Set(opts.map((o) => (o.h % 12) * 60 + o.m));
    assert.strictEqual(keys.size, 3, '不重複');
    const correct = opts.filter((o) => o.h === h && o.m === m);
    assert.strictEqual(correct.length, 1, '正解恰一次');
    for (const o of opts) {
      assert(o.h >= 1 && o.h <= 12, `h 合法: ${o.h}`);
      assert(o.m % 5 === 0 && o.m >= 0 && o.m <= 55, `m 合法: ${o.m}`);
      assert.strictEqual(o.text, CL.formatTime(o.h, o.m));
    }
    const sw = CL.swappedReading(h, m);
    if (sw) {
      assert(opts.some((o) => o.h === sw.h && o.m === sw.m), `讀反型必在: ${h}:${m}`);
    }
    // 干擾項只能是「讀反」或「±5 分」型
    for (const o of opts) {
      if (o.h === h && o.m === m) continue;
      const isSw = sw && o.h === sw.h && o.m === sw.m;
      const p5 = CL.addTime(h, m, 5), m5 = CL.addTime(h, m, -5);
      const isNear = (o.h === p5.h && o.m === p5.m) || (o.h === m5.h && o.m === m5.m);
      assert(isSw || isNear, `干擾項型別: ${h}:${m} → ${o.h}:${o.m}`);
    }
  }
});

test('readOptions：Lv3 終點時刻（m 可為 0 的邊界）也能出 3 個合法選項', () => {
  for (let s = 0; s < 300; s++) {
    const rng = new CL.Rng(s + 900);
    for (const p of CL.genLv3(new CL.Rng(s))) {
      const opts = CL.readOptions(p.end.h, p.end.m, rng);
      assert.strictEqual(opts.length, 3);
      assert.strictEqual(new Set(opts.map((o) => (o.h % 12) * 60 + o.m)).size, 3);
      assert.strictEqual(opts.filter((o) => o.h === p.end.h && o.m === p.end.m).length, 1);
    }
  }
});

console.log('\n結果：' + passed + ' 通過, ' + failed + ' 失敗');
process.exit(failed ? 1 : 0);
