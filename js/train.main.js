/* ============================================================
   湊十小火車 — 主流程
   共用引擎 js/engine.js（Engine.create）＋ 純邏輯 js/train.logic.js
   Lv1 湊 5 / Lv2 湊 10 / Lv3 湊十法加法
   phase：dealing → boarding → count → answer →（anim 過場）→ done
   ============================================================ */
(function () {
  'use strict';

  const TL = window.TrainLogic;
  const sfx = window.sfx;
  const $ = (id) => document.getElementById(id);

  const MODES = ['lv1', 'lv2', 'lv3'];
  const CARRIAGE = 'carriage'; // Lv3 點數用的「整節車廂」目標代號
  const AVATARS = ['deco_bird.png', 'deco_hedgehog.png']; // 乘客頭像輪流

  /* ---------------- DOM ---------------- */
  const spriteLayer = $('sprite-layer');
  const trainEl = $('train');
  const carriageEl = $('carriage');
  const seatsEl = $('seats');
  const standsEl = $('stands');
  const platformBadge = $('platform-badge');
  const answersEl = $('answers');
  const starsEl = $('stars');
  const pd = { a: $('pd-a'), op: $('pd-op'), b: $('pd-b'), q: $('pd-q') };

  /* ---------------- 共用引擎 ---------------- */
  const E = Engine.create({ reshowHint: () => reshowHintForPhase() });

  /* ---------------- 遊戲狀態 ---------------- */
  const T = { lv: 'lv1', session: [], qIndex: 0, wrongTotal: 0 };
  let Q = null;            // 目前題目的執行狀態
  let seatEls = [];        // 座位格（每題重建，重建時盤面必為空）
  let standEls = [];       // 月台站位
  let passengerSeq = 0;    // 頭像輪替
  let unknownEl = pd.q;    // 題目列的未知數（Lv1/2 在 b、Lv3 在 ?）

  function newQState(p) {
    return {
      p,
      phase: 'idle',       // dealing / boarding / count / answer / anim / done
      seated: [],          // 車上所有乘客（含自動發牌上車的 a 隻）
      boarded: [],         // 孩子拖上車的新乘客（Lv1/2 的點數目標）
      pool: [],            // 月台上剩餘乘客
      countSet: null,      // 手動點數：待點目標（Sprite 或 CARRIAGE）
      counted: new Set(),  // 手動點數：點過的目標
      countOrder: [],      // 點數目標的建議順序（提示手用）
      askValue: null,      // 目前答案題的正解
      wrongAnswers: 0,
    };
  }

  /* ---------------- 乘客 ---------------- */
  function makePassenger() {
    const img = AVATARS[passengerSeq++ % AVATARS.length];
    return new E.Sprite('passenger', '<img src="assets/' + img + '" alt="小動物乘客">');
  }

  /* ---------------- 舞台搭建 ---------------- */
  function setProblemDisplay(p) {
    pd.b.classList.remove('solved', 'pulse');
    pd.q.classList.remove('solved', 'pulse');
    pd.a.textContent = p.a;
    pd.op.textContent = '＋';
    if (p.lv === 'lv3') {          // a ＋ b ＝ ?
      pd.b.textContent = p.b;
      pd.q.textContent = '?';
      unknownEl = pd.q;
    } else {                       // a ＋ ? ＝ 5 / 10
      pd.b.textContent = '?';
      pd.q.textContent = p.cap;
      unknownEl = pd.b;
    }
  }

  // 每題重建座位格與站位。只在盤面清空時呼叫（座位格動態增減會位移排版，
  // 此時沒有任何乘客需要重新對位，符合「量測容器不得位移」的鐵則）。
  function buildStage(p) {
    seatEls = []; standEls = [];
    seatsEl.innerHTML = '';
    for (let i = 0; i < p.cap; i++) {
      const d = document.createElement('div');
      d.className = 'seat';
      seatsEl.appendChild(d); seatEls.push(d);
    }
    standsEl.innerHTML = '';
    for (let i = 0; i < p.pool; i++) {
      const d = document.createElement('div');
      d.className = 'stand';
      standsEl.appendChild(d); standEls.push(d);
    }
    if (p.lv === 'lv3') {
      platformBadge.textContent = p.b + ' 隻';
      platformBadge.classList.add('show');
    } else {
      platformBadge.classList.remove('show');
    }
    carriageEl.classList.remove('counted', 'countable', 'drag-over');
    setProblemDisplay(p);
  }

  function clearStage() {
    // 進行中的拖曳一併作廢（按住乘客跨題的殘留防護）
    drag.active = false;
    drag.sprite = null;
    for (const el of spriteLayer.querySelectorAll('.sprite')) {
      if (el.__sprite) el.__sprite.destroy(); else el.remove();
    }
    answersEl.innerHTML = '';
    E.counterHide();
    E.hideHint(false);
    carriageEl.classList.remove('counted', 'countable', 'drag-over');
  }

  /* ---------------- 火車進站 / 出站（transform 動畫的唯一出口） ----------------
   * 進站：盤面必為空（乘客尚未生成）。
   * 出站：先算好所有目標座標再一次啟動，動畫期間不做任何對位量測；
   *       結束後 cancel 動畫（transform 回到 none）並銷毀乘客。 */
  function appWidth() { return $('app').clientWidth; }

  async function trainArrive() {
    trainEl.style.visibility = '';
    if (!E.FAST) {
      const dist = appWidth() + trainEl.offsetWidth + 60;
      sfx.chug(5);
      trainEl.animate([
        { transform: 'translateX(' + (-dist) + 'px)' },
        { transform: 'translateX(0)' },
      ], { duration: E.ms(800), easing: 'cubic-bezier(.25,.8,.35,1)' });
      await E.sleep(830);
    }
    // 保險：分頁隱藏時 WAAPI 會凍結在第 0 幀，transform 卡住會毀掉之後
    // 所有座位對位（E2E 的 headless 分頁就是這狀態）→ 一律收乾淨再發牌
    for (const a of trainEl.getAnimations()) a.cancel();
  }

  async function trainDepart() {
    Q.phase = 'anim';
    E.hideHint(false);
    const rest = Q.pool.slice();      // 月台剩下的：飛走（比照 sweepBoard）
    const onboard = Q.seated.slice(); // 車上的：跟著火車一起出站
    const dist = appWidth() + trainEl.offsetWidth + 80;

    if (rest.length) {
      sfx.whoosh();
      rest.forEach((sp, i) => {
        setTimeout(() => {
          if (!sp.dead && !E.run.cancelled) sp.glideTo(sp.x, sp.y - 70, { dur: 450, scale: 0.3, fade: true });
        }, i * E.ms(35));
      });
      await E.sleep(450 + rest.length * 35 + 120);
    }

    sfx.chug(6);
    const dur = 900;
    if (!E.FAST) {
      trainEl.animate([
        { transform: 'translateX(0)' },
        { transform: 'translateX(' + dist + 'px)' },
      ], { duration: E.ms(dur), easing: 'cubic-bezier(.55,0,.85,.5)', fill: 'forwards' });
    }
    for (const sp of onboard) {
      sp.glideTo(sp.x + dist, sp.y, { dur, ease: 'cubic-bezier(.55,0,.85,.5)' });
    }
    await E.sleep(dur + 80);
    trainEl.style.visibility = 'hidden';
    for (const a of trainEl.getAnimations()) a.cancel();
    for (const sp of rest) sp.destroy();
    for (const sp of onboard) sp.destroy();
  }

  /* ---------------- 發牌 ---------------- */
  async function dealInitial(p) {
    const from = E.centerInLayer($('lottie-guide'));
    for (let i = 0; i < p.a; i++) {
      if (E.run.cancelled) throw new E.CancelError();
      const sp = makePassenger();
      sp.placeAt(from.x, from.y, { scale: 0.3 });
      const seat = seatEls[Q.seated.length];
      sp.anchor = seat;
      seat.classList.add('taken');
      sp.el.classList.add('onboard');
      Q.seated.push(sp);
      const t = E.centerInLayer(seat);
      sp.glideTo(t.x, t.y, { dur: 420, scale: 1 });
      sfx.whoosh();
      setTimeout(() => { if (!E.run.cancelled) sfx.clink(false); }, E.ms(410));
      await E.sleep(200);
    }
    await E.sleep(300);
  }

  async function dealPool(p) {
    const L = E.layerRect();
    for (let i = 0; i < p.pool; i++) {
      if (E.run.cancelled) throw new E.CancelError();
      const sp = makePassenger();
      const stand = standEls[i];
      const t = E.centerInLayer(stand);
      sp.placeAt(L.width + 50, t.y, { scale: 0.5 });
      sp.anchor = stand;
      Q.pool.push(sp);
      sp.glideTo(t.x, t.y, { dur: 430, scale: 1 });
      sfx.whoosh();
      await E.sleep(140);
    }
    await E.sleep(300);
  }

  /* ---------------- 提示小手（依 phase） ---------------- */
  function targetEl(t) { return t === CARRIAGE ? carriageEl : t.el; }

  function reshowHintForPhase() {
    if (!Q) return;
    if (Q.phase === 'boarding') {
      if (Q.pool.length && Q.seated.length < Q.p.cap) {
        E.showHint(E.centerOf(Q.pool[0].el), E.centerOf(carriageEl));
      }
    } else if (Q.phase === 'count' && Q.countSet) {
      const t = Q.countOrder.find((x) => !Q.counted.has(x));
      if (t) { const c = E.centerOf(targetEl(t)); E.showHint(c, c); }
    }
  }

  /* ---------------- 拖曳系統（比照 main.js 的 pointer events） ---------------- */
  const drag = { active: false, pointerId: null, sprite: null };

  function overCarriage(cx, cy) { return E.inflatedContains(carriageEl, cx, cy, 18); }

  function draggableCheck(sp) {
    if (!Q || sp.dead) return false;
    if (Q.pool.indexOf(sp) < 0) return false;   // 只有月台乘客能拖
    if (Q.phase === 'boarding') return true;
    // 車滿後的「再拖 → 苦惱」教學：點數階段仍可拖月台乘客（點數目標除外）
    if (Q.phase === 'count' && (!Q.countSet || !Q.countSet.has(sp))) return true;
    return false;
  }

  function onLayerPointerDown(e) {
    if (!Q) return;
    const el = e.target && e.target.closest ? e.target.closest('.sprite') : null;
    const sp = el && el.__sprite;
    // 手動點數：點一個算一個
    if (Q.phase === 'count' && Q.countSet && sp) {
      // Lv3：車上乘客蓋住車廂（sprite-layer 在上層），點到他們也算點到整節車廂，
      // 錢堆不能是點擊死區（比照 main.js mul-pour 的作法）
      if (Q.countSet.has(CARRIAGE) && !Q.counted.has(CARRIAGE) && Q.seated.indexOf(sp) >= 0) {
        e.preventDefault();
        sfx.unlock();
        tapTarget(CARRIAGE);
        return;
      }
      if (Q.countSet.has(sp) && !Q.counted.has(sp)) {
        e.preventDefault();
        sfx.unlock();
        tapTarget(sp);
        return;
      }
    }
    if (!sp || drag.active || !draggableCheck(sp)) return;
    e.preventDefault();
    drag.active = true; drag.pointerId = e.pointerId; drag.sprite = sp;
    E.hideHint(true);
    sfx.unlock(); // iOS 來電等中斷後，任何手勢都能救回音訊
    sfx.grab();
    sp.setDragging(true);
    moveDragTo(e.clientX, e.clientY, true);
  }

  function moveDragTo(cx, cy, first) {
    const pt = E.toLayer({ x: cx, y: cy });
    const sp = drag.sprite;
    if (first) sp.glideTo(pt.x, pt.y - 12, { dur: 100 });
    else { sp.el.style.transition = 'none'; sp.x = pt.x; sp.y = pt.y - 12; sp.apply(); }
    carriageEl.classList.toggle('drag-over', overCarriage(cx, cy));
  }

  function onPointerMove(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    moveDragTo(e.clientX, e.clientY, false);
  }

  function onPointerUp(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    const sp = drag.sprite;
    drag.active = false; drag.sprite = null;
    carriageEl.classList.remove('drag-over');
    sp.setDragging(false);
    handleDrop(sp, e.clientX, e.clientY);
  }

  function snapBack(sp) {
    if (sp.dead || !sp.anchor) return;
    const t = E.centerInLayer(sp.anchor);
    sp.glideTo(t.x, t.y, { dur: 320, scale: 1 });
  }

  /* ---------------- 落下判定 ---------------- */
  function handleDrop(sp, cx, cy) {
    if (!Q) { snapBack(sp); return; }
    // 跨題殘留防護：pointerdown 時的檢查在落下時要重做——
    // 按住乘客跨過換題（trainDepart 已 destroy 它），落下時 sprite 已死
    // 或已不在本題月台，這時 boardPassenger 會 splice(-1) 毀掉新題的 pool
    if (sp.dead || Q.pool.indexOf(sp) < 0) { snapBack(sp); return; }
    if (overCarriage(cx, cy)) {
      const v = TL.boardVerdict(Q.seated.length, Q.p.cap);
      if (v.ok && Q.phase === 'boarding') { boardPassenger(sp); return; }
      // 坐滿了（鎖定）：大象苦惱＋退回
      E.worry(Q.p.lv === 'lv3' ? '滿了！剩下的坐不下～' : '坐滿了！不能再擠了！');
      snapBack(sp);
      E.hideHint(true);
      return;
    }
    snapBack(sp);
    E.hideHint(true);
  }

  function boardPassenger(sp) {
    Q.pool.splice(Q.pool.indexOf(sp), 1);
    const seat = seatEls[Q.seated.length];
    sp.anchor = seat;
    seat.classList.add('taken');
    sp.el.classList.add('onboard');
    Q.seated.push(sp);
    Q.boarded.push(sp);
    const t = E.centerInLayer(seat);
    sp.glideTo(t.x, t.y, { dur: 280, scale: 1 });
    sfx.clink(false);
    E.hideHint(true);
    if (Q.seated.length >= Q.p.cap) {
      E.fireSignal(); // 坐滿 → 主流程接手（鎖定＋汽笛＋caption）
    }
  }

  /* ---------------- 點數（手動）：孩子自己一個一個點 ----------------
   * Lv1/2：點剛上車的乘客，一隻跳「1」；Lv3：先點整節車廂跳「10」，
   * 再逐隻點月台剩下的乘客各跳「1」。點過做記號、不能重複、不自動加總。 */
  function tapTarget(t) {
    Q.counted.add(t);
    E.hideHint(true);
    sfx.tick(Q.counted.size - 1);
    if (t === CARRIAGE) {
      carriageEl.classList.remove('countable');
      carriageEl.classList.add('counted'); // 變色記號只用 box-shadow/filter，不用 transform
      E.tapNum(carriageEl, '10');
    } else {
      t.el.classList.add('counted');
      t.pulse().catch(() => {});
      E.tapNum(t.el, '1');
    }
    if (Q.counted.size >= Q.countSet.size) {
      Q.countSet = null;
      E.fireSignal(); // 全部點完
    }
  }

  async function manualCount(targets) {
    Q.phase = 'count';
    Q.countOrder = targets.slice();
    Q.countSet = new Set(targets);
    Q.counted = new Set();
    if (Q.countSet.has(CARRIAGE)) carriageEl.classList.add('countable');
    const first = targets[0];
    if (first) { const c = E.centerOf(targetEl(first)); E.showHint(c, c); }
    await E.waitSignal();
    E.hideHint(false);
    await E.sleep(350);
  }

  /* ---------------- 答案選項 ---------------- */
  function askText(p) {
    if (p.lv === 'lv1') return p.a + ' 和幾合起來是 5 呢？';
    if (p.lv === 'lv2') return p.a + ' 和幾湊成 10 呢？';
    return p.a + ' 加 ' + p.b + '，一共是多少呢？';
  }

  async function askAnswer(p, rng) {
    Q.phase = 'answer';
    Q.askValue = p.answer;
    unknownEl.classList.add('pulse');
    const options = TL.makeOptions(p, rng);
    answersEl.innerHTML = '';
    E.say(askText(p));

    await new Promise((resolve, reject) => {
      E.run.waiters.push({ reject });
      let busy = false;
      options.forEach((v) => {
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
            Q.wrongAnswers++; T.wrongTotal++;
            // 診斷式回饋＋擦掉記號重數一次
            const msg = p.lv === 'lv3'
              ? '別忘了，坐滿的整節車廂是 10 隻喔！我們再數一次！'
              : '只差一點點！我們再數一次剛剛上車的小動物！';
            try {
              await E.worryWait(msg, 2600);
              const targets = Q.countOrder.slice();
              for (const t of targets) {
                if (t === CARRIAGE) carriageEl.classList.remove('counted');
                else t.el.classList.remove('counted');
              }
              const recount = manualCount(targets);
              E.say('慢慢點、慢慢數，不要急！');
              await recount;
              Q.phase = 'answer';
              E.say('現在知道答案了嗎？');
            } catch (err) { if (err.isCancel) return reject(err); }
            busy = false;
          }
        });
        answersEl.appendChild(b);
      });
    });

    unknownEl.classList.remove('pulse');
    unknownEl.textContent = p.answer;
    unknownEl.classList.add('solved');
    answersEl.innerHTML = '';
  }

  /* ---------------- 單題流程 ---------------- */
  async function runQuestion(p, rng) {
    Q.phase = 'anim';
    await trainArrive();

    Q.phase = 'dealing';
    if (p.lv === 'lv3') {
      await E.sayWait('我們來算 ' + p.a + ' 加 ' + p.b + '！車廂先坐了 ' + p.a + ' 隻～', 3000);
    } else {
      await E.sayWait('小火車進站囉！車廂有 ' + p.cap + ' 個位子，已經坐了 ' + p.a + ' 隻！', 3200);
    }
    await dealInitial(p);
    await dealPool(p);
    if (p.lv === 'lv1') {
      await E.sayWait('車廂有 5 個位子，已經坐了 ' + p.a + ' 隻，還要幾隻才坐滿？', 3400);
    } else if (p.lv === 'lv2') {
      await E.sayWait(p.a + ' 和幾湊成 10 呢？把車廂坐滿就知道了！', 3200);
    } else {
      await E.sayWait('月台有 ' + p.b + ' 隻等車！先把車廂湊滿 10！', 3200);
    }

    Q.phase = 'boarding';
    E.say('把月台的小動物，拖到車廂的空位上！');
    reshowHintForPhase();
    await E.waitSignal(); // 坐滿（boardPassenger 觸發）；坐滿後拖曳一律被 handleDrop 拒收

    // 鎖定＋汽笛＋慢 caption
    sfx.whistle();
    const capLine = p.lv === 'lv3'
      ? p.a + ' 湊 ' + p.need + ' 是 10！'
      : p.a + ' 和 ' + p.need + ' 合起來是 ' + p.cap + '！';
    E.caption(capLine);
    await E.sayWait(capLine, 3200);

    if (p.lv === 'lv3') {
      await E.sayWait('車廂坐滿 10 隻了！月台還剩 ' + p.leftover + ' 隻～一共有幾隻呢？', 3400);
      const counting = manualCount([CARRIAGE].concat(Q.pool));
      E.say('先點一下整節車廂，再一隻一隻點月台的小動物！');
      await counting;
    } else {
      const counting = manualCount(Q.boarded.slice());
      E.say('換你數數看！剛剛上車了幾隻？一隻一隻點！');
      await counting;
    }
    await askAnswer(p, rng);
  }

  /* ---------------- 一場（5 題） ---------------- */
  const praises = ['答對了！你好棒！', '太厲害了！', '完全正確！', '好聰明！', '你是湊十小車長！'];

  async function runSession(lv) {
    E.newRun();
    T.lv = lv;
    T.qIndex = 0; T.wrongTotal = 0;
    const rng = new TL.Rng(E.URL_SEED != null ? E.URL_SEED : undefined);
    T.session = TL.generateSession(lv, { rng });
    for (const el of starsEl.children) el.classList.remove('lit');
    E.showScreen('game');
    trainEl.style.visibility = 'hidden';

    try {
      for (let i = 0; i < T.session.length; i++) {
        T.qIndex = i;
        const p = T.session[i];
        Q = newQState(p);
        clearStage();
        buildStage(p);
        await E.sleep(400);
        await runQuestion(p, rng);

        // 過關！（先讓答對的 yay 收尾，再吹號角）
        Q.phase = 'done';
        await E.sleep(650);
        starsEl.children[i].classList.add('lit');
        sfx.fanfare();
        const pc = E.centerOf($('problem-display'));
        E.burstStars(pc.x, pc.y + 20, 14);
        await E.sayWait(praises[i % praises.length], 2200);
        await trainDepart(); // 乘客出站＋火車開走，才換下一題
      }
      await showEnd();
    } catch (e) {
      if (!e.isCancel) console.error(e);
    }
  }

  async function showEnd() {
    Q = null;
    clearStage();
    trainEl.style.visibility = 'hidden';
    // 星圖回報：答錯越少星越多（至少 1 顆），只在破紀錄時寫入
    if (window.Starmap) window.Starmap.add('train', T.lv, Math.max(1, 5 - T.wrongTotal));
    $('end-stars').textContent = '⭐'.repeat(T.session.length);
    const msg = T.wrongTotal === 0
      ? '全部一次答對，你是湊十小車長！'
      : (T.wrongTotal <= 2 ? '越來越厲害了！再挑戰一次吧！' : '多練習幾次，你一定會更棒！');
    $('end-msg').textContent = msg;
    E.showScreen('end');
    sfx.sparkleRain();
    E.speech.speak('太棒了！' + msg);
  }

  /* ---------------- 事件綁定 ---------------- */
  function onResize() {
    // 所有有錨點的乘客立刻歸位（只跳過「被拖著的那一隻」，
    // 其他乘客照樣重對位——按著螢幕轉手機是小孩的日常）
    for (const el of spriteLayer.querySelectorAll('.sprite')) {
      const sp = el.__sprite;
      if (sp && sp.anchor && sp !== drag.sprite) {
        const t = E.centerInLayer(sp.anchor);
        sp.placeAt(t.x, t.y);
      }
    }
  }

  function bindUI() {
    document.querySelectorAll('.mode-btn').forEach((b) => {
      b.addEventListener('click', () => {
        sfx.unlock(); E.speech.prime(); sfx.tap();
        runSession(b.dataset.mode);
      });
    });
    $('btn-sound').addEventListener('click', () => {
      E.setSoundOn(!E.soundOn);
      $('btn-sound').textContent = E.soundOn ? '🔊' : '🔇';
      sfx.tap();
    });
    $('btn-again').addEventListener('click', () => {
      sfx.unlock(); E.speech.prime(); sfx.tap();
      runSession(T.lv);
    });
    $('btn-menu').addEventListener('click', () => { sfx.tap(); location.href = 'index.html'; });

    // Lv3 點數：點車廂本體（乘客身上的點擊由 sprite-layer 的 handler 轉發）
    carriageEl.addEventListener('pointerdown', (e) => {
      if (!Q || Q.phase !== 'count' || !Q.countSet) return;
      if (Q.countSet.has(CARRIAGE) && !Q.counted.has(CARRIAGE)) {
        e.preventDefault();
        sfx.unlock();
        tapTarget(CARRIAGE);
      }
    });

    // 拖曳
    spriteLayer.addEventListener('pointerdown', onLayerPointerDown, { passive: false });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  /* ---------------- 測試掛勾（E2E 用，名稱不可改） ---------------- */
  window.__test = {
    get screen() { return E.currentScreen; },
    get phase() { return Q ? Q.phase : 'idle'; },
    get qIndex() { return T.qIndex; },
    get session() { return T.session; },
    get problem() { return Q ? Q.p : null; },
    get askValue() { return Q ? Q.askValue : null; },
    get countLeft() { return Q && Q.countSet ? Q.countSet.size - Q.counted.size : 0; },
    get pool() { return Q ? Q.pool.length : 0; },
    get seats() { return Q ? { filled: Q.seated.length, cap: Q.p.cap } : null; },
    get wrongTotal() { return T.wrongTotal; },
    pump() { E.pumpTimers(); },
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
      const want = Q.askValue;
      for (const b of answersEl.querySelectorAll('.ans-btn')) {
        const v = Number(b.textContent);
        if (correct ? v === want : v !== want) { b.click(); return v; }
      }
      return false;
    },
    centers: {
      poolPassenger(i) {
        return Q && Q.pool[i || 0] ? E.centerOf(Q.pool[i || 0].el) : null;
      },
      carriage() { return E.centerOf(carriageEl); },
      uncountedCoin() {
        if (!Q || !Q.countSet) return null;
        const t = Q.countOrder.find((x) => !Q.counted.has(x));
        return t ? E.centerOf(targetEl(t)) : null;
      },
    },
  };

  /* ---------------- 啟動 ---------------- */
  function init() {
    E.registerScreens(
      { title: $('screen-title'), game: $('screen-game'), end: $('screen-end') },
      'title'
    );
    E.mountChar('lottie-title-elephant', window.LOTTIE_ELEPHANT, 'elephant.gif', 'title');
    E.mountChar('lottie-title-boy', window.LOTTIE_BOY, 'boy.gif', 'title');
    E.mountChar('lottie-title-shark', window.LOTTIE_SHARK, 'shark.gif', 'title');
    E.mountChar('lottie-guide', window.LOTTIE_ELEPHANT, 'elephant.gif', 'game');
    E.mountChar('lottie-end-boy', window.LOTTIE_BOY, 'boy.gif', 'end');
    bindUI();
    E.bindLifecycle({ onResize });
    E.playScreenChars('title');

    if (E.URL_MODE && MODES.indexOf(E.URL_MODE) >= 0) {
      // 測試直開：關語音、直接開跑
      E.speech.on = false;
      runSession(E.URL_MODE);
    } else if (E.URL_PLAY && MODES.indexOf(E.URL_PLAY) >= 0) {
      // 從太空站入口來的：先顯示出發按鈕（點擊手勢＝解鎖 iOS 音訊與語音）
      const ov = $('start-overlay');
      const labels = { lv1: '🚂 湊 5 小火車', lv2: '🚃 湊 10 小火車', lv3: '🚄 湊十法加法' };
      $('start-mode-label').textContent = labels[E.URL_PLAY];
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
