/* ============================================================
   量量看長度
   lv1/lv2：拖尺把「0」對齊物品左端（英雄互動）→ 讀長度
   lv3：尺的 0 被蓋住，物品從刻度 start 開始 → 長度＝末端−起點
   答錯用「一格一格數公分」當鷹架。共用 js/engine.js。
   starmap key: ('measure','lv1'..'lv3')
   ============================================================ */
(function () {
  'use strict';

  const ML = window.MeasureLogic;
  const sfx = window.sfx;
  const $ = (id) => document.getElementById(id);
  const E = Engine.create({ layer: 'fx-layer', fx: 'fx-layer', reshowHint: reshowHintForPhase });

  /* ---------------- DOM ---------------- */
  const app = $('app');
  const screens = { title: $('screen-title'), game: $('screen-game'), end: $('screen-end') };
  const bench = $('bench');
  const objectEl = $('object');
  const spanHl = $('span-hl');
  const unitsLayer = $('units-layer');
  const rulerEl = $('ruler');
  const answersEl = $('answers');
  const pdLabel = $('pd-label');
  const starsEl = $('stars');
  E.registerScreens(screens, 'title');

  /* ---------------- 狀態 ---------------- */
  const G = { lv: 'lv1', session: [], qIndex: 0, wrongTotal: 0 };
  let Q = null;

  // 版面度量（每題重算）
  let M = { cmPx: 22, capLeft: 14, rulerW: 0, objX: 44, objTop: 0, objH: 34, tx0: 20 };

  function newRound(p) {
    return { p, phase: 'idle', tx: 0, alignedTx: 0, aligned: false,
      counted: new Set(), countCells: [], askValue: null, wrongAnswers: 0 };
  }

  /* ---------------- 版面 ---------------- */
  function computeMetrics(p) {
    const bw = bench.clientWidth, bh = bench.clientHeight;
    const cmPx = Math.max(18, Math.min(26, Math.floor((bw - 44) / 14)));
    const rulerH = Math.max(44, Math.min(56, Math.round(bh * 0.2)));
    const capLeft = 14, capRight = 30;
    const rulerW = capLeft + p.rulerMax * cmPx + capRight;
    const objH = Math.max(34, Math.min(48, Math.round(rulerH * 0.86)));
    const rulerTopFromBottom = 14 + rulerH;
    const objBottom = bh - rulerTopFromBottom - 12;
    const objTop = objBottom - objH;
    const objX = p.lv === 3 ? (20 + capLeft + p.start * cmPx) : 44;
    M = { cmPx, capLeft, capRight, rulerH, rulerW, objX, objTop, objH, tx0: 20 };
    app.style.setProperty('--ruler-h', rulerH + 'px');
    app.style.setProperty('--obj-h', objH + 'px');
  }

  function buildRuler(p) {
    rulerEl.innerHTML = '';
    rulerEl.style.width = M.rulerW + 'px';
    for (let k = 0; k <= p.rulerMax; k++) {
      const x = M.capLeft + k * M.cmPx;
      const t = document.createElement('div');
      t.className = 'tick ' + (k === 0 ? 'zero major' : (k % 5 === 0 ? 'major' : 'mid'));
      t.style.left = x + 'px';
      rulerEl.appendChild(t);
      const n = document.createElement('div');
      n.className = 'tick-num' + (k === 0 ? ' zero' : '');
      n.style.left = x + 'px';
      n.textContent = k;
      rulerEl.appendChild(n);
    }
    const cm = document.createElement('div');
    cm.className = 'ruler-cm'; cm.textContent = '公分';
    rulerEl.appendChild(cm);
  }

  function applyTx() { rulerEl.style.transform = 'translateX(' + Q.tx + 'px)'; }

  function placeObject(p) {
    const w = p.length * M.cmPx;
    objectEl.style.top = M.objTop + 'px';
    objectEl.style.left = M.objX + 'px';
    objectEl.style.width = w + 'px';
    objectEl.style.height = M.objH + 'px';
    // 卡通 SVG 插畫：量測左端在 x=0、右端在 x=w（對齊尺的 0 與 length 刻度）
    const art = (window.ObjectArt && window.ObjectArt.has(p.obj.key))
      ? window.ObjectArt.draw(p.obj.key, w, M.objH) : '';
    objectEl.innerHTML =
      '<span class="obj-tag">' + p.obj.emoji + ' ' + p.obj.name + '</span>' +
      art +
      '<span class="obj-zero"></span>';
  }

  function layout(p) {
    computeMetrics(p);
    buildRuler(p);
    placeObject(p);
    Q.alignedTx = M.objX - M.capLeft;                 // 0 對到物品左端
    if (p.lv === 3) { Q.tx = M.tx0; Q.aligned = true; } // lv3 尺固定，0 在左邊
    else if (!Q.aligned) Q.tx = clampTx(Q.alignedTx + 3 * M.cmPx); // 初始故意偏 3 公分
    applyTx();
    positionSpan(p);
  }
  function clampTx(tx) {
    const min = -M.rulerW * 0.45, max = bench.clientWidth - 40;
    return Math.max(min, Math.min(max, tx));
  }
  function positionSpan(p) {
    // 量好的高亮條：物品左端到右端
    const left = p.lv === 3 ? M.objX : M.objX;
    spanHl.style.left = left + 'px';
    spanHl.style.width = (p.length * M.cmPx) + 'px';
    spanHl.style.top = (M.objTop + M.objH + 3) + 'px';
  }

  /* ---------------- 拖尺對齊（lv1/lv2 英雄互動） ---------------- */
  const drag = { active: false, pointerId: null, startX: 0, startTx: 0 };

  function onRulerDown(e) {
    if (!Q || Q.phase !== 'align') return;
    e.preventDefault();
    drag.active = true; drag.pointerId = e.pointerId;
    drag.startX = e.clientX; drag.startTx = Q.tx;
    rulerEl.classList.add('grabbing');
    E.hideHint(true);
    sfx.unlock();
  }
  function onPointerMove(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    Q.tx = clampTx(drag.startTx + (e.clientX - drag.startX));
    applyTx();
    if (Math.random() < 0.15) sfx.slide();
    // 接近對齊時提示（0 標記變色由 aligned class 控制，這裡先不鎖）
  }
  function onPointerUp(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    drag.active = false;
    rulerEl.classList.remove('grabbing');
    const snapPx = 0.55 * M.cmPx;
    if (Math.abs(Q.tx - Q.alignedTx) <= snapPx) {
      alignSuccess();
    } else {
      // 沒對齊：溫和提示
      E.worry('尺的紅色 0，要對到物品的左邊喔！');
      objectEl.classList.add('hint-zero');
      reshowHintForPhase();
    }
  }

  async function alignSuccess() {
    Q.phase = 'anim';
    Q.aligned = true;
    Q.tx = Q.alignedTx;
    applyTx();
    rulerEl.classList.add('locked', 'aligned', 'snap');
    objectEl.classList.remove('hint-zero');
    E.hideHint(false);
    setTimeout(() => rulerEl.classList.remove('snap'), 400);
    sfx.alignDing();
    E.caption('對齊 0 了！');
    spanHl.classList.add('show');
    E.fireSignal();
  }

  /* ---------------- 點數公分格（鷹架／lv3 方法） ---------------- */
  function buildUnitCells(p) {
    unitsLayer.innerHTML = '';
    Q.countCells = [];
    Q.counted = new Set();
    for (let i = 0; i < p.length; i++) {
      const cell = document.createElement('div');
      cell.className = 'unit-cell';
      cell.style.left = (M.objX + i * M.cmPx) + 'px';
      cell.style.top = M.objTop + 'px';
      cell.style.width = M.cmPx + 'px';
      cell.style.height = M.objH + 'px';
      cell.__idx = i;
      unitsLayer.appendChild(cell);
      Q.countCells.push(cell);
    }
  }
  function nextCell() { return Q.countCells[Q.counted.size] || null; }
  function markNextCell() {
    Q.countCells.forEach((c) => c.classList.remove('next'));
    const n = nextCell();
    if (n) n.classList.add('next');
  }
  function tapCell(cell) {
    if (Q.counted.has(cell)) return;
    if (cell !== nextCell()) {   // 要照順序
      sfx.uhoh();
      const n = nextCell();
      if (n) { const c = E.centerOf(n); E.showHint(c, c); }
      return;
    }
    Q.counted.add(cell);
    cell.classList.remove('next');
    cell.classList.add('counted');
    const i = Q.counted.size;
    sfx.tick(i - 1);
    E.tapNum(cell, i);
    if (i >= Q.p.length) { E.fireSignal(); } else markNextCell();
  }
  async function countUnits(p) {
    Q.phase = 'count';
    buildUnitCells(p);
    markNextCell();
    const n = nextCell();
    if (n) { const c = E.centerOf(n); E.showHint(c, c); }
    E.say('一格一格數數看！點每一格。');
    await E.waitSignal();
    E.hideHint(false);
    await E.sleep(300);
  }

  /* ---------------- 提問 ---------------- */
  async function askLength(p) {
    Q.phase = 'answer';
    Q.askValue = p.answer;
    const opts = ML.makeOptions(p, new PL());
    answersEl.innerHTML = '';
    pdLabel.textContent = '多長呢？';
    E.say(p.lv === 3 ? '從頭到尾，一共幾公分呢？' : '另一頭指到幾？有幾公分呢？');

    await new Promise((resolve, reject) => {
      E.run.waiters.push({ reject });
      let busy = false;
      opts.forEach((v) => {
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
              const msg = (p.lv === 3 && v === p.end)
                ? '不是看末端的數字喔！要從頭一格一格數！'
                : '再數數看！一公分一公分數！';
              await E.worryWait(msg, 2600);
              await countUnits(p);
              E.say('數數看，是 ' + p.length + ' 公分！現在知道了嗎？');
              Q.phase = 'answer';
            } catch (err) { if (err.isCancel) return reject(err); }
            busy = false;
          }
        });
        answersEl.appendChild(b);
      });
    });

    pdLabel.textContent = p.length + ' 公分！';
  }
  // makeOptions 需要一個 Rng；用 pattern 無關的 seed 讓選項穩定
  function PL() { return new ML.Rng(E.URL_SEED != null ? E.URL_SEED + Q.p.length * 7 + G.qIndex : (Q.p.length * 131 + Q.p.start * 7 + G.qIndex)); }

  /* ---------------- 提示 ---------------- */
  function reshowHintForPhase() {
    if (!Q) return;
    if (Q.phase === 'align') {
      // 從尺的 0 指向物品左端
      const zero = rulerEl.querySelector('.tick.zero');
      if (zero) E.showHint(E.centerOf(zero), E.centerOf(objectEl));
    } else if (Q.phase === 'count') {
      const n = nextCell();
      if (n) { const c = E.centerOf(n); E.showHint(c, c); }
    }
  }

  /* ---------------- 一回合 ---------------- */
  async function runRound(p) {
    Q.aligned = p.lv === 3;
    spanHl.classList.remove('show');
    unitsLayer.innerHTML = '';
    objectEl.classList.remove('hint-zero');
    rulerEl.classList.remove('locked', 'aligned');
    layout(p);

    if (p.lv === 3) {
      spanHl.classList.add('show');
      await E.sayWait('量量看這隻' + p.obj.name + '！咦，它沒有從 0 開始，是從 ' + p.start + ' 開始的！', 3600);
    } else {
      await E.sayWait('幫大象量量看這隻' + p.obj.name + '有多長！', 2800);
      Q.phase = 'align';
      objectEl.classList.add('hint-zero');
      E.say('拖尺子，把紅色的 0，對到' + p.obj.name + '的左邊！');
      reshowHintForPhase();
      await E.waitSignal(); // 對齊成功
      Q.phase = 'anim';
      await E.sayWait('對齊 0 了！看看另一頭指到幾！', 2600);
    }

    await askLength(p);

    Q.phase = 'done';
    const oc = E.centerOf(objectEl);
    E.burstStars(oc.x, oc.y, 14);
  }

  /* ---------------- 一場 ---------------- */
  const praises = ['量對了！你好棒！', '好厲害！', '量得真準！', '好聰明！', '你是測量小達人！'];

  async function runSession(lv) {
    E.newRun();
    G.lv = lv;
    G.qIndex = 0; G.wrongTotal = 0;
    const rng = new ML.Rng(E.URL_SEED != null ? E.URL_SEED : undefined);
    G.session = ML.generateSession(Number(lv.slice(2)), { rng });
    for (const el of starsEl.children) el.classList.remove('lit');
    E.showScreen('game');

    try {
      for (let i = 0; i < G.session.length; i++) {
        G.qIndex = i;
        const p = G.session[i];
        Q = newRound(p);
        answersEl.innerHTML = '';
        pdLabel.textContent = '量量看！';
        E.counterHide();
        await E.sleep(400);
        await runRound(p);

        await E.sleep(500);
        starsEl.children[i].classList.add('lit');
        sfx.fanfare();
        await E.sayWait(praises[i % praises.length], 2200);
        await E.sleep(300);
      }
      await showEnd();
    } catch (e) {
      if (!e.isCancel) { console.error(e); throw e; }
    }
  }

  async function showEnd() {
    Q = null;
    unitsLayer.innerHTML = '';
    spanHl.classList.remove('show');
    answersEl.innerHTML = '';
    if (window.Starmap) window.Starmap.add('measure', G.lv, Math.max(1, G.session.length - G.wrongTotal));
    $('end-stars').textContent = '⭐'.repeat(G.session.length);
    const msg = G.wrongTotal === 0 ? '每一樣都量得好準，太棒了！' : '再玩一次，記得先對齊 0 喔！';
    $('end-msg').textContent = msg;
    E.showScreen('end');
    sfx.sparkleRain();
    E.speech.speak('太棒了！' + msg);
    const rocket = $('rocket-hedgehog');
    rocket.animate([
      { transform: 'translateX(0) translateY(0) rotate(8deg)', opacity: 1 },
      { transform: 'translateX(' + (app.clientWidth + 280) + 'px) translateY(-70px) rotate(14deg)', opacity: 1 },
    ], { duration: E.ms(2400), easing: 'ease-in' });
  }

  /* ---------------- 事件 ---------------- */
  function onResize() { if (Q) layout(Q.p); }

  function bindUI() {
    document.querySelectorAll('.mode-btn').forEach((b) => {
      b.addEventListener('click', () => {
        sfx.unlock(); E.speech.prime(); sfx.tap();
        runSession(b.dataset.mode);
      });
    });
    $('btn-home').addEventListener('click', () => {
      sfx.tap(); E.speech.stop();
      E.cancelRun(); Q = null;
      unitsLayer.innerHTML = ''; answersEl.innerHTML = ''; spanHl.classList.remove('show');
      E.showScreen('title');
    });
    $('btn-sound').addEventListener('click', () => {
      E.setSoundOn(!E.soundOn);
      $('btn-sound').textContent = E.soundOn ? '🔊' : '🔇';
      sfx.tap();
    });
    $('btn-again').addEventListener('click', () => { sfx.unlock(); E.speech.prime(); sfx.tap(); runSession(G.lv); });
    $('btn-menu').addEventListener('click', () => { sfx.tap(); E.showScreen('title'); });

    rulerEl.addEventListener('pointerdown', onRulerDown, { passive: false });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    unitsLayer.addEventListener('pointerdown', (e) => {
      if (!Q || Q.phase !== 'count') return;
      const cell = e.target && e.target.closest ? e.target.closest('.unit-cell') : null;
      if (cell) { e.preventDefault(); sfx.unlock(); tapCell(cell); }
    }, { passive: false });

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
    get aligned() { return Q ? Q.aligned : false; },
    get countLeft() { return Q ? (Q.countCells.length - Q.counted.size) : 0; },
    get wrongTotal() { return G.wrongTotal; },
    startLevel(lv) { runSession(lv); },
    pump() { E.pumpTimers(); },
    alignRuler() { if (Q && Q.phase === 'align') { Q.tx = Q.alignedTx; applyTx(); alignSuccess(); return true; } return false; },
    tapNextUnit() {
      if (!Q || Q.phase !== 'count') return false;
      const n = nextCell();
      if (n) { tapCell(n); return true; }
      return false;
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
    E.mountChar('lottie-title-boy', window.LOTTIE_BOY, 'boy.gif', 'title');
    E.mountChar('lottie-guide', window.LOTTIE_ELEPHANT, 'elephant.gif', 'game');
    E.mountChar('lottie-end-boy', window.LOTTIE_BOY, 'boy.gif', 'end');
    bindUI();
    E.playScreenChars('title');
    const valid = /^lv[123]$/;
    if (E.URL_MODE && valid.test(E.URL_MODE)) {
      E.speech.on = false;
      runSession(E.URL_MODE);
    } else if (E.URL_PLAY && valid.test(E.URL_PLAY)) {
      const labels = { lv1: '📏 對齊零點', lv2: '📐 量長物', lv3: '🔎 從刻度量' };
      $('start-mode-label').textContent = labels[E.URL_PLAY];
      const ov = $('start-overlay');
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
