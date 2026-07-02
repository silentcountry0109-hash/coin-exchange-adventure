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
  const URL_MODE = params.get('mode');            // 測試用：直接開跑、關語音
  const URL_PLAY = params.get('play');            // 從太空站入口來的：顯示出發按鈕再開始
  const MODES = ['add', 'sub', 'mul', 'div', 'mix'];

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
  const platesEl = $('plates');
  const answersEl = $('answers');
  const bubbleEl = $('bubble');
  const guideEl = $('guide');
  const counterEl = $('counter');
  const captionEl = $('caption');
  const fxLayer = $('fx-layer');
  const hintHand = $('hint-hand');
  const groupRing = $('group-ring');
  const pd = { a: $('pd-a'), op: $('pd-op'), b: $('pd-b'), q: $('pd-q') };
  const pdRem = $('pd-rem');
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
    // 還在講話嗎？（有 90ms 的延遲開口空窗，用 _t 一併視為忙碌）
    busy() {
      if (!this.on) return false;
      try { return speechSynthesis.speaking || speechSynthesis.pending; }
      catch (e) { return false; }
    },
    stop() { clearTimeout(this._t); try { speechSynthesis.cancel(); } catch (e) {} },
  };

  // 等這句真的唸完才繼續（輪詢 + 字數上限保險），旁白不再被下一句喀掉。
  // 上限防止某些瀏覽器 speaking 卡 true 造成流程卡死。
  async function speechDrain(text) {
    if (FAST || !speech.on || !soundOn) return;
    const cap = performance.now() + 2500 + text.length * 480;
    await sleep(160); // 先等 speak() 的 90ms 延遲開口
    while (speech.busy() && performance.now() < cap) await sleep(140);
  }

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
      const base = this.scale; // 相對縮放：盤子上的迷你硬幣也能正確脈衝
      this.el.style.transition = 'transform 130ms ease-out';
      this.scale = base * 1.32; this.apply();
      await sleep(140);
      this.el.style.transition = 'transform 200ms ease-in';
      this.scale = base; this.apply();
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
      phase: 'idle',           // dealing / add-work / sub-work / mul-pour / div-work / anim / count / answer / done
      tensCoins: [], onesCoins: [],
      board: { tens: 0, ones: 0 },
      group: null,             // 加法/乘法進位時的 10 枚 1 元
      exchangeDone: false,
      pay: null,               // { needT, needO, gotT, gotO, slotT:[], slotO:[] }
      plates: [],              // 乘除法的小朋友盤子
      askValue: null,          // 目前答案題的正解（商 → 餘數會換）
      countSet: null,          // 手動點數：待點的錢
      counted: new Set(),      // 手動點數：點過的錢
      wrongAnswers: 0,
    };
  }

  /* ---------------- 小朋友盤子（乘法收錢 / 除法分錢） ---------------- */
  const PLATE_CHARS = [
    { img: 'deco_bird.png', name: '小鳥' },
    { img: 'deco_hedgehog.png', name: '刺蝟' },
    { img: 'deco_news_mammoth.png', name: '長毛象' },
    { img: 'deco_location_people.png', name: '太空人' },
  ];
  const MINI = 0.62; // 盤子上迷你硬幣的縮放

  function buildPlates(n) {
    platesEl.innerHTML = '';
    Q.plates = [];
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'plate';
      d.innerHTML = '<img src="assets/' + PLATE_CHARS[i].img + '" alt="' + PLATE_CHARS[i].name + '">'
        + '<div class="plate-slots"></div><div class="plate-badge">0 元</div>';
      platesEl.appendChild(d);
      Q.plates.push({
        el: d, idx: i,
        slotsEl: d.querySelector('.plate-slots'),
        badgeEl: d.querySelector('.plate-badge'),
        coins: [], value: 0, poured: false,
      });
    }
    platesEl.classList.add('show');
  }
  function platesOff() {
    platesEl.classList.remove('show');
    platesEl.innerHTML = '';
    if (Q) Q.plates = [];
  }
  // 硬幣進盤子：長出一個迷你格、換錨、縮小、鎖定
  function platePut(plate, coin, opts) {
    const slot = document.createElement('div');
    slot.className = 'pslot ' + (coin.denom === 10 ? 'p10' : 'p1');
    plate.slotsEl.appendChild(slot);
    coin.anchor = slot;
    coin.el.classList.add('locked');
    plate.coins.push(coin);
    plate.value += coin.denom;
    plate.badgeEl.textContent = plate.value + ' 元';
    // 新格子長出來會讓置中排版位移，把這盤的舊硬幣一併校正回各自的格心
    for (const c of plate.coins) {
      const t = centerInLayer(c.anchor);
      if (c === coin) c.glideTo(t.x, t.y, Object.assign({ dur: 420, scale: MINI }, opts || {}));
      else c.glideTo(t.x, t.y, { dur: 160, scale: MINI });
    }
  }
  function plateIndexAt(cx, cy) {
    if (!Q || !Q.plates.length) return -1;
    for (let i = 0; i < Q.plates.length; i++) {
      if (inflatedContains(Q.plates[i].el, cx, cy, 10)) return i;
    }
    // 落在盤子列裡就寬鬆地給最近的盤子（小手指友善）
    if (inflatedContains(platesEl, cx, cy, 6)) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < Q.plates.length; i++) {
        const c = centerOf(Q.plates[i].el);
        const d = Math.hypot(c.x - cx, c.y - cy);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }
    return -1;
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
  // 最少停 hold 毫秒，之後若語音還沒唸完就繼續等到唸完（speechDrain 有保險上限）
  async function sayWait(text, hold) {
    say(text);
    await sleep(hold != null ? hold : Math.max(1800, 600 + text.length * 200));
    await speechDrain(text);
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
  // 流程中的苦惱：等孩子看完、也等語音唸完，下一句才接上
  async function worryWait(text, hold) {
    worry(text);
    await sleep(hold != null ? hold : Math.max(2200, 600 + text.length * 200));
    await speechDrain(text);
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
    } else if (Q.phase === 'div-work' && Q.plates.length) {
      const n = Q.plates.length, b = Q.board;
      if (b.tens >= n && Q.tensCoins.length) {
        showHint(centerOf(Q.tensCoins[Q.tensCoins.length - 1].el), centerOf(Q.plates[0].el));
      } else if (b.tens > 0 && Q.tensCoins.length) {
        showHint(centerOf(Q.tensCoins[Q.tensCoins.length - 1].el), centerOf(machineBody));
      } else if (b.ones >= n && Q.onesCoins.length) {
        showHint(centerOf(Q.onesCoins[Q.onesCoins.length - 1].el), centerOf(Q.plates[0].el));
      }
    } else if (Q.phase === 'mul-pour') {
      pulseNextPlate();
    } else if (Q.phase === 'count' && Q.countSet) {
      const next = [...Q.countSet].find((c) => !Q.counted.has(c));
      if (next) showHint(centerOf(next.el), centerOf(next.el));
    }
  }

  // 乘法倒錢：提示下一個還沒倒的盤子（原地點一點的手勢）
  function pulseNextPlate() {
    if (!Q) return;
    const next = Q.plates.find((pl) => !pl.poured);
    if (!next) return;
    next.el.classList.add('pulse');
    const c = centerOf(next.el);
    showHint(c, c);
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
    if (Q.phase === 'sub-work' || Q.phase === 'div-work') {
      if (Q.tensCoins.includes(coin) || Q.onesCoins.includes(coin)) return { coins: [coin], isGroup: false };
    }
    return null;
  }

  function onPointerDown(e) {
    // 手動點數：點一個算一個
    if (Q && Q.phase === 'count' && Q.countSet) {
      const el = e.target && e.target.closest ? e.target.closest('.coin') : null;
      const coin = el && el.__coin;
      if (coin && Q.countSet.has(coin) && !Q.counted.has(coin)) {
        e.preventDefault();
        sfx.unlock();
        tapCount(coin);
      }
      return;
    }
    // 乘法倒錢：盤子上的迷你硬幣蓋住盤面（coin-layer 在上層），
    // 點到「盤子上的錢」也要視同點到盤子，否則錢堆是點擊死區
    if (Q && Q.phase === 'mul-pour') {
      const pi = plateIndexAt(e.clientX, e.clientY);
      if (pi >= 0) {
        e.preventDefault();
        sfx.unlock();
        pourPlate(Q.plates[pi]).catch((err) => { if (!err.isCancel) throw err; });
      }
      return;
    }
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
    if (Q && Q.phase === 'div-work' && Q.plates.length) {
      const pi = plateIndexAt(cx, cy);
      Q.plates.forEach((pl, i) => pl.el.classList.toggle('drag-over', i === pi));
    }
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
    if (Q) Q.plates.forEach((pl) => pl.el.classList.remove('drag-over'));
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

    if (Q.phase === 'div-work') {
      const n = Q.plates.length;
      if (overMachine(cx, cy)) {
        const v = GL.divVerdict('machine', denom, Q.board, n);
        if (v.ok) { runExchangeB2S(coins[0]); return; }
        if (v.reason === 'one-not-needed') worry('1 元不用換喔！1 元可以直接分給大家！');
        else if (v.reason === 'still-shareable') worry('10 元還夠每人分 1 個，先分給大家吧！');
        else worry('現在不用換錢喔！');
        snapBack(coins);
        hideHint(true);
        return;
      }
      const pi = plateIndexAt(cx, cy);
      if (pi >= 0) {
        const v = GL.divVerdict('plate', denom, Q.board, n);
        if (v.ok) {
          dealRound(coins[0], pi).catch((err) => { if (!err.isCancel) throw err; });
          return;
        }
        if (v.reason === 'need-exchange') worry('10 元不夠每人分 1 個了！拖去換錢機換開吧！');
        else if (v.reason === 'tens-first') worry('先分 10 元，再分 1 元喔！');
        else if (v.reason === 'remainder') worry('剩下的 1 元不夠每人分一個，這是餘數，留在桌上！');
        snapBack(coins);
        hideHint(true);
        return;
      }
      snapBack(coins);
      hideHint(true);
      return;
    }
    snapBack(coins);
  }

  /* ---------------- 除法：分一輪（拖 1 個，其他小朋友也各拿 1 個） ---------------- */
  async function dealRound(coin, plateIdx) {
    Q.phase = 'anim';
    hideHint(false);
    const denom = coin.denom;
    const arr = denom === 10 ? Q.tensCoins : Q.onesCoins;
    arr.splice(arr.indexOf(coin), 1);
    if (denom === 10) Q.board.tens--; else Q.board.ones--;
    platePut(Q.plates[plateIdx], coin, { dur: 260 });
    sfx.clink(denom === 10);
    updateBadges();
    await sleep(340);
    const roundLine = '一人一個，大家都有！';
    say(roundLine);
    for (let k = 1; k < Q.plates.length; k++) {
      const idx = (plateIdx + k) % Q.plates.length;
      const c = arr.pop(); // 從尾端拿，前面的格子保持整齊
      if (denom === 10) Q.board.tens--; else Q.board.ones--;
      platePut(Q.plates[idx], c, { dur: 430 });
      sfx.clink(denom === 10);
      updateBadges();
      await sleep(360);
    }
    await sleep(280);
    await speechDrain(roundLine); // 唸完才接下一句（含直接進餘數說明的路徑）

    // 沒有 10 元、1 元又湊不滿一輪 → 結束（剩的是餘數，或剛好分完）
    const b = Q.board, n = Q.plates.length;
    const finished = b.tens === 0 && b.ones < n;
    if (finished) { fireSignal(); return; }

    if (denom === 10) {
      if (b.tens >= n) {
        say('10 元還夠，繼續分！');
      } else if (b.tens > 0) {
        await worryWait('10 元剩 ' + b.tens + ' 個，不夠每人分 1 個了…', 2400);
        say('把 10 元拖進鯊魚的換錢機，換成 10 個 1 元！');
      } else {
        say('10 元分完了！接下來分 1 元！');
      }
    } else if (b.ones >= n) {
      say('1 元還夠，繼續分！');
    }
    Q.phase = 'div-work';
    reshowHintForPhase();
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
      const conserveLine = '個位滿 10 個，換到十位，變出 1 個 10 元！錢沒有變少喔！';
      say(conserveLine);
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
      await speechDrain(conserveLine); // 「錢沒有變少」是核心概念，唸完才接下一句
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
      if (Q.p.op === 'div') {
        await sayWait('1 個 10 元變成 10 個 1 元！錢一樣多，現在夠大家分了！', 3800);
        Q.phase = 'div-work';
        say('繼續分！拖 1 個 1 元，放到小朋友的盤子裡！');
      } else {
        await sayWait('跟十位換了 1 個 10 元，變成 10 個 1 元！錢一樣多，現在夠付了！', 4200);
        Q.phase = 'sub-work';
        say('繼續把要付的錢，拖到粉紅盤子裡！');
      }
      reshowHintForPhase();
    } catch (e) { if (!e.isCancel) throw e; }
  }

  /* ---------------- 點數（手動）：孩子自己一個一個點 ----------------
   * 點一個錢 → 跳出那個錢的面額（點 10 元跳「10」，不自動加總）、
   * 外圈變綠做記號、點過不能再點；全部點完才進入答案選項。 */
  function spawnTapNum(coin) {
    const L = layerRect();
    const c = centerOf(coin.el);
    const el = document.createElement('div');
    el.className = 'tap-num';
    el.textContent = coin.denom;
    el.style.left = (c.x - L.left) + 'px';
    el.style.top = (c.y - L.top) + 'px';
    fxLayer.appendChild(el);
    el.animate([
      { transform: 'translate(-50%,-70%) scale(.4)', opacity: 0 },
      { transform: 'translate(-50%,-140%) scale(1.2)', opacity: 1, offset: 0.3 },
      { transform: 'translate(-50%,-160%) scale(1.05)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%,-230%) scale(1)', opacity: 0 },
    ], { duration: ms(1000), easing: 'ease-out' }).onfinish = () => el.remove();
  }

  function tapCount(coin) {
    Q.counted.add(coin);
    coin.el.classList.add('counted');
    hideHint(true);
    sfx.tick(Q.counted.size - 1);
    coin.pulse().catch(() => {});
    spawnTapNum(coin);
    if (Q.counted.size >= Q.countSet.size) {
      Q.countSet = null;
      fireSignal(); // 全部點完
    }
  }

  async function manualCount(coins) {
    Q.phase = 'count';
    Q.countSet = new Set(coins);
    Q.counted = new Set();
    // 數數時把「幾個＝幾元」的自動加總遮起來，讓孩子自己算
    badgeTens.textContent = '？';
    badgeOnes.textContent = '？';
    for (const pl of Q.plates) pl.badgeEl.textContent = '？';
    const first = coins[0];
    if (first) showHint(centerOf(first.el), centerOf(first.el));
    await waitSignal();
    hideHint(false);
    await sleep(350);
  }

  /* ---------------- 答案選項 ---------------- */
  const ASK_TEXT = {
    add: '一共是多少元呢？',
    sub: '還剩下多少元呢？',
    mul: '一共是多少元呢？',
    div: '每個小朋友分到多少元呢？',
  };

  async function askAnswer(p, rng) {
    Q.phase = 'answer';
    Q.askValue = p.answer;
    pd.q.classList.add('pulse');
    const options = GL.makeOptions(p, rng);
    answersEl.innerHTML = '';
    say(ASK_TEXT[p.op]);

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
            if ((p.op === 'add' || p.op === 'mul') && v === p.answer - 10) {
              msg = '咦，是不是忘記換錢機變出來的那 1 個 10 元呀？我們再數一次！';
            } else if (p.op === 'sub' && v === p.answer + 10) {
              msg = '是不是有 1 個 10 元已經付給鯊魚了呢？我們再數一次！';
            } else if (p.op === 'div') {
              msg = '再看一次小鳥盤子裡的錢，我們慢慢數！';
            } else {
              msg = '只差一點點！這次慢慢數！';
            }
            try {
              await worryWait(msg, 2600); // 等孩子聽完診斷，再重數
              // 把記號擦掉，讓孩子自己再點一次
              const coins = p.op === 'div'
                ? Q.plates[0].coins.slice()
                : Q.tensCoins.concat(Q.onesCoins);
              for (const c of coins) c.el.classList.remove('counted');
              const recount = manualCount(coins);
              say('慢慢點、慢慢數，不要急！');
              await recount;
              Q.phase = 'answer';
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

  /* ---------------- 餘數加問（除法有剩時） ---------------- */
  async function askRemainder(p, rng) {
    Q.phase = 'answer';
    Q.askValue = p.remainder;
    pdRem.textContent = '剩 ?';
    pdRem.classList.add('pulse');
    const options = GL.makeRemainderOptions(p, rng);
    answersEl.innerHTML = '';
    say('那桌上剩下幾元，分不完呢？');

    await new Promise((resolve, reject) => {
      run.waiters.push({ reject });
      let busy = false;
      options.forEach((v) => {
        const b = document.createElement('button');
        b.className = 'ans-btn';
        b.textContent = v;
        b.addEventListener('click', async () => {
          if (busy || run.cancelled) return;
          if (v === p.remainder) {
            busy = true;
            b.classList.add('correct');
            sfx.yay();
            const c = centerOf(b);
            burstStars(c.x, c.y, 10);
            resolve();
          } else {
            busy = true;
            b.classList.add('wrong');
            Q.wrongAnswers++; G.wrongTotal++;
            try {
              await worryWait('看看桌上剩下的 1 元，一個一個數！', 2400);
              for (const c of Q.onesCoins) { c.pulse().catch(() => {}); await sleep(500); }
            } catch (err) { if (err.isCancel) return reject(err); }
            busy = false;
          }
        });
        answersEl.appendChild(b);
      });
    });

    pdRem.classList.remove('pulse');
    pdRem.textContent = '剩 ' + p.remainder;
    pdRem.classList.add('solved');
    answersEl.innerHTML = '';
  }

  /* ---------------- 單題流程 ---------------- */
  const OP_SIGNS = { add: '＋', sub: '－', mul: '×', div: '÷' };
  function setProblemDisplay(p) {
    pd.a.textContent = p.a;
    pd.op.textContent = OP_SIGNS[p.op];
    pd.b.textContent = p.b;
    pd.b.style.textShadow = ''; // 發牌中被 🏠 中斷時的高亮殘留
    pd.q.textContent = '?';
    pd.q.classList.remove('solved', 'pulse');
    pdRem.textContent = '';
    pdRem.classList.remove('solved', 'pulse');
  }

  function clearBoard() {
    for (const el of coinLayer.querySelectorAll('.coin')) el.remove();
    if (Q) { Q.tensCoins = []; Q.onesCoins = []; Q.group = null; }
    dissolveGroupUI();
    platesOff();
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

    const counting = manualCount(Q.tensCoins.concat(Q.onesCoins));
    say('換你數數看！把每一個錢，一個一個點！');
    await counting;
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
        await worryWait(oa === 0
          ? ('要付 ' + ob + ' 個 1 元，可是 1 元一個都沒有，不夠付！')
          : ('要付 ' + ob + ' 個 1 元，可是只有 ' + oa + ' 個，不夠付！'), 3000);
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

    const counting = manualCount(Q.tensCoins.concat(Q.onesCoins));
    say('剩下的就是答案！換你數數看，一個一個點！');
    await counting;
    await askAnswer(p, rng);
  }

  /* ---------------- 乘法流程 ---------------- */
  async function dealToPlate(plate, denom) {
    const from = centerInLayer($('lottie-guide'));
    const c = new Coin(denom);
    c.placeAt(from.x, from.y, { scale: 0.3 });
    platePut(plate, c, { dur: 430 });
    sfx.whoosh();
    setTimeout(() => { if (!run.cancelled) sfx.clink(denom === 10); }, ms(420));
    await sleep(170);
  }

  async function pourPlate(plate) {
    if (!Q || Q.phase !== 'mul-pour' || plate.poured) return;
    plate.poured = true;
    plate.el.classList.remove('pulse');
    hideHint(false);
    sfx.pop();
    Q.phase = 'anim'; // 倒錢中不接受其他操作
    const coins = plate.coins.slice(); // 發牌順序即 10 元在前
    for (const c of coins) {
      if (run.cancelled) throw new CancelError();
      c.el.classList.remove('locked');
      let slotEl;
      if (c.denom === 10) {
        slotEl = tenSlots[Q.tensCoins.length];
        Q.tensCoins.push(c);
      } else {
        slotEl = oneSlots[Q.onesCoins.length];
        Q.onesCoins.push(c);
      }
      c.anchor = slotEl;
      const t = centerInLayer(slotEl);
      c.glideTo(t.x, t.y, { dur: 380, scale: 1 });
      sfx.clink(c.denom === 10);
      updateBadges();
      await sleep(150);
    }
    plate.coins = [];
    plate.value = 0;
    plate.badgeEl.textContent = '倒好了！';
    plate.slotsEl.innerHTML = '';
    plate.el.classList.add('done');
    await sleep(250);
    if (Q.plates.some((pl) => !pl.poured)) {
      Q.phase = 'mul-pour';
      pulseNextPlate();
    } else {
      fireSignal(); // 全部倒完
    }
  }

  async function runMulQuestion(p, rng) {
    const m = p.a, n = p.b;
    await sayWait('我們來算 ' + m + ' 乘以 ' + n + '！有 ' + n + ' 個小朋友，每個人都有 ' + m + ' 元！', 3400);
    Q.phase = 'dealing';
    buildPlates(n);
    for (let i = 0; i < n; i++) {
      const plate = Q.plates[i];
      for (let k = 0; k < GL.tensOf(m); k++) await dealToPlate(plate, 10);
      for (let k = 0; k < GL.onesOf(m); k++) await dealToPlate(plate, 1);
      await sleep(140);
    }
    await sayWait(n + ' 個人都有 ' + m + ' 元！那一共是多少呢？', 2600);
    Q.phase = 'mul-pour';
    say('把大家的錢通通放到桌上！點一下小朋友的盤子！');
    pulseNextPlate();
    await waitSignal(); // 全部倒完（pourPlate 觸發）
    Q.board = { tens: GL.tensOf(m) * n, ones: GL.onesOf(m) * n };
    platesOff();

    if (GL.needsExchange(p)) {
      await sayWait('哇！1 元有 ' + Q.board.ones + ' 個，滿 10 個了！', 3000);
      formGroup();
      Q.phase = 'add-work'; // 與加法進位共用換錢流程
      say('把發光的 10 個 1 元，拖進鯊魚的換錢機！');
      const g = Q.group[4] || Q.group[0];
      showHint(centerOf(g.el), centerOf(machineBody));
      await waitSignal(); // 換錢完成
    } else {
      await sayWait('1 元沒有滿 10 個，不用換錢，直接數！', 2800);
    }

    const counting = manualCount(Q.tensCoins.concat(Q.onesCoins));
    say('換你數數看！把每一個錢，一個一個點！');
    await counting;
    await askAnswer(p, rng);
  }

  /* ---------------- 除法流程 ---------------- */
  async function runDivQuestion(p, rng) {
    const A = p.a, n = p.b;
    await sayWait('我們來算 ' + A + ' 除以 ' + n + '！要把 ' + A + ' 元，平平分給 ' + n + ' 個小朋友！', 3600);
    Q.phase = 'dealing';
    await dealCoins(10, GL.tensOf(A), $('lottie-guide'));
    await dealCoins(1, GL.onesOf(A), $('lottie-guide'));
    Q.board = { tens: GL.tensOf(A), ones: GL.onesOf(A) };
    buildPlates(n);
    await sleep(400);
    Q.phase = 'div-work';
    if (Q.board.tens >= n) {
      await sayWait('先分 10 元！拖 1 個 10 元，放到一個小朋友的盤子裡！', 3000);
    } else {
      // 每一步都確認孩子還沒搶先把 10 元投進換錢機（空窗約 2.6 秒）
      if (!Q.exchangeDone && Q.phase === 'div-work') {
        await worryWait('10 元只有 ' + Q.board.tens + ' 個，沒辦法每人分 1 個！', 2600);
      }
      if (!Q.exchangeDone && Q.phase === 'div-work') {
        say('把 10 元拖進鯊魚的換錢機，換成 10 個 1 元吧！');
      }
    }
    if (Q.phase === 'div-work') reshowHintForPhase(); // 孩子可能已搶先動作
    await waitSignal(); // 分完（dealRound 觸發）
    Q.phase = 'anim';
    hideHint(false);

    if (p.remainder > 0) {
      for (const c of Q.onesCoins) c.pulse().catch(() => {});
      caption('剩下 ' + p.remainder + ' 元 ＝ 餘數');
      sfx.ding();
      await sayWait('剩下 ' + p.remainder + ' 個 1 元，不夠每人再分一個了！這就是「餘數」！', 4000);
    } else {
      await sayWait('剛剛好分完，沒有剩下！', 2200);
    }

    Q.plates[0].el.classList.add('counting');
    const counting = manualCount(Q.plates[0].coins.slice());
    say('點一點' + PLATE_CHARS[0].name + '盤子裡的錢，數數看每人分到多少元！');
    await counting;
    Q.plates[0].el.classList.remove('counting');
    await askAnswer(p, rng);
    if (p.remainder > 0) await askRemainder(p, rng);
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
        else if (p.op === 'sub') await runSubQuestion(p, rng);
        else if (p.op === 'mul') await runMulQuestion(p, rng);
        else await runDivQuestion(p, rng);

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

    // 乘法：點盤子倒錢
    platesEl.addEventListener('pointerdown', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('.plate') : null;
      if (!el || !Q || Q.phase !== 'mul-pour') return;
      const plate = Q.plates.find((pl) => pl.el === el);
      if (!plate) return;
      sfx.unlock();
      pourPlate(plate).catch((err) => { if (!err.isCancel) throw err; });
    });

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
    get plates() { return Q ? Q.plates.map((pl) => ({ value: pl.value, coins: pl.coins.length, poured: pl.poured })) : []; },
    get askValue() { return Q ? Q.askValue : null; },
    get countLeft() { return Q && Q.countSet ? Q.countSet.size - Q.counted.size : 0; },
    get qIndex() { return G.qIndex; },
    get wrongTotal() { return G.wrongTotal; },
    get session() { return G.session; },
    startMode(mode) { runSession(mode); },
    pump() { pumpTimers(); },
    goHome() { $('btn-home').click(); },
    tapPlate(i) {
      if (!Q || !Q.plates[i]) return false;
      Q.plates[i].el.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 9, isPrimary: true,
        pointerType: 'touch', clientX: 0, clientY: 0, button: 0, buttons: 1,
      }));
      return true;
    },
    centers: {
      machine() { return centerOf(machineBody); },
      tray() { return centerOf(traySlotsEl); },
      plate(i) { return Q && Q.plates[i || 0] ? centerOf(Q.plates[i || 0].el) : null; },
      uncountedCoin() {
        if (!Q || !Q.countSet) return null;
        const c = [...Q.countSet].find((x) => !Q.counted.has(x));
        return c ? centerOf(c.el) : null;
      },
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
      if (!Q || Q.askValue == null) return false;
      const want = Q.askValue; // 目前這一問的正解（除法會先問商、再問餘數）
      for (const b of answersEl.querySelectorAll('.ans-btn')) {
        const v = Number(b.textContent);
        if (correct ? v === want : v !== want) { b.click(); return v; }
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
    if (URL_MODE && MODES.includes(URL_MODE)) {
      speech.on = false;
      runSession(URL_MODE);
    } else if (URL_PLAY && MODES.includes(URL_PLAY)) {
      // 從太空站入口來的：先顯示出發按鈕（點擊手勢＝解鎖 iOS 音訊與語音）
      const ov = $('start-overlay');
      const labels = { add: '➕ 加法星球', sub: '➖ 減法星球', mul: '✖️ 乘法星球', div: '➗ 除法星球', mix: '🌟 混合銀河' };
      $('start-mode-label').textContent = labels[URL_PLAY];
      ov.classList.add('show');
      $('btn-start').addEventListener('click', () => {
        sfx.unlock(); speech.prime(); sfx.tap();
        ov.classList.remove('show');
        runSession(URL_PLAY);
      }, { once: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
