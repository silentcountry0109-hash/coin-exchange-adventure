/* ============================================================
   平分蛋糕 — 分數初步
   lv1 公平切蛋糕：點對「過圓心」的切線才平分；切歪會看到一大一小
   lv2 幾分之一：切 n 等分 → 拖一片給小夥伴 → 答 1/n（直式分數按鈕）
   lv3 誰的比較大：1/a vs 1/b 疊比動畫 →「分越多份，每份越小」
   共用 js/engine.js；starmap key: ('cake','lv1'..'lv3')
   ============================================================ */
(function () {
  'use strict';

  const CK = window.CakeLogic;
  const sfx = window.sfx;
  const $ = (id) => document.getElementById(id);
  const E = Engine.create({ reshowHint: reshowHintForPhase });

  /* ---------------- DOM ---------------- */
  const app = $('app');
  const screens = { title: $('screen-title'), game: $('screen-game'), end: $('screen-end') };
  const spriteLayer = $('sprite-layer');
  const stage = $('cake-stage');
  const cakesRow = $('cakes-row');
  const friendsRow = $('friends-row');
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
      phase: 'idle',   // cut / serve / answer / anim / done
      cutStage: 0,     // lv1 第幾刀
      cutsLeft: 0,     // lv2 還有幾條線
      wedges: [],      // 切好的蛋糕塊 Sprite
      grabWedge: null, // lv2 可拖的那塊
      cakePx: 220,
      correctLineEl: null,
      askValue: null,
      wrongAnswers: 0,
    };
  }

  /* ---------------- 幾何 ---------------- */
  const R = 50;
  const rad = (d) => d * Math.PI / 180;
  const pt = (a, r) => ({ x: r * Math.cos(rad(a)), y: r * Math.sin(rad(a)) });

  // 弦端點：方向角 angle、垂直偏移 offset（R 的比例）
  function chordPoints(angle, offset) {
    const d = { x: Math.cos(rad(angle)), y: Math.sin(rad(angle)) };
    const n = { x: -d.y, y: d.x };
    const c = { x: n.x * offset * R, y: n.y * offset * R };
    const half = Math.sqrt(Math.max(0, 1 - offset * offset)) * R * 1.12;
    return [
      { x: c.x - d.x * half, y: c.y - d.y * half },
      { x: c.x + d.x * half, y: c.y + d.y * half },
    ];
  }

  // 扇形路徑（a0→a1 度）
  function wedgePath(a0, a1) {
    const span = a1 - a0;
    const e = span >= 180 ? 0.5 : 0; // 避免 180° 弧線二義性
    const p0 = pt(a0, R), p1 = pt(a1 - e, R);
    const large = span - e > 180 ? 1 : 0;
    return 'M 0 0 L ' + p0.x.toFixed(2) + ' ' + p0.y.toFixed(2)
      + ' A ' + R + ' ' + R + ' 0 ' + large + ' 1 ' + p1.x.toFixed(2) + ' ' + p1.y.toFixed(2) + ' Z';
  }

  /* ---------------- 蛋糕繪製 ---------------- */
  const SVGNS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    const e2 = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e2.setAttribute(k, attrs[k]);
    return e2;
  }

  // 一顆完整蛋糕（含奶油點裝飾）；回傳 {box, svg}
  function buildCake(flavor, sizePx, opts) {
    opts = opts || {};
    const box = document.createElement('div');
    box.className = 'cake-box';
    const svg = el('svg', { viewBox: '-55 -55 110 110', width: sizePx, height: sizePx, class: 'cake-svg' });
    svg.appendChild(el('ellipse', { cx: 0, cy: 6, rx: 53, ry: 51, fill: 'rgba(58,56,68,.14)', stroke: 'none' }));
    svg.appendChild(el('circle', { cx: 0, cy: 0, r: R, fill: flavor.body, stroke: '#3a3844', 'stroke-width': 3.5 }));
    svg.appendChild(el('circle', { cx: 0, cy: 0, r: R - 4, fill: 'none', stroke: flavor.top, 'stroke-width': 4, opacity: 0.85 }));
    if (!opts.noDots) {
      for (let i = 0; i < 8; i++) {
        const p = pt(i * 45 - 90, 32);
        svg.appendChild(el('circle', { cx: p.x, cy: p.y, r: 4.5, fill: '#fff', stroke: '#3a3844', 'stroke-width': 2 }));
      }
    }
    box.appendChild(svg);
    cakesRow.appendChild(box);
    return { box, svg };
  }

  // 蛋糕塊 sprite（同 viewBox 的透明方塊，內含一塊扇形）
  function makeWedge(flavor, sizePx, a0, a1) {
    const mid = (a0 + a1) / 2;
    const c = pt(mid, R * 0.55);
    const html = '<svg class="wedge-svg" viewBox="-55 -55 110 110" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="' + wedgePath(a0, a1) + '" fill="' + flavor.body + '" stroke="#3a3844" stroke-width="3.5" stroke-linejoin="round"/>'
      + '<circle cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="4.5" fill="#fff" stroke="#3a3844" stroke-width="2"/>'
      + '</svg>';
    const sp = new E.Sprite('wedge', html);
    sp.el.style.width = sizePx + 'px';
    sp.el.style.height = sizePx + 'px';
    sp.mid = mid;
    return sp;
  }

  /* ---------------- 切線 ---------------- */
  // 在 svg 上加一條切線；命中不靠 DOM（多線在中心重疊會歧義），
  // 由 svg 層級的 pointerdown 以「最近線段」數學判定。
  function addCutLine(svg, angle, offset, radial) {
    let p1, p2;
    if (radial) { p1 = { x: 0, y: 0 }; p2 = pt(angle, R * 1.06); }
    else { [p1, p2] = chordPoints(angle, offset); }
    const line = el('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: 'cutline' });
    svg.appendChild(line);
    return { line, p1, p2, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
  }
  // svg 內部座標 ↔ client 座標
  function svgToClient(svg, x, y) {
    const r = svg.getBoundingClientRect();
    return {
      x: r.left + ((x + 55) / 110) * r.width,
      y: r.top + ((y + 55) / 110) * r.height,
    };
  }
  function clientToSvg(svg, x, y) {
    const r = svg.getBoundingClientRect();
    return {
      x: ((x - r.left) / r.width) * 110 - 55,
      y: ((y - r.top) / r.height) * 110 - 55,
    };
  }
  // 點到線段距離（svg 單位）
  function distToSeg(q, p1, p2) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((q.x - p1.x) * dx + (q.y - p1.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = p1.x + t * dx, cy = p1.y + t * dy;
    return Math.hypot(q.x - cx, q.y - cy);
  }
  // 取切線上遠離中心交叉點的提示/測試點（78% 處）
  function lineFarPoint(svg, L) {
    const x = L.p1.x + (L.p2.x - L.p1.x) * 0.78;
    const y = L.p1.y + (L.p2.y - L.p1.y) * 0.78;
    return svgToClient(svg, x, y);
  }
  // 綁定「點最近的候選線」：cands=[{line,p1,p2,...}]，cb(cand)
  function bindNearestLineTap(svg, getCands, cb) {
    svg.addEventListener('pointerdown', (e) => {
      const cands = getCands();
      if (!cands || !cands.length) return;
      const q = clientToSvg(svg, e.clientX, e.clientY);
      let best = null, bd = Infinity;
      for (const c of cands) {
        const d = distToSeg(q, c.p1, c.p2);
        if (d < bd) { bd = d; best = c; }
      }
      if (best && bd <= 14) {
        e.preventDefault();
        cb(best);
      }
    }, { passive: false });
  }

  /* ---------------- lv1 公平切 ---------------- */
  function showUnfairPreview(svg, wrong) {
    // 在弦兩側標「大」「小」（偏移弦：offset 側較小）
    const n = { x: -Math.sin(rad(wrong.angle)), y: Math.cos(rad(wrong.angle)) };
    const sign = wrong.offset >= 0 ? 1 : -1;
    const bigC = { x: -n.x * sign * R * 0.5, y: -n.y * sign * R * 0.5 };
    const smallC = { x: n.x * sign * (Math.abs(wrong.offset) + 0.32) * R, y: n.y * sign * (Math.abs(wrong.offset) + 0.32) * R };
    const labels = [];
    if (wrong.kind === 'offset') {
      labels.push(el('text', { x: bigC.x, y: bigC.y, 'text-anchor': 'middle', 'font-size': 15, class: 'size-label' }));
      labels[0].textContent = '大';
      labels.push(el('text', { x: smallC.x, y: smallC.y + 4, 'text-anchor': 'middle', 'font-size': 11, class: 'size-label' }));
      labels[1].textContent = '小';
    } else {
      // skew：45° 斜切 → 兩大兩小
      const t1 = el('text', { x: 0, y: -R * 0.6 + 4, 'text-anchor': 'middle', 'font-size': 13, class: 'size-label' });
      t1.textContent = '大小不同！';
      labels.push(t1);
    }
    for (const t of labels) svg.appendChild(t);
    setTimeout(() => labels.forEach((t) => t.remove()), 1900);
  }

  async function runFairQuestion(p) {
    pdLabel.textContent = '分給 ' + p.n + ' 個人';
    const size = Q.cakePx = Math.min(Math.round(stage.clientWidth * 0.56), 230);
    const { svg } = buildCake(p.flavor, size);
    // 夥伴列
    friendsRow.innerHTML = '';
    const friends = CK.FRIENDS.slice(0, p.n);
    for (const f of friends) {
      const d = document.createElement('div');
      d.className = 'friend';
      d.innerHTML = '<img src="assets/' + f.img + '" alt="' + f.name + '"><div class="plate-dish"></div>';
      friendsRow.appendChild(d);
    }
    await E.sayWait(p.flavor.name + '要平分給 ' + p.n + ' 個人！每一份都要一樣大喔！', 3200);

    // 最近線判定（一次繫結，取用當前 stage 的候選）
    let stageCands = [];
    let stageCb = null;
    let lastWorryAt = 0;
    bindNearestLineTap(svg, () => (Q && Q.phase === 'cut' ? stageCands : []), (L) => {
      if (stageCb) stageCb(L);
    });

    const doneCuts = [];
    for (let s = 0; s < p.cuts.length; s++) {
      Q.cutStage = s;
      const cut = p.cuts[s];
      const rng2 = new CK.Rng((E.URL_SEED != null ? E.URL_SEED : 7) * 13 + G.qIndex * 5 + s);
      const cands = rng2.shuffle([
        { def: cut.correct, ok: true },
        { def: cut.wrongs[0], ok: false },
        { def: cut.wrongs[1], ok: false },
      ]);
      const lineEls = cands.map((c2) => ({ ...addCutLine(svg, c2.def.angle, c2.def.offset), ...c2 }));
      stageCands = lineEls;
      Q.correctLineEl = lineEls.find((l) => l.ok);
      Q.correctLineEl.svg = svg;
      Q.phase = 'cut';
      E.say(s === 0 ? '哪一條線可以平分？點下去切切看！' : '再切一刀！哪一條才公平？');

      await new Promise((resolve, reject) => {
        E.run.waiters.push({ reject });
        stageCb = (L) => {
          if (Q.phase !== 'cut' || E.run.cancelled) return;
          sfx.unlock();
          if (L.ok) {
            Q.phase = 'anim';
            E.hideHint(false);
            sfx.whoosh(); sfx.clink(true);
            L.line.classList.add('done');
            L.line.classList.remove('next');
            lineEls.filter((x) => !x.ok).forEach((x) => x.line.remove());
            doneCuts.push(cut.correct);
            stageCands = [];
            resolve();
          } else {
            G.wrongTotal++; Q.wrongAnswers++;
            L.line.classList.add('bad');
            sfx.uhoh();
            const now = performance.now();
            if (now - lastWorryAt > 2200) {
              lastWorryAt = now;
              showUnfairPreview(svg, L.def);
              E.worry(L.def.kind === 'skew'
                ? '這樣切會兩塊大、兩塊小，不公平！'
                : '這樣切，一邊大一邊小，不公平！要切過蛋糕的中心！');
            }
            setTimeout(() => L.line.classList.remove('bad'), 1600);
          }
        };
      });
      await E.sleep(400);
    }

    // 分開 → 飛給夥伴
    const boundaries = [];
    const base = doneCuts[0].angle;
    for (let k = 0; k < p.n; k++) boundaries.push(base + k * (360 / p.n));
    svg.parentElement.style.visibility = 'hidden';
    const center = E.centerInLayer(svg);
    const wedges = [];
    for (let k = 0; k < p.n; k++) {
      const w = makeWedge(p.flavor, Q.cakePx, boundaries[k], boundaries[k] + 360 / p.n);
      const off = pt(w.mid, 9);
      w.placeAt(center.x, center.y);
      w.glideTo(center.x + off.x, center.y + off.y, { dur: 350 });
      wedges.push(w);
    }
    Q.wedges = wedges;
    sfx.pop();
    await E.sleep(700);
    E.caption('每份一樣大＝平分！');
    E.speech.speak('每一份都一樣大，平分成功！');
    const friendEls = friendsRow.querySelectorAll('.friend');
    for (let k = 0; k < wedges.length; k++) {
      const fpt = E.centerInLayer(friendEls[k % friendEls.length]);
      wedges[k].glideTo(fpt.x, fpt.y - 14, { dur: 600, scale: 0.32 });
      sfx.hop();
      await E.sleep(220);
    }
    await E.sleep(700);
    await E.speechDrain('每一份都一樣大，平分成功！');
  }

  /* ---------------- lv2 幾分之一 ---------------- */
  function divisionLines(n, theta) {
    // 偶數：n/2 條直徑；3：3 條半徑
    const out = [];
    if (n === 3) {
      for (let k = 0; k < 3; k++) out.push({ angle: theta + k * 120, radial: true });
    } else {
      for (let k = 0; k < n / 2; k++) out.push({ angle: (theta + k * (360 / n)) % 180, radial: false });
    }
    return out;
  }

  async function runUnitQuestion(p) {
    pdLabel.textContent = '平分成 ' + p.n + ' 份';
    const size = Q.cakePx = Math.min(Math.round(stage.clientWidth * 0.52), 215);
    const { svg } = buildCake(p.flavor, size);
    friendsRow.innerHTML = '';
    const fd = document.createElement('div');
    fd.className = 'friend';
    fd.innerHTML = '<img src="assets/' + p.friend.img + '" alt="' + p.friend.name + '"><div class="plate-dish"></div>';
    friendsRow.appendChild(fd);

    await E.sayWait(p.flavor.name + '要平分成 ' + p.n + ' 份，分一份給' + p.friend.name + '！', 3200);

    const theta = 0;
    const lines = divisionLines(p.n, theta).map((d) => ({ ...addCutLine(svg, d.angle, 0, d.radial), def: d }));
    for (const L of lines) L.line.classList.add('next');
    Q.cutsLeft = lines.length;
    Q.correctLineEl = lines[0];
    Q.correctLineEl.svg = svg;
    Q.phase = 'cut';
    E.say('沿著亮亮的線，一刀一刀切！');

    await new Promise((resolve, reject) => {
      E.run.waiters.push({ reject });
      bindNearestLineTap(svg,
        () => (Q && Q.phase === 'cut' ? lines.filter((x) => !x.line.classList.contains('done')) : []),
        (L) => {
          if (Q.phase !== 'cut' || E.run.cancelled) return;
          sfx.unlock();
          L.line.classList.add('done');
          L.line.classList.remove('next');
          sfx.whoosh(); sfx.tick(lines.length - Q.cutsLeft);
          Q.cutsLeft--;
          Q.correctLineEl = lines.find((x) => !x.line.classList.contains('done')) || null;
          if (Q.correctLineEl) Q.correctLineEl.svg = svg;
          E.hideHint(true);
          if (Q.cutsLeft <= 0) { Q.phase = 'anim'; resolve(); }
        });
    });

    // 分開，其中一塊可拖給夥伴
    await E.sleep(300);
    svg.parentElement.style.visibility = 'hidden';
    const center = E.centerInLayer(svg);
    const startA = p.n === 3 ? theta : theta;
    const wedges = [];
    for (let k = 0; k < p.n; k++) {
      const a0 = startA + k * (360 / p.n);
      const w = makeWedge(p.flavor, Q.cakePx, a0, a0 + 360 / p.n);
      const off = pt(w.mid, 8);
      w.placeAt(center.x, center.y);
      w.glideTo(center.x + off.x, center.y + off.y, { dur: 350 });
      wedges.push(w);
    }
    Q.wedges = wedges;
    sfx.pop();
    await E.sleep(600);
    Q.grabWedge = wedges[0];
    Q.grabWedge.el.classList.add('grabbable');
    Q.phase = 'serve';
    E.say('拖一塊，分給' + p.friend.name + '！');
    reshowHintForPhase();
    await E.waitSignal(); // 送達
    await E.sleep(300);

    // 提問：幾分之一
    const opts = CK.makeUnitOptions(p, new CK.Rng(E.URL_SEED != null ? E.URL_SEED + G.qIndex : p.n * 31 + 5));
    await askFracOptions(opts, p.answer,
      p.friend.name + '拿到多少蛋糕呢？', async () => {
        await E.worryWait('蛋糕平分成 ' + p.n + ' 份，一份就是 ' + p.n + ' 分之一！', 3200);
        // 鷹架：逐塊數 1..n
        for (let k = 0; k < Q.wedges.length; k++) {
          const w = Q.wedges[k];
          if (!w.dead) { w.pulse().catch(() => {}); }
          sfx.tick(k);
          E.counterShow(k + 1, 30);
          await E.sleep(430);
        }
        await E.sleep(400);
        E.counterHide();
      });
    E.caption(p.n + ' 分之一！');
    E.speech.speak('一份就是 ' + p.n + ' 分之一！');
    await E.sleep(1400);
    await E.speechDrain('一份就是 ' + p.n + ' 分之一！');
  }

  /* ---------------- lv3 誰的比較大 ---------------- */
  async function runCompareQuestion(p) {
    pdLabel.textContent = '誰的比較大？';
    friendsRow.innerHTML = '';
    const size = Q.cakePx = Math.min(Math.round(stage.clientWidth * 0.38), 165);
    const boxes = [];
    for (let i = 0; i < 2; i++) {
      const n = p.parts[i];
      const { box, svg } = buildCake(p.flavor, size, { noDots: true });
      // 分割線（實線）＋ 高亮一塊（-90 起的第一塊）
      const hl = el('path', { d: wedgePath(-90, -90 + 360 / n), fill: p.flavor.top, stroke: '#3a3844', 'stroke-width': 3, opacity: 0.95 });
      svg.appendChild(hl);
      for (const d of divisionLines(n, -90)) {
        const L = addCutLine(svg, d.angle, 0, d.radial);
        L.line.classList.add('done');
      }
      const name = document.createElement('div');
      name.className = 'cake-name';
      name.innerHTML = '<img src="assets/' + p.friends[i].img + '" alt="">' + p.friends[i].name + '｜切 ' + n + ' 份';
      box.appendChild(name);
      boxes.push({ box, svg, n });
    }
    await E.sayWait('兩個蛋糕一樣大！' + p.friends[0].name + '的切 ' + p.parts[0] + ' 份、'
      + p.friends[1].name + '的切 ' + p.parts[1] + ' 份，每人拿一塊！', 4200);

    const doCompare = async () => {
      // 兩塊高亮蛋糕飛到中央，對齊同角度疊比
      const mid = E.centerInLayer(cakesRow);
      const sps = [];
      for (let i = 0; i < 2; i++) {
        const n = p.parts[i];
        const w = makeWedge(p.flavor, Q.cakePx, -90, -90 + 360 / n);
        if (i === 1) w.el.querySelector('path').setAttribute('fill', p.flavor.top);
        const c = E.centerInLayer(boxes[i].svg);
        w.placeAt(c.x, c.y);
        w.glideTo(mid.x, mid.y, { dur: 600, scale: 1.15 });
        sps.push(w);
      }
      sfx.whoosh();
      await E.sleep(800);
      E.caption('分越多份，每份越小！');
      E.speech.speak('切越多份，每一份就越小喔！');
      await E.sleep(1800);
      await E.speechDrain('切越多份，每一份就越小喔！');
      sps.forEach((w) => w.destroy());
    };

    const opts = CK.makeCompareOptions(p, new CK.Rng(E.URL_SEED != null ? E.URL_SEED + G.qIndex : p.parts[0] * 7 + p.parts[1]));
    await askKeyOptions(opts, p.answer, '誰拿到的比較大呢？', async () => {
      await E.worryWait('我們把兩塊疊起來比比看！', 2200);
      await doCompare();
    });
    await doCompare();
  }

  /* ---------------- 提問（分數／人名按鈕） ---------------- */
  function fracHtml(v) {
    const m = v.split('/');
    return '<b>' + m[0] + '</b><span class="bar"></span><b>' + m[1] + '</b>';
  }
  function askFracOptions(values, correct, sayText, onWrong) {
    return askGeneric(values.map((v) => ({ v, html: fracHtml(v), cls: ' frac' })), correct, sayText, onWrong);
  }
  function askKeyOptions(objs, correct, sayText, onWrong) {
    return askGeneric(objs.map((o) => ({ v: o.key, html: o.label, cls: '' })), correct, sayText, onWrong);
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
        b.className = 'ans-btn' + it.cls;
        b.innerHTML = it.html;
        b.dataset.v = it.v;
        b.addEventListener('click', async () => {
          if (busy || E.run.cancelled) return;
          if (it.v === correct) {
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

  /* ---------------- lv2 拖蛋糕塊 ---------------- */
  const drag = { active: false, pointerId: null, sprite: null };
  function overFriend(x, y) {
    const f = friendsRow.querySelector('.friend');
    return f && E.inflatedContains(f, x, y, 22) ? f : null;
  }
  function onLayerPointerDown(e) {
    if (!Q || Q.phase !== 'serve' || !Q.grabWedge) return;
    const el2 = e.target && e.target.closest ? e.target.closest('.sprite.wedge.grabbable') : null;
    if (!el2 || el2.__sprite !== Q.grabWedge || drag.active) return;
    e.preventDefault();
    drag.active = true; drag.pointerId = e.pointerId; drag.sprite = Q.grabWedge;
    E.hideHint(true);
    sfx.unlock(); sfx.grab();
    drag.sprite.el.classList.add('dragging');
  }
  function onPointerMove(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    const p2 = E.toLayer({ x: e.clientX, y: e.clientY });
    const sp = drag.sprite;
    sp.el.style.transition = 'none';
    sp.x = p2.x; sp.y = p2.y - 10; sp.apply();
    const f = overFriend(e.clientX, e.clientY);
    friendsRow.querySelectorAll('.friend').forEach((x) => x.classList.toggle('drag-over', x === f));
  }
  function onPointerUp(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    const sp = drag.sprite;
    drag.active = false; drag.sprite = null;
    sp.el.classList.remove('dragging');
    friendsRow.querySelectorAll('.friend').forEach((x) => x.classList.remove('drag-over'));
    const f = overFriend(e.clientX, e.clientY);
    if (f) {
      Q.phase = 'anim';
      sp.el.classList.remove('grabbable');
      const t = E.centerInLayer(f);
      sp.glideTo(t.x, t.y - 14, { dur: 380, scale: 0.34 });
      sfx.hop();
      E.fireSignal();
    } else {
      // 彈回蛋糕旁
      const c = E.centerInLayer(cakesRow);
      const off = pt(sp.mid, 8);
      sp.glideTo(c.x + off.x, c.y + off.y, { dur: 300, scale: 1 });
    }
  }

  /* ---------------- 提示 ---------------- */
  function reshowHintForPhase() {
    if (!Q) return;
    if (Q.phase === 'cut' && Q.correctLineEl) {
      // 用線的外側點提示（中央是多線交叉點，會誤導）
      const m = lineFarPoint(Q.correctLineEl.line.ownerSVGElement, Q.correctLineEl);
      E.showHint(m, m);
    } else if (Q.phase === 'serve' && Q.grabWedge) {
      const f = friendsRow.querySelector('.friend');
      if (f) E.showHint(E.centerOf(Q.grabWedge.el), E.centerOf(f));
    }
  }

  /* ---------------- 一場 ---------------- */
  const praises = ['分得真公平！', '太棒了！', '你是分蛋糕高手！', '好聰明！', '大家都好開心！'];

  function clearStage() {
    drag.active = false;
    drag.sprite = null;
    for (const el2 of spriteLayer.querySelectorAll('.sprite')) {
      if (el2.__sprite) el2.__sprite.destroy(); else el2.remove();
    }
    cakesRow.innerHTML = '';
    friendsRow.innerHTML = '';
    answersEl.innerHTML = '';
    E.counterHide();
    E.hideHint(false);
  }

  async function runSession(lv) {
    E.newRun();
    G.lv = lv;
    G.qIndex = 0; G.wrongTotal = 0;
    const rng = new CK.Rng(E.URL_SEED != null ? E.URL_SEED : undefined);
    G.session = CK.generateSession(Number(lv.slice(2)), { rng });
    for (const el2 of starsEl.children) el2.classList.remove('lit');
    E.showScreen('game');

    try {
      for (let i = 0; i < G.session.length; i++) {
        G.qIndex = i;
        const p = G.session[i];
        Q = newRound(p);
        clearStage();
        await E.sleep(400);
        if (p.type === 'fair') await runFairQuestion(p);
        else if (p.type === 'unit') await runUnitQuestion(p);
        else await runCompareQuestion(p);

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
    if (window.Starmap) window.Starmap.add('cake', G.lv, Math.max(1, G.session.length - G.wrongTotal));
    $('end-stars').textContent = '⭐'.repeat(G.session.length);
    const msg = G.wrongTotal === 0 ? '每個蛋糕都分得公公平平！' : '再分一次，會切得更準！';
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
    $('btn-again').addEventListener('click', () => { sfx.unlock(); E.speech.prime(); sfx.tap(); runSession(G.lv); });
    $('btn-menu').addEventListener('click', () => { sfx.tap(); E.showScreen('title'); });

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
    get problem() { return Q ? Q.p : null; },
    get qIndex() { return G.qIndex; },
    get session() { return G.session; },
    get askValue() { return Q ? Q.askValue : null; },
    get cutsLeft() { return Q ? Q.cutsLeft : 0; },
    get wrongTotal() { return G.wrongTotal; },
    startLevel(lv) { runSession(lv); },
    pump() { E.pumpTimers(); },
    centers: {
      correctCut() {
        if (!Q || !Q.correctLineEl) return null;
        // 外側點：遠離中央交叉，最近線判定不歧義
        return lineFarPoint(Q.correctLineEl.line.ownerSVGElement, Q.correctLineEl);
      },
      wrongCut() {
        if (!Q || !Q.correctLineEl) return null;
        const svg = Q.correctLineEl.line.ownerSVGElement;
        const all = svg.querySelectorAll('.cutline:not(.done)');
        for (const ln of all) {
          if (ln !== Q.correctLineEl.line) {
            const p1 = { x: +ln.getAttribute('x1'), y: +ln.getAttribute('y1') };
            const p2 = { x: +ln.getAttribute('x2'), y: +ln.getAttribute('y2') };
            return svgToClient(svg, p1.x + (p2.x - p1.x) * 0.78, p1.y + (p2.y - p1.y) * 0.78);
          }
        }
        return null;
      },
      grabWedge() { return Q && Q.grabWedge ? E.centerOf(Q.grabWedge.el) : null; },
      friend() { const f = friendsRow.querySelector('.friend'); return f ? E.centerOf(f) : null; },
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
      const labels = { lv1: '🔪 公平切蛋糕', lv2: '🍰 幾分之一', lv3: '⚖️ 誰的比較大' };
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
