/* 換錢大冒險 — WebAudio 合成音效（不需外部音檔，file:// 離線可用）
 * 第一次使用者手勢時呼叫 Sfx.unlock() 解鎖 iOS/Android 音訊。 */
(function (root) {
  'use strict';

  class Sfx {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = true;   // 使用者開關
      this.available = true; // 裝置是否支援
    }

    unlock() {
      if (!this.available) return;
      try {
        if (!this.ctx) {
          const AC = root.AudioContext || root.webkitAudioContext;
          if (!AC) { this.available = false; return; }
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.45;
          this.master.connect(this.ctx.destination);
        }
        // iOS 有非標準的 'interrupted' 狀態（來電、Siri），一律用 !== 'running' 判斷
        if (this.ctx.state !== 'running') this.ctx.resume();
      } catch (e) { this.available = false; }
    }

    get ready() { return this.enabled && this.available && this.ctx; }

    setEnabled(on) { this.enabled = !!on; }

    /* --- 基本合成單元 --- */
    tone(opts) {
      if (!this.ready) return;
      const o = Object.assign({ freq: 440, type: 'sine', dur: 0.15, vol: 0.5, when: 0, slideTo: 0, attack: 0.006 }, opts);
      const t0 = this.ctx.currentTime + o.when;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = o.type;
      osc.frequency.setValueAtTime(o.freq, t0);
      if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.slideTo), t0 + o.dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(o.vol, t0 + o.attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      osc.connect(g); g.connect(this.master);
      osc.start(t0); osc.stop(t0 + o.dur + 0.05);
    }

    noise(opts) {
      if (!this.ready) return;
      const o = Object.assign({ dur: 0.3, vol: 0.2, when: 0, from: 400, to: 2400, q: 1.2 }, opts);
      const t0 = this.ctx.currentTime + o.when;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * o.dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = o.q;
      f.frequency.setValueAtTime(o.from, t0);
      f.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(o.vol, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t0); src.stop(t0 + o.dur + 0.05);
    }

    /* --- 遊戲音效 --- */
    tap() { this.tone({ freq: 620, type: 'triangle', dur: 0.09, vol: 0.35 }); }

    // 硬幣叮噹（放下 / 落定）
    clink(big) {
      const f = big ? 1900 : 2600;
      this.tone({ freq: f, type: 'sine', dur: 0.09, vol: 0.4 });
      this.tone({ freq: f * 1.42, type: 'sine', dur: 0.16, vol: 0.28, when: 0.02 });
    }

    // 抓起硬幣
    grab() { this.tone({ freq: 480, type: 'triangle', dur: 0.07, vol: 0.3, slideTo: 640 }); }

    // 咻—飛行
    whoosh() { this.noise({ dur: 0.32, vol: 0.16, from: 500, to: 2600 }); }

    // 點數第 i 個（音高逐步升高）
    tick(i) {
      const f = 560 + Math.min(i, 20) * 44;
      this.tone({ freq: f, type: 'triangle', dur: 0.11, vol: 0.4 });
      this.tone({ freq: f * 2, type: 'sine', dur: 0.06, vol: 0.14 });
    }

    // 換錢機運轉
    whirr() {
      this.noise({ dur: 0.55, vol: 0.14, from: 300, to: 900, q: 2 });
      this.tone({ freq: 140, type: 'square', dur: 0.5, vol: 0.06, slideTo: 200 });
    }

    // 叮！（機器完成）
    ding() {
      this.tone({ freq: 1318, type: 'sine', dur: 0.5, vol: 0.4 });
      this.tone({ freq: 1976, type: 'sine', dur: 0.7, vol: 0.22, when: 0.06 });
    }

    // 換錢成功的魔法琶音
    magic() {
      [659, 880, 1109, 1319, 1760].forEach((f, i) =>
        this.tone({ freq: f, type: 'sine', dur: 0.28, vol: 0.3, when: i * 0.09 }));
    }

    // 冒出
    pop() { this.tone({ freq: 330, type: 'sine', dur: 0.14, vol: 0.4, slideTo: 780 }); }

    // 哎呀（錯誤，溫和不刺耳）
    uhoh() {
      this.tone({ freq: 420, type: 'triangle', dur: 0.22, vol: 0.38, slideTo: 330 });
      this.tone({ freq: 330, type: 'triangle', dur: 0.3, vol: 0.34, when: 0.22, slideTo: 250 });
    }

    // 答對小歡呼
    yay() {
      [523, 659, 784].forEach((f, i) =>
        this.tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.4, when: i * 0.09 }));
      this.tone({ freq: 1047, type: 'triangle', dur: 0.45, vol: 0.4, when: 0.27 });
    }

    // 過關號角
    fanfare() {
      const seq = [[523, 0.14], [523, 0.14], [659, 0.14], [784, 0.2], [659, 0.12], [784, 0.5]];
      let t = 0;
      for (const [f, d] of seq) {
        this.tone({ freq: f, type: 'triangle', dur: d, vol: 0.42, when: t });
        this.tone({ freq: f / 2, type: 'sine', dur: d, vol: 0.2, when: t });
        t += d * 0.92;
      }
    }

    // 火車汽笛（湊十小火車）：兩聲上滑長音
    whistle() {
      this.tone({ freq: 620, type: 'triangle', dur: 0.28, vol: 0.4, slideTo: 740 });
      this.tone({ freq: 620, type: 'triangle', dur: 0.55, vol: 0.42, when: 0.32, slideTo: 780 });
      this.tone({ freq: 310, type: 'sine', dur: 0.55, vol: 0.2, when: 0.32, slideTo: 390 });
    }

    // 火車開動的節奏（嗚嗆嗚嗆）
    chug(n) {
      for (let i = 0; i < (n || 4); i++) {
        this.noise({ dur: 0.12, vol: 0.14, when: i * 0.17, from: 200, to: 700, q: 1.5 });
      }
    }

    // 時鐘滴答（時鐘星球，i 用來交替滴/答音高）
    tick2(i) {
      this.tone({ freq: i % 2 ? 900 : 1150, type: 'square', dur: 0.045, vol: 0.16 });
    }

    // 咕咕鐘報時（時針跳格）
    cuckoo() {
      this.tone({ freq: 784, type: 'sine', dur: 0.18, vol: 0.4 });
      this.tone({ freq: 622, type: 'sine', dur: 0.26, vol: 0.4, when: 0.2 });
    }

    // 蓋印章（九九口訣）：厚實的「咚」＋亮片
    stamp() {
      this.tone({ freq: 190, type: 'sine', dur: 0.16, vol: 0.5, slideTo: 120 });
      this.noise({ dur: 0.09, vol: 0.12, from: 900, to: 400, q: 1 });
      this.tone({ freq: 1560, type: 'sine', dur: 0.2, vol: 0.18, when: 0.1 });
    }

    // 全部完成的星星雨
    sparkleRain() {
      for (let i = 0; i < 10; i++) {
        this.tone({ freq: 1200 + Math.sin(i * 2.1) * 500 + i * 60, type: 'sine', dur: 0.18, vol: 0.16, when: i * 0.07 });
      }
    }
  }

  root.sfx = new Sfx();
})(window);
