/* ============================================================
   Danlu Kids Space — 共用遊戲引擎
   從換錢大冒險 main.js 抽出的已驗證模式，供新星球使用。
   （main.js 本身凍結不改，接受暫時性重複）

   使用：const E = Engine.create({ reshowHint: fn })
   頁面需有固定 id：sprite-layer / fx-layer / bubble / guide /
   sweat / hint-hand / counter / caption（可用 cfg 覆寫 id）
   ============================================================ */
(function (root) {
  'use strict';

  function create(cfg) {
    cfg = cfg || {};
    const $ = (id) => document.getElementById(id);

    /* ---------------- URL 參數（測試用） ---------------- */
    const params = new URLSearchParams(location.search);
    const FAST = params.get('fast') === '1';
    const SPEED = FAST ? 0.12 : 1;
    const ms = (t) => Math.max(10, Math.round(t * SPEED));
    const URL_SEED = params.has('seed') ? Number(params.get('seed')) : null;
    const URL_MODE = params.get('mode');   // 測試：直接開跑、關語音
    const URL_PLAY = params.get('play');   // 入口來的：顯示出發按鈕

    /* ---------------- DOM ---------------- */
    const el = {
      layer: $(cfg.layer || 'sprite-layer'),
      fx: $(cfg.fx || 'fx-layer'),
      bubble: $(cfg.bubble || 'bubble'),
      guide: $(cfg.guide || 'guide'),
      hint: $(cfg.hint || 'hint-hand'),
      counter: $(cfg.counter || 'counter'),
      caption: $(cfg.caption || 'caption'),
    };
    const sfx = root.sfx;

    /* ---------------- 取消權杖：回首頁/重開時中斷所有動畫鏈 ---------------- */
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
    /* sleep 以「截止時刻＋幫浦」實作：分頁被節流時回前景會補跑（見 bindLifecycle） */
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
    // 等玩家完成某件事（drop/點擊 handler 以 fireSignal 放行）；閂鎖式防競態
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

    /* ---------------- 語音（幫助還不識字的孩子） ---------------- */
    let soundOn = true;
    const speech = {
      on: !FAST && 'speechSynthesis' in root,
      _t: null,
      prime() { // iOS 第一次 speak 必須在使用者手勢內
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
          // Android 的 cancel() 非同步：cancel 後立刻 speak 會被吞，隔一拍再講
          if (speechSynthesis.speaking || speechSynthesis.pending) {
            speechSynthesis.cancel();
            this._t = setTimeout(go, 90);
          } else { go(); }
        } catch (e) {}
      },
      busy() {
        if (!this.on) return false;
        try { return speechSynthesis.speaking || speechSynthesis.pending; }
        catch (e) { return false; }
      },
      stop() { clearTimeout(this._t); try { speechSynthesis.cancel(); } catch (e) {} },
    };
    // 等這句唸完才繼續（輪詢＋字數上限保險），旁白不被下一句喀掉
    async function speechDrain(text) {
      if (FAST || !speech.on || !soundOn) return;
      const cap = performance.now() + 2500 + text.length * 480;
      await sleep(160);
      while (speech.busy() && performance.now() < cap) await sleep(140);
    }

    /* ---------------- 泡泡對話＋苦惱 ---------------- */
    let worryTimer = null;
    function say(text, opts) {
      opts = opts || {};
      el.bubble.textContent = text;
      el.bubble.classList.remove('warn');
      el.bubble.classList.add('show');
      if (!opts.silent) speech.speak(text);
    }
    async function sayWait(text, hold) {
      say(text);
      await sleep(hold != null ? hold : Math.max(1800, 600 + text.length * 200));
      await speechDrain(text);
    }
    function worry(text) {
      el.bubble.textContent = text;
      el.bubble.classList.add('show', 'warn');
      speech.speak(text);
      if (sfx) sfx.uhoh();
      el.guide.classList.remove('worried');
      void el.guide.offsetWidth;
      el.guide.classList.add('worried');
      clearTimeout(worryTimer);
      worryTimer = setTimeout(() => el.guide.classList.remove('worried'), 1600);
    }
    async function worryWait(text, hold) {
      worry(text);
      await sleep(hold != null ? hold : Math.max(2200, 600 + text.length * 200));
      await speechDrain(text);
    }

    /* ---------------- 幾何工具 ---------------- */
    const layerRect = () => el.layer.getBoundingClientRect();
    function centerOf(target) {
      const r = target.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    function toLayer(pt) {
      const L = layerRect();
      return { x: pt.x - L.left, y: pt.y - L.top };
    }
    function centerInLayer(target) { return toLayer(centerOf(target)); }
    function inflatedContains(target, x, y, pad) {
      const r = target.getBoundingClientRect();
      return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    }

    /* ---------------- Sprite（可拖曳/飛行的圓形棋子，比照 Coin） ----------------
     * className: 額外 class；html: 內容（img/文字）。頁面 CSS 需給 .sprite 尺寸。 */
    class Sprite {
      constructor(className, html) {
        this.el = document.createElement('div');
        this.el.className = 'sprite ' + (className || '');
        this.el.innerHTML = html || '';
        this.el.__sprite = this;
        this.x = 0; this.y = 0; this.scale = 1;
        this.anchor = null;
        this.dead = false;
        el.layer.appendChild(this.el);
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
        void this.el.offsetWidth;
      }
      glideTo(x, y, opts) {
        opts = opts || {};
        if (FAST) { // 測試模式：立即定位，座標立刻正確
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
        const base = this.scale; // 相對縮放
        this.el.style.transition = 'transform 130ms ease-out';
        this.scale = base * 1.32; this.apply();
        await sleep(140);
        this.el.style.transition = 'transform 200ms ease-in';
        this.scale = base; this.apply();
      }
      setDragging(on) {
        this.el.classList.toggle('dragging', on);
        this.scale = on ? 1.14 : 1;
        this.apply();
      }
      destroy() { this.dead = true; this.el.remove(); }
    }

    /* ---------------- 特效：星星爆發 / 面額跳字 / 計數大字 / 標語 ---------------- */
    function burstStars(clientX, clientY, n) {
      const L = layerRect();
      for (let i = 0; i < (n || 10); i++) {
        const s = document.createElement('div');
        s.className = 'fx-star';
        s.textContent = ['⭐', '✨', '🌟'][i % 3];
        s.style.left = (clientX - L.left) + 'px';
        s.style.top = (clientY - L.top) + 'px';
        el.fx.appendChild(s);
        const ang = Math.PI * 2 * (i / (n || 10)) + Math.random() * 0.6;
        const dist = 60 + Math.random() * 90;
        s.animate([
          { transform: 'translate(0,0) scale(.4) rotate(0deg)', opacity: 1 },
          { transform: 'translate(' + Math.cos(ang) * dist + 'px,' + (Math.sin(ang) * dist - 30) + 'px) scale(1.1) rotate(' + (Math.random() * 240 - 120) + 'deg)', opacity: 0 },
        ], { duration: ms(900) + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.4,1)' })
          .onfinish = () => s.remove();
      }
    }
    // 手動點數的跳字：在目標元素上方跳出 text（例如點 10 元跳「10」）
    function tapNum(target, text) {
      const L = layerRect();
      const c = centerOf(target);
      const d = document.createElement('div');
      d.className = 'tap-num';
      d.textContent = text;
      d.style.left = (c.x - L.left) + 'px';
      d.style.top = (c.y - L.top) + 'px';
      el.fx.appendChild(d);
      d.animate([
        { transform: 'translate(-50%,-70%) scale(.4)', opacity: 0 },
        { transform: 'translate(-50%,-140%) scale(1.2)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%,-160%) scale(1.05)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%,-230%) scale(1)', opacity: 0 },
      ], { duration: ms(1000), easing: 'ease-out' }).onfinish = () => d.remove();
    }
    function counterShow(n, topPct) {
      el.counter.style.top = (topPct || 30) + '%';
      el.counter.textContent = n;
      el.counter.classList.remove('show');
      void el.counter.offsetWidth;
      el.counter.classList.add('show');
    }
    function counterHide() { el.counter.classList.remove('show'); }
    function caption(text) {
      el.caption.textContent = text;
      el.caption.style.animationDuration = ms(3000) + 'ms';
      el.caption.classList.remove('show');
      void el.caption.offsetWidth;
      el.caption.classList.add('show');
    }

    /* ---------------- 提示小手 ---------------- */
    let hintAnim = null, hintIdleTimer = null;
    function showHint(fromPt, toPt) {
      hideHint(false);
      const L = layerRect();
      el.hint.style.left = '0px'; el.hint.style.top = '0px';
      const k = (p) => 'translate(' + (p.x - L.left - 10) + 'px,' + (p.y - L.top - 4) + 'px)';
      hintAnim = el.hint.animate([
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
      if (scheduleReshow && cfg.reshowHint) {
        hintIdleTimer = setTimeout(() => cfg.reshowHint(), ms(8000));
      }
    }

    /* ---------------- Lottie 角色（失敗退回 GIF）與畫面切換 ---------------- */
    const lotties = {}; // screenKey -> [anim]
    function mountChar(containerId, data, gifName, screenKey) {
      const target = $(containerId);
      if (!lotties[screenKey]) lotties[screenKey] = [];
      try {
        if (!root.lottie || !data) throw new Error('no lottie');
        const anim = root.lottie.loadAnimation({
          container: target, renderer: 'svg', loop: true, autoplay: false,
          animationData: JSON.parse(JSON.stringify(data)),
        });
        lotties[screenKey].push(anim);
        return anim;
      } catch (e) {
        target.innerHTML = '<img src="assets/' + gifName + '" style="width:100%" alt="">';
        return null;
      }
    }
    function playScreenChars(key) {
      for (const k of Object.keys(lotties)) {
        for (const a of lotties[k]) { if (k === key) a.play(); else a.pause(); }
      }
    }
    let screens = null, currentScreen = '';
    function registerScreens(map, initial) {
      screens = map;
      currentScreen = initial;
    }
    function showScreen(key) {
      currentScreen = key;
      for (const k of Object.keys(screens)) screens[k].classList.toggle('active', k === key);
      playScreenChars(key);
    }

    /* ---------------- 生命週期：前景幫浦、音訊解鎖、可見性 ---------------- */
    function bindLifecycle(opts) {
      opts = opts || {};
      document.addEventListener('pointerdown', function unlockOnce() {
        if (sfx) sfx.unlock();
        document.removeEventListener('pointerdown', unlockOnce);
      }, { once: true });

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          for (const k of Object.keys(lotties)) lotties[k].forEach((a) => a.pause());
          speech.stop();
        } else {
          playScreenChars(currentScreen);
          pumpTimers();
          if (sfx) sfx.unlock();
        }
      });

      if (opts.onResize) window.addEventListener('resize', opts.onResize);

      (function rafPump() {
        pumpTimers();
        requestAnimationFrame(rafPump);
      })();
    }

    function setSoundOn(on) {
      soundOn = !!on;
      if (sfx) sfx.setEnabled(soundOn);
      if (!soundOn) speech.stop();
    }

    return {
      // 參數
      FAST, SPEED, ms, URL_SEED, URL_MODE, URL_PLAY,
      // 流程
      CancelError, newRun, cancelRun, sleep, pumpTimers, waitSignal, fireSignal,
      get run() { return run; },
      // 語音與對話
      speech, speechDrain, say, sayWait, worry, worryWait,
      setSoundOn, get soundOn() { return soundOn; },
      // 幾何
      centerOf, toLayer, centerInLayer, inflatedContains, layerRect,
      // 視覺
      Sprite, burstStars, tapNum, counterShow, counterHide, caption,
      showHint, hideHint,
      // 角色與畫面
      mountChar, playScreenChars, registerScreens, showScreen,
      get currentScreen() { return currentScreen; },
      // 生命週期
      bindLifecycle,
      // DOM 快取
      el,
    };
  }

  root.Engine = { create };
})(window);
