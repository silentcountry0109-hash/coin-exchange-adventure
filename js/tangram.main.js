/* ============================================================
   七巧板 — 圖形組合與空間旋轉
   操作：拖曳拼塊、點一下轉 45°；放對位置＋方向就吸附
   lv1 形狀變變變：2~3 塊拼基本形 → 問「是什麼形狀？」
   lv2 圖案拼拼樂：4~5 塊拼圖案（有虛線內框）→ 數三角形
   lv3 影子挑戰：只有黑影；💡偷看內框要扣一顆星
   共用 js/engine.js；starmap key: ('tangram','lv1'..'lv3')
   ============================================================ */
(function () {
  'use strict';

  const TG = window.TangramLogic;
  const sfx = window.sfx;
  const $ = (id) => document.getElementById(id);
  const E = Engine.create({ reshowHint: reshowHintForPhase });

  /* ---------------- DOM ---------------- */
  const app = $('app');
  const screens = { title: $('screen-title'), game: $('screen-game'), end: $('screen-end') };
  const spriteLayer = $('sprite-layer');
  const stage = $('tangram-stage');
  const holder = $('puzzle-holder');
  const hintBtn = $('btn-hint');
  const answersEl = $('answers');
  const pdLabel = $('pd-label');
  const starsEl = $('stars');
  E.registerScreens(screens, 'title');

  const SVGNS = 'http://www.w3.org/2000/svg';
  const MARGIN = 0.6; // 剪影 svg 的留邊（格）

  // 拼塊顏色（同型第二塊用第二色）
  const COLORS = {
    lt: ['#f76d6d', '#ffb03a'],
    mt: ['#b79bf0'],
    st: ['#7fd3f7', '#9fd86b'],
    sq: ['#f9a8c9'],
    par: ['#5ec9b4'],
  };

  /* ---------------- 狀態 ---------------- */
  const G = { lv: 'lv1', session: [], qIndex: 0, wrongTotal: 0, saidHow: false };
  let Q = null;

  function newRound(q) {
    return {
      q,
      fig: q.fig,
      phase: 'idle',    // build / answer / anim / done
      u: 22,
      svg: null,
      slots: [],        // {type, rot, flip, sym, centroid, pts, filled, el}
      pieces: [],       // Sprite（帶 meta）
      askValue: null,
      wrongAnswers: 0,
      wrongRotDrops: 0,
      peeking: false,
      lastWorryAt: 0,
    };
  }

  /* ---------------- 版面與座標 ---------------- */
  function layoutPuzzle(fig) {
    const r = stage.getBoundingClientRect();
    const availW = r.width - 24;
    const availH = r.height * 0.58;
    const u = Math.min(availW / (fig.bbox.w + 2 * MARGIN), availH / (fig.bbox.h + 2 * MARGIN), 30);
    const svgW = (fig.bbox.w + 2 * MARGIN) * u;
    const svgH = (fig.bbox.h + 2 * MARGIN) * u;
    return { u, svgW, svgH, left: (r.width - svgW) / 2, top: 12 };
  }
  // 圖案格座標 → client px
  function figToClient(gx, gy) {
    const r = Q.svg.getBoundingClientRect();
    return {
      x: r.left + ((gx + MARGIN) / (Q.fig.bbox.w + 2 * MARGIN)) * r.width,
      y: r.top + ((gy + MARGIN) / (Q.fig.bbox.h + 2 * MARGIN)) * r.height,
    };
  }
  const figToLayer = (gx, gy) => E.toLayer(figToClient(gx, gy));

  function svgEl(tag, attrs) {
    const e2 = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e2.setAttribute(k, attrs[k]);
    return e2;
  }
  const ptsAttr = (pts) => pts.map(([x, y]) => x.toFixed(3) + ',' + y.toFixed(3)).join(' ');

  /* ---------------- 剪影與目標框 ---------------- */
  function buildPuzzle(q) {
    const L = layoutPuzzle(q.fig);
    Q.u = L.u;
    const svg = svgEl('svg', {
      viewBox: (-MARGIN) + ' ' + (-MARGIN) + ' '
        + (q.fig.bbox.w + 2 * MARGIN) + ' ' + (q.fig.bbox.h + 2 * MARGIN),
      width: L.svgW, height: L.svgH,
    });
    svg.style.left = L.left + 'px';
    svg.style.top = L.top + 'px';
    holder.appendChild(svg);
    Q.svg = svg;

    const shadow = q.type === 'shadow';
    Q.slots = q.fig.pieces.map((p) => {
      const el = svgEl('polygon', {
        points: ptsAttr(p.pts),
        class: 'slot-poly' + (shadow ? ' shadow' : ''),
        'stroke-width': shadow ? 0.09 : 0.1,
      });
      svg.appendChild(el);
      return {
        type: p.type, rot: p.rot, flip: p.flip,
        sym: TG.PIECES[p.type].sym,
        centroid: p.centroid, pts: p.pts,
        filled: false, el,
      };
    });
  }

  /* ---------------- 拼塊 sprite ---------------- */
  function localOffsets(type) {
    const P = TG.PIECES[type].poly;
    const c0 = TG.polyCentroid(P);
    return P.map(([x, y]) => [x - c0[0], y - c0[1]]);
  }
  function makePiece(slot, colorIdx) {
    const L0 = localOffsets(slot.type);
    const Ld = slot.flip ? L0.map(([x, y]) => [-x, y]) : L0;
    let R = 0;
    for (const [x, y] of L0) R = Math.max(R, Math.hypot(x, y));
    R += 0.4;
    const color = COLORS[slot.type][colorIdx % COLORS[slot.type].length];
    const html = '<svg class="piece-svg" viewBox="' + (-R) + ' ' + (-R) + ' ' + (2 * R) + ' ' + (2 * R)
      + '" xmlns="http://www.w3.org/2000/svg">'
      + '<polygon points="' + ptsAttr(Ld) + '" fill="' + color + '"/></svg>';
    const sp = new E.Sprite('piece', html);
    sp.el.style.width = (2 * R * Q.u) + 'px';
    sp.el.style.height = (2 * R * Q.u) + 'px';
    sp.type = slot.type;
    sp.sym = slot.sym;
    sp.flip = slot.flip;
    sp.rotSteps = 0;
    sp.placed = false;
    sp.L0 = L0;
    sp.visR = R - 0.4; // 可見最大半徑（格）：生成/丟放收斂用
    return sp;
  }
  function applyRot(sp, animate) {
    const svg = sp.el.querySelector('.piece-svg');
    svg.style.transition = (animate && !E.FAST) ? 'transform 160ms ease-out' : 'none';
    svg.style.transform = 'rotate(' + sp.rotSteps * 45 + 'deg)';
  }

  // 點到多邊形邊緣的距離（格）；在內部回 0
  function distToPolyLocal(x, y, poly) {
    if (TG.pointInPoly(x, y, poly)) return 0;
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
      const dx = x2 - x1, dy = y2 - y1;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((x - x1) * dx + (y - y1) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
    }
    return best;
  }
  // 以「多邊形內含測試」找被點到的拼塊（方形外框重疊時不誤抓）；
  // 沒直接命中時放寬 ~12px 找最近的塊——小三角形太薄，小小孩指腹會偏
  function hitPiece(clientX, clientY) {
    const L = E.layerRect();
    const els = spriteLayer.querySelectorAll('.sprite.piece');
    let near = null, nearD = Infinity;
    for (let i = els.length - 1; i >= 0; i--) {
      const sp = els[i].__sprite;
      if (!sp || sp.placed || sp.dead) continue;
      const gx = (clientX - (L.left + sp.x)) / Q.u;
      const gy = (clientY - (L.top + sp.y)) / Q.u;
      let [vx, vy] = TG.rotPt(gx, gy, -sp.rotSteps);
      if (sp.flip) vx = -vx;
      const d = distToPolyLocal(vx, vy, sp.L0);
      if (d === 0) return sp;
      if (d < nearD) { nearD = d; near = sp; }
    }
    return nearD <= Math.max(12 / Q.u, 0.4) ? near : null;
  }

  /* ---------------- 吸附判定 ---------------- */
  function slotCenterLayer(slot) { return figToLayer(slot.centroid[0], slot.centroid[1]); }

  /* quiet：點轉後的靜默檢查——只在「方向對了」時吸附，不觸發任何錯誤回饋 */
  function trySnap(sp, opts) {
    const quiet = !!(opts && opts.quiet);
    const snapPx = Math.max(20, Q.u * 1.15);
    const cands = [];
    for (const s of Q.slots) {
      if (s.filled || s.type !== sp.type) continue;
      const c = slotCenterLayer(s);
      const d = Math.hypot(c.x - sp.x, c.y - sp.y);
      if (d <= snapPx) cands.push({ s, c, d });
    }
    cands.sort((a, b) => a.d - b.d);
    const rotOK = (s) => (((sp.rotSteps - s.rot) % s.sym) + s.sym) % s.sym === 0;
    const hit = cands.find((x) => rotOK(x.s));

    if (hit) {
      sp.placed = true;
      hit.s.filled = true;
      sp.el.classList.add('locked');
      sp.glideTo(hit.c.x, hit.c.y, { dur: 160 });
      sfx.alignDing();
      const cc = figToClient(hit.s.centroid[0], hit.s.centroid[1]);
      E.burstStars(cc.x, cc.y, 6);
      E.hideHint(true);
      if (Q.slots.every((s) => s.filled)) {
        Q.phase = 'anim';
        E.hideHint(false);
        E.fireSignal();
      }
      return;
    }
    if (quiet) return; // 點轉檢查：還沒轉對就安靜等下一下
    if (cands.length) {
      // 位置對了、方向不對
      Q.wrongRotDrops++;
      if (!E.FAST) {
        const svg = sp.el.querySelector('.piece-svg');
        const base = 'rotate(' + sp.rotSteps * 45 + 'deg)';
        svg.animate([
          { transform: base }, { transform: 'rotate(' + (sp.rotSteps * 45 + 10) + 'deg)' },
          { transform: 'rotate(' + (sp.rotSteps * 45 - 10) + 'deg)' }, { transform: base },
        ], { duration: 340, easing: 'ease-in-out' });
      }
      // 節流窗要比整句語音長，重試時才不會每次都砍掉重講；
      // worry 內建 uhoh，被節流時才自己播一聲，一次錯放只有一聲哎呀
      const now = performance.now();
      if (now - Q.lastWorryAt > 5200) {
        Q.lastWorryAt = now;
        E.worry('位置對了！點一下拼板，它就會轉方向喔！');
      } else {
        sfx.uhoh();
      }
      if (Q.wrongRotDrops >= 2) showGhost(cands[0].s);
      return;
    }
    clampIntoStage(sp);
  }

  // 掉在空地／被系統中斷：留在原地，但整塊都要看得見
  function clampIntoStage(sp) {
    const r = stage.getBoundingClientRect();
    const m = sp.visR * Q.u;
    const p = E.toLayer({
      x: Math.min(Math.max(E.layerRect().left + sp.x, r.left + m), r.right - m),
      y: Math.min(Math.max(E.layerRect().top + sp.y, r.top + m * 0.8), r.bottom - m),
    });
    if (Math.abs(p.x - sp.x) > 1 || Math.abs(p.y - sp.y) > 1) sp.glideTo(p.x, p.y, { dur: 240 });
  }

  let ghostTimer = null;
  function showGhost(slot) {
    if (!Q.svg || Q.svg.querySelector('.ghost-poly')) return;
    const g = svgEl('polygon', { points: ptsAttr(slot.pts), class: 'ghost-poly', 'stroke-width': 0.16 });
    Q.svg.appendChild(g);
    clearTimeout(ghostTimer);
    ghostTimer = setTimeout(() => g.remove(), E.ms(2000));
  }

  /* ---------------- 拖曳／點轉 ---------------- */
  const drag = { active: false, pointerId: null, sp: null, moved: false, x0: 0, y0: 0, t0: 0, ox: 0, oy: 0 };

  function onLayerPointerDown(e) {
    if (!Q || Q.phase !== 'build' || drag.active) return;
    // 按鈕優先：拼板的 12px 容差不可以搶走 💡/🏠 的點擊
    if (e.target && e.target.closest && e.target.closest('button, a')) return;
    const sp = hitPiece(e.clientX, e.clientY);
    if (!sp) return;
    e.preventDefault();
    sfx.unlock();
    drag.active = true;
    drag.pointerId = e.pointerId;
    drag.sp = sp;
    drag.moved = false;
    drag.x0 = e.clientX; drag.y0 = e.clientY; drag.t0 = performance.now();
    const p = E.toLayer({ x: e.clientX, y: e.clientY });
    drag.ox = sp.x - p.x; drag.oy = sp.y - p.y;
    spriteLayer.appendChild(sp.el); // 帶到最上層
  }
  function onPointerMove(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 9) {
      drag.moved = true;
      drag.sp.el.classList.add('dragging');
      sfx.grab();
      E.hideHint(true);
    }
    if (!drag.moved) return;
    const p = E.toLayer({ x: e.clientX, y: e.clientY });
    const sp = drag.sp;
    sp.el.style.transition = 'none';
    sp.x = p.x + drag.ox;
    sp.y = p.y + drag.oy;
    sp.apply();
  }
  function onPointerUp(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    const sp = drag.sp;
    drag.active = false; drag.sp = null;
    sp.el.classList.remove('dragging');
    if (!Q || Q.phase !== 'build' || sp.placed) return;
    if (e.type === 'pointercancel') {
      // 系統中斷（來電/手勢/切 App）：只歸位，不當點轉也不評分
      if (drag.moved) clampIntoStage(sp);
      return;
    }
    if (!drag.moved && performance.now() - drag.t0 < 500) {
      // 點一下＝轉 45°；轉到對的方向且已放在框上就直接吸附
      sp.rotSteps = (sp.rotSteps + 1) % 8;
      sfx.tap();
      applyRot(sp, true);
      E.hideHint(true);
      trySnap(sp, { quiet: true });
    } else if (drag.moved) {
      trySnap(sp);
    }
  }

  /* ---------------- 偷看提示（lv3） ---------------- */
  async function onHintTap() {
    if (!Q || Q.phase !== 'build' || Q.peeking || Q.q.type !== 'shadow') return;
    const round = Q;
    round.peeking = true;
    G.wrongTotal++;
    hintBtn.classList.add('used');
    sfx.pop();
    E.say('偷看一下下，記好囉！');
    for (const s of round.slots) s.el.classList.add('peek');
    try { await E.sleep(2600); } catch (err) { /* 回首頁等取消 */ } finally {
      for (const s of round.slots) s.el.classList.remove('peek');
      round.peeking = false;
      hintBtn.classList.remove('used');
    }
  }

  /* ---------------- 提示小手 ---------------- */
  function reshowHintForPhase() {
    if (!Q || Q.phase !== 'build') return;
    const slot = Q.slots.find((s) => !s.filled);
    if (!slot) return;
    const rotOK = (sp) => (((sp.rotSteps - slot.rot) % slot.sym) + slot.sym) % slot.sym === 0;
    const frees = Q.pieces.filter((sp) => !sp.placed && sp.type === slot.type);
    const sp = frees.find(rotOK) || frees[0];
    if (!sp) return;
    const L = E.layerRect();
    const from = { x: L.left + sp.x, y: L.top + sp.y };
    E.showHint(from, figToClient(slot.centroid[0], slot.centroid[1]));
  }

  /* ---------------- 提問 ---------------- */
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
        b.textContent = it;
        b.dataset.v = it;
        b.addEventListener('click', async () => {
          if (busy || E.run.cancelled) return;
          if (String(it) === String(correct)) {
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
              await onWrong(it);
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

  /* ---------------- 拼好的慶祝 ---------------- */
  async function celebrate(q) {
    sfx.magic();
    for (const sp of Q.pieces) {
      sp.pulse().catch(() => {});
      await E.sleep(80);
    }
    if (q.fig.eye) {
      const p = figToLayer(q.fig.eye[0], q.fig.eye[1]);
      const d = Math.max(10, Q.u * 0.95);
      const eye = new E.Sprite('fig-eye',
        '<svg viewBox="-10 -10 20 20" style="display:block;width:100%;height:100%">'
        + '<circle r="8" fill="#fff" stroke="#3a3844" stroke-width="2.4"/>'
        + '<circle cx="1.6" r="3.6" fill="#3a3844"/></svg>');
      eye.el.style.width = d + 'px';
      eye.el.style.height = d + 'px';
      eye.placeAt(p.x, p.y, { scale: 0.2 });
      eye.glideTo(p.x, p.y, { scale: 1, dur: 260 });
      sfx.pop();
    }
    await E.sleep(500);
  }

  /* ---------------- 三種題型 ---------------- */
  async function spawnPieces(q) {
    const rng = new TG.Rng((E.URL_SEED != null ? E.URL_SEED : 3) * 17 + G.qIndex * 7 + 1);
    const stageR = stage.getBoundingClientRect();
    const svgR = Q.svg.getBoundingClientRect();
    const trayTop = svgR.bottom - stageR.top + 26;
    const trayBottom = stageR.height - 30;
    const order = rng.shuffle(Q.slots.map((s, i) => i));
    const colorCount = {};
    const n = order.length;
    for (let k = 0; k < n; k++) {
      const slot = Q.slots[order[k]];
      const idx = colorCount[slot.type] || 0;
      colorCount[slot.type] = idx + 1;
      const sp = makePiece(slot, idx);
      sp.rotSteps = rng.int(0, 7);
      applyRot(sp, false);
      // 用可見半徑收斂生成位置，任何轉向下整塊都在舞台內
      const vis = sp.visR * Q.u;
      const rawX = stageR.left + stageR.width * ((k + 0.5) / n);
      const fx = Math.min(Math.max(rawX, stageR.left + vis), stageR.right - vis);
      const rawY = stageR.top + trayTop + (trayBottom - trayTop - 26) * (k % 2 === 0 ? 0.12 : 0.62)
        + rng.int(-6, 6);
      const fy = Math.min(rawY, stageR.bottom - vis);
      const p = E.toLayer({ x: fx, y: fy });
      sp.placeAt(p.x, p.y, { scale: 0.2 });
      sp.glideTo(p.x, p.y, { scale: 1, dur: 240 });
      sfx.pop();
      Q.pieces.push(sp);
      await E.sleep(70);
    }
  }

  async function runBuild(q, introText) {
    buildPuzzle(q);
    await spawnPieces(q);
    await E.sayWait(introText, 2600);
    if (!G.saidHow) {
      G.saidHow = true;
      await E.sayWait('點一下拼板會旋轉，拖一拖放進去！', 2600);
    }
    Q.phase = 'build';
    if (q.type === 'shadow') hintBtn.classList.add('show');
    reshowHintForPhase();
    await E.waitSignal(); // 全部吸附完成
    hintBtn.classList.remove('show');
  }

  async function runShapeQuestion(q) {
    pdLabel.textContent = '神祕形狀 ' + (G.qIndex + 1) + ' 號';
    await runBuild(q, '把 ' + q.fig.pieces.length + ' 塊拼板拼進虛線框！會變出什麼形狀呢？');
    sfx.yay();
    await E.sleep(400);
    await askGeneric(q.options, q.answer, '登登！拼出來的是什麼形狀？', async () => {
      await E.worryWait('再看一次輪廓～' + q.lesson, 3000);
    });
    E.caption(q.answer + '！');
    if (q.say) await E.sayWait(q.say, 2000); // 例：斜斜放也是正方形喔！
    E.speech.speak(q.lesson);
    await E.sleep(1200);
    await E.speechDrain(q.lesson);
  }

  async function runCountQuestion(q) {
    pdLabel.textContent = '拼：' + q.zh;
    await runBuild(q, '一起來拼「' + q.zh + '」！');
    await celebrate(q);
    E.caption(q.zh + '完成！');
    await E.sayWait(q.say || ('是' + q.zh + '耶！'), 2200);
    await askGeneric(q.options, q.answer, '這個' + q.zh + '，用了幾塊「三角形」呢？', async () => {
      await E.worryWait('我們一塊一塊數！只數尖尖的三角形喔！', 2600);
      let k = 0;
      for (const sp of Q.pieces) {
        if (!TG.PIECES[sp.type].isTri) continue;
        k++;
        sp.pulse().catch(() => {});
        sfx.tick(k);
        E.counterShow(k, 30);
        await E.sleep(500);
      }
      await E.sleep(400);
      E.counterHide();
    });
    E.caption('三角形有 ' + q.answer + ' 塊！');
    E.speech.speak('三角形有 ' + q.answer + ' 塊！');
    await E.sleep(1000);
    await E.speechDrain('三角形有 ' + q.answer + ' 塊！');
  }

  async function runShadowQuestion(q) {
    pdLabel.textContent = '影子：' + q.zh;
    await runBuild(q, '影子挑戰！看黑黑的影子，把「' + q.zh + '」拼出來！');
    await celebrate(q);
    E.caption(q.zh + '完成！');
    await E.sayWait(q.say || (q.zh + '出現了！'), 2400);
  }

  /* ---------------- 一場 ---------------- */
  const praises = ['拼得真好！', '你是拼圖高手！', '太厲害了！', '形狀魔法師！', '好聰明的手！'];

  function clearStage() {
    drag.active = false;
    drag.sp = null;
    for (const el2 of spriteLayer.querySelectorAll('.sprite')) {
      if (el2.__sprite) el2.__sprite.destroy(); else el2.remove();
    }
    holder.innerHTML = '';
    answersEl.innerHTML = '';
    hintBtn.classList.remove('show', 'used');
    clearTimeout(ghostTimer);
    E.counterHide();
    E.hideHint(false);
  }

  async function runSession(lv) {
    E.newRun();
    G.lv = lv;
    G.qIndex = 0; G.wrongTotal = 0; G.saidHow = false;
    const rng = new TG.Rng(E.URL_SEED != null ? E.URL_SEED : undefined);
    G.session = TG.generateSession(Number(lv.slice(2)), { rng });
    for (const el2 of starsEl.children) el2.classList.remove('lit');
    // 清掉上一場殘留的泡泡與標籤（回首頁/再玩一次都會走這裡）
    E.el.bubble.classList.remove('show', 'warn');
    pdLabel.textContent = '七巧板';
    E.showScreen('game');

    try {
      for (let i = 0; i < G.session.length; i++) {
        G.qIndex = i;
        const q = G.session[i];
        Q = newRound(q);
        clearStage();
        await E.sleep(400);
        if (q.type === 'shape') await runShapeQuestion(q);
        else if (q.type === 'count') await runCountQuestion(q);
        else await runShadowQuestion(q);

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
    if (window.Starmap) window.Starmap.add('tangram', G.lv, Math.max(1, G.session.length - G.wrongTotal));
    $('end-stars').textContent = '⭐'.repeat(G.session.length);
    const msg = G.wrongTotal === 0 ? '每一塊都放得剛剛好！' : '多拼幾次，手會越來越巧！';
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
      sfx.unlock(); E.speech.stop(); E.speech.prime(); sfx.tap();
      runSession(G.lv);
    });
    $('btn-menu').addEventListener('click', () => { sfx.tap(); E.speech.stop(); E.showScreen('title'); });
    hintBtn.addEventListener('click', onHintTap);

    // 綁 document 不綁 sprite-layer：拼板命中區縮成多邊形後，
    // 「差一點點」的點擊會落到下層元素，得在上游用 hitPiece 容差接住
    document.addEventListener('pointerdown', onLayerPointerDown, { passive: false });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    E.bindLifecycle({});
  }

  /* ---------------- 測試掛勾 ---------------- */
  window.__test = {
    get screen() { return E.currentScreen; },
    get phase() { return Q ? Q.phase : 'idle'; },
    get qIndex() { return G.qIndex; },
    get session() { return G.session; },
    get askValue() { return Q ? Q.askValue : null; },
    get wrongTotal() { return G.wrongTotal; },
    pieces() {
      return Q ? Q.pieces.map((sp) => ({
        type: sp.type, rot: sp.rotSteps, flip: sp.flip, sym: sp.sym, placed: sp.placed,
      })) : [];
    },
    slots() {
      return Q ? Q.slots.map((s) => ({ type: s.type, rot: s.rot, flip: s.flip, sym: s.sym, filled: s.filled })) : [];
    },
    startLevel(lv) { runSession(lv); },
    pump() { E.pumpTimers(); },
    centers: {
      piece(i) {
        if (!Q || !Q.pieces[i]) return null;
        const L = E.layerRect();
        return { x: L.left + Q.pieces[i].x, y: L.top + Q.pieces[i].y };
      },
      slot(i) {
        if (!Q || !Q.slots[i]) return null;
        return figToClient(Q.slots[i].centroid[0], Q.slots[i].centroid[1]);
      },
      hintBtn() { return E.centerOf(hintBtn); },
    },
    hint() { hintBtn.click(); },
    drag(x0, y0, x1, y1) {
      const opt = (x, y) => ({
        bubbles: true, cancelable: true, composed: true,
        pointerId: 7, isPrimary: true, pointerType: 'touch',
        clientX: x, clientY: y, button: 0, buttons: 1,
      });
      spriteLayer.dispatchEvent(new PointerEvent('pointerdown', opt(x0, y0)));
      const steps = 6;
      for (let i = 1; i <= steps; i++) {
        window.dispatchEvent(new PointerEvent('pointermove',
          opt(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps)));
      }
      window.dispatchEvent(new PointerEvent('pointerup', opt(x1, y1)));
      return true;
    },
    tapPiece(i) {
      const c = this.centers.piece(i);
      if (!c) return false;
      return this.drag(c.x, c.y, c.x, c.y);
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
    hintBtn.innerHTML = '💡<span class="cost">−⭐</span>';
    bindUI();
    E.playScreenChars('title');
    const valid = /^lv[123]$/;
    if (E.URL_MODE && valid.test(E.URL_MODE)) {
      E.speech.on = false;
      runSession(E.URL_MODE);
    } else if (E.URL_PLAY && valid.test(E.URL_PLAY)) {
      const labels = { lv1: '🔷 形狀變變變', lv2: '🧩 圖案拼拼樂', lv3: '🌙 影子挑戰' };
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
