/* ============================================================
   換錢大冒險 — 主遊戲引擎
   拖曳換錢、慢速進退位動畫、語音導引、特效與音效
   ============================================================ */
(function () {
  'use strict';

  const GL = window.GameLogic;

  /* ---------------- 參數（測試用） ---------------- */
  const params = new URLSearchParams(location.search);
  const FAST = params.get('fast') === '1';       // 測試加速模式
  const SPEED = FAST ? 0.12 : 1;                 // 時間倍率
  const URL_SEED = params.has('seed') ? Number(params.get('seed')) : null;
  const URL_MODE = params.get('mode');

  const ms = (t) => Math.max(10, Math.round(t * SPEED));

  /* ---------------- DOM ---------------- */
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const screens = { title: $('screen-title'), game: $('screen-game'), end: $('screen-end') };
  const coinLayer = $('coin-layer');
  const slotsTensEl = $('slots-tens');
  const slotsOnesEl = $('slots-ones');
  const badgeTens = $('badge-tens');
  const badgeOnes = $('badge-ones');
  const zoneOnes = $('zone-ones');
  const machineEl = $('machine');
  const machineBody = $('machine-body');
  const machineSlotIn = $('machine-slot-in');
  const machineTrayOut = $('machine-tray-out');
  const trayEl = $('tray');
  const trayLabel = $('tray-label');
  const traySlotsEl = $('tray-slots');
  const answersEl = $('answers');
  const bubbleEl = $('bubble');
  const guideEl = $('guide');
  const counterEl = $('counter');
  const captionEl = $('caption');
  const fxLayer = $('fx-layer');
  const hintHand = $('hint-hand');
  const groupRing = $('group-ring');
  const pd = { a: $('pd-a'), op: $('pd-op'), b: $('pd-b'), q: $('pd-q') };
  const starsEl = $('stars');
  const sfx = window.sfx;

  /* ---------------- 取消權杖：回首頁 / 重開時中斷所有動畫鏈 ---------------- */
  class CancelError extends Error { constructor() { super('cancelled'); this.isCancel = true; } }
  let run = { cancelled: true, waiters: [] };

  function newRun() {
    cancelRun();
    run = { cancelled: false, waiters: [] };
    return run;
  }
  function cancelRun() {
    run.cancelled = true;
    for (const w of run.waiters.slice()) {
      if (w.settle) w.settle(); else w.reject(new CancelError());
    }
    run.waiters = [];
  }
  /* sleep 以「截止時刻＋幫浦」實作：正常靠 setTimeout；
   * 分頁被隱藏、計時器被瀏覽器節流時，回到前景（或測試呼叫 pump）
   * 會立刻補跑所有到期的等待，動畫鏈不會凍結。 */
  function sleep(t) {
    const r = run;
    return new Promise((resolve, reject) => {
      if (r.cancelled) return reject(new CancelError());
      const entry = { deadline: performance.now() + ms(t), reject };
      entry.settle = () => {
        if (entry.done) return;
        entry.done = true;
        clearTimeout(entry.timer);
        const i = r.waiters.indexOf(entry);
        if (i >= 0) r.waiters.splice(i, 1);
        if (r.cancelled) reject(new CancelError()); else resolve();
      };
      r.waiters.push(entry);
      entry.timer = setTimeout(entry.settle, ms(t));
    });
  }
  function pumpTimers() {
    const now = performance.now();
    for (const e of run.waiters.slice()) {
      if (e.settle && e.deadline <= now) e.settle();
    }
  }
  // 等待玩家完成某件事（由 drop handler resolve）。
  // 閂鎖式：若完成訊號比 waitSignal 先到（玩家動作比旁白快），先記住、掛上時立即放行。
  function waitSignal() {
    const r = run;
    return new Promise((resolve, reject) => {
      if (r.cancelled) return reject(new CancelError());
      if (r.signalFired) { r.signalFired = false; return resolve(); }
      r.waiters.push({ reject });
      r.signal = resolve;
    });
  }
  function fireSignal() {
    if (run.signal) { const s = run.signal; run.signal = null; s(); }
    else run.signalFired = true;
  }

  /* ---------------- 語音（幫助還不太識字的孩子） ---------------- */
  const speech = {
    on: !FAST && 'speechSynthesis' in window,
    _t: null,
    // iOS Safari 要求第一次 speak() 必須在使用者手勢內，否則整頁語音靜音。
    // 在模式按鈕的 click handler 裡先講一個無聲字元解鎖。
    prime() {
      if (!this.on) return;
      try {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        speechSynthesis.speak(u);
      } catch (e) { /* 不支援就安靜 */ }
    },
    speak(text) {
      if (!this.on || !soundOn) return;
      try {
        clearTimeout(this._t);
        const go = () => {
          try {
            const u = new SpeechSynthesisUtterance(text.replace(/[～!！?？]/g, '。'));
            u.lang = 'zh-TW'; u.rate = 0.95; u.pitch = 1.1; u.volume = 0.9;
            speechSynthesis.speak(u);
          } catch (e) {}
        };
        // Android Chrome 的 cancel() 是非同步的：cancel 後立刻 speak 會被吞掉，
        // 所以只有真的在講話時才 cancel，並隔一拍再開口。
        if (speechSynthesis.speaking || speechSynthesis.pending) {
          speechSynthesis.cancel();
          this._t = setTimeout(go, 90);
        } else {
          go();
        }
      } catch (e) { /* 不支援就安靜 */ }
    },
    stop() { clearTimeout(this._t); try { speechSynthesis.cancel(); } catch (e) {} },
  };

  /* ---------------- Lottie 角色（失敗時退回 GIF） ---------------- */
  const lotties = { title: [], game: [], end: [] };
  function mountChar(containerId, data, gifName, screenKey) {
    const el = $(containerId);
    try {
      if (!window.lottie || !data) throw new Error('no lottie');
      const anim = lottie.loadAnimation({
        container: el, renderer: 'svg', loop: true, autoplay: false,
        animationData: JSON.parse(JSON.stringify(data)),
      });
      lotties[screenKey].push(anim);
      return anim;
    } catch (e) {
      el.innerHTML = '<img src="assets/' + gifName + '" style="width:100%" alt="">';
      return null;
    }
  }
  function playScreenChars(key) {
    for (const k of Object.keys(lotties)) {
      for (const a of lotties[k]) { if (k === key) a.play(); else a.pause(); }
    }
  }

  /* ---------------- 畫面切換 ---------------- */
  let currentScreen = 'title';
  function showScreen(key) {
    currentScreen = key;
    for (const k of Object.keys(screens)) screens[k].classList.toggle('active', k === key);
    playScreenChars(key);
  }

  /* ---------------- 幾何工具 ---------------- */
  const layerRect = () => coinLayer.getBoundingClientRect();
  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  // 轉成 coin-layer 內部座標
  function toLayer(pt) {
    const L = layerRect();
    return { x: pt.x - L.left, y: pt.y - L.top };
  }
  function centerInLayer(el) { return toLayer(centerOf(el)); }
  function inflatedContains(el, x, y, pad) {
    const r = el.getBoundingClientRect();
    return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  }

  /* ---------------- 硬幣 ---------------- */
  class Coin {
    constructor(denom) {
      this.denom = denom;
      this.el = document.createElement('div');
      this.el.className = 'coin ' + (denom === 10 ? 'c10' : 'c1');
      this.el.innerHTML = '<b>' + denom + '</b><i>元</i>';
      this.el.__coin = this;
      this.x = 0; this.y = 0; this.scale = 1;
      this.anchor = null;   // 佔住的格子（resize 時歸位用）
      this.dead = false;
      coinLayer.appendChild(this.el);
    }
    get size() { return this.el.offsetWidth || 40; }
    apply() {
      const s = this.size / 2;
      this.el.style.transform =
        'translate3d(' + (this.x - s) + 'px,' + (this.y - s) + 'px,0) scale(' + this.scale + ')';
    }
    placeAt(x, y, opts) {
      opts = opts || {};
      this.el.style.transition = 'none';
      this.x = x; this.y = y;
      if (opts.scale != null) this.scale = opts.scale;
      this.apply();
      void this.el.offsetWidth; // 強制 reflow，讓後續 transition 生效
    }
    glideTo(x, y, opts) {  // 啟動移動（不等待）
      opts = opts || {};
      if (FAST) { // 測試模式：立即定位，座標立刻正確（不依賴重繪）
        this.el.style.transition = 'none';
        this.x = x; this.y = y;
        if (opts.scale != null) this.scale = opts.scale;
        if (opts.fade) this.el.style.opacity = 0;
        this.apply();
        void this.el.offsetWidth;
        return 0;
      }
      const dur = ms(opts.dur != null ? opts.dur : 450);
      const ease = opts.ease || 'cubic-bezier(.45,1.35,.55,1)';
      this.el.style.transition = 'transform ' + dur + 'ms ' + ease + ', opacity ' + dur + 'ms';
      this.x = x; this.y = y;
      if (opts.scale != null) this.scale = opts.scale;
      if (opts.fade) this.el.style.opacity = 0;
      this.apply();
      return dur;
    }
    async moveTo(x, y, opts) { this.glideTo(x, y, opts); await sleep((opts && opts.dur) || 450); }
    async pulse() {
      this.el.style.transition = 'transform 130ms ease-out';
      this.scale = 1.32; this.apply();
      await sleep(140);
      this.el.style.transition = 'transform 200ms ease-in';
      this.scale = 1; this.apply();
    }
    setDragging(on) {
      this.el.classList.toggle('dragging', on);
      if (on) { this.scale = 1.14; } else { this.scale = 1; }
      this.apply();
    }
    destroy() { this.dead = true; this.el.remove(); }
  }

  /* ---------------- 盤面格子 ---------------- */
  const tenSlots = [];  // 9 格
  const oneSlots = [];  // 20 格（前 10 格是十格框）
  function buildSlots() {
    for (let i = 0; i < 9; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      slotsTensEl.appendChild(d); tenSlots.push(d);
    }
    for (let i = 0; i < 20; i++) {
      const d = document.createElement('div');
      d.className = 'slot' + (i < 10 ? ' frame' : '');
      slotsOnesEl.appendChild(d); oneSlots.push(d);
    }
  }

  /* ---------------- 遊戲狀態 ---------------- */
  const G = {
    mode: 'add', session: [], qIndex: 0, wrongTotal: 0,
  };
  let Q = null; // 目前題目的執行狀態

  function newQuestionState(p) {
    return {
      p,
      phase: 'idle',           // dealing / add-work / sub-work / anim / count / answer / done
      tensCoins: [], onesCoins: [],
      board: { tens: 0, ones: 0 },
      group: null,             // 加法進位時的 10 枚 1 元
      exchangeDone: false,
      pay: null,               // { needT, needO, gotT, gotO, slotT:[], slotO:[] }
      wrongAnswers: 0,
    };
  }

  function updateBadges() {
    if (!Q) return;
    const t = Q.tensCoins.length, o = Q.onesCoins.length;
    badgeTens.textContent = t + ' 個 ＝ ' + (t * 10) + ' 元';
    badgeOnes.textContent = o + ' 個 ＝ ' + o + ' 元';
  }

  /* ---------------- 泡泡對話 + 苦惱 ---------------- */
  let worryTimer = null;
  function say(text, opts) {
    opts = opts || {};
    bubbleEl.textContent = text;
    bubbleEl.classList.remove('warn');
    bubbleEl.classList.add('show');
    if (!opts.silent) speech.speak(text);
  }
  // 停留時間以 zh-TW 語速（每字約 260ms）估算，確保整句唸得完
  async function sayWait(text, hold) {
    say(text);
    await sleep(hold != null ? hold : Math.max(2000, 700 + text.length * 260));
  }
  // 苦惱：搖頭 + 汗滴 + 警告泡泡 + 哎呀音
  function worry(text) {
    bubbleEl.textContent = text;
    bubbleEl.classList.add('show', 'warn');
    speech.speak(text);
    sfx.uhoh();
    guideEl.classList.remove('worried');
    void guideEl.offsetWidth;
    guideEl.classList.add('worried');
    clearTimeout(worryTimer);
    worryTimer = setTimeout(() => guideEl.classList.remove('worried'), 1600);
  }

  /* ---------------- 計數大字 / 標語 ---------------- */
  function counterShow(n, topPct) {
    counterEl.style.top = (topPct || 30) + '%';
    counterEl.textContent = n;
    counterEl.classList.remove('show');
    void counterEl.offsetWidth;
    counterEl.classList.add('show');
  }
  function counterHide() { counterEl.classList.remove('show'); }
  function caption(text) {
    captionEl.textContent = text;
    captionEl.style.animationDuration = ms(3000) + 'ms';
    captionEl.classList.remove('show');
    void captionEl.offsetWidth;
    captionEl.classList.add('show');
  }

  /* ---------------- 星星特效 ---------------- */
  function burstStars(clientX, clientY, n) {
    const L = layerRect();
    for (let i = 0; i < (n || 10); i++) {
      const s = document.createElement('div');
      s.className = 'fx-star';
      s.textContent = ['⭐', '✨', '🌟'][i % 3];
      s.style.left = (clientX - L.left) + 'px';
      s.style.top = (clientY - L.top) + 'px';
      fxLayer.appendChild(s);
      const ang = Math.PI * 2 * (i / (n || 10)) + Math.random() * 0.6;
      const dist = 60 + Math.random() * 90;
      s.animate([
        { transform: 'translate(0,0) scale(.4) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + Math.cos(ang) * dist + 'px,' + (Math.sin(ang) * dist - 30) + 'px) scale(1.1) rotate(' + (Math.random() * 240 - 120) + 'deg)', opacity: 0 },
      ], { duration: ms(900) + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.4,1)' })
        .onfinish = () => s.remove();
    }
  }

  /* ---------------- 提示小手 ---------------- */
  let hintAnim = null, hintIdleTimer = null;
  function showHint(fromPt, toPt) {
    hideHint(false);
    const L = layerRect();
    hintHand.style.left = '0px'; hintHand.style.top = '0px';
    const k = (p) => 'translate(' + (p.x - L.left - 10) + 'px,' + (p.y - L.top - 4) + 'px)';
    hintAnim = hintHand.animate([
      { transform: k(fromPt) + ' scale(1)', opacity: 0 },
      { transform: k(fromPt) + ' scale(.85)', opacity: 1, offset: 0.18 },
      { transform: k(toPt) + ' scale(.85)', opacity: 1, offset: 0.75 },
      { transform: k(toPt) + ' scale(1.15)', opacity: 1, offset: 0.86 },
      { transform: k(toPt) + ' scale(1)', opacity: 0 },
    ], { duration: ms(2200), iterations: Infinity, easing: 'ease-in-out' });
  }
  function hideHint(scheduleReshow) {
    if (hintAnim) { hintAnim.cancel(); hintAnim = null; }
    clearTimeout(hintIdleTimer);
    if (scheduleReshow) {
      hintIdleTimer = setTimeout(() => { if (Q) reshowHintForPhase(); }, ms(8000));
    }
  }
  function reshowHintForPhase() {
    if (!Q) return;
    if (Q.phase === 'add-work' && Q.group && Q.group.length) {
      const g = Q.group[4] || Q.group[0];
      showHint(centerOf(g.el), centerOf(machineBody));
    } else if (Q.phase === 'sub-work') {
      const need = payNeeds();
      if (need.needMoreOnes && Q.tensCoins.length) {
        showHint(centerOf(Q.tensCoins[Q.tensCoins.length - 1].el), centerOf(machineBody));
      } else if (need.oLeft > 0 && Q.onesCoins.length) {
        showHint(centerOf(Q.onesCoins[Q.onesCoins.length - 1].el), centerOf(traySlotsEl));
      } else if (need.tLeft > 0 && Q.tensCoins.length) {
        showHint(centerOf(Q.tensCoins[Q.tensCoins.length - 1].el), centerOf(traySlotsEl));
      }
    }
  }

  /* ---------------- 發牌（把錢排上桌） ---------------- */
  function tensSlotCenter(i) { return centerInLayer(tenSlots[i]); }
  function onesSlotCenter(i) { return centerInLayer(oneSlots[i]); }

  async function dealCoins(denom, count, fromEl, startIdx) {
    const from = centerInLayer(fromEl);
    for (let i = 0; i < count; i++) {
      if (run.cancelled) throw new CancelError();
      const c = new Coin(denom);
      c.placeAt(from.x, from.y, { scale: 0.3 });
      let target, slotEl;
      if (denom === 10) {
        const idx = Q.tensCoins.length;
        slotEl = tenSlots[idx]; target = tensSlotCenter(idx);
        Q.tensCoins.push(c);
      } else {
        const idx = Q.onesCoins.length;
        slotEl = oneSlots[idx]; target = onesSlotCenter(idx);
        Q.onesCoins.push(c);
      }
      c.anchor = slotEl;
      c.glideTo(target.x, target.y, { dur: 480, scale: 1 });
      sfx.whoosh();
      setTimeout(() => { if (!run.cancelled) { sfx.clink(denom === 10); updateBadges(); } }, ms(470));
      await sleep(240);
    }
    await sleep(320);
  }

  // 個位重新排到最前面的格子
  function relayoutOnes() {
    Q.onesCoins.forEach((c, i) => {
      c.anchor = oneSlots[i];
      const t = onesSlotCenter(i);
      c.glideTo(t.x, t.y, { dur: 380 });
    });
  }

  /* ---------------- 群組（加法進位的 10 枚 1 元） ---------------- */
  function formGroup() {
    Q.group = Q.onesCoins.slice(0, 10);
    for (const c of Q.group) c.el.classList.add('grouped');
    positionGroupRing();
    groupRing.classList.add('show');
    zoneOnes.classList.add('overflow');
  }
  function positionGroupRing() {
    if (!Q || !Q.group) return;
    const first = oneSlots[0].getBoundingClientRect();
    const last = oneSlots[9].getBoundingClientRect();
    const sg = screens.game.getBoundingClientRect();
    groupRing.style.left = (first.left - sg.left - 7) + 'px';
    groupRing.style.top = (first.top - sg.top - 7) + 'px';
    groupRing.style.width = (last.right - first.left + 14) + 'px';
    groupRing.style.height = (last.bottom - first.top + 14) + 'px';
  }
  function dissolveGroupUI() {
    groupRing.classList.remove('show');
    zoneOnes.classList.remove('overflow');
  }

  /* ---------------- 拖曳系統 ---------------- */
  const drag = { active: false, pointerId: null, coins: [], isGroup: false, moved: false };

  function draggableCheck(coin) {
    if (!Q || coin.dead || coin.el.classList.contains('locked')) return null;
    if (Q.phase === 'add-work') {
      if (Q.group && Q.group.includes(coin)) return { coins: Q.group.slice(), isGroup: true };
      return { coins: [coin], isGroup: false }; // 散幣或 10 元：可拖（錯誤教學用）
    }
    if (Q.phase === 'sub-work') {
      if (Q.tensCoins.includes(coin) || Q.onesCoins.includes(coin)) return { coins: [coin], isGroup: false };
    }
    return null;
  }

  function onPointerDown(e) {
    const coinEl = e.target && e.target.closest ? e.target.closest('.coin') : null;
    if (!coinEl || !coinEl.__coin) return;
    const info = draggableCheck(coinEl.__coin);
    if (!info || drag.active) return;
    e.preventDefault();
    drag.active = true; drag.pointerId = e.pointerId;
    drag.coins = info.coins; drag.isGroup = info.isGroup; drag.moved = false;
    hideHint(true);
    sfx.unlock(); // iOS 來電等中斷後（state 變 interrupted），任何手勢都能救回音訊
    sfx.grab();
    for (const c of drag.coins) { c.setDragging(true); }
    moveDragTo(e.clientX, e.clientY, true);
  }

  function moveDragTo(cx, cy, first) {
    const L = layerRect();
    const x = cx - L.left, y = cy - L.top;
    if (drag.isGroup) {
      const sp = (drag.coins[0] ? drag.coins[0].size : 36) * 0.92;
      drag.coins.forEach((c, i) => {
        const ox = ((i % 5) - 2) * sp * 0.8;
        const oy = (Math.floor(i / 5) - 0.5) * sp * 0.95;
        if (first) c.glideTo(x + ox, y + oy - 14, { dur: 140, scale: 0.95 });
        else { c.el.style.transition = 'none'; c.x = x + ox; c.y = y + oy - 14; c.apply(); }
      });
    } else {
      const c = drag.coins[0];
      if (first) c.glideTo(x, y - 12, { dur: 100 });
      else { c.el.style.transition = 'none'; c.x = x; c.y = y - 12; c.apply(); }
    }
    // 拖到目標上的高亮
    machineEl.classList.toggle('drag-over', overMachine(cx, cy));
    trayEl.classList.toggle('drag-over', trayEl.classList.contains('show') && overTray(cx, cy));
  }

  function overMachine(cx, cy) { return inflatedContains(machineBody, cx, cy, 20); }
  function overTray(cx, cy) { return inflatedContains(trayEl, cx, cy, 12); }

  function onPointerMove(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    drag.moved = true;
    moveDragTo(e.clientX, e.clientY, false);
  }

  function onPointerUp(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    const coins = drag.coins, isGroup = drag.isGroup;
    drag.active = false;
    machineEl.classList.remove('drag-over');
    trayEl.classList.remove('drag-over');
    for (const c of coins) c.setDragging(false);
    handleDrop(coins, isGroup, e.clientX, e.clientY);
  }

  function snapBack(coins) {
    coins.forEach((c, i) => {
      setTimeout(() => {
        if (c.dead || !c.anchor) return;
        const t = centerInLayer(c.anchor);
        c.glideTo(t.x, t.y, { dur: 320, scale: 1 });
      }, i * 25);
    });
  }

  /* ---------------- 落下判定 ---------------- */
  function payNeeds() {
    const p = Q.pay;
    if (!p) return { tLeft: 0, oLeft: 0, needMoreOnes: false };
    const tLeft = p.needT - p.gotT, oLeft = p.needO - p.gotO;
    return { tLeft, oLeft, needMoreOnes: Q.onesCoins.length < oLeft };
  }

  function handleDrop(coins, isGroup, cx, cy) {
    if (!Q) return;
    const denom = coins[0].denom;

    if (Q.phase === 'add-work') {
      if (overMachine(cx, cy)) {
        const verdict = GL.exchangeVerdict('s2b', isGroup ? 1 : denom, Q.board, false);
        if (isGroup && verdict.ok) { runExchangeS2B(); return; }
        if (denom === 10) worry('10 元不用換喔！要把發光的 10 個 1 元，一起拖進來換成 1 個 10 元！');
        else worry('一個一個不能換！把發光的那一群 1 元，一起拖過來吧！');
        snapBack(coins);
        hideHint(true);
        return;
      }
      snapBack(coins);
      hideHint(true);
      return;
    }

    if (Q.phase === 'sub-work') {
      if (overMachine(cx, cy)) {
        const need = payNeeds();
        const verdict = GL.exchangeVerdict('b2s', denom, Q.board, need.needMoreOnes);
        if (verdict.ok) { runExchangeB2S(coins[0]); return; }
        if (verdict.reason === 'one-not-needed') worry('1 元不用換喔！要把 1 個 10 元，換成 10 個 1 元！');
        else if (verdict.reason === 'already-enough') worry('1 元已經夠付了，不用換錢囉！');
        else worry('現在不用換錢喔！');
        snapBack(coins);
        hideHint(true);
        return;
      }
      if (trayEl.classList.contains('show') && overTray(cx, cy)) {
        dropOnTray(coins[0]);
        return;
      }
      snapBack(coins);
      hideHint(true);
      return;
    }
    snapBack(coins);
  }

  /* ---------------- 付錢盤 ---------------- */
  function buildTray(p) {
    const need = GL.paymentFor(p);
    traySlotsEl.innerHTML = '';
    Q.pay = { needT: need.tens, needO: need.ones, gotT: 0, gotO: 0, slotT: [], slotO: [] };
    for (let i = 0; i < need.tens; i++) {
      const s = document.createElement('div');
      s.className = 'tray-slot t10'; s.textContent = '10';
      traySlotsEl.appendChild(s); Q.pay.slotT.push(s);
    }
    for (let i = 0; i < need.ones; i++) {
      const s = document.createElement('div');
      s.className = 'tray-slot t1'; s.textContent = '1';
      traySlotsEl.appendChild(s); Q.pay.slotO.push(s);
    }
    trayLabel.textContent = '要付的錢：' + p.b + ' 元';
    trayEl.classList.add('show');
  }

  function dropOnTray(coin) {
    const pay = Q.pay;
    const isTen = coin.denom === 10;
    const got = isTen ? pay.gotT : pay.gotO;
    const need = isTen ? pay.needT : pay.needO;
    if (got >= need) {
      worry(need === 0
        ? ('這次不用付 ' + coin.denom + ' 元喔！')
        : (coin.denom + ' 元已經付夠了！'));
      snapBack([coin]);
      hideHint(true);
      return;
    }
    // 放進對應的格子
    const slot = (isTen ? pay.slotT : pay.slotO)[got];
    if (isTen) { pay.gotT++; Q.tensCoins.splice(Q.tensCoins.indexOf(coin), 1); Q.board.tens--; }
    else { pay.gotO++; Q.onesCoins.splice(Q.onesCoins.indexOf(coin), 1); Q.board.ones--; }
    slot.classList.add('filled');
    coin.anchor = slot;
    coin.el.classList.add('locked');
    const t = centerInLayer(slot);
    coin.glideTo(t.x, t.y, { dur: 260, scale: 1 });
    sfx.clink(isTen);
    updateBadges();
    hideHint(true);
    // 個位付掉後立刻補位重排，讓倖存硬幣永遠佔據前面的格子
    //（換錢機吐新幣是接在陣列尾端，不重排會疊在同一格）
    if (!isTen) relayoutOnes();

    const left = payNeeds();
    if (left.tLeft === 0 && left.oLeft === 0) {
      fireSignal(); // 付款完成
    } else if (left.oLeft > 0 && left.needMoreOnes && !Q.exchangeDone) {
      worry('咦！1 元不夠付了…拖 1 個 10 元進換錢機，換成 10 個 1 元吧！');
      if (Q.tensCoins.length) showHint(centerOf(Q.tensCoins[Q.tensCoins.length - 1].el), centerOf(machineBody));
    }
  }

  /* ---------------- 換錢動畫：小換大（加法進位） ---------------- */
  function machineOn() { machineEl.classList.add('working'); }
  function machineOff() { machineEl.classList.remove('working'); }

  async function runExchangeS2B() {
    try {
      Q.phase = 'anim';
      hideHint(false);
      dissolveGroupUI();
      const coins = Q.group; Q.group = null;
      Q.onesCoins.splice(0, 10);
      say('看好囉～ 10 個 1 元，一個一個進去！');
      machineOn();
      const slotIn = centerInLayer(machineSlotIn);
      for (let i = 0; i < 10; i++) {
        const c = coins[i];
        c.el.classList.remove('grouped');
        c.el.style.zIndex = 61;
        c.glideTo(slotIn.x, slotIn.y, { dur: 430, scale: 0.3, fade: true, ease: 'ease-in' });
        sfx.tick(i);
        counterShow(i + 1, 42);
        const remain = Q.onesCoins.length + (9 - i);
        badgeOnes.textContent = remain + ' 個 ＝ ' + remain + ' 元';
        await sleep(420);
        c.destroy();
      }
      updateBadges();
      Q.board.ones -= 10;
      counterHide();
      sfx.whirr();
      await sleep(750);
      machineOff();
      sfx.ding();
      caption('10 個 1 元 ＝ 1 個 10 元！');
      setTimeout(() => sfx.magic(), ms(160));
      const out = centerInLayer(machineTrayOut);
      const ten = new Coin(10);
      ten.el.style.zIndex = 61;
      ten.placeAt(out.x, out.y - 4, { scale: 0.25 });
      ten.glideTo(out.x, out.y - 18, { dur: 420, scale: 1.15 });
      sfx.pop();
      const mc = centerOf(machineTrayOut);
      burstStars(mc.x, mc.y - 10, 8);
      await sleep(1400); // 停一下，讓孩子看清楚
      say('個位滿 10 個，換到十位，變出 1 個 10 元！錢沒有變少喔！');
      const idx = Q.tensCoins.length;
      const target = tensSlotCenter(idx);
      ten.anchor = tenSlots[idx];
      Q.tensCoins.push(ten);
      Q.board.tens += 1;
      sfx.whoosh();
      await ten.moveTo(target.x, target.y, { dur: 1100, scale: 1 });
      ten.el.style.zIndex = '';
      sfx.clink(true);
      updateBadges();
      relayoutOnes();
      Q.exchangeDone = true;
      await sleep(1400);
      // 位值總結：把「10 元/1 元」連回「十位/個位」
      await sayWait('現在十位有 ' + Q.tensCoins.length + ' 個 10 元，個位有 ' + Q.onesCoins.length + ' 個 1 元！', 3000);
      fireSignal();
    } catch (e) { if (!e.isCancel) throw e; }
  }

  /* ---------------- 換錢動畫：大換小（減法退位） ---------------- */
  async function runExchangeB2S(tenCoin) {
    try {
      Q.phase = 'anim';
      hideHint(false);
      Q.tensCoins.splice(Q.tensCoins.indexOf(tenCoin), 1);
      Q.board.tens -= 1;
      say('10 元進去了…會變出什麼呢？');
      const slotIn = centerInLayer(machineSlotIn);
      tenCoin.el.style.zIndex = 61;
      tenCoin.glideTo(slotIn.x, slotIn.y, { dur: 550, scale: 0.3, fade: true, ease: 'ease-in' });
      sfx.whoosh();
      await sleep(560);
      tenCoin.destroy();
      updateBadges();
      relayoutOnes(); // 保證倖存 1 元佔據前面格子，新幣才不會疊上去
      machineOn();
      sfx.whirr();
      await sleep(900);
      machineOff();
      sfx.ding();
      caption('1 個 10 元 ＝ 10 個 1 元！');
      setTimeout(() => sfx.magic(), ms(160));
      await sleep(1200); // 先讓孩子讀完等式，再開始吐幣
      const out = centerInLayer(machineTrayOut);
      for (let i = 0; i < 10; i++) {
        const c = new Coin(1);
        c.el.style.zIndex = 61;
        c.placeAt(out.x, out.y - 4, { scale: 0.25 });
        const idx = Q.onesCoins.length;
        c.anchor = oneSlots[idx];
        Q.onesCoins.push(c);
        const t = onesSlotCenter(idx);
        sfx.tick(i);
        counterShow(i + 1, 24);
        c.glideTo(t.x, t.y, { dur: 620, scale: 1 });
        await sleep(430);
        c.el.style.zIndex = '';
        updateBadges();
      }
      counterHide();
      Q.board.ones += 10;
      Q.exchangeDone = true;
      await sleep(500);
      await sayWait('跟十位換了 1 個 10 元，變成 10 個 1 元！錢一樣多，現在夠付了！', 4200);
      Q.phase = 'sub-work';
      say('繼續把要付的錢，拖到粉紅盤子裡！');
      reshowHintForPhase();
    } catch (e) { if (!e.isCancel) throw e; }
  }

  /* ---------------- 點數 ---------------- */
  async function countUp(speedMul) {
    const mul = speedMul || 1;
    const seq = GL.countSequence({ tens: Q.tensCoins.length, ones: Q.onesCoins.length });
    const coins = Q.tensCoins.concat(Q.onesCoins);
    for (let i = 0; i < coins.length; i++) {
      coins[i].pulse().catch(() => {});
      sfx.tick(i);
      counterShow(seq[i], 30);
      await sleep((i < Q.tensCoins.length ? 650 : 540) * mul);
    }
    await sleep(600 * mul);
    counterHide();
  }

  /* ---------------- 答案選項 ---------------- */
  async function askAnswer(p, rng) {
    Q.phase = 'answer';
    pd.q.classList.add('pulse');
    const options = GL.makeOptions(p, rng);
    answersEl.innerHTML = '';
    say(p.op === 'add' ? '一共是多少元呢？' : '還剩下多少元呢？');

    await new Promise((resolve, reject) => {
      run.waiters.push({ reject });
      let busy = false;
      options.forEach((v) => {
        const b = document.createElement('button');
        b.className = 'ans-btn';
        b.textContent = v;
        b.addEventListener('click', async () => {
          if (busy || run.cancelled) return;
          if (v === p.answer) {
            busy = true;
            b.classList.add('correct');
            sfx.yay();
            const c = centerOf(b);
            burstStars(c.x, c.y, 12);
            resolve();
          } else {
            busy = true;
            b.classList.add('wrong');
            Q.wrongAnswers++; G.wrongTotal++;
            // 診斷式回饋：差 10 的錯誤＝忘了進位/退位，點出具體原因
            let msg;
            if (p.op === 'add' && v === p.answer - 10) {
              msg = '咦，是不是忘記換錢機變出來的那 1 個 10 元呀？我們再數一次！';
            } else if (p.op === 'sub' && v === p.answer + 10) {
              msg = '是不是有 1 個 10 元已經付給鯊魚了呢？我們再數一次！';
            } else {
              msg = '只差一點點！這次慢慢數！';
            }
            worry(msg);
            try {
              await sleep(2800);
              await countUp(1); // 重數要一樣慢，不能變快
              say('現在知道答案了嗎？');
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

  /* ---------------- 單題流程 ---------------- */
  function setProblemDisplay(p) {
    pd.a.textContent = p.a;
    pd.op.textContent = p.op === 'add' ? '＋' : '－';
    pd.b.textContent = p.b;
    pd.b.style.textShadow = ''; // 發牌中被 🏠 中斷時的高亮殘留
    pd.q.textContent = '?';
    pd.q.classList.remove('solved', 'pulse');
  }

  function clearBoard() {
    for (const el of coinLayer.querySelectorAll('.coin')) el.remove();
    if (Q) { Q.tensCoins = []; Q.onesCoins = []; Q.group = null; }
    dissolveGroupUI();
    trayEl.classList.remove('show');
    traySlotsEl.innerHTML = '';
    answersEl.innerHTML = '';
    counterHide();
    hideHint(false);
    machineOff();
    badgeTens.textContent = '';
    badgeOnes.textContent = '';
  }

  async function runAddQuestion(p, rng) {
    const oa = GL.onesOf(p.a), ob = GL.onesOf(p.b);
    await sayWait('我們來算 ' + p.a + ' 加 ' + p.b + '！先拿出 ' + p.a + ' 元～', 2800);
    Q.phase = 'dealing';
    await dealCoins(10, GL.tensOf(p.a), $('lottie-guide'));
    await dealCoins(1, oa, $('lottie-guide'));
    Q.board = { tens: GL.tensOf(p.a), ones: oa };
    await sayWait('再加上 ' + p.b + ' 元！', 1800);
    pd.b.style.textShadow = '0 0 10px #ffd166';
    await dealCoins(10, GL.tensOf(p.b), $('problem-display'));
    await dealCoins(1, ob, $('problem-display'));
    pd.b.style.textShadow = '';
    Q.board = GL.boardAfterMerge(p);

    if (GL.needsExchange(p)) {
      await sayWait('哇！1 元有 ' + Q.board.ones + ' 個，滿 10 個了！', 3000);
      formGroup();
      Q.phase = 'add-work';
      say('把發光的 10 個 1 元，拖進鯊魚的換錢機！');
      const g = Q.group[4] || Q.group[0];
      showHint(centerOf(g.el), centerOf(machineBody));
      await waitSignal(); // 換錢完成
    } else {
      await sayWait('1 元沒有滿 10 個，不用換錢，直接數！', 2800);
    }

    Q.phase = 'count';
    await sayWait('我們一起數數看！', 1600);
    await countUp();
    await askAnswer(p, rng);
  }

  async function runSubQuestion(p, rng) {
    await sayWait('我們來算 ' + p.a + ' 減 ' + p.b + '！先拿出 ' + p.a + ' 元～', 2800);
    Q.phase = 'dealing';
    await dealCoins(10, GL.tensOf(p.a), $('lottie-guide'));
    await dealCoins(1, GL.onesOf(p.a), $('lottie-guide'));
    Q.board = { tens: GL.tensOf(p.a), ones: GL.onesOf(p.a) };

    buildTray(p);
    Q.phase = 'sub-work';

    if (GL.needsExchange(p)) {
      // 退位題：一段連貫的引導——先看個位、發現不夠、再指示換錢。
      // 每一步之前都確認孩子還沒搶先換錢（1.9 秒的空窗孩子可能已經投幣）
      const oa = GL.onesOf(p.a), ob = GL.onesOf(p.b);
      await sayWait('要付 ' + p.b + ' 元！先看看 1 元夠不夠～', 2800);
      if (!Q.exchangeDone && Q.phase === 'sub-work') {
        worry(oa === 0
          ? ('要付 ' + ob + ' 個 1 元，可是 1 元一個都沒有，不夠付！')
          : ('要付 ' + ob + ' 個 1 元，可是只有 ' + oa + ' 個，不夠付！'));
        await sleep(3400);
      }
      if (!Q.exchangeDone && Q.phase === 'sub-work') {
        say('把 1 個 10 元，拖進鯊魚的換錢機，換成 10 個 1 元吧！');
        if (Q.tensCoins.length) showHint(centerOf(Q.tensCoins[Q.tensCoins.length - 1].el), centerOf(machineBody));
      }
    } else {
      await sayWait('要付 ' + p.b + ' 元！把錢拖到粉紅盤子裡！', 2600);
      reshowHintForPhase();
    }

    await waitSignal(); // 付款完成（dropOnTray 觸發）
    Q.phase = 'anim';
    hideHint(false);
    await sayWait('付好了！錢請收下～', 1800);

    // 付掉的錢飛走（交給鯊魚行員）
    const paidCoins = Array.from(coinLayer.querySelectorAll('.coin.locked'))
      .map((el) => el.__coin).filter(Boolean);
    const sharkPt = centerInLayer($('machine-shark'));
    paidCoins.forEach((c, i) => {
      setTimeout(() => { if (!c.dead) c.glideTo(sharkPt.x, sharkPt.y, { dur: 650, scale: 0.2, fade: true }); }, i * ms(90));
    });
    sfx.whoosh();
    await sleep(650 + paidCoins.length * 90 + 200);
    paidCoins.forEach((c) => c.destroy());
    trayEl.classList.remove('show');

    Q.phase = 'count';
    await sayWait('剩下的就是答案！一起數數看！', 2600);
    await countUp();
    await askAnswer(p, rng);
  }

  /* ---------------- 一場（5 題） ---------------- */
  const praises = ['答對了！你好棒！', '太厲害了！', '完全正確！', '好聰明！', '你是換錢小達人！'];

  // 換題時讓桌上的硬幣飛回大象身邊，不要一幀內憑空消失
  async function sweepBoard() {
    const coins = Array.from(coinLayer.querySelectorAll('.coin'))
      .map((el) => el.__coin).filter((c) => c && !c.dead);
    if (!coins.length) return;
    sfx.whoosh();
    const home = centerInLayer($('lottie-guide'));
    coins.forEach((c, i) => {
      setTimeout(() => {
        if (!c.dead && !run.cancelled) c.glideTo(home.x, home.y, { dur: 450, scale: 0.2, fade: true });
      }, i * ms(28));
    });
    await sleep(450 + coins.length * 28 + 150);
    coins.forEach((c) => c.destroy());
  }

  async function runSession(mode) {
    const r = newRun();
    G.mode = mode;
    G.qIndex = 0; G.wrongTotal = 0;
    const seed = URL_SEED != null ? URL_SEED : undefined;
    const rng = new GL.Rng(seed);
    G.session = GL.generateSession(mode, { rng });
    for (const el of starsEl.children) el.classList.remove('lit');
    showScreen('game');

    try {
      for (let i = 0; i < G.session.length; i++) {
        G.qIndex = i;
        const p = G.session[i];
        Q = newQuestionState(p);
        clearBoard();
        setProblemDisplay(p);
        updateBadges();
        await sleep(500);
        if (p.op === 'add') await runAddQuestion(p, rng);
        else await runSubQuestion(p, rng);

        // 過關！（先讓答對的 yay 收尾，再吹號角，旋律才不打架）
        Q.phase = 'done';
        await sleep(650);
        starsEl.children[i].classList.add('lit');
        sfx.fanfare();
        const pc = centerOf($('problem-display'));
        burstStars(pc.x, pc.y + 20, 14);
        await sayWait(praises[i % praises.length], 2200);
        await sweepBoard(); // 硬幣飛回大象身邊，才換下一題
      }
      await showEnd();
    } catch (e) {
      if (!e.isCancel) { console.error(e); throw e; }
    }
  }

  async function showEnd() {
    Q = null;
    clearBoard();
    $('end-stars').textContent = '⭐'.repeat(G.session.length);
    const msg = G.wrongTotal === 0
      ? '全部一次答對，你是換錢小達人！'
      : (G.wrongTotal <= 2 ? '越來越厲害了！再挑戰一次吧！' : '多練習幾次，你一定會更棒！');
    $('end-msg').textContent = msg;
    showScreen('end');
    sfx.sparkleRain();
    speech.speak('太棒了！' + msg);
    // 火箭刺蝟飛過
    const rocket = $('rocket-hedgehog');
    rocket.animate([
      { transform: 'translateX(0) translateY(0) rotate(8deg)', opacity: 1 },
      { transform: 'translateX(' + (app.clientWidth + 280) + 'px) translateY(-70px) rotate(14deg)', opacity: 1 },
    ], { duration: ms(2400), easing: 'ease-in' });
  }

  /* ---------------- 事件绑定 ---------------- */
  let soundOn = true;

  function bindUI() {
    document.querySelectorAll('.mode-btn').forEach((b) => {
      b.addEventListener('click', () => {
        sfx.unlock(); speech.prime(); sfx.tap();
        runSession(b.dataset.mode);
      });
    });
    $('btn-home').addEventListener('click', () => {
      sfx.tap(); speech.stop();
      cancelRun(); Q = null; clearBoard();
      showScreen('title');
    });
    $('btn-sound').addEventListener('click', () => {
      soundOn = !soundOn;
      sfx.setEnabled(soundOn);
      if (!soundOn) speech.stop();
      $('btn-sound').textContent = soundOn ? '🔊' : '🔇';
      sfx.tap();
    });
    $('btn-again').addEventListener('click', () => { sfx.unlock(); speech.prime(); sfx.tap(); runSession(G.mode); });
    $('btn-menu').addEventListener('click', () => { sfx.tap(); showScreen('title'); });

    // 拖曳
    coinLayer.addEventListener('pointerdown', onPointerDown, { passive: false });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    // 首次手勢解鎖音訊
    document.addEventListener('pointerdown', function unlockOnce() {
      sfx.unlock();
      document.removeEventListener('pointerdown', unlockOnce);
    }, { once: true });

    window.addEventListener('resize', () => {
      // 所有有錨點的硬幣立刻歸位
      for (const el of coinLayer.querySelectorAll('.coin')) {
        const c = el.__coin;
        if (c && c.anchor && !drag.active) {
          const t = centerInLayer(c.anchor);
          c.placeAt(t.x, t.y);
        }
      }
      positionGroupRing();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { for (const k of Object.keys(lotties)) lotties[k].forEach((a) => a.pause()); speech.stop(); }
      else { playScreenChars(currentScreen); pumpTimers(); sfx.unlock(); }
    });

    // iOS Safari 會忽略 user-scalable=no：手動擋掉雙指捏合，
    // 免得小朋友把畫面捏到放大卡住（頁面本身不捲動，安全）
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => {
      if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });

    // 前景時以 rAF 保險幫浦（幾乎零成本），計時器被節流也不卡動畫
    (function rafPump() {
      pumpTimers();
      requestAnimationFrame(rafPump);
    })();
  }

  /* ---------------- 測試掛勾 ---------------- */
  window.__test = {
    get screen() { return currentScreen; },
    get phase() { return Q ? Q.phase : 'idle'; },
    get problem() { return Q ? Q.p : null; },
    get board() { return Q ? { tens: Q.tensCoins.length, ones: Q.onesCoins.length } : null; },
    get pay() { return Q ? Q.pay : null; },
    get qIndex() { return G.qIndex; },
    get wrongTotal() { return G.wrongTotal; },
    get session() { return G.session; },
    startMode(mode) { runSession(mode); },
    pump() { pumpTimers(); },
    goHome() { $('btn-home').click(); },
    centers: {
      machine() { return centerOf(machineBody); },
      tray() { return centerOf(traySlotsEl); },
      groupedCoin() {
        if (!Q || !Q.group || !Q.group.length) return null;
        return centerOf((Q.group[4] || Q.group[0]).el);
      },
      tensCoin(i) { return Q && Q.tensCoins[i || 0] ? centerOf(Q.tensCoins[i || 0].el) : null; },
      onesCoin(i) { return Q && Q.onesCoins[i || 0] ? centerOf(Q.onesCoins[i || 0].el) : null; },
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
      const p = Q && Q.p;
      if (!p) return false;
      for (const b of answersEl.querySelectorAll('.ans-btn')) {
        const v = Number(b.textContent);
        if (correct ? v === p.answer : v !== p.answer) { b.click(); return v; }
      }
      return false;
    },
  };

  /* ---------------- 啟動 ---------------- */
  function init() {
    buildSlots();
    mountChar('lottie-title-elephant', window.LOTTIE_ELEPHANT, 'elephant.gif', 'title');
    mountChar('lottie-title-boy', window.LOTTIE_BOY, 'boy.gif', 'title');
    mountChar('lottie-title-shark', window.LOTTIE_SHARK, 'shark.gif', 'title');
    mountChar('lottie-guide', window.LOTTIE_ELEPHANT, 'elephant.gif', 'game');
    mountChar('lottie-end-boy', window.LOTTIE_BOY, 'boy.gif', 'end');
    bindUI();
    playScreenChars('title');
    if (URL_MODE) {
      speech.on = false;
      runSession(URL_MODE);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
