/* ============================================================
   周長探險 — 螞蟻繞格線直角圖形一圈數邊長
   lv1 繞一圈數格子：長方形，逐格走、逐格數 → 周長（干擾含面積）
   lv2 邊長加加看：L/凸/凹/十字形，每條邊標長度，走過就加起來
   lv3 誰的周長長：兩形各繞一圈，比總長（攻堅面積≠周長）
   共用 js/engine.js；starmap key: ('perimeter','lv1'..'lv3')
   ============================================================ */
(function () {
  'use strict';

  const PL = window.PerimeterLogic;
  const sfx = window.sfx;
  const $ = (id) => document.getElementById(id);
  const E = Engine.create({ reshowHint: reshowHintForPhase });

  /* ---------------- DOM ---------------- */
  const app = $('app');
  const screens = { title: $('screen-title'), game: $('screen-game'), end: $('screen-end') };
  const spriteLayer = $('sprite-layer');
  const stage = $('peri-stage');
  const shapesRow = $('shapes-row');
  const walkBar = $('walk-bar');
  const walkBtn = $('btn-walk');
  const periNum = $('peri-num');
  const answersEl = $('answers');
  const pdLabel = $('pd-label');
  const starsEl = $('stars');
  E.registerScreens(screens, 'title');

  const SVGNS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, text) {
    const e2 = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e2.setAttribute(k, attrs[k]);
    if (text != null) e2.textContent = text;
    return e2;
  }
  function centroidOf(verts) {
    let x = 0, y = 0;
    for (const v of verts) { x += v[0]; y += v[1]; }
    return { x: x / verts.length, y: y / verts.length };
  }

  /* ---------------- 狀態 ---------------- */
  const G = { lv: 'lv1', session: [], qIndex: 0, wrongTotal: 0 };
  let Q = null;

  function newRound(q) {
    return { q, phase: 'idle', sum: 0, cur: 0, shapes: [], bugs: [], askValue: null, walkedShapes: 0, walking: false, wrongAnswers: 0 };
  }

  /* ---------------- 圖形 SVG ---------------- */
  const PAD = 1.15;
  function buildShape(verts, sizePx, opts) {
    opts = opts || {};
    const bb = PL.bboxOf(verts);
    const W = bb.w + 2 * PAD, H = bb.h + 2 * PAD;
    const u = sizePx / Math.max(W, H);        // 每格 px
    const box = document.createElement('div');
    box.className = 'shape-box';
    const svg = el('svg', {
      viewBox: (-PAD) + ' ' + (-PAD) + ' ' + W + ' ' + H,
      width: W * u, height: H * u, class: 'shape-svg',
    });
    if (opts.grid) {
      for (let x = 0; x <= bb.w; x++) svg.appendChild(el('line', { x1: x, y1: 0, x2: x, y2: bb.h, class: 'grid-line' }));
      for (let y = 0; y <= bb.h; y++) svg.appendChild(el('line', { x1: 0, y1: y, x2: bb.w, y2: y, class: 'grid-line' }));
    }
    svg.appendChild(el('polygon', { points: verts.map((v) => v.join(',')).join(' '), class: 'shape-fill' }));
    const edges = PL.edgesOf(verts);
    const edgeEls = edges.map((e) => {
      const ln = el('line', { x1: e.a[0], y1: e.a[1], x2: e.b[0], y2: e.b[1], class: 'edge' });
      svg.appendChild(ln); return ln;
    });
    for (const v of verts) svg.appendChild(el('circle', { cx: v[0], cy: v[1], r: 0.15, class: 'corner-dot' }));
    let labelEls = [];
    if (opts.labels) {
      const c = centroidOf(verts);
      labelEls = edges.map((e) => {
        const mx = (e.a[0] + e.b[0]) / 2, my = (e.a[1] + e.b[1]) / 2;
        const nx = mx - c.x, ny = my - c.y, nl = Math.hypot(nx, ny) || 1;
        const t = el('text', { x: mx + nx / nl * 0.5, y: my + ny / nl * 0.5, class: 'side-label' }, String(e.len));
        svg.appendChild(t); return t;
      });
    }
    box.appendChild(svg);
    shapesRow.appendChild(box);
    const gridToClient = (gx, gy) => {
      const r = svg.getBoundingClientRect();
      return { x: r.left + ((gx + PAD) / W) * r.width, y: r.top + ((gy + PAD) / H) * r.height };
    };
    return { box, svg, verts, edges, edgeEls, labelEls, gridToClient, u, perimeter: PL.perimeterOf(verts) };
  }

  /* ---------------- 瓢蟲 sprite ---------------- */
  function makeBug(uPx) {
    const html = '<svg class="bug-svg" viewBox="-11 -12 22 24" xmlns="http://www.w3.org/2000/svg">'
      + '<line x1="-4" y1="-9" x2="-7" y2="-13" stroke="#3a3844" stroke-width="1.4" stroke-linecap="round"/>'
      + '<line x1="4" y1="-9" x2="7" y2="-13" stroke="#3a3844" stroke-width="1.4" stroke-linecap="round"/>'
      + '<circle cx="-7" cy="-13" r="1.6" fill="#3a3844"/><circle cx="7" cy="-13" r="1.6" fill="#3a3844"/>'
      + '<ellipse cx="0" cy="1" rx="8" ry="9" fill="#e24b4a" stroke="#3a3844" stroke-width="1.6"/>'
      + '<path d="M0 -8 L0 10" stroke="#3a3844" stroke-width="1.4"/>'
      + '<circle cx="0" cy="-8" r="3.6" fill="#3a3844"/>'
      + '<circle cx="-3.6" cy="-2" r="1.5" fill="#3a3844"/><circle cx="3.6" cy="-2" r="1.5" fill="#3a3844"/>'
      + '<circle cx="-4" cy="4" r="1.5" fill="#3a3844"/><circle cx="4" cy="4" r="1.5" fill="#3a3844"/>'
      + '</svg>';
    const sp = new E.Sprite('bug', html);
    const d = Math.max(16, uPx * 0.95);
    sp.el.style.width = d + 'px'; sp.el.style.height = d + 'px';
    return sp;
  }
  function placeBugAt(shape, bug, gx, gy) {
    const p = E.toLayer(shape.gridToClient(gx, gy));
    bug.placeAt(p.x, p.y);
  }

  /* ---------------- 走一條邊（逐格） ---------------- */
  async function walkEdge(shape, bug, idx, opts) {
    opts = opts || {};
    const e = shape.edges[idx];
    const sx = Math.sign(e.dx), sy = Math.sign(e.dy);
    const dur = opts.dur != null ? opts.dur : 260;
    if (opts.count) {
      // 逐格走、逐格數（lv1／lv3）
      for (let k = 1; k <= e.len; k++) {
        const p = E.toLayer(shape.gridToClient(e.a[0] + sx * k, e.a[1] + sy * k));
        bug.glideTo(p.x, p.y, { dur, ease: 'ease-in-out' });
        await E.sleep(dur);
        Q.sum++;
        periNum.textContent = Q.sum;
        sfx.hop();
        if (!opts.noBig) E.counterShow(Q.sum, 24);
      }
    } else {
      // 一口氣走完整條邊、加上這邊長度（lv2：把邊長加起來）
      const p = E.toLayer(shape.gridToClient(e.b[0], e.b[1]));
      bug.glideTo(p.x, p.y, { dur: dur * 1.5, ease: 'ease-in-out' });
      await E.sleep(dur * 1.5);
      Q.sum += e.len;
      periNum.textContent = Q.sum;
      sfx.hop();
      if (shape.labelEls[idx]) E.tapNum(shape.labelEls[idx], '＋' + e.len);
    }
    shape.edgeEls[idx].classList.remove('glow');
    shape.edgeEls[idx].classList.add('done');
    if (shape.labelEls[idx]) shape.labelEls[idx].classList.add('lit');
  }
  function glowNext(shape, idx) {
    if (idx < shape.edgeEls.length) shape.edgeEls[idx].classList.add('glow');
  }

  /* ---------------- lv1/lv2：走一圈 ---------------- */
  async function runWalkQuestion(q, lv) {
    const isCount = lv === 1;
    pdLabel.textContent = isCount ? '繞一圈，周長多少？' : '把每條邊加起來！';
    Q.sum = 0; Q.cur = 0; periNum.textContent = '0';

    const size = Math.min(Math.round(stage.clientWidth * (isCount ? 0.56 : 0.6)), 260);
    const shape = buildShape(q.verts, size, { grid: isCount, labels: !isCount });
    Q.shapes = [shape];
    const bug = makeBug(shape.u);
    Q.bugs = [bug];
    placeBugAt(shape, bug, q.verts[0][0], q.verts[0][1]);

    await E.sayWait(isCount
      ? '小瓢蟲要繞圖形走一圈！按「走一邊」，一格一格數！'
      : '小瓢蟲繞一圈，把每條邊的長度加起來就是周長！', 3200);

    // 旁白講完才顯示＋綁定按鈕（旁白期間點按鈕不會是死點）
    walkBar.classList.remove('hidden');
    walkBtn.classList.remove('hidden');
    walkBtn.style.visibility = '';
    walkBtn.disabled = false;
    Q.phase = 'walk';
    glowNext(shape, 0);
    reshowHintForPhase();

    await new Promise((resolve, reject) => {
      E.run.waiters.push({ reject });
      walkBtn.onclick = async () => {
        if (Q.phase !== 'walk' || walkBtn.disabled || E.run.cancelled) return;
        walkBtn.disabled = true;
        sfx.unlock();
        E.hideHint(true);
        try {
          await walkEdge(shape, bug, Q.cur, { count: isCount });
        } catch (err) { if (err.isCancel) return; throw err; }
        Q.cur++;
        if (Q.cur >= shape.edges.length) {
          Q.phase = 'anim';
          walkBtn.style.visibility = 'hidden'; // 只藏按鈕、保留走一邊列佔位＝圖形不位移、瓢蟲不脫節
          resolve();
        } else {
          glowNext(shape, Q.cur);
          reshowHintForPhase();
          walkBtn.disabled = false;
        }
      };
    });

    sfx.yay();
    E.caption('繞一圈＝周長 ' + q.perimeter + '！');
    await E.sleep(600);
    await askOptions(q.options, q.answer,
      isCount ? '這個圖形的周長是多少呢？' : '周長一共是多少？', async () => {
        if (isCount) await E.worryWait('周長是「繞一圈」的長度，不是裡面的格子數喔！再數一次邊！', 3600);
        else await E.worryWait('每一條邊都要加到！漏了哪一邊嗎？', 3000);
      });
    E.caption('周長 ' + q.answer + '！');
    E.speech.speak('周長是 ' + q.answer + '！');
    await E.sleep(1100);
    await E.speechDrain('周長是 ' + q.answer + '！');
  }

  /* ---------------- lv3：比周長 ---------------- */
  async function runCompareQuestion(q) {
    pdLabel.textContent = '誰的周長比較長？';
    walkBar.classList.add('hidden');
    const size = Math.min(Math.round(stage.clientWidth * 0.4), 175);
    const names = ['左邊', '右邊'];
    q.shapes.forEach((s, i) => {
      const shape = buildShape(s.verts, size, { grid: true });
      const nm = document.createElement('div');
      nm.className = 'shape-name'; nm.textContent = names[i];
      shape.box.appendChild(nm);
      const pr = document.createElement('div');
      pr.className = 'shape-perim'; pr.textContent = '';
      shape.box.appendChild(pr);
      shape.perimEl = pr; shape.key = s.key; shape.walked = false;
      shape.box.classList.add('tappable');
      Q.shapes.push(shape);
      const bug = makeBug(shape.u);
      Q.bugs.push(bug);
      placeBugAt(shape, bug, s.verts[0][0], s.verts[0][1]);
    });

    await E.sayWait('兩個圖形，點一下就讓瓢蟲繞一圈！看看誰的周長比較長！', 3400);
    Q.phase = 'walk';
    reshowHintForPhase();

    await new Promise((resolve, reject) => {
      E.run.waiters.push({ reject });
      Q.shapes.forEach((shape, i) => {
        shape.box.onclick = async () => {
          if (Q.phase !== 'walk' || shape.walked || Q.walking || E.run.cancelled) return;
          Q.walking = true;                       // 一次只走一個形，避免兩形交錯共用 sum
          sfx.unlock();
          E.hideHint(true);
          Q.sum = 0; periNum.textContent = '0';
          try {
            for (let k = 0; k < shape.edges.length; k++) {
              glowNext(shape, k);
              await walkEdge(shape, Q.bugs[i], k, { count: true, dur: 120, noBig: true });
            }
          } catch (err) { Q.walking = false; if (err.isCancel) return; throw err; }
          shape.walked = true; Q.walking = false;
          E.counterHide();
          shape.perimEl.textContent = '周長 ' + shape.perimeter;
          shape.box.classList.remove('tappable');
          Q.walkedShapes++;
          if (Q.walkedShapes >= 2) { Q.phase = 'anim'; resolve(); }
          else reshowHintForPhase();
        };
      });
    });

    await E.sleep(300);
    await askKeyOptions(q.options, q.answer, '誰的周長比較長呢？', async () => {
      await E.worryWait('看周長的數字！比較大的那個才是周長比較長，不是看誰看起來比較大喔！', 4000);
    });
    const win = q.shapes.find((s) => s.key === q.answer);
    E.caption('周長 ' + win.perimeter + ' 比較長！');
    E.speech.speak('答對了！周長比較長的是這個！');
    await E.sleep(1200);
    await E.speechDrain('答對了！周長比較長的是這個！');
  }

  /* ---------------- 提問 ---------------- */
  function askOptions(values, correct, sayText, onWrong) {
    return askGeneric(values.map((v) => ({ v, label: String(v) })), correct, sayText, onWrong);
  }
  function askKeyOptions(objs, correct, sayText, onWrong) {
    return askGeneric(objs.map((o) => ({ v: o.key, label: o.label })), correct, sayText, onWrong);
  }
  function askGeneric(items, correct, sayText, onWrong) {
    Q.phase = 'answer';
    Q.askValue = correct;
    answersEl.innerHTML = '';
    E.say(sayText);
    return new Promise((resolve, reject) => {
      E.run.waiters.push({ reject });
      let busy = false;
      items.forEach((it) => {
        const b = document.createElement('button');
        b.className = 'ans-btn';
        b.textContent = it.label;
        b.dataset.v = it.v;
        b.addEventListener('click', async () => {
          if (busy || E.run.cancelled) return;
          if (String(it.v) === String(correct)) {
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
              await onWrong(it.v);
              Q.phase = 'answer';
              E.say('現在知道了嗎？');
            } catch (err) { if (err.isCancel) return reject(err); }
            busy = false;
          }
        });
        answersEl.appendChild(b);
      });
    });
  }

  /* ---------------- 提示 ---------------- */
  function reshowHintForPhase() {
    if (!Q || Q.phase !== 'walk') return;
    if (Q.q.type === 'compare') {
      const s = Q.shapes.find((x) => !x.walked);
      if (s) { const c = E.centerOf(s.box); E.showHint(c, c); }
    } else {
      const c = E.centerOf(walkBtn);
      E.showHint({ x: c.x, y: c.y - 26 }, c);
    }
  }

  /* ---------------- 一場 ---------------- */
  const praises = ['太厲害了！', '周長數對了！', '好聰明！', '答對了！', '你是周長高手！'];

  function clearStage() {
    for (const el2 of spriteLayer.querySelectorAll('.sprite')) {
      if (el2.__sprite) el2.__sprite.destroy(); else el2.remove();
    }
    shapesRow.innerHTML = '';
    answersEl.innerHTML = '';
    walkBtn.disabled = false;
    walkBtn.onclick = null;
    walkBtn.style.visibility = '';
    walkBar.classList.add('hidden');
    periNum.textContent = '0';
    E.counterHide();
    E.hideHint(false);
  }

  async function runSession(lv) {
    E.newRun();
    G.lv = lv;
    G.qIndex = 0; G.wrongTotal = 0;
    const rng = new PL.Rng(E.URL_SEED != null ? E.URL_SEED : undefined);
    G.session = PL.generateSession(Number(lv.slice(2)), { rng });
    for (const el2 of starsEl.children) el2.classList.remove('lit');
    E.el.bubble.classList.remove('show', 'warn');
    pdLabel.textContent = '周長';
    E.showScreen('game');

    try {
      for (let i = 0; i < G.session.length; i++) {
        G.qIndex = i;
        const q = G.session[i];
        Q = newRound(q);
        clearStage();
        await E.sleep(420);
        if (q.type === 'compare') await runCompareQuestion(q);
        else await runWalkQuestion(q, Number(lv.slice(2)));

        Q.phase = 'done';
        await E.sleep(300);
        starsEl.children[i].classList.add('lit');
        sfx.fanfare();
        await E.sayWait(praises[i % praises.length], 2000);
      }
      await showEnd();
    } catch (e) {
      if (!e.isCancel) { console.error(e); throw e; }
    }
  }

  async function showEnd() {
    Q = null;
    clearStage();
    if (window.Starmap) window.Starmap.add('perimeter', G.lv, Math.max(1, G.session.length - G.wrongTotal));
    $('end-stars').textContent = '⭐'.repeat(G.session.length);
    const msg = G.wrongTotal === 0 ? '每一圈都繞得好準！' : '多繞幾圈，周長會越來越熟！';
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
  function bindUI() {
    document.querySelectorAll('.mode-btn').forEach((b) => {
      b.addEventListener('click', () => {
        sfx.unlock(); E.speech.prime(); sfx.tap();
        runSession(b.dataset.mode);
      });
    });
    $('btn-home').addEventListener('click', () => {
      sfx.tap(); E.speech.stop();
      E.cancelRun(); Q = null; clearStage();
      E.showScreen('title');
    });
    $('btn-sound').addEventListener('click', () => {
      E.setSoundOn(!E.soundOn);
      $('btn-sound').textContent = E.soundOn ? '🔊' : '🔇';
      sfx.tap();
    });
    $('btn-again').addEventListener('click', () => {
      sfx.unlock(); E.speech.stop(); E.speech.prime(); sfx.tap(); runSession(G.lv);
    });
    $('btn-menu').addEventListener('click', () => { sfx.tap(); E.speech.stop(); E.showScreen('title'); });
    E.bindLifecycle({});
  }

  /* ---------------- 測試掛勾 ---------------- */
  window.__test = {
    get screen() { return E.currentScreen; },
    get phase() { return Q ? Q.phase : 'idle'; },
    get qIndex() { return G.qIndex; },
    get session() { return G.session; },
    get problem() { return Q ? Q.q : null; },
    get askValue() { return Q ? Q.askValue : null; },
    get sum() { return Q ? Q.sum : 0; },
    get walkedShapes() { return Q ? Q.walkedShapes : 0; },
    get wrongTotal() { return G.wrongTotal; },
    startLevel(lv) { runSession(lv); },
    pump() { E.pumpTimers(); },
    flush() { for (const w of E.run.waiters.slice()) if (w.settle && w.deadline) w.settle(); },
    edgeCount() { return Q && Q.shapes[0] ? Q.shapes[0].edges.length : 0; },
    walkStep() {                 // lv1/lv2：走一邊
      if (!Q || Q.phase !== 'walk' || walkBtn.disabled) return false;
      walkBtn.click(); return true;
    },
    tapShape(i) {                // lv3：讓某形繞一圈
      if (!Q || Q.phase !== 'walk' || !Q.shapes[i]) return false;
      if (Q.shapes[i].box.onclick) Q.shapes[i].box.onclick();
      return true;
    },
    clickAnswer(correct) {
      if (!Q || Q.askValue == null) return false;
      const want = String(Q.askValue);
      for (const b of answersEl.querySelectorAll('.ans-btn')) {
        const v = b.dataset.v;
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
      const labels = { lv1: '🐜 繞一圈數格子', lv2: '➕ 邊長加加看', lv3: '⚖️ 誰的周長長' };
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
