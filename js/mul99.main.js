/* ============================================================
   九九乘法星球 — 主遊戲
   一場＝一段口訣（2~9）5 題：
   排陣列（拖一排排點點卡、照順序點排跳數）×2
   → 跳數填空 → 口訣快答×2（蓋口訣印章）
   共用 js/engine.js；starmap key: ('mul99', 'd' + 段)
   ============================================================ */
(function () {
  'use strict';

  const ML = window.Mul99Logic;
  const sfx = window.sfx;
  const $ = (id) => document.getElementById(id);

  const E = Engine.create({ reshowHint: reshowHintForPhase });

  /* ---------------- DOM ---------------- */
  const app = $('app');
  const screens = { title: $('screen-title'), game: $('screen-game'), end: $('screen-end') };
  const spriteLayer = $('sprite-layer');
  const arrayZone = $('array-zone');
  const arrayLabel = $('array-label');
  const rowSlotsEl = $('row-slots');
  const seqRow = $('seq-row');
  const trayEl = $('tray99');
  const traySlot = $('tray99-slot');
  const trayBadge = $('tray99-badge');
  const stampList = $('stamp-list');
  const answersEl = $('answers');
  const pd = { a: $('pd-a'), op: $('pd-op'), b: $('pd-b'), eq: $('pd-eq'), q: $('pd-q') };
  const starsEl = $('stars');
  E.registerScreens(screens, 'title');

  /* ---------------- 遊戲狀態 ---------------- */
  const G = { seg: 3, session: [], qIndex: 0, wrongTotal: 0 };
  let Q = null;
  let rng = null;

  function newQuestionState(p) {
    return {
      p,
      phase: 'idle',      // dealing / build / skip / answer / anim / done
      rows: [],           // 已放上陣列的排（Sprite，依序）
      trayStrip: null,    // 月台上待拖的那一排
      rowSlotEls: [],
      counted: new Set(), // 跳數點過的排
      wrongTaps: 0,
      askValue: null,
      wrongAnswers: 0,
    };
  }

  /* ---------------- 尺寸：依段數/排數調整點點卡 ---------------- */
  function setSizes(d, b) {
    const stripW = Math.min(app.clientWidth - 64, 88 + d * 26);
    // 排高依「螢幕扣掉 HUD/月台/導引/答案列後」的預算計算，矮螢幕不溢版
    const budget = Math.max(140, app.clientHeight - 400);
    const rowH = Math.max(22, Math.min(38, Math.floor(budget / Math.max(3, b))));
    app.style.setProperty('--strip-w', stripW + 'px');
    app.style.setProperty('--row-h', rowH + 'px');
  }

  /* ---------------- 盤面 ---------------- */
  function makeStrip(d) {
    let html = '';
    for (let i = 0; i < d; i++) html += '<div class="dot"></div>';
    return new E.Sprite('rowstrip', html);
  }

  function buildRowSlots(b) {
    rowSlotsEl.innerHTML = '';
    Q.rowSlotEls = [];
    for (let i = 0; i < b; i++) {
      const s = document.createElement('div');
      s.className = 'row-slot';
      rowSlotsEl.appendChild(s);
      Q.rowSlotEls.push(s);
    }
  }

  function clearStage() {
    drag.active = false;
    drag.sprite = null;
    for (const el of spriteLayer.querySelectorAll('.sprite')) {
      if (el.__sprite) el.__sprite.destroy(); else el.remove();
    }
    rowSlotsEl.innerHTML = '';
    seqRow.classList.remove('show');
    seqRow.innerHTML = '';
    trayEl.classList.remove('show');
    trayBadge.textContent = '';
    answersEl.innerHTML = '';
    arrayZone.classList.remove('drag-over');
    E.counterHide();
    E.hideHint(false);
  }

  function setProblemDisplay(p) {
    if (p.type === 'gap') {
      pd.a.textContent = p.a;
      pd.op.textContent = '×';
      pd.b.textContent = p.missIdx + 1;
    } else {
      pd.a.textContent = p.a;
      pd.op.textContent = '×';
      pd.b.textContent = p.b;
    }
    pd.q.textContent = '?';
    pd.q.classList.remove('solved', 'pulse');
  }

  // 把一排放進第 idx 個排位
  function placeRow(sp, idx) {
    const slot = Q.rowSlotEls[idx];
    slot.classList.add('taken');
    sp.anchor = slot;
    sp.el.classList.add('locked');
    Q.rows.push(sp);
    const t = E.centerInLayer(slot);
    sp.glideTo(t.x, t.y, { dur: 300, scale: 1 });
    sfx.clink(false);
  }

  // 月台生出下一排
  function spawnTrayStrip() {
    const p = Q.p;
    const left = p.b - Q.rows.length - (Q.trayStrip ? 1 : 0);
    if (Q.trayStrip || Q.rows.length >= p.b) return;
    const sp = makeStrip(p.a);
    sp.anchor = traySlot;
    const t = E.centerInLayer(traySlot);
    sp.placeAt(t.x, t.y + 60, { scale: 0.6 });
    sp.glideTo(t.x, t.y, { dur: 320, scale: 1 });
    sfx.pop();
    Q.trayStrip = sp;
    trayBadge.textContent = '還有 ' + (p.b - Q.rows.length) + ' 排';
  }

  /* ---------------- 拖曳（單一排，比照小火車） ---------------- */
  const drag = { active: false, pointerId: null, sprite: null };

  function overArray(cx, cy) { return E.inflatedContains(arrayZone, cx, cy, 16); }

  function onLayerPointerDown(e) {
    if (!Q) return;
    const el = e.target && e.target.closest ? e.target.closest('.sprite') : null;
    const sp = el && el.__sprite;
    // 跳數：照順序點排
    if (Q.phase === 'skip' && sp && Q.rows.indexOf(sp) >= 0) {
      e.preventDefault();
      sfx.unlock();
      tapRow(sp);
      return;
    }
    // 排陣列：只有月台那一排能拖
    if (Q.phase !== 'build' || !sp || sp !== Q.trayStrip || drag.active) return;
    e.preventDefault();
    drag.active = true; drag.pointerId = e.pointerId; drag.sprite = sp;
    E.hideHint(true);
    sfx.unlock();
    sfx.grab();
    sp.setDragging(true);
    moveDragTo(e.clientX, e.clientY);
  }

  function moveDragTo(cx, cy) {
    const pt = E.toLayer({ x: cx, y: cy });
    const sp = drag.sprite;
    sp.el.style.transition = 'none';
    sp.x = pt.x; sp.y = pt.y - 14; sp.apply();
    arrayZone.classList.toggle('drag-over', overArray(cx, cy));
  }

  function onPointerMove(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    moveDragTo(e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    const sp = drag.sprite;
    drag.active = false; drag.sprite = null;
    arrayZone.classList.remove('drag-over');
    sp.setDragging(false);
    handleDrop(sp, e.clientX, e.clientY);
  }

  function snapBack(sp) {
    if (sp.dead || !sp.anchor) return;
    const t = E.centerInLayer(sp.anchor);
    sp.glideTo(t.x, t.y, { dur: 300, scale: 1 });
  }

  function handleDrop(sp, cx, cy) {
    // 跨題殘留防護：落下時重新驗證（比照小火車）
    if (!Q || sp.dead || sp !== Q.trayStrip || Q.phase !== 'build') { snapBack(sp); return; }
    if (!overArray(cx, cy)) {
      snapBack(sp);
      E.hideHint(true);
      return;
    }
    Q.trayStrip = null;
    placeRow(sp, Q.rows.length);
    E.hideHint(true);
    if (Q.rows.length >= Q.p.b) {
      trayBadge.textContent = '排好了！';
      E.fireSignal(); // 排完 → 主流程接手（跳數）
    } else {
      spawnTrayStrip();
      reshowHintForPhase();
    }
  }

  /* ---------------- 跳數（照順序點排，跳出累積倍數） ---------------- */
  function nextRowToTap() {
    return Q.rows[Q.counted.size] || null;
  }

  function markNextTap() {
    for (const r of Q.rows) r.el.classList.remove('next-tap');
    const next = nextRowToTap();
    if (next) next.el.classList.add('next-tap');
  }

  function tapRow(sp) {
    if (Q.counted.has(sp)) return; // 點過不能再點
    const expect = nextRowToTap();
    if (sp !== expect) {
      // 順序錯：第一次用大象講清楚，之後輕輕提示就好
      Q.wrongTaps++;
      if (Q.wrongTaps === 1) E.worry('照順序喔！從最上面那一排，一排一排往下點！');
      else sfx.uhoh();
      if (expect) {
        const c = E.centerOf(expect.el);
        E.showHint(c, c);
      }
      return;
    }
    Q.counted.add(sp);
    sp.el.classList.remove('next-tap');
    sp.el.classList.add('counted');
    E.hideHint(true);
    const i = Q.counted.size;           // 第 i 排
    const val = Q.p.a * i;              // 跳數：d, 2d, 3d…
    sfx.tick(i - 1);
    E.tapNum(sp.el, val);
    sp.pulse().catch(() => {});
    if (i >= Q.rows.length) {
      E.fireSignal(); // 全部點完
    } else {
      markNextTap();
    }
  }

  async function skipCount() {
    Q.phase = 'skip';
    Q.counted = new Set();
    for (const r of Q.rows) r.el.classList.remove('counted');
    markNextTap();
    const first = nextRowToTap();
    if (first) { const c = E.centerOf(first.el); E.showHint(c, c); }
    await E.waitSignal();
    E.hideHint(false);
    await E.sleep(300);
  }

  /* ---------------- 口訣（caption + 語音 + 印章） ---------------- */
  let lastChant = '';
  function sayChant(p) {
    lastChant = ML.chant(p.a, p.type === 'gap' ? (p.missIdx + 1) : p.b);
    $('caption').classList.add('chant');
    E.caption(lastChant + '！');
    E.speech.speak(lastChant + '！');
    setTimeout(() => sfx.magic(), E.ms(150));
  }
  function addStamp(p) {
    const b = p.type === 'gap' ? (p.missIdx + 1) : p.b;
    const text = p.a + '×' + b + '=' + p.answer;
    // 同一句口訣只蓋一次：重複時讓舊印章跳一下就好
    for (const el of stampList.children) {
      if (el.textContent === text) {
        el.animate([
          { transform: 'scale(1) rotate(-4deg)' },
          { transform: 'scale(1.25) rotate(2deg)' },
          { transform: 'scale(1) rotate(-4deg)' },
        ], { duration: E.ms(400) });
        sfx.stamp();
        return;
      }
    }
    const s = document.createElement('div');
    s.className = 'stamp';
    s.textContent = text;
    stampList.appendChild(s);
    sfx.stamp();
  }

  /* ---------------- 答案選項 ---------------- */
  async function askAnswer(p) {
    Q.phase = 'answer';
    Q.askValue = p.answer;
    pd.q.classList.add('pulse');
    const options = ML.makeOptions(p, rng);
    answersEl.innerHTML = '';
    E.say(p.type === 'gap' ? '被雲遮住的是多少呢？' : '一共有多少個點點呢？想一想口訣！');

    await new Promise((resolve, reject) => {
      E.run.waiters.push({ reject });
      let busy = false;
      options.forEach((v) => {
        const b = document.createElement('button');
        b.className = 'ans-btn';
        b.textContent = v;
        b.addEventListener('click', async () => {
          if (busy || E.run.cancelled) return;
          if (v === p.answer) {
            busy = true;
            b.classList.add('correct');
            sfx.yay();
            const c = E.centerOf(b);
            E.burstStars(c.x, c.y, 12);
            resolve();
          } else {
            busy = true;
            b.classList.add('wrong');
            Q.wrongAnswers++; G.wrongTotal++;
            try {
              const isAdj = Math.abs(v - p.answer) === p.a;
              await E.worryWait(isAdj
                ? '差一排喔！跳著數再數一次：一排一排點！'
                : '再想一想！跳著數就知道了！', 2600);
              if (p.type === 'gap') {
                // 填空題：把序列唸一次當提示
                for (let i = 0; i < p.count; i++) {
                  if (i === p.missIdx) continue;
                  const pill = seqRow.children[i];
                  if (pill) {
                    pill.animate([
                      { transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' },
                    ], { duration: E.ms(360) });
                  }
                  sfx.tick(i);
                  await E.sleep(420);
                }
              } else {
                await skipCount(); // 重新照順序點一次
                Q.phase = 'answer';
              }
              E.say('現在知道了嗎？');
            } catch (err) { if (err.isCancel) return reject(err); }
            busy = false;
          }
        });
        answersEl.appendChild(b);
      });
    });

    pd.q.classList.remove('pulse');
    pd.q.textContent = p.answer;
    pd.q.classList.add('solved');
  }

  /* ---------------- 題型流程 ---------------- */
  async function runBuildQuestion(p) {
    arrayLabel.textContent = '每排 ' + p.a + ' 個';
    trayEl.classList.add('show');
    await E.sayWait(p.a + ' 乘以 ' + p.b + '！每排有 ' + p.a + ' 個點點，要排 ' + p.b + ' 排！', 3200);
    Q.phase = 'build';
    spawnTrayStrip();
    E.say('把點點卡，一排一排拖上去！');
    reshowHintForPhase();
    await E.waitSignal(); // 排完
    Q.phase = 'anim';
    await E.sayWait('排好了！換你跳著數：點一排，跳一次！', 2800);
    await skipCount();
    Q.phase = 'anim';
    sayChant(p);
    await E.sleep(1600);
    await E.speechDrain(lastChant); // 口訣唸完才問答案
    await askAnswer(p);
    addStamp(p);
  }

  async function runGapQuestion(p) {
    arrayLabel.textContent = '每排 ' + p.a + ' 個';
    // 自動排出 6 排（被挖的那排半透明），跳數序列挖一格
    setSizes(p.a, p.count);
    buildRowSlots(p.count);
    seqRow.innerHTML = '';
    for (let i = 0; i < p.count; i++) {
      const pill = document.createElement('div');
      pill.className = 'seq-pill' + (i === p.missIdx ? ' miss' : '');
      pill.textContent = i === p.missIdx ? '？' : p.seq[i];
      seqRow.appendChild(pill);
    }
    seqRow.classList.add('show');
    await E.sayWait(p.a + ' 的跳數：' + p.a + '、' + (p.a * 2) + '、' + (p.a * 3) + '…有一個被雲遮住了！', 3400);
    Q.phase = 'dealing';
    for (let i = 0; i < p.count; i++) {
      if (E.run.cancelled) throw new E.CancelError();
      const sp = makeStrip(p.a);
      const slot = Q.rowSlotEls[i];
      slot.classList.add('taken');
      sp.anchor = slot;
      sp.el.classList.add('locked');
      if (i === p.missIdx) sp.el.style.opacity = 0.3;
      Q.rows.push(sp);
      const t = E.centerInLayer(slot);
      sp.placeAt(t.x, t.y - 40, { scale: 0.5 });
      sp.glideTo(t.x, t.y, { dur: 260, scale: 1 });
      sfx.tick(i);
      await E.sleep(170);
    }
    await E.sleep(300);
    await askAnswer(p);
    // 答對：雲散開
    const missRow = Q.rows[p.missIdx];
    if (missRow && !missRow.dead) missRow.el.style.opacity = 1;
    const pill = seqRow.children[p.missIdx];
    if (pill) { pill.classList.remove('miss'); pill.classList.add('solved'); pill.textContent = p.answer; }
    sayChant(p);
    await E.sleep(1400);
    await E.speechDrain(lastChant);
    addStamp(p);
  }

  async function runQuickQuestion(p) {
    arrayLabel.textContent = '每排 ' + p.a + ' 個';
    await E.sayWait(p.a + ' 乘以 ' + p.b + ' 是多少？看點點卡想口訣！', 3000);
    Q.phase = 'dealing';
    for (let i = 0; i < p.b; i++) {
      if (E.run.cancelled) throw new E.CancelError();
      const sp = makeStrip(p.a);
      const slot = Q.rowSlotEls[i];
      slot.classList.add('taken');
      sp.anchor = slot;
      sp.el.classList.add('locked');
      Q.rows.push(sp);
      const t = E.centerInLayer(slot);
      sp.placeAt(t.x, t.y - 40, { scale: 0.5 });
      sp.glideTo(t.x, t.y, { dur: 240, scale: 1 });
      sfx.tick(i);
      await E.sleep(140);
    }
    await E.sleep(300);
    await askAnswer(p);
    sayChant(p);
    await E.sleep(1400);
    await E.speechDrain(lastChant);
    addStamp(p);
  }

  /* ---------------- 提示 ---------------- */
  function reshowHintForPhase() {
    if (!Q) return;
    if (Q.phase === 'build' && Q.trayStrip) {
      E.showHint(E.centerOf(Q.trayStrip.el), E.centerOf(arrayZone));
    } else if (Q.phase === 'skip') {
      const next = nextRowToTap();
      if (next) { const c = E.centerOf(next.el); E.showHint(c, c); }
    }
  }

  /* ---------------- 一場（5 題） ---------------- */
  const praises = ['答對了！你好棒！', '太厲害了！', '口訣記得真熟！', '好聰明！', '你是九九小達人！'];

  async function runSession(seg) {
    E.newRun();
    G.seg = seg;
    G.qIndex = 0; G.wrongTotal = 0;
    rng = new ML.Rng(E.URL_SEED != null ? E.URL_SEED : undefined);
    G.session = ML.generateSession(seg, { rng });
    stampList.innerHTML = '';
    for (const el of starsEl.children) el.classList.remove('lit');
    E.showScreen('game');

    try {
      for (let i = 0; i < G.session.length; i++) {
        G.qIndex = i;
        const p = G.session[i];
        Q = newQuestionState(p);
        clearStage();
        setSizes(p.a, p.type === 'gap' ? p.count : p.b);
        if (p.type !== 'gap') buildRowSlots(p.b);
        setProblemDisplay(p);
        await E.sleep(500);
        if (p.type === 'build') await runBuildQuestion(p);
        else if (p.type === 'gap') await runGapQuestion(p);
        else await runQuickQuestion(p);

        Q.phase = 'done';
        await E.sleep(650);
        starsEl.children[i].classList.add('lit');
        sfx.fanfare();
        const pc = E.centerOf($('problem-display'));
        E.burstStars(pc.x, pc.y + 20, 14);
        await E.sayWait(praises[i % praises.length], 2200);
        // 點點卡飛走再換下一題
        const sprites = Q.rows.slice();
        sprites.forEach((sp, k) => {
          setTimeout(() => {
            if (!sp.dead && !E.run.cancelled) sp.glideTo(sp.x, sp.y - 90, { dur: 420, scale: 0.4, fade: true });
          }, k * E.ms(40));
        });
        sfx.whoosh();
        await E.sleep(420 + sprites.length * 40 + 150);
        sprites.forEach((sp) => sp.destroy());
      }
      await showEnd();
    } catch (e) {
      if (!e.isCancel) { console.error(e); throw e; }
    }
  }

  async function showEnd() {
    Q = null;
    clearStage();
    if (window.Starmap) window.Starmap.add('mul99', 'd' + G.seg, Math.max(1, G.session.length - G.wrongTotal));
    $('end-stars').textContent = '⭐'.repeat(G.session.length);
    const msg = G.wrongTotal === 0
      ? G.seg + ' 的口訣全部答對，蓋滿印章！'
      : '再玩一次，把 ' + G.seg + ' 的口訣背得更熟！';
    $('end-msg').textContent = msg;
    E.showScreen('end');
    sfx.sparkleRain();
    E.speech.speak('太棒了！' + msg);
    buildSegMenu(); // 更新星星徽章
    const rocket = $('rocket-hedgehog');
    rocket.animate([
      { transform: 'translateX(0) translateY(0) rotate(8deg)', opacity: 1 },
      { transform: 'translateX(' + (app.clientWidth + 280) + 'px) translateY(-70px) rotate(14deg)', opacity: 1 },
    ], { duration: E.ms(2400), easing: 'ease-in' });
  }

  /* ---------------- 標題畫面：口訣段選單 ---------------- */
  function buildSegMenu() {
    const menu = $('seg-menu');
    menu.innerHTML = '';
    ML.SEGMENTS.forEach((d, i) => {
      const b = document.createElement('button');
      b.className = 'seg-btn c' + (i % 4);
      const best = window.Starmap ? window.Starmap.best('mul99', 'd' + d) : 0;
      b.innerHTML = '<b>' + d + '</b><small>的口訣</small>'
        + '<span class="seg-stars">' + (best > 0 ? '⭐' + best : '　') + '</span>';
      b.addEventListener('click', () => {
        sfx.unlock(); E.speech.prime(); sfx.tap();
        runSession(d);
      });
      menu.appendChild(b);
    });
  }

  /* ---------------- 事件綁定 ---------------- */
  function onResize() {
    for (const el of spriteLayer.querySelectorAll('.sprite')) {
      const sp = el.__sprite;
      if (sp && sp.anchor && sp !== drag.sprite) {
        const t = E.centerInLayer(sp.anchor);
        sp.placeAt(t.x, t.y);
      }
    }
  }

  function bindUI() {
    $('btn-home').addEventListener('click', () => {
      sfx.tap(); E.speech.stop();
      E.cancelRun(); Q = null; clearStage();
      buildSegMenu();
      E.showScreen('title');
    });
    $('btn-sound').addEventListener('click', () => {
      E.setSoundOn(!E.soundOn);
      $('btn-sound').textContent = E.soundOn ? '🔊' : '🔇';
      sfx.tap();
    });
    $('btn-again').addEventListener('click', () => { sfx.unlock(); E.speech.prime(); sfx.tap(); runSession(G.seg); });
    $('btn-menu').addEventListener('click', () => { sfx.tap(); buildSegMenu(); E.showScreen('title'); });

    spriteLayer.addEventListener('pointerdown', onLayerPointerDown, { passive: false });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    E.bindLifecycle({ onResize });
  }

  /* ---------------- 測試掛勾 ---------------- */
  window.__test = {
    get screen() { return E.currentScreen; },
    get phase() { return Q ? Q.phase : 'idle'; },
    get problem() { return Q ? Q.p : null; },
    get qIndex() { return G.qIndex; },
    get session() { return G.session; },
    get askValue() { return Q ? Q.askValue : null; },
    get rowsPlaced() { return Q ? Q.rows.length : 0; },
    get countedRows() { return Q ? Q.counted.size : 0; },
    get stamps() { return stampList.children.length; },
    get wrongTotal() { return G.wrongTotal; },
    startSeg(d) { runSession(d); },
    pump() { E.pumpTimers(); },
    centers: {
      trayStrip() { return Q && Q.trayStrip ? E.centerOf(Q.trayStrip.el) : null; },
      arrayZone() { return E.centerOf(arrayZone); },
      nextRow() {
        const r = Q ? Q.rows[Q.counted.size] : null;
        return r ? E.centerOf(r.el) : null;
      },
      row(i) { return Q && Q.rows[i] ? E.centerOf(Q.rows[i].el) : null; },
    },
    drag(x0, y0, x1, y1) {
      const target = document.elementFromPoint(x0, y0);
      if (!target) return false;
      const opt = (x, y) => ({
        bubbles: true, cancelable: true, composed: true,
        pointerId: 7, isPrimary: true, pointerType: 'touch',
        clientX: x, clientY: y, button: 0, buttons: 1,
      });
      target.dispatchEvent(new PointerEvent('pointerdown', opt(x0, y0)));
      const steps = 6;
      for (let i = 1; i <= steps; i++) {
        window.dispatchEvent(new PointerEvent('pointermove',
          opt(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps)));
      }
      window.dispatchEvent(new PointerEvent('pointerup', opt(x1, y1)));
      return true;
    },
    clickAnswer(correct) {
      if (!Q || Q.askValue == null) return false;
      const want = Q.askValue;
      for (const b of answersEl.querySelectorAll('.ans-btn')) {
        const v = Number(b.textContent);
        if (correct ? v === want : v !== want) { b.click(); return v; }
      }
      return false;
    },
  };

  /* ---------------- 啟動 ---------------- */
  function init() {
    E.mountChar('lottie-title-elephant', window.LOTTIE_ELEPHANT, 'elephant.gif', 'title');
    E.mountChar('lottie-title-shark', window.LOTTIE_SHARK, 'shark.gif', 'title');
    E.mountChar('lottie-guide', window.LOTTIE_ELEPHANT, 'elephant.gif', 'game');
    E.mountChar('lottie-end-boy', window.LOTTIE_BOY, 'boy.gif', 'end');
    buildSegMenu();
    bindUI();
    E.playScreenChars('title');
    // 測試：?mode=d3&seed=1&fast=1 直接開跑（關語音）
    if (E.URL_MODE && /^d[2-9]$/.test(E.URL_MODE)) {
      E.speech.on = false;
      runSession(Number(E.URL_MODE.slice(1)));
    } else if (E.URL_PLAY && /^d[2-9]$/.test(E.URL_PLAY)) {
      // 從入口直連某一段：反白該按鈕提示（點擊才有手勢能開語音）
      const d = Number(E.URL_PLAY.slice(1));
      const idx = ML.SEGMENTS.indexOf(d);
      const btn = $('seg-menu').children[idx];
      if (btn) btn.animate([
        { transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' },
      ], { duration: 900, iterations: 5 });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
