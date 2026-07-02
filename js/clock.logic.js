/* 時鐘星球 — 純遊戲邏輯（瀏覽器 window.ClockLogic / Node module.exports 共用）
 * 角度換算、指標拖曳累計、越 12 計數、三檔出題、報讀選項。不碰 DOM，方便單元測試。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ClockLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 可種子化亂數（mulberry32），測試可重現 ---------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Rng {
    constructor(seed) {
      this.seed = (seed == null ? (Math.floor(Math.random() * 2 ** 31)) : seed) >>> 0;
      this.next = mulberry32(this.seed);
    }
    int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
    pick(arr) { return arr[this.int(0, arr.length - 1)]; }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.int(0, i);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
  }

  /* ---------- 角度換算 ---------- */
  // 分針角度：12 點方向為 0°、順時針增加
  function minuteAngle(m) { return m * 6; }
  // 時針角度：含分鐘的連續位置
  function hourAngle(h, m) { return (h % 12) * 30 + (m || 0) * 0.5; }

  // 指標（螢幕座標，y 向下）→ 鐘面分鐘 [0,60)：12 點方向為 0、順時針增加
  function pointerToMinutes(cx, cy, px, py) {
    const deg = Math.atan2(px - cx, cy - py) * 180 / Math.PI;
    return (((deg / 6) % 60) + 60) % 60;
  }

  // 吸附到 step 分鐘格（60 wrap 回 0）
  function snapMinutes(minutes, step) {
    step = step || 5;
    return ((Math.round(minutes / step) * step) % 60 + 60) % 60;
  }

  /* ---------- 拖曳累計 ---------- */
  // 兩次取樣的原始鐘面分鐘 → 有號增量（wrap 處理：>30 減 60、<−30 加 60）
  function processDrag(prevRawMinutes, newRawMinutes) {
    let d = newRawMinutes - prevRawMinutes;
    if (d > 30) d -= 60;
    else if (d < -30) d += 60;
    return d;
  }

  // 累計分鐘（可為負、可超過 60）之間，分針越過 12 的次數（正=順時針、負=逆時針）
  function hourCrossings(prevAbs, newAbs) {
    return Math.floor(newAbs / 60) - Math.floor(prevAbs / 60);
  }

  /* ---------- 時刻工具 ---------- */
  const normHour = (h) => ((h - 1) % 12 + 12) % 12 + 1;      // 任意整數 → 1..12
  function clockHour(absMin) {
    const idx = ((Math.floor(absMin / 60) % 12) + 12) % 12;
    return idx === 0 ? 12 : idx;
  }
  function clockMinute(absMin) { return ((absMin % 60) + 60) % 60; }
  function absOf(h, m) { return (h % 12) * 60 + (m || 0); }
  // 連續累計分鐘 → 吸附後的 {h, m}
  function snappedTime(absMin, step) {
    const s = Math.round(absMin / (step || 5)) * (step || 5);
    return { h: clockHour(s), m: clockMinute(s) };
  }
  function addTime(h, m, deltaMin) {
    const t = absOf(h, m) + deltaMin;
    return { h: clockHour(t), m: clockMinute(t) };
  }

  /* ---------- 晝夜（背景變色用） ---------- */
  // 6:00–17:00 白天、17:00–19:00 黃昏、其餘夜晚（h24 可帶小數）
  function dayPhase(h24, m) {
    const t = ((h24 + (m || 0) / 60) % 24 + 24) % 24;
    if (t >= 6 && t < 17) return 'day';
    if (t >= 17 && t < 19) return 'dusk';
    return 'night';
  }

  /* ---------- 文案 ---------- */
  function formatHM(h, m) { return h + ':' + String(m).padStart(2, '0'); }
  function formatTime(h, m) { return m === 0 ? h + ' 點' : h + ' 點 ' + m + ' 分'; }

  /* ---------- 出題：Lv1 整點與半點 ---------- */
  // 兩種題型交錯（整點先＝較簡單），時刻不重複；半點題從整點出發撥分針半圈
  function genLv1(rng) {
    const out = [];
    const used = new Set();
    const kinds = ['hour', 'half', 'hour', 'half', 'hour'];
    for (let i = 0; i < 5; i++) {
      const kind = kinds[i];
      let h, guard = 0;
      do { h = rng.int(1, 12); guard++; } while (used.has(kind + ':' + h) && guard < 80);
      used.add(kind + ':' + h);
      if (kind === 'hour') {
        let sh = i === 0 ? normHour(h - 1) : rng.int(1, 12);
        if (sh === h) sh = normHour(h + rng.pick([-2, -1, 1, 2]));
        out.push({ lv: 1, type: 'set', kind, h, m: 0, start: { h: sh, m: 0 }, pm: rng.next() < 0.5 });
      } else {
        out.push({ lv: 1, type: 'set', kind, h, m: 30, start: { h, m: 0 }, pm: rng.next() < 0.5 });
      }
    }
    return out;
  }

  /* ---------- 出題：Lv2 幾點幾分 ---------- */
  // 撥時刻 / 報讀交錯；分針不出 0 分；第 1 題用好認的 15/30/45
  function genLv2(rng) {
    const out = [];
    const used = new Set();
    const types = ['set', 'read', 'set', 'read', 'set'];
    for (let i = 0; i < 5; i++) {
      let p, guard = 0;
      do {
        const h = rng.int(1, 12);
        const m = (i === 0 ? rng.pick([3, 6, 9]) : rng.int(1, 11)) * 5;
        if (types[i] === 'set') {
          p = { lv: 2, type: 'set', kind: 'time', h, m, start: { h, m: 0 }, pm: rng.next() < 0.5 };
        } else {
          p = { lv: 2, type: 'read', h, m, pm: rng.next() < 0.5 };
        }
        guard++;
      } while (used.has(p.h + ':' + p.m) && guard < 100);
      used.add(p.h + ':' + p.m);
      out.push(p);
    }
    return out;
  }

  /* ---------- 出題：Lv3 經過時間 ---------- */
  // start m∈{0,15,30,45}、dur∈{20..55 step5}；第 4、5 題必跨整點；第 1 題不跨且較短
  const LV3_ACTS = ['看卡通', '寫功課', '吃點心', '玩積木', '拼拼圖'];
  function genLv3(rng) {
    const out = [];
    const used = new Set();
    for (let i = 0; i < 5; i++) {
      const mustCross = i >= 3;
      let p = null, guard = 0;
      while (!p && guard < 300) {
        guard++;
        const h = rng.int(1, 12);
        const m = rng.pick([0, 15, 30, 45]);
        const dur = rng.int(4, 11) * 5;
        if (mustCross && m + dur < 60) continue;
        if (i === 0 && (m + dur >= 60 || dur > 30)) continue;
        const key = h + ':' + m + '+' + dur;
        if (used.has(key) && guard < 200) continue;
        used.add(key);
        p = { lv: 3, type: 'elapsed', h, m, dur, end: addTime(h, m, dur),
              cross: m + dur >= 60, act: LV3_ACTS[i % LV3_ACTS.length], pm: rng.next() < 0.5 };
      }
      if (!p) { // 理論上到不了的保險
        const h = ((i * 2) % 12) + 1;
        const m = mustCross ? 30 : 15;
        const dur = mustCross ? 40 : 20;
        p = { lv: 3, type: 'elapsed', h, m, dur, end: addTime(h, m, dur),
              cross: m + dur >= 60, act: LV3_ACTS[i % LV3_ACTS.length], pm: rng.next() < 0.5 };
      }
      out.push(p);
    }
    return out;
  }

  function genSession(mode, opts) {
    opts = opts || {};
    const rng = opts.rng || new Rng(opts.seed);
    if (mode === 'lv1') return genLv1(rng);
    if (mode === 'lv3') return genLv3(rng);
    return genLv2(rng);
  }

  /* ---------- 報讀選項 ---------- */
  // 「時針分針讀反」型：長針指的數字被讀成「幾點」、短針的數字被讀成「幾分」
  // 例 3:25 → 5:15。僅在讀反後合法（且 ≠ 正解）時使用。
  function swappedReading(h, m) {
    if (m % 5 !== 0 || m === 0) return null;
    const sh = m / 5;
    const sm = (h % 12) * 5;
    if (sh < 1 || sh > 12) return null;
    if (sh === h && sm === m) return null;
    return { h: sh, m: sm };
  }

  // 文字三選一：正解＋讀反型（合法才有）＋±5 分補滿，不重複
  function readOptions(h, m, rng) {
    rng = rng || new Rng();
    const key = (o) => (o.h % 12) * 60 + o.m;
    const correct = { h, m };
    const opts = [correct];
    const seen = new Set([key(correct)]);
    const push = (o) => {
      if (o && !seen.has(key(o))) { seen.add(key(o)); opts.push(o); }
    };
    push(swappedReading(h, m));
    const near = rng.shuffle([addTime(h, m, 5), addTime(h, m, -5)]);
    for (const o of near) { if (opts.length < 3) push(o); }
    for (const d of [10, -10, 15, -15]) { if (opts.length < 3) push(addTime(h, m, d)); }
    const out = opts.slice(0, 3).map((o) => ({ h: o.h, m: o.m, text: formatTime(o.h, o.m) }));
    return rng.shuffle(out);
  }

  return {
    Rng,
    minuteAngle, hourAngle, pointerToMinutes, snapMinutes,
    processDrag, hourCrossings,
    normHour, clockHour, clockMinute, absOf, snappedTime, addTime,
    dayPhase, formatHM, formatTime,
    genLv1, genLv2, genLv3, genSession,
    swappedReading, readOptions,
  };
});
