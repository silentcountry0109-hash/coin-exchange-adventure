/* ============================================================
   一位小數 — 量杯十分之一・數線・小數加法
   lv1 讀小數：量杯裝到 k 格，一格一格點數 → 0.k（含 1 又幾）
   lv2 數線找家：把青蛙拖到指定小數的刻度
   lv3 小數加法：兩杯相倒，滿 10 格換成一整瓶＝進位
   共用 js/engine.js；starmap key: ('decimal','lv1'..'lv3')
   ============================================================ */
(function () {
  'use strict';

  const DL = window.DecimalLogic;
  const sfx = window.sfx;
  const $ = (id) => document.getElementById(id);
  const E = Engine.create({ reshowHint: reshowHintForPhase });

  /* ---------------- DOM ---------------- */
  const app = $('app');
  const screens = { title: $('screen-title'), game: $('screen-game'), end: $('screen-end') };
  const spriteLayer = $('sprite-layer');
  const stage = $('dec-stage');
  const cupsRow = $('cups-row');
  const numline = $('numline');
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

  /* ---------------- 狀態 ---------------- */
  const G = { lv: 'lv1', session: [], qIndex: 0, wrongTotal: 0 };
  let Q = null;

  function newRound(q) {
    return {
      q, phase: 'idle',     // count / place / pour / answer / anim / done
      askValue: null,
      counted: 0,           // lv1 已點格數
      cups: [],             // buildCup 回傳
      frog: null,           // lv2 青蛙 sprite
      line: null,           // lv2 數線幾何
      poured: false,
      wrongAnswers: 0,
      lastWorryAt: 0,
    };
  }

  /* ---------------- 量杯 SVG ---------------- */
  const CUP = { W: 46, H: 100, cell: 10 };
  const cupBodyPath = 'M0 0 L0 92 Q0 100 8 100 L38 100 Q46 100 46 92 L46 0';

  // 造一個量杯；level=裝幾格（0..10）。回傳 { box, svg, cells[], water, setLevel, cap }
  function buildCup(level, sizePx, opts) {
    opts = opts || {};
    const box = document.createElement('div');
    box.className = 'cup-box';
    const vbW = 82, vbH = 122;
    const svg = el('svg', {
      viewBox: '-8 -12 ' + vbW + ' ' + vbH,
      width: sizePx, height: Math.round(sizePx * vbH / vbW), class: 'cup-svg',
    });
    const clipId = 'cupclip' + Math.floor(Math.random() * 1e9);
    const defs = el('defs', {});
    const clip = el('clipPath', { id: clipId });
    clip.appendChild(el('path', { d: cupBodyPath }));
    defs.appendChild(clip); svg.appendChild(defs);

    // 手把
    svg.appendChild(el('path', {
      d: 'M46 20 Q66 24 66 46 Q66 68 46 72', fill: 'none',
      stroke: '#3a3844', 'stroke-width': 5, 'stroke-linecap': 'round',
    }));
    // 杯身底（白）
    svg.appendChild(el('path', { d: cupBodyPath, class: 'cup-body' }));
    // 水（夾在杯身內）
    const wg = el('g', { 'clip-path': 'url(#' + clipId + ')' });
    const water = el('rect', { x: 0, y: CUP.H, width: CUP.W, height: 0, class: 'cup-water' });
    wg.appendChild(water);
    svg.appendChild(wg);
    // 格線
    for (let i = 1; i < 10; i++) {
      svg.appendChild(el('line', { x1: 0, y1: CUP.H - i * CUP.cell, x2: CUP.W, y2: CUP.H - i * CUP.cell, class: 'cup-grid' }));
    }
    // 0.5 與 1.0 刻度加粗
    svg.appendChild(el('line', { x1: 0, y1: CUP.H - 5 * CUP.cell, x2: CUP.W, y2: CUP.H - 5 * CUP.cell, class: 'cup-tick' }));
    // 杯身描邊（蓋在水上）
    svg.appendChild(el('path', { d: cupBodyPath, fill: 'none', stroke: '#3a3844', 'stroke-width': 3 }));
    // 杯口
    svg.appendChild(el('ellipse', { cx: 23, cy: 0, rx: 23, ry: 4, fill: '#fff', stroke: '#3a3844', 'stroke-width': 3 }));

    // 可點的格子命中區（透明；lv1 用）
    const cells = [];
    for (let i = 0; i < 10; i++) {
      const r = el('rect', {
        x: 0, y: CUP.H - (i + 1) * CUP.cell, width: CUP.W, height: CUP.cell,
        fill: 'transparent',
      });
      svg.appendChild(r);
      cells.push(r);
    }

    box.appendChild(svg);
    const cap = document.createElement('div');
    cap.className = 'cup-cap';
    box.appendChild(cap);

    function setLevel(k, full) {
      water.setAttribute('y', CUP.H - k * CUP.cell);
      water.setAttribute('height', k * CUP.cell);
      water.classList.toggle('full', !!full);
    }
    setLevel(level, opts.full);
    return { box, svg, cells, water, setLevel, cap };
  }

  // 一整瓶（滿杯）小圖示，代表「1」
  function buildFullJug(sizePx) {
    const c = buildCup(10, sizePx, { full: true });
    c.cap.textContent = '1';
    c.cap.classList.add('q');
    // 一整瓶不需要點格
    c.cells.forEach((r) => r.remove());
    return c;
  }

  /* ---------------- 數線 SVG ---------------- */
  function buildNumline(lineMax) {
    numline.innerHTML = '';
    const padX = 18, W = 340, y = 46, tickH = 9, bigH = 16;
    const x0 = padX, x1 = W - padX;
    const svg = el('svg', { viewBox: '0 0 ' + W + ' 74', preserveAspectRatio: 'xMidYMid meet' });
    const xOf = (t) => x0 + (x1 - x0) * (t / lineMax);
    svg.appendChild(el('line', { x1: x0, y1: y, x2: x1, y2: y, class: 'nl-axis' }));
    for (let t = 0; t <= lineMax; t++) {
      const big = t % 10 === 0;
      svg.appendChild(el('line', {
        x1: xOf(t), y1: y - (big ? bigH : tickH), x2: xOf(t), y2: y, class: 'nl-tick' + (big ? ' big' : ''),
      }));
      if (big) {
        svg.appendChild(el('text', {
          x: xOf(t), y: y + 20, 'text-anchor': 'middle', 'font-size': 15, class: 'nl-num',
        }, String(t / 10)));
      }
    }
    numline.appendChild(svg);
    numline.classList.add('show');
    return { svg, lineMax, xOf, y, W, padX };
  }
  // 數線刻度 t → client 座標
  function tickClient(line, t) {
    const r = line.svg.getBoundingClientRect();
    return {
      x: r.left + (line.xOf(t) / line.W) * r.width,
      y: r.top + (line.y / 74) * r.height,
    };
  }

  /* ---------------- 青蛙 sprite ---------------- */
  function makeFrog(sizePx) {
    const html = '<svg class="frog-svg" viewBox="0 0 60 54" xmlns="http://www.w3.org/2000/svg">'
      + '<ellipse cx="30" cy="50" rx="18" ry="4" fill="rgba(58,56,68,.18)"/>'
      + '<path d="M8 30 Q8 12 30 12 Q52 12 52 30 Q52 46 30 46 Q8 46 8 30 Z" fill="#7ac74f" stroke="#3a3844" stroke-width="3"/>'
      + '<circle cx="18" cy="14" r="8" fill="#7ac74f" stroke="#3a3844" stroke-width="3"/>'
      + '<circle cx="42" cy="14" r="8" fill="#7ac74f" stroke="#3a3844" stroke-width="3"/>'
      + '<circle cx="18" cy="13" r="3.4" fill="#3a3844"/><circle cx="42" cy="13" r="3.4" fill="#3a3844"/>'
      + '<path d="M20 34 Q30 40 40 34" fill="none" stroke="#3a3844" stroke-width="3" stroke-linecap="round"/>'
      + '</svg>';
    const sp = new E.Sprite('frog', html);
    sp.el.style.width = sizePx + 'px';
    sp.el.style.height = Math.round(sizePx * 54 / 60) + 'px';
    return sp;
  }

  /* ---------------- lv1 讀小數 ---------------- */
  async function runReadQuestion(q) {
    pdLabel.textContent = '這杯是多少？';
    cupsRow.innerHTML = '';
    numline.classList.remove('show');
    // 兩杯並排（一整瓶＋杯）要縮小，窄幕才放得下＋號與間距
    const size = q.whole >= 1
      ? Math.min(Math.round(stage.clientWidth * 0.30), 120)
      : Math.min(Math.round(stage.clientWidth * 0.42), 150);

    // 一整杯又幾格：先擺一個滿杯（＝1）再擺一個裝 tenth 格的杯
    const cups = [];
    if (q.whole >= 1) {
      const jug = buildFullJug(size);
      cupsRow.appendChild(jug.box);
      cups.push(jug);
      const plus = document.createElement('div');
      plus.className = 'plus-sign'; plus.textContent = '＋';
      cupsRow.appendChild(plus);
    }
    const main = buildCup(q.tenth, size);
    cupsRow.appendChild(main.box);
    cups.push(main);
    Q.cups = cups;

    await E.sayWait(q.whole >= 1
      ? '一整瓶再加幾格呢？一格一格數數看！'
      : '量杯裡有幾格水呢？一格一格點點看！', 3000);

    // 點數：main 杯的前 q.tenth 格（由下往上、任意順序）
    Q.phase = 'count';
    Q.counted = 0;
    const target = q.tenth;
    E.say('點一格，跳 0.1！');
    reshowHintForPhase();

    if (target === 0) {
      // 剛好整數瓶（理論上 lv1 不會，保險）
      await revealRead(q);
      return;
    }

    await new Promise((resolve, reject) => {
      E.run.waiters.push({ reject });
      const filled = main.cells.slice(0, target);
      filled.forEach((r) => {
        r.style.cursor = 'pointer';
        r.addEventListener('pointerdown', (ev) => {
          if (Q.phase !== 'count' || E.run.cancelled || r.dataset.done) return;
          ev.preventDefault();
          r.dataset.done = '1';
          r.setAttribute('class', 'cup-cell-hot');
          Q.counted++;
          sfx.unlock(); sfx.tick(Q.counted);
          E.tapNum(r, DL.format(Q.counted));   // 跳 0.1, 0.2 ...
          E.hideHint(true);
          if (Q.counted >= target) { Q.phase = 'anim'; resolve(); }
        }, { passive: false });
      });
    });

    await E.sleep(500);
    await revealRead(q);
  }

  async function revealRead(q) {
    const prompt = q.whole >= 1
      ? '一整瓶又 ' + q.tenth + ' 格，合起來是多少？'
      : '這杯水是多少公升？';
    await askOptions(q.options, q.answer, prompt, async () => {
      await E.worryWait(q.whole >= 1
        ? '一整瓶是 1，再 ' + q.tenth + ' 格就是 ' + q.answer + '！'
        : q.tenth + ' 格就是 ' + q.answer + '，十分之 ' + q.tenth + '！', 3200);
    });
    E.caption(q.answer + ' 公升！');
    E.speech.speak('是 ' + q.answer + ' 公升！');
    await E.sleep(1100);
    await E.speechDrain('是 ' + q.answer + ' 公升！');
  }

  /* ---------------- lv2 數線找家 ---------------- */
  async function runPlaceQuestion(q) {
    pdLabel.textContent = '青蛙要跳到 ' + q.answer;
    cupsRow.innerHTML = '';
    const line = Q.line = buildNumline(q.lineMax);
    const frogPx = Math.min(Math.round(stage.clientWidth * 0.13), 52);
    const frog = Q.frog = makeFrog(frogPx);
    frog.pos = 0;
    placeFrogAt(0);
    frog.el.classList.add('grabbable');

    await E.sayWait('青蛙要跳到 ' + q.answer + '！拖拖看，數數格子！', 3000);
    Q.phase = 'place';
    reshowHintForPhase();
    await E.waitSignal(); // 跳到正確刻度
    frog.el.classList.remove('grabbable');

    E.caption('跳到 ' + q.answer + '！');
    E.speech.speak('答對了！這裡就是 ' + q.answer + '！');
    await E.sleep(1200);
    await E.speechDrain('答對了！這裡就是 ' + q.answer + '！');
  }

  function placeFrogAt(t) {
    if (!Q || !Q.frog || !Q.line) return;
    const c = tickClient(Q.line, t);
    const p = E.toLayer(c);
    Q.frog.placeAt(p.x, p.y - Q.frog.el.offsetHeight * 0.4);
    Q.frog.pos = t;
  }
  function pulseTick(t) {
    const c = tickClient(Q.line, t);
    const L = E.layerRect();
    const g = document.createElement('div');
    g.style.cssText = 'position:absolute;left:' + (c.x - L.left - 12) + 'px;top:' + (c.y - L.top - 30)
      + 'px;width:24px;height:44px;border-radius:12px;background:rgba(255,209,102,.55);'
      + 'border:2px solid #d99a1e;pointer-events:none;';
    E.el.fx.appendChild(g);
    g.animate([{ opacity: 0.2 }, { opacity: 1 }, { opacity: 0.2 }],
      { duration: E.ms(1700), iterations: 1 }).onfinish = () => g.remove();
    setTimeout(() => g.remove(), E.ms(1800));
  }

  /* ---------------- lv3 小數加法 ---------------- */
  async function runAddQuestion(q) {
    pdLabel.textContent = DL.format(q.a) + ' ＋ ' + DL.format(q.b);
    cupsRow.innerHTML = '';
    numline.classList.remove('show');
    const size = Math.min(Math.round(stage.clientWidth * 0.30), 118);

    const cupA = buildCup(q.a, size);
    cupA.cap.textContent = DL.format(q.a);
    const plus = document.createElement('div');
    plus.className = 'plus-sign'; plus.textContent = '＋';
    const cupB = buildCup(q.b, size);
    cupB.cap.textContent = DL.format(q.b);
    cupsRow.appendChild(cupA.box);
    cupsRow.appendChild(plus);
    cupsRow.appendChild(cupB.box);
    Q.cups = [cupA, cupB];

    await E.sayWait('兩杯水倒在一起是多少？按「倒！」看看！', 3000);

    // 倒水按鈕
    Q.phase = 'pour';
    const btn = ensurePourBtn();
    btn.classList.add('show');
    Q.poured = false;
    await new Promise((resolve, reject) => {
      E.run.waiters.push({ reject });
      btn.onclick = () => {
        if (Q.phase !== 'pour' || Q.poured || E.run.cancelled) return;
        Q.poured = true;
        btn.classList.remove('show');
        resolve();
      };
      reshowHintForPhase();
    });

    // 動畫：B 一格一格倒進 A
    Q.phase = 'anim';
    let levelA = q.a;
    let jug = null;
    for (let i = 0; i < q.b; i++) {
      levelA++;
      cupB.setLevel(q.b - 1 - i);
      if (levelA <= 10) {
        cupA.setLevel(levelA, levelA === 10);
      }
      sfx.tick(i + 1);
      await E.sleep(230);
      if (levelA === 10) {
        // 滿 10 格 → 換成一整瓶
        E.caption(q.sum > 10 ? '滿 10 格，換成一整瓶！' : '剛剛好一整瓶！');
        sfx.whirr();
        await E.sleep(320);
        sfx.ding();
        jug = buildFullJug(size);
        cupsRow.insertBefore(jug.box, cupA.box);
        const pl = document.createElement('div');
        pl.className = 'plus-sign'; pl.textContent = '＋';
        cupsRow.insertBefore(pl, cupA.box);
        cupA.setLevel(0);
        levelA = 0;
        await E.sleep(400);
      }
    }
    // 標杯身自己的量：換瓶後＝一整瓶(標1)＋剩幾格(如0.3)，孩子自己合成 1.3
    cupA.cap.textContent = DL.format(levelA);
    if (jug) {
      // 換瓶後倒空的來源杯要移除，否則答題列變三杯＋兩＋號會溢出舞台
      cupB.box.remove();
      plus.remove();
    } else {
      cupB.cap.textContent = '';
    }
    Q.cups = jug ? [jug, cupA] : [cupA];

    await E.sleep(300);
    await askOptions(q.options, q.answer,
      DL.format(q.a) + ' ＋ ' + DL.format(q.b) + ' 是多少呢？', async () => {
        await E.worryWait(q.carry
          ? '滿 10 格換一整瓶（就是 1），再加剩下的 ' + (q.sum - 10) + ' 格，是 ' + q.answer + '！'
          : q.a + ' 格加 ' + q.b + ' 格是 ' + q.sum + ' 格，就是 ' + q.answer + '！', 3600);
      });
    E.caption(q.answer + ' 公升！');
    E.speech.speak('合起來是 ' + q.answer + ' 公升！');
    await E.sleep(1200);
    await E.speechDrain('合起來是 ' + q.answer + ' 公升！');
  }

  let pourBtn = null;
  function ensurePourBtn() {
    if (pourBtn) return pourBtn;
    pourBtn = document.createElement('button');
    pourBtn.id = 'pour-btn';
    pourBtn.textContent = '倒！ 🫗';
    stage.appendChild(pourBtn);
    return pourBtn;
  }

  /* ---------------- 提問 ---------------- */
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
        b.dataset.v = v;
        b.addEventListener('click', async () => {
          if (busy || E.run.cancelled) return;
          if (String(v) === String(correct)) {
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
              await onWrong(v);
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

  /* ---------------- lv2 拖曳青蛙 ---------------- */
  const drag = { active: false, pointerId: null };
  function onLayerPointerDown(e) {
    if (!Q || Q.phase !== 'place' || !Q.frog || drag.active) return;
    const t = e.target && e.target.closest ? e.target.closest('.sprite.frog.grabbable') : null;
    if (!t || t.__sprite !== Q.frog) return;
    e.preventDefault();
    drag.active = true; drag.pointerId = e.pointerId;
    sfx.unlock(); sfx.grab();
    Q.frog.el.classList.add('dragging');
    E.hideHint(true);
  }
  function onPointerMove(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    const line = Q.line;
    const r = line.svg.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - (r.left + (line.padX / line.W) * r.width))
      / (((line.W - 2 * line.padX) / line.W) * r.width)));
    const t = Math.round(frac * line.lineMax);
    placeFrogAt(Math.min(line.lineMax, Math.max(0, t)));
  }
  function onPointerUp(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    drag.active = false;
    if (!Q || !Q.frog) return;
    Q.frog.el.classList.remove('dragging');
    if (Q.phase !== 'place') return;
    const q = Q.q;
    if (Q.frog.pos === q.T) {
      Q.phase = 'anim';
      Q.frog.el.classList.remove('grabbable');
      sfx.hop();
      const c = tickClient(Q.line, q.T);
      E.burstStars(c.x, c.y, 10);
      E.fireSignal();
    } else {
      // worry 內建 uhoh；被節流時才自播一聲，避免一次錯放兩聲哎呀
      const now = performance.now();
      if (now - Q.lastWorryAt > 2400) {
        Q.lastWorryAt = now;
        const whole = Math.floor(q.T / 10), tenth = q.T % 10;
        E.worry(whole >= 1
          ? '從 ' + whole + ' 開始，再數 ' + tenth + ' 格！'
          : '從 0 開始，數 ' + tenth + ' 格！');
        pulseTick(q.T);
      } else {
        sfx.uhoh();
      }
    }
  }

  /* ---------------- 提示 ---------------- */
  function reshowHintForPhase() {
    if (!Q) return;
    if (Q.phase === 'count') {
      const main = Q.cups[Q.cups.length - 1];
      const next = main.cells.slice(0, Q.q.tenth).find((r) => !r.dataset.done);
      if (next) { const c = E.centerOf(next); E.showHint(c, { x: c.x, y: c.y - 34 }); }
    } else if (Q.phase === 'place' && Q.frog && Q.line) {
      const from = E.centerOf(Q.frog.el);
      const to = tickClient(Q.line, Q.q.T);
      E.showHint(from, to);
    } else if (Q.phase === 'pour' && pourBtn) {
      const c = E.centerOf(pourBtn);
      E.showHint({ x: c.x, y: c.y - 30 }, c);
    }
  }

  /* ---------------- 一場 ---------------- */
  const praises = ['太厲害了！', '你懂小數了！', '好聰明！', '答對了！', '小數高手！'];

  function clearStage() {
    drag.active = false;
    for (const el2 of spriteLayer.querySelectorAll('.sprite')) {
      if (el2.__sprite) el2.__sprite.destroy(); else el2.remove();
    }
    cupsRow.innerHTML = '';
    numline.innerHTML = '';
    numline.classList.remove('show');
    answersEl.innerHTML = '';
    if (pourBtn) pourBtn.classList.remove('show');
    E.counterHide();
    E.hideHint(false);
  }

  async function runSession(lv) {
    E.newRun();
    G.lv = lv;
    G.qIndex = 0; G.wrongTotal = 0;
    const rng = new DL.Rng(E.URL_SEED != null ? E.URL_SEED : undefined);
    G.session = DL.generateSession(Number(lv.slice(2)), { rng });
    for (const el2 of starsEl.children) el2.classList.remove('lit');
    E.el.bubble.classList.remove('show', 'warn');
    pdLabel.textContent = '一位小數';
    E.showScreen('game');

    try {
      for (let i = 0; i < G.session.length; i++) {
        G.qIndex = i;
        const q = G.session[i];
        Q = newRound(q);
        clearStage();
        await E.sleep(400);
        if (q.type === 'read') await runReadQuestion(q);
        else if (q.type === 'place') await runPlaceQuestion(q);
        else await runAddQuestion(q);

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
    if (window.Starmap) window.Starmap.add('decimal', G.lv, Math.max(1, G.session.length - G.wrongTotal));
    $('end-stars').textContent = '⭐'.repeat(G.session.length);
    const msg = G.wrongTotal === 0 ? '每一格都數得好準！' : '多玩幾次，小數會越來越熟！';
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

    spriteLayer.addEventListener('pointerdown', onLayerPointerDown, { passive: false });
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
    get problem() { return Q ? Q.q : null; },
    get askValue() { return Q ? Q.askValue : null; },
    get counted() { return Q ? Q.counted : 0; },
    get frogPos() { return Q && Q.frog ? Q.frog.pos : null; },
    get wrongTotal() { return G.wrongTotal; },
    startLevel(lv) { runSession(lv); },
    pump() { E.pumpTimers(); },
    // 測試用快轉：無視截止時刻強制結清所有 sleep（headless 分頁 timer 被節流時用）
    flush() {
      for (const w of E.run.waiters.slice()) {
        if (w.settle && w.deadline) w.settle();
      }
    },
    centers: {
      cell(i) {
        if (!Q || !Q.cups.length) return null;
        const main = Q.cups[Q.cups.length - 1];
        const r = main.cells[i]; if (!r) return null;
        const b = r.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      },
      tick(t) { return Q && Q.line ? tickClient(Q.line, t) : null; },
      frog() { return Q && Q.frog ? E.centerOf(Q.frog.el) : null; },
      pour() { return pourBtn ? E.centerOf(pourBtn) : null; },
    },
    tapCell(i) {
      const c = this.centers.cell(i); if (!c) return false;
      const t = document.elementFromPoint(c.x, c.y);
      if (!t) return false;
      t.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 5, clientX: c.x, clientY: c.y, button: 0, buttons: 1,
      }));
      return true;
    },
    countAll() {
      if (!Q || Q.phase !== 'count') return 0;
      const target = Q.q.tenth; let n = 0;
      for (let i = 0; i < target; i++) if (this.tapCell(i)) n++;
      return n;
    },
    pour() {
      if (!pourBtn) return false;
      pourBtn.click(); return true;
    },
    dragFrogTo(t) {
      const from = this.centers.frog();
      const to = this.centers.tick(t);
      if (!from || !to) return false;
      const opt = (x, y) => ({
        bubbles: true, cancelable: true, composed: true,
        pointerId: 7, isPrimary: true, pointerType: 'touch',
        clientX: x, clientY: y, button: 0, buttons: 1,
      });
      const el0 = document.elementFromPoint(from.x, from.y) || spriteLayer;
      el0.dispatchEvent(new PointerEvent('pointerdown', opt(from.x, from.y)));
      const steps = 6;
      for (let i = 1; i <= steps; i++) {
        window.dispatchEvent(new PointerEvent('pointermove',
          opt(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)));
      }
      window.dispatchEvent(new PointerEvent('pointerup', opt(to.x, to.y)));
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
      const labels = { lv1: '🥤 讀小數', lv2: '📍 數線找家', lv3: '➕ 小數加法' };
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
