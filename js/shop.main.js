/* ============================================================
   柑仔店 — 付錢與找錢（面額 1/5/10/50）
   lv1 剛好付錢：從錢包湊面額、按鈴結帳、老闆逐枚數錢驗收
   lv2 幫忙找錢：先答「找多少」、再從收銀機湊出找錢
   lv3 往上數找錢：37→(1元)→40→(10元)→50，邊放邊數
   共用 js/engine.js；starmap key: ('shop','lv1'..'lv3')
   ============================================================ */
(function () {
  'use strict';

  const SL = window.ShopLogic;
  const sfx = window.sfx;
  const $ = (id) => document.getElementById(id);
  // 注意：#counter 是櫃台場景，大字計數改用 #counter-num
  const E = Engine.create({ counter: 'counter-num', reshowHint: reshowHintForPhase });

  /* ---------------- DOM ---------------- */
  const app = $('app');
  const screens = { title: $('screen-title'), game: $('screen-game'), end: $('screen-end') };
  const spriteLayer = $('sprite-layer');
  const itemArt = $('item-art');
  const priceTag = $('price-tag');
  const customerEl = $('customer');
  const paidNote = $('paid-note');
  const paytray = $('paytray');
  const paytrayLabel = $('paytray-label');
  const traySlots = $('tray-slots');
  const bellBtn = $('btn-bell');
  const cumBadge = $('cum-badge');
  const walletEl = $('wallet');
  const walletLabel = $('wallet-label');
  const walletRows = $('wallet-rows');
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
      phase: 'idle',      // pay / checking / countup / count / answer / anim / done
      walletCoins: [],    // 還在錢包的
      trayCoins: [],      // 已放到盤上的（順序）
      cum: 0,             // lv3 往上數的目前累計
      counted: new Set(), // 鷹架點數
      askValue: null,
      wrongAnswers: 0,
    };
  }

  const denomOf = (c) => c.denom;
  const trayTotal = () => Q.trayCoins.reduce((s, c) => s + c.denom, 0);

  /* ---------------- 硬幣 ---------------- */
  function makeCoin(denom, homeSlot) {
    const cls = 'coin c' + denom;
    const sp = new E.Sprite(cls, '<b>' + denom + '</b><i>元</i>');
    sp.denom = denom;
    sp.homeSlot = homeSlot;
    sp.anchor = homeSlot;
    const t = E.centerInLayer(homeSlot);
    sp.placeAt(t.x, t.y - 40, { scale: 0.5 });
    sp.glideTo(t.x, t.y, { dur: 300, scale: 1 });
    return sp;
  }

  /* ---------------- 錢包 ---------------- */
  function buildWallet(counts) {
    walletRows.innerHTML = '';
    Q.walletCoins = [];
    const denoms = [[10, counts.c10 || 0], [5, counts.c5 || 0], [1, counts.c1 || 0]];
    for (const [denom, n] of denoms) {
      if (!n) continue;
      const row = document.createElement('div');
      row.className = 'wrow';
      walletRows.appendChild(row);
      for (let i = 0; i < n; i++) {
        const slot = document.createElement('div');
        slot.className = 'wslot s' + denom;
        row.appendChild(slot);
      }
    }
    // 版面就緒後再生幣（量測才準）
    const slots = walletRows.querySelectorAll('.wslot');
    let idx = 0;
    for (const [denom, n] of denoms) {
      for (let i = 0; i < n; i++) {
        const sp = makeCoin(denom, slots[idx++]);
        Q.walletCoins.push(sp);
        sfx.tick(i % 5);
      }
    }
  }

  /* ---------------- 盤（動態格＋整盤校正，學自盤子事故） ---------------- */
  function trayResync() {
    for (const c of Q.trayCoins) {
      const t = E.centerInLayer(c.anchor);
      c.glideTo(t.x, t.y, { dur: 160, scale: 1 });
    }
  }
  function trayAdd(sp) {
    const slot = document.createElement('div');
    slot.className = 'tslot s' + sp.denom;
    traySlots.appendChild(slot);
    sp.anchor = slot;
    Q.trayCoins.push(sp);
    const i = Q.walletCoins.indexOf(sp);
    if (i >= 0) Q.walletCoins.splice(i, 1);
    const t = E.centerInLayer(slot);
    sp.glideTo(t.x, t.y, { dur: 260, scale: 1 });
    sfx.clink(sp.denom >= 10);
    trayResync();
  }
  function trayRemove(sp) {
    const i = Q.trayCoins.indexOf(sp);
    if (i < 0) return;
    Q.trayCoins.splice(i, 1);
    if (sp.anchor && sp.anchor.classList.contains('tslot')) sp.anchor.remove();
    sp.anchor = sp.homeSlot;
    Q.walletCoins.push(sp);
    const t = E.centerInLayer(sp.homeSlot);
    sp.glideTo(t.x, t.y, { dur: 260, scale: 1 });
    sfx.clink(sp.denom >= 10);
    trayResync();
  }

  /* ---------------- 拖曳 ---------------- */
  const drag = { active: false, pointerId: null, sprite: null };
  const overTray = (x, y) => E.inflatedContains(paytray, x, y, 14);
  const overWallet = (x, y) => E.inflatedContains(walletEl, x, y, 14);

  function draggableCheck(sp) {
    if (!Q || sp.dead) return false;
    if (Q.phase === 'pay' || Q.phase === 'countup') {
      return Q.walletCoins.includes(sp) || Q.trayCoins.includes(sp);
    }
    return false;
  }

  function onLayerPointerDown(e) {
    if (!Q) return;
    const el = e.target && e.target.closest ? e.target.closest('.sprite') : null;
    const sp = el && el.__sprite;
    if (!sp) return;
    // 鷹架點數：點盤上的錢跳面額
    if (Q.phase === 'count' && Q.trayCoins.includes(sp) && !Q.counted.has(sp)) {
      e.preventDefault();
      sfx.unlock();
      Q.counted.add(sp);
      sp.el.classList.add('counted');
      sfx.tick(Q.counted.size - 1);
      E.tapNum(sp.el, sp.denom);
      sp.pulse().catch(() => {});
      if (Q.counted.size >= Q.trayCoins.length) E.fireSignal();
      return;
    }
    if (drag.active || !draggableCheck(sp)) return;
    e.preventDefault();
    drag.active = true; drag.pointerId = e.pointerId; drag.sprite = sp;
    E.hideHint(true);
    sfx.unlock();
    sfx.grab();
    sp.setDragging(true);
    moveDragTo(e.clientX, e.clientY);
  }
  function moveDragTo(cx, cy) {
    const pt = E.toLayer({ x: cx, y: cy });
    const sp = drag.sprite;
    sp.el.style.transition = 'none';
    sp.x = pt.x; sp.y = pt.y - 14; sp.apply();
    paytray.classList.toggle('drag-over', overTray(cx, cy));
    walletEl.classList.toggle('drag-over', overWallet(cx, cy));
  }
  function onPointerMove(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    moveDragTo(e.clientX, e.clientY);
  }
  function onPointerUp(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    const sp = drag.sprite;
    drag.active = false; drag.sprite = null;
    paytray.classList.remove('drag-over');
    walletEl.classList.remove('drag-over');
    sp.setDragging(false);
    handleDrop(sp, e.clientX, e.clientY);
  }
  function snapBack(sp) {
    if (sp.dead || !sp.anchor) return;
    const t = E.centerInLayer(sp.anchor);
    sp.glideTo(t.x, t.y, { dur: 280, scale: 1 });
  }

  function handleDrop(sp, cx, cy) {
    if (!Q || sp.dead || (Q.phase !== 'pay' && Q.phase !== 'countup')) { snapBack(sp); return; }
    const inTray = Q.trayCoins.includes(sp);

    if (overTray(cx, cy) && !inTray) {
      if (Q.phase === 'countup' && !countupAccept(sp)) { snapBack(sp); return; }
      trayAdd(sp);
      if (Q.phase === 'countup') countupAfterAdd(sp);
      E.hideHint(true);
      return;
    }
    if (overWallet(cx, cy) && inTray) {
      trayRemove(sp);
      if (Q.phase === 'countup') {
        Q.cum -= sp.denom;
        updateCumBadge();
      }
      E.hideHint(true);
      return;
    }
    snapBack(sp);
  }

  /* ---------------- lv3 往上數規則 ---------------- */
  function updateCumBadge() {
    cumBadge.textContent = '現在 ' + Q.cum + ' 元';
  }
  function countupAccept(sp) {
    const d = sp.denom;
    if (Q.cum + d > 50) { E.worry('會超過 50 喔！'); return false; }
    if (Q.cum % 10 !== 0 && d !== 1) {
      E.worry('先用 1 元，湊到整十！');
      return false;
    }
    if (Q.cum % 10 === 0 && d === 1) {
      E.worry('已經整十了，放 10 元比較快！');
      return false;
    }
    return true;
  }
  function countupAfterAdd(sp) {
    Q.cum += sp.denom;
    updateCumBadge();
    E.counterShow(Q.cum, 34);
    sfx.tick(Math.floor(Q.cum / 5) % 12);
    if (Q.cum % 10 === 0 && Q.cum < 50) sfx.ding();
    if (Q.cum === 50) {
      Q.phase = 'anim';
      E.hideHint(false);
      sfx.ding();
      E.caption('剛好 50！');
      E.fireSignal();
    } else {
      reshowHintForPhase();
    }
  }

  /* ---------------- 結帳（lv1/lv2）：老闆逐枚數錢驗收 ---------------- */
  async function ringBell() {
    if (!Q || Q.phase !== 'pay') return;
    if (!Q.trayCoins.length) { E.worry('盤子裡還沒放錢喔！'); return; }
    Q.phase = 'checking';
    bellBtn.classList.remove('pulse');
    E.hideHint(false);
    sfx.ding();
    try {
      await E.sayWait('我來數數看！', 1400);
      let cum = 0;
      // 由大到小數（像老闆數錢）
      const ordered = Q.trayCoins.slice().sort((a, b) => b.denom - a.denom);
      for (let i = 0; i < ordered.length; i++) {
        const c = ordered[i];
        c.pulse().catch(() => {});
        cum += c.denom;
        E.counterShow(cum, 34);
        sfx.tick(i);
        await E.sleep(480);
      }
      await E.sleep(500);
      E.counterHide();
      const target = Q.p.type === 'pay' ? Q.p.price : Q.p.change;
      if (cum === target) {
        E.fireSignal(); // 付對了！主流程接手
      } else if (cum > target) {
        await E.worryWait('一共 ' + cum + ' 元，多了 ' + (cum - target) + ' 元！拿一些回去吧！', 3000);
        Q.phase = 'pay';
        bellBtn.classList.add('pulse');
        reshowHintForPhase();
      } else {
        await E.worryWait('一共 ' + cum + ' 元，還少 ' + (target - cum) + ' 元！再放一些！', 3000);
        Q.phase = 'pay';
        bellBtn.classList.add('pulse');
        reshowHintForPhase();
      }
    } catch (err) { if (!err.isCancel) throw err; }
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

  /* ---------------- 商品與櫃台 ---------------- */
  function setupCounter(p) {
    itemArt.innerHTML = window.ShopArt.draw(p.item.key);
    priceTag.textContent = p.item.name + ' ' + p.price + ' 元';
    pdLabel.textContent = p.item.name + ' ' + p.price + ' 元';
    if (p.type === 'pay') {
      customerEl.classList.remove('show');
    } else {
      customerEl.classList.add('show');
      paidNote.innerHTML = '付 <span class="mini-coin">' + p.pay + '</span> 元';
    }
  }

  // 成功後：盤上的錢飛給老闆（或客人），商品/找錢交付
  async function settle(toCustomer) {
    Q.phase = 'anim';
    const targetEl = toCustomer ? $('customer-img') : $('keeper');
    const pt = E.centerInLayer(targetEl);
    const coins = Q.trayCoins.slice();
    coins.forEach((c, i) => {
      setTimeout(() => {
        if (!c.dead && !E.run.cancelled) c.glideTo(pt.x, pt.y, { dur: 550, scale: 0.25, fade: true });
      }, i * E.ms(70));
    });
    sfx.whoosh();
    await E.sleep(550 + coins.length * 70 + 150);
    coins.forEach((c) => c.destroy());
    Q.trayCoins = [];
    traySlots.innerHTML = '';
  }

  /* ---------------- 提示 ---------------- */
  function bestHintCoin() {
    if (!Q) return null;
    if (Q.phase === 'countup') {
      const want = Q.cum % 10 !== 0 ? 1 : 10;
      return Q.walletCoins.find((c) => c.denom === want) || null;
    }
    // pay：用建議組合裡還缺的最大面額
    const target = Q.p.type === 'pay' ? Q.p.price : Q.p.change;
    const remain = target - trayTotal();
    if (remain <= 0) return null;
    const w = { c10: 0, c5: 0, c1: 0 };
    for (const c of Q.walletCoins) w['c' + c.denom]++;
    const combo = SL.suggestCombo(remain, w);
    if (!combo) return null;
    const want = combo.c10 ? 10 : combo.c5 ? 5 : 1;
    return Q.walletCoins.find((c) => c.denom === want) || null;
  }
  function reshowHintForPhase() {
    if (!Q) return;
    if (Q.phase === 'pay' || Q.phase === 'countup') {
      const c = bestHintCoin();
      if (c) E.showHint(E.centerOf(c.el), E.centerOf(traySlots));
      else if (Q.phase === 'pay' && trayTotal() >= 1) {
        const b = E.centerOf(bellBtn);
        E.showHint(b, b); // 湊夠了 → 提示按鈴
      }
    }
  }

  /* ---------------- 題目流程 ---------------- */
  async function runPayQuestion(p) {
    paytrayLabel.textContent = '付的錢';
    walletLabel.textContent = '我的錢包';
    bellBtn.classList.remove('hidden');
    bellBtn.classList.add('pulse');
    cumBadge.classList.remove('show');
    setupCounter(p);
    await E.sayWait('歡迎光臨！' + p.item.name + ' ' + p.price + ' 元！', 2800);
    buildWallet(p.wallet);
    await E.sleep(500);
    Q.phase = 'pay';
    E.say('從錢包拿剛剛好 ' + p.price + ' 元，放到盤子裡，再按鈴結帳！');
    reshowHintForPhase();
    await E.waitSignal(); // 結帳驗收通過
    await E.sayWait('剛剛好 ' + p.price + ' 元！謝謝惠顧！', 2400);
    await settle(false);
    pdLabel.textContent = '買到了！';
  }

  async function runChangeQuestion(p) {
    paytrayLabel.textContent = '找的錢';
    walletLabel.textContent = '收銀機';
    bellBtn.classList.remove('hidden');
    cumBadge.classList.remove('show');
    setupCounter(p);
    await E.sayWait('客人買' + p.item.name + ' ' + p.price + ' 元，付了 ' + p.pay + ' 元！', 3200);
    const opts = SL.makeChangeOptions(p, new SL.Rng(E.URL_SEED != null ? E.URL_SEED + G.qIndex : p.price * 17 + p.pay));
    await askOptions(opts, p.change, '要找客人多少元呢？', async (v) => {
      const diff = v - p.change;
      await E.worryWait(Math.abs(diff) === 10
        ? '想想看：' + p.pay + ' 減 ' + p.price + '，十位要記得退位喔！'
        : '再算一次：' + p.pay + ' 減 ' + p.price + ' 是多少？', 3000);
    });
    answersEl.innerHTML = '';
    await E.sayWait('對！要找 ' + p.change + ' 元！', 2000);
    buildWallet(p.till);
    await E.sleep(500);
    Q.phase = 'pay';
    bellBtn.classList.add('pulse');
    E.say('從收銀機拿 ' + p.change + ' 元放到盤子裡，按鈴給客人！');
    reshowHintForPhase();
    await E.waitSignal();
    await E.sayWait('找 ' + p.change + ' 元，謝謝光臨！', 2400);
    await settle(true);
    pdLabel.textContent = '找對了！';
  }

  async function runCountUpQuestion(p) {
    paytrayLabel.textContent = '找的錢';
    walletLabel.textContent = '收銀機';
    bellBtn.classList.add('hidden');
    cumBadge.classList.add('show');
    setupCounter(p);
    Q.cum = p.price;
    updateCumBadge();
    await E.sayWait(p.item.name + ' ' + p.price + ' 元，客人付 50 元！我們邊放邊數，從 ' + p.price + ' 數到 50！', 3800);
    buildWallet({ c10: p.tens + 1, c5: 0, c1: p.toTen + 2 });
    await E.sleep(500);
    Q.phase = 'countup';
    E.counterShow(p.price, 34);
    E.say('先用 1 元，從 ' + p.price + ' 湊到整十！');
    reshowHintForPhase();
    await E.waitSignal(); // 湊到 50
    E.counterHide();
    await E.sayWait('數到 50 了！盤子裡的錢，就是要找的錢！', 3000);
    // 問找了多少（答錯 → 點數盤上的錢當鷹架）
    const opts = SL.makeChangeOptions(p, new SL.Rng(E.URL_SEED != null ? E.URL_SEED + G.qIndex : p.price * 13 + 7));
    await askOptions(opts, p.change, '我們找了客人多少元呢？', async () => {
      await E.worryWait('點點看盤子裡的錢，數數看一共多少！', 2600);
      Q.counted = new Set();
      for (const c of Q.trayCoins) c.el.classList.remove('counted');
      Q.phase = 'count';
      const first = Q.trayCoins[0];
      if (first) { const c = E.centerOf(first.el); E.showHint(c, c); }
      await E.waitSignal(); // 全點完
      E.hideHint(false);
      Q.phase = 'answer';
      E.say('現在知道了嗎？');
    });
    answersEl.innerHTML = '';
    await E.sayWait('對！找了 ' + p.change + ' 元！', 2000);
    await settle(true);
    pdLabel.textContent = '找對了！';
  }

  /* ---------------- 一場 ---------------- */
  const praises = ['做得好！', '你是小店長！', '算得真快！', '客人好開心！', '生意越來越好！'];

  function clearStage() {
    drag.active = false;
    drag.sprite = null;
    for (const el of spriteLayer.querySelectorAll('.sprite')) {
      if (el.__sprite) el.__sprite.destroy(); else el.remove();
    }
    walletRows.innerHTML = '';
    traySlots.innerHTML = '';
    answersEl.innerHTML = '';
    cumBadge.classList.remove('show');
    bellBtn.classList.remove('pulse');
    E.counterHide();
    E.hideHint(false);
  }

  async function runSession(lv) {
    E.newRun();
    G.lv = lv;
    G.qIndex = 0; G.wrongTotal = 0;
    const rng = new SL.Rng(E.URL_SEED != null ? E.URL_SEED : undefined);
    G.session = SL.generateSession(Number(lv.slice(2)), { rng });
    for (const el of starsEl.children) el.classList.remove('lit');
    E.showScreen('game');

    try {
      for (let i = 0; i < G.session.length; i++) {
        G.qIndex = i;
        const p = G.session[i];
        Q = newRound(p);
        clearStage();
        await E.sleep(400);
        if (p.type === 'pay') await runPayQuestion(p);
        else if (p.type === 'change') await runChangeQuestion(p);
        else await runCountUpQuestion(p);

        Q.phase = 'done';
        await E.sleep(400);
        starsEl.children[i].classList.add('lit');
        sfx.fanfare();
        await E.sayWait(praises[i % praises.length], 2200);
      }
      await showEnd();
    } catch (e) {
      if (!e.isCancel) { console.error(e); throw e; }
    }
  }

  async function showEnd() {
    Q = null;
    clearStage();
    if (window.Starmap) window.Starmap.add('shop', G.lv, Math.max(1, G.session.length - G.wrongTotal));
    $('end-stars').textContent = '⭐'.repeat(G.session.length);
    const msg = G.wrongTotal === 0 ? '每一筆都算得剛剛好，太棒了！' : '再開店一次，會算得更快！';
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
  function onResize() {
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
    $('btn-again').addEventListener('click', () => { sfx.unlock(); E.speech.prime(); sfx.tap(); runSession(G.lv); });
    $('btn-menu').addEventListener('click', () => { sfx.tap(); E.showScreen('title'); });
    bellBtn.addEventListener('click', () => {
      sfx.unlock();
      ringBell().catch((err) => { if (!err.isCancel) throw err; });
    });

    spriteLayer.addEventListener('pointerdown', onLayerPointerDown, { passive: false });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

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
    get trayTotal() { return Q ? trayTotal() : 0; },
    get cum() { return Q ? Q.cum : 0; },
    get walletLeft() { return Q ? Q.walletCoins.length : 0; },
    get wrongTotal() { return G.wrongTotal; },
    startLevel(lv) { runSession(lv); },
    pump() { E.pumpTimers(); },
    ringBell() { bellBtn.click(); },
    centers: {
      walletCoin(denom) {
        const c = Q ? Q.walletCoins.find((x) => x.denom === denom) : null;
        return c ? E.centerOf(c.el) : null;
      },
      tray() { return E.centerOf(traySlots); },
      wallet() { return E.centerOf(walletRows); },
      trayCoin(i) { return Q && Q.trayCoins[i] ? E.centerOf(Q.trayCoins[i].el) : null; },
      uncountedTrayCoin() {
        const c = Q ? Q.trayCoins.find((x) => !Q.counted.has(x)) : null;
        return c ? E.centerOf(c.el) : null;
      },
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
    E.mountChar('lottie-title-shark', window.LOTTIE_SHARK, 'shark.gif', 'title');
    E.mountChar('lottie-guide', window.LOTTIE_ELEPHANT, 'elephant.gif', 'game');
    E.mountChar('lottie-end-boy', window.LOTTIE_BOY, 'boy.gif', 'end');
    bindUI();
    E.playScreenChars('title');
    const valid = /^lv[123]$/;
    if (E.URL_MODE && valid.test(E.URL_MODE)) {
      E.speech.on = false;
      runSession(E.URL_MODE);
    } else if (E.URL_PLAY && valid.test(E.URL_PLAY)) {
      const labels = { lv1: '🪙 剛好付錢', lv2: '💰 幫忙找錢', lv3: '🔢 往上數找錢' };
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
