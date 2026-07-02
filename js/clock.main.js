/* ============================================================
   時鐘星球 — 主遊戲（大象導引＋大 SVG 時鐘）
   Lv1 整點與半點（拖時針/分針）
   Lv2 幾點幾分（撥時刻＋報讀三選一）
   Lv3 經過時間（往前撥 dur 分鐘，跨整點慢動畫教學）
   共用引擎：js/engine.js（Engine.create）
   ============================================================ */
(function () {
  'use strict';

  const CL = window.ClockLogic;
  const sfx = window.sfx;
  const $ = (id) => document.getElementById(id);

  const E = Engine.create({ reshowHint: () => reshowHintForPhase() });
  const MODES = ['lv1', 'lv2', 'lv3'];

  /* ---------------- DOM ---------------- */
  const app = $('app');
  const screens = { title: $('screen-title'), game: $('screen-game'), end: $('screen-end') };
  const clockWrap = $('clock-wrap');
  const svg = $('clock-svg');
  const tapAnchor = $('tap-anchor');
  const minuteHandle = $('minute-handle');
  const hourHandle = $('hour-handle');
  const answersEl = $('answers');
  const goalEl = $('goal-text');
  const starsEl = $('stars');

  /* ---------------- SVG 鐘面（圓面、12 數字、60 刻度、粗時針/長分針、中心帽） ---------------- */
  const NS = 'http://www.w3.org/2000/svg';
  const R_MIN = 74;   // 分針尖端到圓心（viewBox 單位，viewBox=200）
  const R_HOUR = 48;  // 時針尖端到圓心
  let mhG = null, hhG = null, mKnob = null, hKnob = null;

  function svgEl(tag, attrs, cls) {
    const el = document.createElementNS(NS, tag);
    for (const k of Object.keys(attrs || {})) el.setAttribute(k, attrs[k]);
    if (cls) el.setAttribute('class', cls);
    svg.appendChild(el);
    return el;
  }

  function buildClockFace() {
    svgEl('circle', { cx: 100, cy: 100, r: 94 }, 'face');
    svgEl('circle', { cx: 100, cy: 100, r: 86 }, 'face-in');
    // 60 條刻度線（每 5 分一條粗的）
    for (let i = 0; i < 60; i++) {
      const a = (i * 6) * Math.PI / 180;
      const major = i % 5 === 0;
      const r1 = major ? 80 : 85.5, r2 = 90;
      svgEl('line', {
        x1: 100 + Math.sin(a) * r1, y1: 100 - Math.cos(a) * r1,
        x2: 100 + Math.sin(a) * r2, y2: 100 - Math.cos(a) * r2,
      }, major ? 'tick major' : 'tick');
    }
    // 12 個數字（12/3/6/9 稍大）
    for (let n = 1; n <= 12; n++) {
      const a = (n * 30) * Math.PI / 180;
      const big = n % 3 === 0;
      const t = svgEl('text', {
        x: 100 + Math.sin(a) * 67, y: 100 - Math.cos(a) * 67,
        'font-size': big ? 19 : 15.5,
        'text-anchor': 'middle', 'dominant-baseline': 'central',
      });
      t.textContent = n;
    }
    // 時針（短粗）＋尖端把手圓鈕
    hhG = document.createElementNS(NS, 'g');
    hhG.setAttribute('class', 'hg');
    const hl = document.createElementNS(NS, 'line');
    hl.setAttribute('x1', 100); hl.setAttribute('y1', 108);
    hl.setAttribute('x2', 100); hl.setAttribute('y2', 100 - R_HOUR + 4);
    hl.setAttribute('class', 'hand-h');
    hKnob = document.createElementNS(NS, 'circle');
    hKnob.setAttribute('cx', 100); hKnob.setAttribute('cy', 100 - R_HOUR);
    hKnob.setAttribute('r', 9); hKnob.setAttribute('class', 'knob');
    hhG.appendChild(hl); hhG.appendChild(hKnob);
    svg.appendChild(hhG);
    // 分針（長）＋尖端把手圓鈕
    mhG = document.createElementNS(NS, 'g');
    const ml = document.createElementNS(NS, 'line');
    ml.setAttribute('x1', 100); ml.setAttribute('y1', 112);
    ml.setAttribute('x2', 100); ml.setAttribute('y2', 100 - R_MIN + 4);
    ml.setAttribute('class', 'hand-m');
    mKnob = document.createElementNS(NS, 'circle');
    mKnob.setAttribute('cx', 100); mKnob.setAttribute('cy', 100 - R_MIN);
    mKnob.setAttribute('r', 8); mKnob.setAttribute('class', 'knob');
    mhG.appendChild(ml); mhG.appendChild(mKnob);
    svg.appendChild(mhG);
    // 中心圓帽
    svgEl('circle', { cx: 100, cy: 100, r: 8 }, 'cap');
    svgEl('circle', { cx: 100, cy: 100, r: 3.2 }, 'cap-in');
  }

  function hhFlash() {
    hhG.classList.remove('flash');
    void clockWrap.offsetWidth;
    hhG.classList.add('flash');
  }

  // 夜空星點（純裝飾）
  function buildNightStars() {
    const sky = document.querySelector('.sky-night');
    for (let i = 0; i < 26; i++) {
      const s = document.createElement('i');
      s.className = 'nstar';
      const size = (1.4 + Math.random() * 1.8).toFixed(1);
      s.style.width = s.style.height = size + 'px';
      s.style.left = (Math.random() * 100).toFixed(1) + '%';
      s.style.top = (Math.random() * 68).toFixed(1) + '%';
      s.style.animationDelay = (Math.random() * 2.8).toFixed(2) + 's';
      sky.appendChild(s);
    }
  }

  /* ---------------- 遊戲狀態 ---------------- */
  const G = { mode: 'lv1', session: [], qIndex: 0, wrongTotal: 0 };
  let Q = null;

  function newQState(p) {
    return {
      p,
      phase: 'intro',      // intro / set / read / elapsed / answer / anim / done
      absMin: 0,           // 連續累計分鐘（分針角度 = absMin%60 × 6，時針 = absMin × 0.5）
      startAbs: 0,         // Lv3 起點
      taught: false,       // 本題已演過越 12 慢動畫
      captionShown: false, // 本題已播過 caption
      elapsedShown: 0,     // Lv3 最後跳字到的 5 分倍數
      askValue: null,      // answer 階段的正解 {h, m}
      holdTimer: null,     // 到達目標持續 800ms 的計時器
    };
  }

  function setAbs(v) {
    if (!Q) return;
    Q.absMin = v;
    renderHands();
    updateBg();
  }

  function snappedCurrent() {
    if (!Q) return null;
    const step = (Q.p.type === 'set' && Q.p.kind === 'hour') ? 60 : 5;
    return CL.snappedTime(Q.absMin, step);
  }

  /* ---------------- 指針渲染＋把手定位 ----------------
   * SVG 內部用 rotate transform（安全）；HTML 把手只用 left/top 定位，
   * 且以 clientWidth 的本地座標計算，不受畫面切換 transform 影響。 */
  function renderHands() {
    if (!Q) return;
    const lockMinute = Q.p.type === 'set' && Q.p.kind === 'hour'; // Lv1 整點題分針鎖 12
    const mA = lockMinute ? 0 : CL.minuteAngle(CL.clockMinute(Q.absMin));
    const hA = ((Q.absMin * 0.5) % 360 + 360) % 360;
    mhG.setAttribute('transform', 'rotate(' + mA + ' 100 100)');
    hhG.setAttribute('transform', 'rotate(' + hA + ' 100 100)');
    positionHandle(minuteHandle, mA, R_MIN);
    positionHandle(hourHandle, hA, R_HOUR);
  }

  function positionHandle(handle, angleDeg, rUnits) {
    const w = clockWrap.clientWidth;
    if (!w) return;
    const c = w / 2;
    const r = rUnits * (w / 200);
    const a = angleDeg * Math.PI / 180;
    const hs = handle.offsetWidth || 56;
    handle.style.left = (c + Math.sin(a) * r - hs / 2) + 'px';
    handle.style.top = (c - Math.cos(a) * r - hs / 2) + 'px';
  }

  // 把手模式：'hour'（Lv1 整點：時針＋分針都在）/ 'minute' / 'none'
  function setHandleMode(mode) {
    minuteHandle.classList.toggle('off', mode === 'none');
    hourHandle.classList.toggle('off', mode !== 'hour');
    hKnob.style.opacity = mode === 'hour' ? 1 : 0;
    mKnob.style.opacity = mode === 'none' ? 0.4 : 1;
  }

  /* ---------------- 晝夜背景（隨目前時刻緩變） ---------------- */
  let curBgPhase = '';
  function updateBg() {
    if (!Q) return;
    const hFloat = ((Q.absMin / 60) % 12 + 12) % 12;
    const ph = CL.dayPhase(hFloat + (Q.p.pm ? 12 : 0));
    if (ph === curBgPhase) return;
    curBgPhase = ph;
    app.classList.remove('time-day', 'time-dusk', 'time-night');
    app.classList.add('time-' + ph);
  }

  /* ---------------- 拖曳系統 ---------------- */
  const drag = { active: false, which: null, pointerId: null, prevRaw: 0 };

  function clockCenterClient() {
    const r = svg.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function handleRadiusPx(rUnits) {
    const r = svg.getBoundingClientRect();
    return rUnits * (r.width / 200);
  }

  let lastWorryAt = 0;
  function worryThrottled(text) {
    const now = performance.now();
    if (now - lastWorryAt < 2600) return;
    lastWorryAt = now;
    E.worry(text);
  }

  function onHandleDown(which, e) {
    if (!Q || drag.active) return;
    sfx.unlock();
    if (Q.phase !== 'set' && Q.phase !== 'elapsed') return;
    const p = Q.p;
    if (which === 'minute' && p.type === 'set' && p.kind === 'hour') {
      e.preventDefault();
      worryThrottled('整點的時候，長針要指 12 喔！拖短短的時針就好！');
      return;
    }
    if (which === 'hour' && !(p.type === 'set' && p.kind === 'hour')) return;
    e.preventDefault();
    drag.active = true;
    drag.which = which;
    drag.pointerId = e.pointerId;
    const c = clockCenterClient();
    drag.prevRaw = CL.pointerToMinutes(c.x, c.y, e.clientX, e.clientY);
    try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件沒有作用中指標 */ }
    (which === 'minute' ? minuteHandle : hourHandle).classList.add('grabbing');
    E.hideHint(true);
    sfx.grab();
  }

  function onPointerMove(e) {
    // 教學動畫強制放開後，手指若一直壓著：phase 一還原就自動接回拖曳
    //（同一根手指不會再有 pointerdown，不接回把手就會看似凍結）
    if (!drag.active && drag.pendingResume && Q
        && e.pointerId === drag.pendingResume.pointerId
        && (Q.phase === 'set' || Q.phase === 'elapsed')) {
      drag.active = true;
      drag.which = drag.pendingResume.which;
      drag.pointerId = e.pointerId;
      const c0 = clockCenterClient();
      drag.prevRaw = CL.pointerToMinutes(c0.x, c0.y, e.clientX, e.clientY);
      drag.pendingResume = null;
      (drag.which === 'minute' ? minuteHandle : hourHandle).classList.add('grabbing');
    }
    if (!drag.active || e.pointerId !== drag.pointerId || !Q) return;
    e.preventDefault();
    const c = clockCenterClient();
    const raw = CL.pointerToMinutes(c.x, c.y, e.clientX, e.clientY);
    const delta = CL.processDrag(drag.prevRaw, raw);
    drag.prevRaw = raw;
    if (drag.which === 'minute') applyMinuteDelta(delta);
    else applyHourDelta(delta);
  }

  function onPointerUp(e) {
    const wasPending = drag.pendingResume && e.pointerId === drag.pendingResume.pointerId;
    if (wasPending) drag.pendingResume = null;
    if (!drag.active || e.pointerId !== drag.pointerId) {
      // 教學強制放開後直接抬手：補做磁性吸附（教學終點不是 5 的倍數）
      if (wasPending && Q && (Q.phase === 'set' || Q.phase === 'elapsed')) {
        const snapped = Math.round(Q.absMin / 5) * 5;
        if (snapped !== Q.absMin) applyMinuteDelta(snapped - Q.absMin);
        checkTarget();
      }
      return;
    }
    const which = drag.which;
    endDragForce();
    if (!Q || (Q.phase !== 'set' && Q.phase !== 'elapsed')) return;
    // 磁性吸附（分針吸 5 分格、時針吸整點）
    if (which === 'minute') {
      const snapped = Math.round(Q.absMin / 5) * 5;
      if (snapped !== Q.absMin) applyMinuteDelta(snapped - Q.absMin);
    } else {
      Q.absMin = Math.round(Q.absMin / 60) * 60;
      renderHands();
      updateBg();
    }
    checkTarget();
    E.hideHint(true);
  }

  function endDragForce(rememberResume) {
    if (!drag.active) return;
    drag.active = false;
    if (rememberResume) drag.pendingResume = { pointerId: drag.pointerId, which: drag.which };
    // 一併釋放 pointer capture，殘留的 capture 會擋掉後續互動
    try { minuteHandle.releasePointerCapture(drag.pointerId); } catch (err) {}
    try { hourHandle.releasePointerCapture(drag.pointerId); } catch (err) {}
    minuteHandle.classList.remove('grabbing');
    hourHandle.classList.remove('grabbing');
  }

  // 分針的有號增量：wrap、Lv3 倒轉保護、越 12 教學、跳字、目標判定
  function applyMinuteDelta(delta) {
    if (!Q) return;
    const prev = Q.absMin;
    let next = prev + delta;
    if (Q.p.type === 'elapsed' && Q.phase === 'elapsed' && next < Q.startAbs) {
      next = Q.startAbs; // 不能倒轉回起點之前
      // 指針被釘住時，角度基準也要拉回釘住點：手指要回到這個角度
      // 才會重新帶動指針，否則反向回拖時指針會瞬跳到手指前方（脫鉤）
      if (drag.active) drag.prevRaw = ((Q.startAbs % 60) + 60) % 60;
      worryThrottled('要往前轉喔！');
    }
    const crossings = CL.hourCrossings(prev, next);
    Q.absMin = next;
    if (crossings > 0 && !Q.taught) {
      // 核心教學時刻：分針順時針越過 12 → 慢動畫＋咕咕鐘＋caption（每題一次）
      Q.taught = true;
      const boundary = Math.floor(next / 60) * 60;
      runTeach(boundary, next).catch((err) => { if (!err.isCancel) throw err; });
      return;
    }
    if (crossings !== 0) cuckooThrottled(); // 再次越過（含逆時針退格）只咕咕
    renderHands();
    updateBg();
    handleElapsedTicks();
    checkTarget();
  }

  // 把手在 12 附近抖動時，每個 pointermove 都可能跨界一次：
  // 不節流會疊出數十組振盪器的音牆（cuckoo 一次兩顆 vol .4）
  let lastCuckoo = 0;
  function cuckooThrottled() {
    const now = performance.now();
    if (now - lastCuckoo < 300) return;
    lastCuckoo = now;
    sfx.cuckoo();
    hhFlash();
  }

  // Lv1 整點題：拖時針（1 鐘面分 = 6° = 時針走 12 分鐘的量）
  let lastHourTick = 0;
  function applyHourDelta(delta) {
    if (!Q) return;
    const prev = Q.absMin;
    Q.absMin = prev + delta * 12;
    const hPrev = Math.round(prev / 60), hNow = Math.round(Q.absMin / 60);
    if (hNow !== hPrev && performance.now() - lastHourTick > 150) {
      lastHourTick = performance.now();
      sfx.tick2(hNow);
    }
    renderHands();
    updateBg();
    checkTarget();
  }

  /* ---------------- 慢動畫教學：分針走一圈＝時針走一格 ---------------- */
  async function runTeach(boundary, resumeAbs) {
    const myQ = Q;
    const prevPhase = myQ.phase;
    myQ.phase = 'anim';
    endDragForce(true); // 記住 pointerId：手指還壓著的話，教學結束自動接回拖曳
    E.hideHint(false);
    try {
      const from = boundary - 6;
      const to = Math.max(resumeAbs, boundary + 2);
      setAbs(from);
      const introLine = '看好囉！分針要走完一圈了！';
      E.say(introLine);
      await E.sleep(700);
      await E.speechDrain(introLine); // 開場白唸完才開始轉針，才不會被教學句切斷
      let cur = from;
      let lastTickMin = Math.floor(from);
      const total = to - from;
      const steps = Math.max(10, Math.round(total * 3));
      for (let i = 1; i <= steps; i++) {
        const v = from + total * (i / steps);
        if (Math.floor(v) !== lastTickMin) { lastTickMin = Math.floor(v); sfx.tick2(lastTickMin); }
        const crossed = CL.hourCrossings(cur, v) > 0;
        cur = v;
        setAbs(v);
        if (crossed) {
          sfx.cuckoo();
          hhFlash();
          if (!myQ.captionShown) {
            myQ.captionShown = true;
            E.caption('分針走一圈＝時針走一格！');
            E.say('分針走一圈，時針就走一格！');
          }
          await E.sleep(1200); // 停一拍，讓孩子看時針跳到下一格
        } else {
          await E.sleep(95);
        }
      }
      await E.sleep(500);
      // 「時針就走一格」是核心概念：唸完才把流程還給主線，
      // 否則 m+dur=60 的題目會自動達標、succeed 的旁白把句尾切掉
      await E.speechDrain('分針走一圈，時針就走一格！');
    } catch (err) {
      if (!err.isCancel) throw err;
      return;
    }
    if (Q !== myQ) return;
    myQ.phase = prevPhase;
    handleElapsedTicks(); // Lv3：補上動畫期間經過的「X 分」跳字
    checkTarget();
    reshowHintForPhase();
  }

  /* ---------------- Lv3 經過量跳字：每 +5 分鐘「5 分、10 分…」 ---------------- */
  function handleElapsedTicks() {
    if (!Q || Q.p.type !== 'elapsed' || Q.phase !== 'elapsed') return;
    const elapsed = Q.absMin - Q.startAbs;
    const step = Math.floor(elapsed / 5) * 5;
    if (step > Q.elapsedShown) {
      for (let v = Q.elapsedShown + 5; v <= step; v += 5) {
        E.tapNum(tapAnchor, v + ' 分');
        sfx.tick2(v / 5);
      }
      Q.elapsedShown = step;
    } else if (step < Q.elapsedShown) {
      Q.elapsedShown = Math.max(0, step); // 倒退後再前進可以重新跳（計的是經過量）
    }
  }

  /* ---------------- 目標判定：到達持續 800ms（FAST 即時） ---------------- */
  function reached() {
    if (!Q) return false;
    const p = Q.p;
    if (p.type === 'set') {
      if (p.kind === 'hour') {
        const offset = Math.abs(Q.absMin - Math.round(Q.absMin / 60) * 60);
        const cur = CL.snappedTime(Q.absMin, 60);
        return offset <= 9 && cur.h === p.h; // 時針要真的停在整點附近
      }
      const cur = CL.snappedTime(Q.absMin, 5);
      const offset = Math.abs(Q.absMin - Math.round(Q.absMin / 5) * 5);
      return offset <= 2.5 && cur.h === p.h && cur.m === p.m;
    }
    if (p.type === 'elapsed') {
      return Math.abs((Q.absMin - Q.startAbs) - p.dur) <= 2.5;
    }
    return false;
  }

  function clearHold() {
    if (Q && Q.holdTimer != null) { clearTimeout(Q.holdTimer); Q.holdTimer = null; }
  }

  function checkTarget() {
    if (!Q || (Q.phase !== 'set' && Q.phase !== 'elapsed')) { clearHold(); return; }
    if (!reached()) { clearHold(); return; }
    if (Q.holdTimer != null) return;
    if (E.FAST) { succeed(); return; }
    const myQ = Q;
    myQ.holdTimer = setTimeout(() => {
      myQ.holdTimer = null;
      if (Q === myQ && (myQ.phase === 'set' || myQ.phase === 'elapsed') && reached()) succeed();
    }, 800);
  }

  function succeed() {
    clearHold();
    const p = Q.p;
    Q.phase = 'anim';
    endDragForce();
    E.hideHint(false);
    // 校正到精準目標角度
    if (p.type === 'set') {
      const base = CL.absOf(p.h, p.m);
      setAbs(base + Math.round((Q.absMin - base) / 720) * 720);
    } else {
      setAbs(Q.startAbs + p.dur);
    }
    sfx.yay();
    const c = E.centerOf(svg);
    E.burstStars(c.x, c.y, 12);
    E.fireSignal();
  }

  /* ---------------- 提示小手（閒置 8 秒由 engine 回呼） ---------------- */
  function reshowHintForPhase() {
    if (!Q) return;
    if (Q.phase === 'set') {
      if (Q.p.kind === 'hour') hintAlongArc(hourHandle, hourDirection());
      else hintAlongArc(minuteHandle, 1); // 半點/幾點幾分都是順時針撥
    } else if (Q.phase === 'elapsed') {
      hintAlongArc(minuteHandle, 1);
    }
  }
  // 時針題：往目標的短邊方向
  function hourDirection() {
    const curDial = ((Q.absMin / 12) % 60 + 60) % 60;
    const d = CL.processDrag(curDial, (Q.p.h % 12) * 5);
    return d >= 0 ? 1 : -1;
  }
  // 從把手中心沿切線方向的直線提示
  function hintAlongArc(handle, sign) {
    const c = E.centerOf(handle);
    const ctr = clockCenterClient();
    const dx = c.x - ctr.x, dy = c.y - ctr.y;
    const len = Math.hypot(dx, dy) || 1;
    const to = { x: c.x + (-dy / len) * 70 * sign, y: c.y + (dx / len) * 70 * sign };
    E.showHint(c, to);
  }

  /* ---------------- 題目列 ---------------- */
  function setProblemDisplay(p) {
    if (p.type === 'set') goalEl.textContent = '撥到 ' + CL.formatHM(p.h, p.m);
    else if (p.type === 'read') goalEl.textContent = '現在是 ?';
    else goalEl.textContent = CL.formatHM(p.h, p.m) + ' ＋ ' + p.dur + ' 分 = ?';
  }

  /* ---------------- 報讀三選一（文字選項） ---------------- */
  async function askRead(h, m, rng, prompt) {
    Q.phase = 'answer';
    Q.askValue = { h, m };
    const options = CL.readOptions(h, m, rng);
    answersEl.innerHTML = '';
    E.say(prompt || '現在是幾點幾分？');

    await new Promise((resolve, reject) => {
      E.run.waiters.push({ reject });
      let busy = false;
      const sw = CL.swappedReading(h, m);
      options.forEach((o) => {
        const b = document.createElement('button');
        b.className = 'ans-btn ans-time';
        b.textContent = o.text;
        b.dataset.h = o.h;
        b.dataset.m = o.m;
        b.addEventListener('click', async () => {
          if (busy || E.run.cancelled) return;
          if (o.h === h && o.m === m) {
            busy = true;
            b.classList.add('correct');
            sfx.yay();
            const c = E.centerOf(b);
            E.burstStars(c.x, c.y, 12);
            resolve();
          } else {
            busy = true;
            b.classList.add('wrong');
            G.wrongTotal++;
            // 診斷式回饋：讀反 → 針對「長短針」講；其他 → 教數分鐘
            const isSwapped = sw && o.h === sw.h && o.m === sw.m;
            const msg = isSwapped
              ? '短短的針才是「幾點」喔！先找短針指到哪裡！'
              : '再看一次長針！從 12 開始 5、10、15，一格一格數！';
            try {
              await E.worryWait(msg, 2800);
              E.say('再選一次！');
            } catch (err) { if (err.isCancel) return reject(err); }
            busy = false;
          }
        });
        answersEl.appendChild(b);
      });
    });
    Q.askValue = null;
  }

  /* ---------------- 程式轉針（Lv2 報讀） ---------------- */
  async function rotateAbsTo(target) {
    let guard = 0;
    while (Q && Q.absMin < target - 0.01 && guard++ < 500) {
      const prev = Q.absMin;
      const v = Math.min(target, prev + 1);
      setAbs(v);
      if (CL.hourCrossings(prev, v) > 0) { sfx.cuckoo(); hhFlash(); }
      else sfx.tick2(Math.floor(v));
      await E.sleep(150);
    }
    setAbs(target);
  }

  /* ---------------- 各題型流程 ---------------- */
  async function runSetQuestion(p) {
    setAbs(CL.absOf(p.start.h, p.start.m));
    setHandleMode(p.kind === 'hour' ? 'hour' : 'minute');
    Q.phase = 'intro';
    if (p.kind === 'hour') {
      await E.sayWait('把時鐘撥到 ' + p.h + ' 點！', 2600);
      E.say('拖著短短的時針轉！整點的時候，長針指著 12！');
    } else if (p.kind === 'half') {
      await E.sayWait('把時鐘撥到 ' + p.h + ' 點半！', 2600);
      E.say('拖著長長的分針，順時針走半圈到 6！');
    } else {
      await E.sayWait('把時鐘撥到 ' + p.h + ' 點 ' + p.m + ' 分！', 2800);
      E.say('拖著長針慢慢轉，短針會自己跟著走！');
    }
    Q.phase = 'set';
    checkTarget(); // 保險（起點≠目標，理論上不會立刻成立）
    reshowHintForPhase();
    await E.waitSignal();
    if (p.kind === 'half') {
      await E.sayWait('看！短針走到 ' + p.h + ' 和 ' + CL.normHour(p.h + 1) + ' 的中間了！', 3000);
    } else if (p.kind === 'hour') {
      await E.sayWait(p.h + ' 點整！長針指 12，短針指 ' + p.h + '！', 2600);
    } else {
      await E.sayWait(CL.formatTime(p.h, p.m) + '，撥對了！', 2200);
    }
  }

  async function runReadQuestion(p, rng) {
    const offset = rng.pick([10, 15, 20, 25]);
    const target = CL.absOf(p.h, p.m);
    setAbs(target - offset);
    setHandleMode('minute'); // 分針把手常駐（read 階段 onHandleDown 會擋掉拖曳）
    Q.phase = 'intro';
    await E.sayWait('換小象撥時鐘，看仔細囉！', 2400);
    Q.phase = 'read';
    await rotateAbsTo(target);
    await E.sleep(400);
    await askRead(p.h, p.m, rng, '現在是幾點幾分？');
  }

  async function runElapsedQuestion(p, rng) {
    setAbs(CL.absOf(p.h, p.m));
    Q.startAbs = Q.absMin;
    setHandleMode('minute');
    Q.phase = 'intro';
    await E.sayWait('現在是 ' + CL.formatTime(p.h, p.m) + '！要' + p.act + ' ' + p.dur + ' 分鐘！', 3400);
    E.say('拖著長針往前轉 ' + p.dur + ' 分鐘！');
    Q.phase = 'elapsed';
    reshowHintForPhase();
    await E.waitSignal();
    await E.sayWait('剛好過了 ' + p.dur + ' 分鐘！', 2400);
    await askRead(p.end.h, p.end.m, rng, '那現在是幾點幾分？');
  }

  /* ---------------- 一場（5 題） ---------------- */
  const praises = ['答對了！你好棒！', '太厲害了！', '完全正確！', '好聰明！', '你是時鐘小達人！'];

  function resetQuestionUI() {
    answersEl.innerHTML = '';
    E.hideHint(false);
    clearHold();
  }

  async function runSession(mode) {
    E.newRun();
    G.mode = mode;
    G.qIndex = 0;
    G.wrongTotal = 0;
    const rng = new CL.Rng(E.URL_SEED != null ? E.URL_SEED : undefined);
    G.session = CL.genSession(mode, { rng });
    for (const el of starsEl.children) el.classList.remove('lit');
    E.showScreen('game');
    try {
      for (let i = 0; i < G.session.length; i++) {
        G.qIndex = i;
        const p = G.session[i];
        Q = newQState(p);
        resetQuestionUI();
        setProblemDisplay(p);
        await E.sleep(450);
        if (p.type === 'set') await runSetQuestion(p);
        else if (p.type === 'read') await runReadQuestion(p, rng);
        else await runElapsedQuestion(p, rng);

        Q.phase = 'done';
        await E.sleep(550);
        starsEl.children[i].classList.add('lit');
        sfx.fanfare();
        const c = E.centerOf(clockWrap);
        E.burstStars(c.x, c.y, 14);
        await E.sayWait(praises[i % praises.length], 2200);
      }
      await showEnd();
    } catch (err) {
      if (!err.isCancel) { console.error(err); throw err; }
    }
  }

  async function showEnd() {
    Q = null;
    resetQuestionUI();
    setHandleMode('none');
    if (window.Starmap) window.Starmap.add('clock', G.mode, Math.max(1, 5 - G.wrongTotal));
    $('end-stars').textContent = '⭐'.repeat(G.session.length);
    const msg = G.wrongTotal === 0
      ? '全部一次答對，你是時鐘小達人！'
      : (G.wrongTotal <= 2 ? '越來越厲害了！再挑戰一次吧！' : '多練習幾次，你一定會更棒！');
    $('end-msg').textContent = msg;
    E.showScreen('end');
    sfx.sparkleRain();
    E.speech.speak('太棒了！' + msg);
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindUI() {
    document.querySelectorAll('.mode-btn').forEach((b) => {
      b.addEventListener('click', () => {
        sfx.unlock(); E.speech.prime(); sfx.tap();
        runSession(b.dataset.mode);
      });
    });
    $('btn-home').addEventListener('click', () => {
      sfx.tap(); E.speech.stop(); E.cancelRun(); // <a href> 會接手導回 index.html
    });
    $('btn-sound').addEventListener('click', () => {
      const on = !E.soundOn;
      E.setSoundOn(on);
      $('btn-sound').textContent = on ? '🔊' : '🔇';
      sfx.tap();
    });
    $('btn-again').addEventListener('click', () => {
      sfx.unlock(); E.speech.prime(); sfx.tap();
      runSession(G.mode);
    });
    $('btn-menu').addEventListener('click', () => {
      sfx.tap(); E.speech.stop(); E.cancelRun();
      location.href = 'index.html';
    });

    minuteHandle.addEventListener('pointerdown', (e) => onHandleDown('minute', e), { passive: false });
    hourHandle.addEventListener('pointerdown', (e) => onHandleDown('hour', e), { passive: false });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  /* ---------------- 測試掛勾 ---------------- */
  function handleTipClient(rUnits, dialMinutes) {
    const c = clockCenterClient();
    const r = handleRadiusPx(rUnits);
    const a = CL.minuteAngle(dialMinutes) * Math.PI / 180;
    return { x: c.x + Math.sin(a) * r, y: c.y - Math.cos(a) * r };
  }
  const testWait = (t) => new Promise((res) => setTimeout(res, t));
  const testOpt = (pt) => ({
    bubbles: true, cancelable: true, composed: true,
    pointerId: 7, isPrimary: true, pointerType: 'touch',
    clientX: pt.x, clientY: pt.y, button: 0, buttons: 1,
  });

  // 用真實 PointerEvent 沿弧線多步拖「分針把手」。deltaMinutes 相對現在，正=順時針。
  // 每步 ≤6 分（一定經過中間角度，越 12 邏輯必被觸發）；
  // 慢動畫教學把拖曳中斷時，會等動畫結束再重新抓把手續拖。回傳 Promise<{h,m}|false>。
  async function testTurnMinuteTo(deltaMinutes, steps) {
    if (!Q) return false;
    const target = Q.absMin + deltaMinutes;
    const stepMin = Math.max(1, Math.min(6, Math.abs(deltaMinutes) / (steps || Math.max(6, Math.ceil(Math.abs(deltaMinutes) / 6)))));
    let guard = 0;
    let lastPt = handleTipClient(R_MIN, CL.clockMinute(Q.absMin));
    while (guard++ < 800) {
      if (!Q) return false;
      const remaining = target - Q.absMin;
      if (Math.abs(remaining) < 0.6) break;
      if (Q.phase !== 'set' && Q.phase !== 'elapsed') { // intro / 教學動畫中
        E.pumpTimers();
        await testWait(25);
        continue;
      }
      if (!drag.active || drag.which !== 'minute') {
        lastPt = handleTipClient(R_MIN, CL.clockMinute(Q.absMin));
        minuteHandle.dispatchEvent(new PointerEvent('pointerdown', testOpt(lastPt)));
        await testWait(4);
        continue;
      }
      const step = Math.sign(remaining) * Math.min(Math.abs(remaining), stepMin);
      lastPt = handleTipClient(R_MIN, CL.clockMinute(Q.absMin + step));
      window.dispatchEvent(new PointerEvent('pointermove', testOpt(lastPt)));
      await testWait(4);
    }
    window.dispatchEvent(new PointerEvent('pointerup', testOpt(lastPt)));
    E.pumpTimers();
    return snappedCurrent();
  }

  // Lv1 整點：用真實 PointerEvent 拖「時針把手」到 h 點（走短邊）
  async function testTurnHourTo(h) {
    if (!Q) return false;
    let guard = 0;
    let lastPt = handleTipClient(R_HOUR, ((Q.absMin / 12) % 60 + 60) % 60);
    while (guard++ < 800) {
      if (!Q) return false;
      const curDial = ((Q.absMin / 12) % 60 + 60) % 60;
      const remaining = CL.processDrag(curDial, (h % 12) * 5);
      if (Math.abs(remaining) < 0.4) break;
      if (Q.phase !== 'set') { E.pumpTimers(); await testWait(25); continue; }
      if (!drag.active || drag.which !== 'hour') {
        lastPt = handleTipClient(R_HOUR, curDial);
        hourHandle.dispatchEvent(new PointerEvent('pointerdown', testOpt(lastPt)));
        await testWait(4);
        continue;
      }
      const step = Math.sign(remaining) * Math.min(Math.abs(remaining), 4);
      lastPt = handleTipClient(R_HOUR, ((curDial + step) % 60 + 60) % 60);
      window.dispatchEvent(new PointerEvent('pointermove', testOpt(lastPt)));
      await testWait(4);
    }
    window.dispatchEvent(new PointerEvent('pointerup', testOpt(lastPt)));
    E.pumpTimers();
    return snappedCurrent();
  }

  window.__test = {
    get screen() { return E.currentScreen; },
    get phase() { return Q ? Q.phase : 'idle'; },
    get qIndex() { return G.qIndex; },
    get session() { return G.session; },
    get problem() { return Q ? Q.p : null; },
    get current() { return snappedCurrent(); },
    get askValue() { return Q ? Q.askValue : null; },
    get wrongTotal() { return G.wrongTotal; },
    pump() { E.pumpTimers(); },
    turnMinuteTo(deltaMinutes, steps) { return testTurnMinuteTo(deltaMinutes, steps); },
    turnHourTo(h) { return testTurnHourTo(h); },
    clickAnswer(correct) {
      if (!Q || !Q.askValue) return false;
      const want = Q.askValue;
      for (const b of answersEl.querySelectorAll('.ans-btn')) {
        if (b.classList.contains('wrong')) continue;
        const hit = Number(b.dataset.h) === want.h && Number(b.dataset.m) === want.m;
        if (correct ? hit : !hit) { b.click(); return b.textContent; }
      }
      return false;
    },
    centers: {
      minuteHandle() { return E.centerOf(minuteHandle); },
      hourHandle() { return E.centerOf(hourHandle); },
      clock() { return E.centerOf(svg); },
    },
  };

  /* ---------------- 啟動 ---------------- */
  function init() {
    buildClockFace();
    buildNightStars();
    E.registerScreens(screens, 'title');
    E.mountChar('lottie-title-elephant', window.LOTTIE_ELEPHANT, 'elephant.gif', 'title');
    E.mountChar('lottie-title-boy', window.LOTTIE_BOY, 'boy.gif', 'title');
    E.mountChar('lottie-guide', window.LOTTIE_ELEPHANT, 'elephant.gif', 'game');
    E.mountChar('lottie-end-boy', window.LOTTIE_BOY, 'boy.gif', 'end');
    bindUI();
    E.bindLifecycle({ onResize: () => { if (E.currentScreen === 'game') renderHands(); } });
    E.playScreenChars('title');

    if (E.URL_MODE && MODES.includes(E.URL_MODE)) {
      E.speech.on = false; // 測試直開：關語音
      runSession(E.URL_MODE);
    } else if (E.URL_PLAY && MODES.includes(E.URL_PLAY)) {
      const ov = $('start-overlay');
      const labels = { lv1: '🕐 整點與半點', lv2: '🕝 幾點幾分', lv3: '⏱️ 經過時間' };
      $('start-mode-label').textContent = labels[E.URL_PLAY];
      ov.classList.add('show');
      $('btn-start').addEventListener('click', () => {
        sfx.unlock(); E.speech.prime(); sfx.tap();
        ov.classList.remove('show');
        runSession(E.URL_PLAY);
      }, { once: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
