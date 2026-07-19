/* ============================================================
   長條圖樂園 — 逐格讀值、逐格蓋圖、比較推理
   共用 js/engine.js；starmap key: ('barchart','lv1'..'lv3')
   ============================================================ */
(function () {
  'use strict';

  const BL = window.BarchartLogic;
  const sfx = window.sfx;
  const $ = (id) => document.getElementById(id);
  const E = Engine.create({ reshowHint: reshowHintForPhase });

  /* ---------------- DOM ---------------- */
  const app = $('app');
  const screens = { title: $('screen-title'), game: $('screen-game'), end: $('screen-end') };
  const spriteLayer = $('sprite-layer');
  const stage = $('chart-stage');
  const themeEl = $('chart-theme');
  const sourceRow = $('source-row');
  const yAxis = $('y-axis');
  const barsArea = $('bars-area');
  const answersEl = $('answers');
  const pdLabel = $('pd-label');
  const starsEl = $('stars');
  E.registerScreens(screens, 'title');

  /* ---------------- 狀態 ---------------- */
  const G = { lv: 'lv1', session: [], qIndex: 0, wrongTotal: 0 };
  let Q = null;

  function newRound(q) {
    return {
      q, phase: 'idle', askValue: null, chart: null,
      counted: 0, built: q.categories.map(() => 0), activeCol: 0,
      marker: null, stacking: false, wrongAnswers: 0,
    };
  }

  function category(q, key) { return q.categories.find((c) => c.key === key); }
  function catLabel(c) { return c.emoji + ' ' + c.name; }

  /* ---------------- 長條圖 DOM ---------------- */
  function addBarCell(col, level, yMax, extraClass) {
    const cell = document.createElement('div');
    cell.className = 'bar-cell' + (extraClass ? ' ' + extraClass : '');
    cell.style.height = (100 / yMax) + '%';
    cell.dataset.level = level;
    col.stack.appendChild(cell);
    col.cells.push(cell);
    return cell;
  }

  function buildChart(q, filled) {
    yAxis.innerHTML = '';
    barsArea.innerHTML = '';
    barsArea.style.setProperty('--grid-step', (100 / q.yMax) + '%');
    const cols = [];

    for (let n = 0; n <= q.yMax; n++) {
      const tick = document.createElement('div');
      tick.className = 'y-tick'; tick.textContent = n;
      tick.style.bottom = (n / q.yMax * 100) + '%';
      yAxis.appendChild(tick);
    }

    q.categories.forEach((c, i) => {
      const box = document.createElement('div');
      box.className = 'bar-col'; box.dataset.key = c.key;
      const stack = document.createElement('div');
      stack.className = 'bar-stack'; box.appendChild(stack);
      const label = document.createElement('div');
      label.className = 'bar-label'; label.textContent = c.emoji + ' ' + c.name;
      box.appendChild(label);
      const plus = document.createElement('button');
      plus.className = 'stack-btn'; plus.textContent = '＋'; plus.dataset.col = i;
      plus.setAttribute('aria-label', c.name + '加一格');
      box.appendChild(plus);
      barsArea.appendChild(box);
      const col = { box, stack, label, plus, cells: [], data: c };
      cols.push(col);
      if (filled) for (let level = 1; level <= c.value; level++) addBarCell(col, level, q.yMax, 'filled');
    });
    return { cols };
  }

  function fillSourceCards(q) {
    sourceRow.innerHTML = '';
    q.categories.forEach((c, i) => {
      const card = document.createElement('div');
      card.className = 'source-card'; card.dataset.col = i;
      card.textContent = c.emoji + ' ' + c.value + ' 個';
      sourceRow.appendChild(card);
    });
    sourceRow.classList.add('show');
  }

  function cellClient(col, level, yMax) {
    const r = barsArea.getBoundingClientRect();
    const cr = col.box.getBoundingClientRect();
    return { x: cr.left + cr.width / 2, y: r.bottom - ((level - 0.5) / yMax) * r.height };
  }

  function makeMarker() {
    return new E.Sprite('chart-marker', '<span aria-hidden="true">🔎</span>');
  }

  /* ---------------- lv1：讀長條圖 ---------------- */
  async function runReadQuestion(q) {
    themeEl.textContent = q.theme.name + '長條圖';
    sourceRow.classList.remove('show');
    Q.chart = buildChart(q, true);

    if (q.kind === 'read') {
      const target = category(q, q.targetKey);
      const col = Q.chart.cols.find((x) => x.data.key === q.targetKey);
      col.box.classList.add('focus');
      pdLabel.textContent = catLabel(target) + '有幾個？';
      await E.sayWait('沿著' + target.name + '的長條，從下面一格一格點著數！', 3000);
      await countTargetBar(col, target.value);
      await E.sleep(350);
    } else {
      pdLabel.textContent = q.kind === 'most' ? '哪一個最多？' : '哪一個最少？';
      await E.sayWait(q.kind === 'most'
        ? '看看哪一根長條最高，就是數量最多！'
        : '看看哪一根長條最矮，就是數量最少！', 2800);
    }

    await askOptions(q, questionText(q), async () => {
      if (q.kind === 'read') {
        const target = category(q, q.targetKey);
        await E.worryWait('從最下面開始，一格一格數。' + target.name + '一共有 ' + target.value + ' 格！', 3300);
      } else {
        await E.worryWait(q.kind === 'most'
          ? '長條越高，數量越多。再比比看每根長條的頂端！'
          : '長條越矮，數量越少。再比比看每根長條的頂端！', 3300);
      }
    });
    celebrateAnswer(q);
    await E.sleep(1100);
    await E.speechDrain('答對了！' + answerSpeech(q));
  }

  function countTargetBar(col, target) {
    Q.phase = 'count'; Q.counted = 0;
    Q.marker = makeMarker();
    const first = col.cells[0];
    if (first) {
      first.classList.add('next-cell');
      const p = E.toLayer(E.centerOf(first));
      Q.marker.placeAt(p.x + 24, p.y);
    }
    reshowHintForPhase();

    return new Promise((resolve, reject) => {
      E.run.waiters.push({ reject });
      col.cells.forEach((cell, i) => {
        cell.classList.add('countable');
        cell.addEventListener('pointerdown', (ev) => {
          if (!Q || Q.phase !== 'count' || E.run.cancelled || i !== Q.counted) return;
          ev.preventDefault();
          cell.classList.remove('next-cell');
          cell.classList.add('counted');
          Q.counted++;
          sfx.unlock(); sfx.tick(Q.counted);
          E.counterShow(Q.counted, 25);
          E.tapNum(cell, Q.counted);
          E.hideHint(true);
          const p = E.toLayer(E.centerOf(cell));
          Q.marker.glideTo(p.x + 24, p.y, { dur: 180 });
          if (Q.counted >= target) {
            Q.phase = 'anim';
            col.cells.forEach((x) => x.classList.remove('countable'));
            resolve();
          } else {
            col.cells[Q.counted].classList.add('next-cell');
            reshowHintForPhase();
          }
        }, { passive: false });
      });
    });
  }

  /* ---------------- lv2：蓋長條圖 ---------------- */
  async function runBuildQuestion(q) {
    themeEl.textContent = q.theme.name + '調查表';
    pdLabel.textContent = '照數量一格一格蓋！';
    fillSourceCards(q);
    Q.chart = buildChart(q, false);

    await E.sayWait('看上面的數量，從第一種開始，每按一次加一格！', 3100);
    Q.phase = 'stack'; Q.activeCol = 0;
    stage.classList.add('stack-ready');
    bindStackButtons();
    setActiveColumn(0);
    reshowHintForPhase();

    await new Promise((resolve, reject) => {
      E.run.waiters.push({ reject });
      Q.stackResolve = resolve;
    });

    Q.phase = 'anim';
    stage.classList.remove('stack-ready');
    E.caption('每一根都蓋好了！');
    E.speech.speak('太棒了！長條圖完成了！');
    await E.sleep(1100);
    await E.speechDrain('太棒了！長條圖完成了！');
  }

  function bindStackButtons() {
    Q.chart.cols.forEach((col, i) => {
      col.plus.onclick = async () => {
        if (!Q || Q.phase !== 'stack' || E.run.cancelled || Q.stacking || i !== Q.activeCol) return;
        Q.stacking = true;
        col.plus.disabled = true;
        E.hideHint(true);
        sfx.unlock(); sfx.tap();
        const level = Q.built[i] + 1;
        const from = E.toLayer(E.centerOf(col.plus));
        const to = E.toLayer(cellClient(col, level, Q.q.yMax));
        const block = new E.Sprite('stack-fly', '<span aria-hidden="true">🟦</span>');
        block.placeAt(from.x, from.y);
        block.glideTo(to.x, to.y, { dur: 230, ease: 'ease-in-out' });
        try {
          await E.sleep(240);
        } catch (err) {
          block.destroy();
          if (err.isCancel) return;
          throw err;
        }
        block.destroy();
        if (!Q || Q.phase !== 'stack') return;
        const cell = addBarCell(col, level, Q.q.yMax, 'filled new-cell');
        Q.built[i] = level;
        E.tapNum(cell, level);
        sfx.tick(level);

        if (level >= col.data.value) {
          col.box.classList.add('complete');
          col.plus.classList.remove('active');
          sourceRow.children[i].classList.remove('active');
          sourceRow.children[i].classList.add('done');
          E.caption(catLabel(col.data) + '完成！');
          Q.activeCol++;
          if (Q.activeCol >= Q.chart.cols.length) {
            Q.stacking = false;
            Q.stackResolve();
            return;
          }
          setActiveColumn(Q.activeCol);
        }
        Q.stacking = false;
        col.plus.disabled = false;
        reshowHintForPhase();
      };
    });
  }

  function setActiveColumn(i) {
    Q.chart.cols.forEach((col, n) => col.plus.classList.toggle('active', n === i));
    Array.from(sourceRow.children).forEach((card, n) => card.classList.toggle('active', n === i));
    const col = Q.chart.cols[i];
    if (col) col.plus.disabled = false;
  }

  /* ---------------- lv3：比較問答 ---------------- */
  async function runCompareQuestion(q) {
    themeEl.textContent = q.theme.name + '長條圖';
    sourceRow.classList.remove('show');
    Q.chart = buildChart(q, true);
    pdLabel.textContent = questionText(q);
    await E.sayWait(compareIntro(q), 3100);
    await askOptions(q, questionText(q), async () => {
      if (q.kind === 'total') {
        await E.worryWait('求一共要把每一根長條都加起來，不能漏掉一根喔！', 3400);
      } else {
        const a = category(q, q.leftKey), b = category(q, q.rightKey);
        await E.worryWait('「多幾個」要用大數減小數：' + a.value + ' 減 ' + b.value + '！', 3400);
      }
    });
    celebrateAnswer(q);
    await E.sleep(1100);
    await E.speechDrain('答對了！答案是 ' + q.answer + '！');
  }

  function compareIntro(q) {
    if (q.kind === 'total') return '把每一根長條的數量都加起來，看看一共有幾個！';
    if (q.kind === 'range') return '先找最高和最矮的長條，再用大數減小數！';
    const a = category(q, q.leftKey), b = category(q, q.rightKey);
    return a.name + '比' + b.name + '多幾個？看高度，再用減法！';
  }

  function questionText(q) {
    if (q.type === 'read') {
      if (q.kind === 'read') return catLabel(category(q, q.targetKey)) + '有幾個？';
      return q.kind === 'most' ? '哪一個最多？' : '哪一個最少？';
    }
    if (q.kind === 'total') return '全部一共有幾個？';
    if (q.kind === 'range') return '最多的比最少的多多少？';
    return category(q, q.leftKey).name + '比' + category(q, q.rightKey).name + '多幾個？';
  }

  function answerLabel(q, value) {
    if (typeof value === 'number') return String(value);
    const c = category(q, value);
    return c ? catLabel(c) : String(value);
  }

  function answerSpeech(q) {
    return typeof q.answer === 'number' ? '答案是 ' + q.answer + '！' : answerLabel(q, q.answer) + '！';
  }

  function celebrateAnswer(q) {
    const text = answerSpeech(q);
    E.caption(text);
    E.speech.speak('答對了！' + text);
  }

  /* ---------------- 三選一 ---------------- */
  function askOptions(q, sayText, onWrong) {
    Q.phase = 'answer'; Q.askValue = q.answer;
    answersEl.innerHTML = '';
    E.say(sayText);
    return new Promise((resolve, reject) => {
      E.run.waiters.push({ reject });
      let busy = false;
      q.options.forEach((v) => {
        const b = document.createElement('button');
        b.className = 'ans-btn'; b.textContent = answerLabel(q, v); b.dataset.v = v;
        b.addEventListener('click', async () => {
          if (busy || E.run.cancelled) return;
          if (String(v) === String(q.answer)) {
            busy = true; b.classList.add('correct'); sfx.yay();
            const c = E.centerOf(b); E.burstStars(c.x, c.y, 12);
            resolve();
          } else {
            busy = true; b.classList.add('wrong');
            Q.wrongAnswers++; G.wrongTotal++;
            try {
              await onWrong(v);
              Q.phase = 'answer';
              E.say('現在知道了嗎？');
            } catch (err) {
              if (err.isCancel) return reject(err);
              throw err;
            }
            busy = false;
          }
        });
        answersEl.appendChild(b);
      });
    });
  }

  /* ---------------- 提示 ---------------- */
  function reshowHintForPhase() {
    if (!Q) return;
    if (Q.phase === 'count' && Q.chart) {
      const col = Q.chart.cols.find((x) => x.data.key === Q.q.targetKey);
      const cell = col && col.cells[Q.counted];
      if (cell) { const c = E.centerOf(cell); E.showHint({ x: c.x + 28, y: c.y }, c); }
    } else if (Q.phase === 'stack' && Q.chart) {
      const col = Q.chart.cols[Q.activeCol];
      if (col) { const c = E.centerOf(col.plus); E.showHint({ x: c.x, y: c.y - 26 }, c); }
    }
  }

  /* ---------------- 一場 ---------------- */
  const praises = ['暖身成功！', '長條看得好準！', '一格都沒漏！', '推理高手！', '長條圖大師！'];

  function clearStage() {
    for (const el2 of spriteLayer.querySelectorAll('.sprite')) {
      if (el2.__sprite) el2.__sprite.destroy(); else el2.remove();
    }
    stage.classList.remove('stack-ready');
    sourceRow.innerHTML = ''; sourceRow.classList.remove('show');
    yAxis.innerHTML = ''; barsArea.innerHTML = ''; answersEl.innerHTML = '';
    E.counterHide(); E.hideHint(false);
  }

  async function runSession(lv) {
    E.newRun();
    G.lv = lv; G.qIndex = 0; G.wrongTotal = 0;
    const rng = new BL.Rng(E.URL_SEED != null ? E.URL_SEED : undefined);
    G.session = BL.generateSession(Number(lv.slice(2)), { rng });
    for (const el2 of starsEl.children) el2.classList.remove('lit');
    E.el.bubble.classList.remove('show', 'warn');
    pdLabel.textContent = '長條圖';
    E.showScreen('game');

    try {
      for (let i = 0; i < G.session.length; i++) {
        G.qIndex = i;
        const q = G.session[i];
        Q = newRound(q);
        clearStage();
        await E.sleep(400);
        if (q.type === 'read') await runReadQuestion(q);
        else if (q.type === 'build') await runBuildQuestion(q);
        else await runCompareQuestion(q);

        Q.phase = 'done';
        await E.sleep(300);
        starsEl.children[i].classList.add('lit');
        sfx.fanfare();
        await E.sayWait(praises[i], 1900);
      }
      await showEnd();
    } catch (e) {
      if (!e.isCancel) { console.error(e); throw e; }
    }
  }

  async function showEnd() {
    Q = null;
    clearStage();
    const earned = Math.max(1, G.session.length - G.wrongTotal);
    if (window.Starmap) window.Starmap.add('barchart', G.lv, earned);
    $('end-stars').textContent = '⭐'.repeat(earned);
    const msg = G.wrongTotal === 0 ? '每一根長條都看得好準！' : '再一格一格數，會越來越厲害！';
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
    $('btn-menu').addEventListener('click', () => {
      sfx.tap(); E.speech.stop(); E.cancelRun(); Q = null; clearStage(); E.showScreen('title');
    });
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
    get wrongTotal() { return G.wrongTotal; },
    get counted() { return Q ? Q.counted : 0; },
    get built() { return Q ? Q.built.slice() : []; },
    get activeCol() { return Q ? Q.activeCol : null; },
    startLevel(lv) { runSession(lv); },
    pump() { E.pumpTimers(); },
    flush() {
      for (const w of E.run.waiters.slice()) {
        if (w.settle && w.deadline) w.settle();
      }
    },
    centers: {
      cell(col, level) {
        if (!Q || !Q.chart || !Q.chart.cols[col]) return null;
        const cell = Q.chart.cols[col].cells[level - 1];
        return cell ? E.centerOf(cell) : cellClient(Q.chart.cols[col], level, Q.q.yMax);
      },
      plus(col) {
        if (!Q || !Q.chart || !Q.chart.cols[col]) return null;
        return E.centerOf(Q.chart.cols[col].plus);
      },
    },
    tapCell(col, level) {
      const c = this.centers.cell(col, level);
      if (!c) return false;
      const target = document.elementFromPoint(c.x, c.y);
      if (!target) return false;
      target.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 5,
        clientX: c.x, clientY: c.y, button: 0, buttons: 1,
      }));
      return true;
    },
    countAll() {
      if (!Q || Q.phase !== 'count' || !Q.chart) return 0;
      const col = Q.chart.cols.findIndex((x) => x.data.key === Q.q.targetKey);
      const total = Q.q.categories[col].value;
      let n = 0;
      for (let level = 1; level <= total; level++) if (this.tapCell(col, level)) n++;
      return n;
    },
    stackCell(col) {
      if (!Q || Q.phase !== 'stack' || !Q.chart || !Q.chart.cols[col]) return false;
      Q.chart.cols[col].plus.click(); return true;
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
      const labels = { lv1: '📊 讀長條圖', lv2: '🧱 蓋長條圖', lv3: '➗ 比較問答' };
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
