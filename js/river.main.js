/* ============================================================
   小鳥過河 — 等差數列（找規律）
   石頭排成數線、間距相等；小鳥每次「跳一樣遠」＝公差。
   往上坡＝數字變大，往下坡＝變小。
   lv1 找下一顆｜lv2 補中間（增減）｜lv3 看間隔＋預測
   共用 js/engine.js；starmap key: ('river','lv1'..'lv3')
   ============================================================ */
(function () {
  'use strict';

  const PL = window.PatternLogic;
  const sfx = window.sfx;
  const $ = (id) => document.getElementById(id);
  const E = Engine.create({ reshowHint: reshowHintForPhase });

  /* ---------------- DOM ---------------- */
  const app = $('app');
  const screens = { title: $('screen-title'), game: $('screen-game'), end: $('screen-end') };
  const pond = $('pond');
  const stonesEl = $('stones');
  const stepsLayer = $('steps-layer');
  const hopper = $('hopper');
  const dirBanner = $('dir-banner');
  const answersEl = $('answers');
  const pdLabel = $('pd-label');
  const starsEl = $('stars');
  E.registerScreens(screens, 'title');

  /* ---------------- 狀態 ---------------- */
  const G = { lv: 'lv1', session: [], qIndex: 0, wrongTotal: 0 };
  let Q = null;

  function newRound(p) {
    return {
      p,
      phase: 'idle',   // observe / answer / anim / done
      stoneEls: [],
      stonePos: [],     // 各石頭在 pond 內的 {x,y}（px）
      chips: [],        // {el, i}
      frogIndex: 0,
      frogPos: { x: 0, y: 0 },
      hopping: false,
      diffAsked: false,
      askValue: null,   // 目前提問的正解（缺項數字 or 公差）
      wrongAnswers: 0,
    };
  }

  /* ---------------- 尺寸 ---------------- */
  function setSizes() {
    const w = pond.clientWidth || app.clientWidth;
    const sw = Math.max(40, Math.min(58, Math.floor(w / 7)));
    app.style.setProperty('--stone-w', sw + 'px');
    app.style.setProperty('--bird-w', Math.round(sw * 1.18) + 'px');
  }
  function birdLift() { return (parseFloat(getComputedStyle(app).getPropertyValue('--stone-w')) || 52) * 0.5; }

  /* ---------------- 版面：石頭位置（增減＝上下坡） ---------------- */
  function computePositions(p) {
    const W = pond.clientWidth, H = pond.clientHeight;
    const n = p.length;
    const padX = Math.max(30, W * 0.1);
    const topY = H * 0.28, botY = H * 0.74;
    const pos = [];
    for (let i = 0; i < n; i++) {
      const x = padX + (i / (n - 1)) * (W - 2 * padX);
      const t = i / (n - 1);
      // 遞增：從低（botY）爬到高（topY）；遞減：從高到低
      const y = p.increasing ? (botY - t * (botY - topY)) : (topY + t * (botY - topY));
      pos.push({ x, y });
    }
    return pos;
  }

  function layoutStones() {
    if (!Q) return;
    Q.stonePos = computePositions(Q.p);
    Q.stoneEls.forEach((el, i) => {
      el.style.left = Q.stonePos[i].x + 'px';
      el.style.top = Q.stonePos[i].y + 'px';
    });
    // 公差牌落在兩石頭中點稍上方
    for (const c of Q.chips) {
      const a = Q.stonePos[c.i - 1], b = Q.stonePos[c.i];
      c.el.style.left = ((a.x + b.x) / 2) + 'px';
      c.el.style.top = ((a.y + b.y) / 2 - 20) + 'px';
    }
    if (!Q.hopping) setFrogToStone(Q.frogIndex);
  }

  function buildStones(p) {
    stonesEl.innerHTML = '';
    stepsLayer.innerHTML = '';
    Q.stoneEls = [];
    Q.chips = [];
    for (let i = 0; i < p.length; i++) {
      const el = document.createElement('div');
      el.className = 'stone';
      const isMissing = i === p.missingIndex;
      if (isMissing) el.classList.add('missing');
      if (i === p.length - 1) el.classList.add('goal');
      el.innerHTML = '<div class="pad"></div><span class="num">'
        + (isMissing ? '？' : p.terms[i]) + '</span>'
        + (i === p.length - 1 ? '<span class="flag">🏁</span>' : '');
      stonesEl.appendChild(el);
      Q.stoneEls.push(el);
    }
    layoutStones();
  }

  /* ---------------- 小鳥 ---------------- */
  function setFrog(pt) {
    hopper.style.left = pt.x + 'px';
    hopper.style.top = pt.y + 'px';
    hopper.style.transform = 'translate(-50%,-50%)';
    Q.frogPos = { x: pt.x, y: pt.y };
  }
  function stoneCenterInLayer(i) {
    const c = E.centerInLayer(Q.stoneEls[i]);
    c.y -= birdLift();
    return c;
  }
  function setFrogToStone(i) {
    if (!Q.stoneEls[i]) return;
    setFrog(stoneCenterInLayer(i));
    Q.frogIndex = i;
  }

  async function hopTo(i) {
    const to = stoneCenterInLayer(i);
    const from = { x: Q.frogPos.x, y: Q.frogPos.y };
    const dx = to.x - from.x, dy = to.y - from.y;
    if (E.FAST) { setFrog(to); Q.frogIndex = i; return; }
    const arc = Math.max(46, Math.abs(dx) * 0.4 + 30);
    Q.hopping = true;
    sfx.hop();
    const anim = hopper.animate([
      { transform: 'translate(-50%,-50%) translate(0px,0px) rotate(0deg)' },
      { transform: 'translate(-50%,-50%) translate(' + (dx * 0.5) + 'px,' + (dy * 0.5 - arc) + 'px) rotate(-10deg)', offset: 0.5 },
      { transform: 'translate(-50%,-50%) translate(' + dx + 'px,' + dy + 'px) rotate(0deg)' },
    ], { duration: E.ms(560), easing: 'cubic-bezier(.4,.05,.5,1)' });
    try {
      await E.sleep(560);
      setFrog(to);       // 先把 base 位置設到目標
    } finally {
      // 即使中途被 🏠 取消（sleep 拋 CancelError），也要收掉動畫，不留孤兒
      anim.cancel();     // 取消動畫（transform 回到 base）
      Q.hopping = false;
    }
    Q.frogIndex = i;
    sfx.splash();
  }

  // 落下公差牌（跳過就留著，讓孩子看見「每次一樣多」）
  function dropStepChip(i) {
    const a = Q.stonePos[i - 1], b = Q.stonePos[i];
    const chip = document.createElement('div');
    chip.className = 'step-chip ' + (Q.p.increasing ? 'up' : 'down');
    chip.textContent = (Q.p.increasing ? '+' : '−') + Q.p.step;
    chip.style.left = ((a.x + b.x) / 2) + 'px';
    chip.style.top = ((a.y + b.y) / 2 - 20) + 'px';
    stepsLayer.appendChild(chip);
    void chip.offsetWidth;
    chip.classList.add('show');
    Q.chips.push({ el: chip, i });
  }
  function flashChips() {
    for (const c of Q.chips) {
      c.el.animate([{ transform: 'translate(-50%,-50%) scale(1)' },
        { transform: 'translate(-50%,-50%) scale(1.3)' },
        { transform: 'translate(-50%,-50%) scale(1)' }], { duration: E.ms(500) });
    }
  }

  /* ---------------- 方向旗 ---------------- */
  function showDirBanner(p) {
    dirBanner.className = 'show ' + (p.increasing ? 'up' : 'down');
    dirBanner.textContent = p.increasing ? '⬆ 數字越來越大' : '⬇ 數字越來越小';
  }

  /* ---------------- 觀察：點一下，小鳥就跳 ---------------- */
  function waitTap() {
    setFrogToStone(Q.frogIndex); // 版面若在進場中量測過早，這裡對正
    Q.phase = 'observe';
    pond.classList.add('tap-ready');
    hopper.classList.add('tappable');
    pdLabel.textContent = '點一下，小鳥就跳！';
    const c = E.centerOf(hopper);
    E.showHint(c, c);
    return E.waitSignal().then(() => {
      pond.classList.remove('tap-ready');
      hopper.classList.remove('tappable');
      E.hideHint(false);
    });
  }

  /* ---------------- 提問：缺項數字 ---------------- */
  function askOptions(values, correct, sayText, onWrong) {
    Q.phase = 'answer';
    Q.askValue = correct;
    answersEl.innerHTML = '';
    E.say(sayText);
    return new Promise((resolve, reject) => {
      E.run.waiters.push({ reject });
      let busy = false;
      values.forEach((v) => {
        const b = document.createElement('button');
        b.className = 'ans-btn';
        b.textContent = v;
        b.addEventListener('click', async () => {
          if (busy || E.run.cancelled) return;
          if (v === correct) {
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
            try { await onWrong(v); } catch (err) { if (err.isCancel) return reject(err); }
            busy = false;
          }
        });
        answersEl.appendChild(b);
      });
    });
  }

  async function askTerm(p, i) {
    setFrogToStone(Q.frogIndex); // 出題時小鳥停在上一顆，確保對正
    const stone = Q.stoneEls[i];
    stone.classList.add('ask');
    const opts = PL.makeOptions(p, new PL.Rng(Number(E.URL_SEED != null ? E.URL_SEED + i * 7 : (p.answer * 31 + i))));
    const q = i === p.length - 1 ? '小鳥下一顆要跳到多少呢？' : '中間這顆石頭是多少呢？';
    pdLabel.textContent = i === p.length - 1 ? '下一顆是？' : '中間是？';
    await askOptions(opts, p.answer, q, async (v) => {
      const diff = v - p.answer;
      let msg;
      if (Math.abs(diff) === p.step) msg = '差一顆喔！每次都' + (p.increasing ? '多' : '少') + ' ' + p.step + '，再看一次規律！';
      else msg = '再看看石頭上的數字，找找規律！';
      await E.worryWait(msg, 2600);
      flashChips();
      E.say('每次都' + (p.increasing ? '多' : '少') + ' ' + p.step + '，想想看！');
    });
    // 答對：揭曉石頭數字
    stone.classList.remove('missing', 'ask');
    stone.classList.add('revealed');
    stone.querySelector('.num').textContent = p.terms[i];
    sfx.pop();
    await E.sleep(300);
  }

  async function askDiff(p) {
    setFrogToStone(Q.frogIndex);
    pdLabel.textContent = '每次跳多遠？';
    const opts = PL.makeDiffOptions(p, new PL.Rng(Number(E.URL_SEED != null ? E.URL_SEED + 99 : p.step * 13 + p.start)));
    await askOptions(opts, p.step, '小鳥每次跳多遠呢？看看牌子！', async () => {
      await E.worryWait('看看石頭中間的牌子，每次跳一樣多喔！', 2400);
      flashChips();
    });
    flashChips();
    E.caption('每次都跳 ' + p.step + '！');
    E.speech.speak('每次都跳 ' + p.step + '！');
    await E.sleep(1200);
  }

  /* ---------------- 提示重播 ---------------- */
  function reshowHintForPhase() {
    if (!Q) return;
    if (Q.phase === 'observe') {
      const c = E.centerOf(hopper);
      E.showHint(c, c);
    }
  }

  /* ---------------- 一回合（過一條河） ---------------- */
  async function runRound(p) {
    buildStones(p);
    setFrogToStone(0);
    showDirBanner(p);
    await E.sayWait('小鳥要過河！看看石頭上的數字，' + (p.increasing ? '越來越大' : '越來越小') + '！', 3200);
    setFrogToStone(0); // 進場動畫結束、版面定案後再對正一次

    for (let i = 1; i < p.length; i++) {
      if (i === p.missingIndex) {
        if (p.askDiff && !Q.diffAsked) { Q.diffAsked = true; await askDiff(p); }
        await askTerm(p, i);
      } else {
        await waitTap();
      }
      Q.phase = 'anim';
      await hopTo(i);
      dropStepChip(i);
      if (i < p.length - 1) await E.sleep(200);
    }

    // 過河成功
    Q.phase = 'done';
    pdLabel.textContent = '過河成功！';
    const goal = Q.stoneEls[p.length - 1];
    goal.querySelector('.flag').textContent = '🎉';
    const gc = E.centerOf(goal);
    E.burstStars(gc.x, gc.y - 10, 16);
  }

  /* ---------------- 一場（5 回合） ---------------- */
  const praises = ['過河了！你好棒！', '規律找對了！', '太厲害了！', '好聰明！', '你是規律小達人！'];

  async function runSession(lv) {
    E.newRun();
    G.lv = lv;
    G.qIndex = 0; G.wrongTotal = 0;
    const rng = new PL.Rng(E.URL_SEED != null ? E.URL_SEED : undefined);
    G.session = PL.generateSession(Number(lv.slice(2)), { rng });
    for (const el of starsEl.children) el.classList.remove('lit');
    E.showScreen('game');

    try {
      for (let i = 0; i < G.session.length; i++) {
        G.qIndex = i;
        const p = G.session[i];
        Q = newRound(p);
        setSizes();
        answersEl.innerHTML = '';
        pdLabel.textContent = '看看規律！';
        E.counterHide();
        await E.sleep(400);
        await runRound(p);

        await E.sleep(500);
        starsEl.children[i].classList.add('lit');
        sfx.fanfare();
        await E.sayWait(praises[i % praises.length], 2200);
        // 小鳥飛走，換下一條河
        if (!E.FAST) {
          hopper.animate([{ transform: 'translate(-50%,-50%)' },
            { transform: 'translate(-50%,-250%) scale(.5)', opacity: 0 }], { duration: E.ms(500), easing: 'ease-in' });
        }
        await E.sleep(520);
        dirBanner.className = '';
      }
      await showEnd();
    } catch (e) {
      if (!e.isCancel) { console.error(e); throw e; }
    }
  }

  async function showEnd() {
    Q = null;
    stonesEl.innerHTML = '';
    stepsLayer.innerHTML = '';
    answersEl.innerHTML = '';
    dirBanner.className = '';
    if (window.Starmap) window.Starmap.add('river', G.lv, Math.max(1, G.session.length - G.wrongTotal));
    $('end-stars').textContent = '⭐'.repeat(G.session.length);
    const msg = G.wrongTotal === 0
      ? '每一條河都找對規律，太棒了！'
      : '再玩一次，規律會越看越快！';
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
  function onResize() { setSizes(); layoutStones(); }

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
      stonesEl.innerHTML = ''; stepsLayer.innerHTML = ''; answersEl.innerHTML = '';
      dirBanner.className = '';
      E.showScreen('title');
    });
    $('btn-sound').addEventListener('click', () => {
      E.setSoundOn(!E.soundOn);
      $('btn-sound').textContent = E.soundOn ? '🔊' : '🔇';
      sfx.tap();
    });
    $('btn-again').addEventListener('click', () => { sfx.unlock(); E.speech.prime(); sfx.tap(); runSession(G.lv); });
    $('btn-menu').addEventListener('click', () => { sfx.tap(); E.showScreen('title'); });

    // 觀察階段：點河面 → 小鳥跳一格
    pond.addEventListener('pointerdown', () => {
      if (Q && Q.phase === 'observe') {
        Q.phase = 'anim';       // 立刻鎖住，避免連點多跳
        sfx.unlock();
        E.fireSignal();
      }
    });

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
    get frogIndex() { return Q ? Q.frogIndex : -1; },
    get wrongTotal() { return G.wrongTotal; },
    startLevel(lv) { runSession(lv); },
    pump() { E.pumpTimers(); },
    tapRiver() {
      pond.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 3, isPrimary: true,
        pointerType: 'touch', clientX: 0, clientY: 0, button: 0, buttons: 1,
      }));
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
      const labels = { lv1: '🐦 找下一顆', lv2: '🪨 補中間', lv3: '🔎 看間隔' };
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
