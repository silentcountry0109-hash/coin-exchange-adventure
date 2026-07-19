/* ============================================================
   長條圖 — 邏輯模組（純函式，Node 測試與瀏覽器共用）
   lv1 讀長條圖：逐格讀值、找最多、找最少
   lv2 蓋長條圖：依資料逐格堆出每根長條
   lv3 比較問答：相差、總和、最多與最少的差
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BarchartLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- 可播種的隨機數（mulberry32） ---------------- */
  class Rng {
    constructor(seed) {
      this.s = (seed == null ? Math.floor(Math.random() * 2 ** 31) : seed) >>> 0;
    }
    next() {
      let t = (this.s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    int(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); }
    pick(arr) { return arr[this.int(0, arr.length - 1)]; }
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = this.int(0, i);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
  }

  const THEMES = [
    { key: 'fruit', name: '水果攤', categories: [
      ['apple', '蘋果', '🍎'], ['banana', '香蕉', '🍌'], ['grape', '葡萄', '🍇'], ['orange', '橘子', '🍊'],
    ] },
    { key: 'zoo', name: '動物園', categories: [
      ['lion', '獅子', '🦁'], ['panda', '熊貓', '🐼'], ['monkey', '猴子', '🐵'], ['giraffe', '長頸鹿', '🦒'],
    ] },
    { key: 'sea', name: '海洋館', categories: [
      ['fish', '小魚', '🐟'], ['octopus', '章魚', '🐙'], ['crab', '螃蟹', '🦀'], ['turtle', '海龜', '🐢'],
    ] },
    { key: 'farm', name: '開心農場', categories: [
      ['chicken', '小雞', '🐥'], ['pig', '小豬', '🐷'], ['cow', '乳牛', '🐮'], ['sheep', '綿羊', '🐑'],
    ] },
  ];

  function distinctInts(rng, count, lo, hi) {
    const pool = [];
    for (let n = lo; n <= hi; n++) pool.push(n);
    return rng.shuffle(pool).slice(0, count);
  }

  function makeCategories(rng, count, lo, hi) {
    const theme = rng.pick(THEMES);
    const defs = rng.shuffle(theme.categories).slice(0, count);
    const values = distinctInts(rng, count, lo, hi);
    return {
      theme: { key: theme.key, name: theme.name },
      categories: defs.map((d, i) => ({ key: d[0], name: d[1], emoji: d[2], value: values[i] })),
    };
  }

  /* 正解＋指定干擾；數字題會用相鄰數補滿，類別題則由 pool 補滿。 */
  function makeOptions(answer, distractors, rng, opts) {
    opts = opts || {};
    const set = new Set([answer]);
    const valid = (v) => v != null
      && v !== answer
      && (typeof v !== 'number' || ((opts.min == null || v >= opts.min) && (opts.max == null || v <= opts.max)));
    for (const v of distractors || []) {
      if (set.size >= 3) break;
      if (valid(v)) set.add(v);
    }
    for (const v of rng.shuffle(opts.pool || [])) {
      if (set.size >= 3) break;
      if (valid(v)) set.add(v);
    }
    if (typeof answer === 'number') {
      for (let d = 1; set.size < 3 && d <= 50; d++) {
        for (const v of rng.shuffle([answer - d, answer + d])) {
          if (valid(v)) set.add(v);
          if (set.size >= 3) break;
        }
      }
    }
    return rng.shuffle(Array.from(set));
  }

  function yMaxFor(categories, floor) {
    return Math.max(floor || 5, ...categories.map((c) => c.value));
  }

  /* ---------------- lv1：讀長條圖 ---------------- */
  function genRead(rng, opts) {
    opts = opts || {};
    const warm = !!opts.warm;
    const count = warm ? 3 : rng.int(3, 4);
    const data = makeCategories(rng, count, 1, warm ? 5 : 8);
    const categories = data.categories;
    const kind = opts.kind || (warm ? 'read' : rng.pick(['read', 'read', 'most', 'least']));
    let targetKey = null, answer, requiredDistractor, options;

    if (kind === 'read') {
      const target = rng.pick(categories);
      targetKey = target.key;
      answer = target.value;
      requiredDistractor = answer > 1 ? answer - 1 : answer + 1;
      const anotherBar = rng.pick(categories.filter((c) => c.key !== target.key)).value;
      options = makeOptions(answer, [requiredDistractor, answer + 1, anotherBar], rng, { min: 1, max: 9 });
    } else {
      const sorted = categories.slice().sort((a, b) => kind === 'most' ? b.value - a.value : a.value - b.value);
      answer = sorted[0].key;
      requiredDistractor = sorted[1].key;
      options = makeOptions(answer, [requiredDistractor], rng, { pool: categories.map((c) => c.key) });
    }

    return {
      type: 'read', kind, warm, theme: data.theme, categories,
      yMax: yMaxFor(categories, 5), targetKey, answer, requiredDistractor, options,
    };
  }

  /* ---------------- lv2：蓋長條圖 ---------------- */
  function genBuild(rng, opts) {
    opts = opts || {};
    const warm = !!opts.warm;
    const count = warm ? 3 : rng.int(3, 4);
    const data = makeCategories(rng, count, 1, warm ? 4 : 7);
    const total = data.categories.reduce((s, c) => s + c.value, 0);
    const requiredDistractor = total - 1;
    return {
      type: 'build', kind: 'stack', warm, theme: data.theme, categories: data.categories,
      yMax: yMaxFor(data.categories, warm ? 4 : 7), targets: data.categories.map((c) => c.value),
      answer: total, requiredDistractor,
      options: makeOptions(total, [requiredDistractor, total + 1], rng, { min: 1, max: 36 }),
    };
  }

  /* ---------------- lv3：比較問答 ---------------- */
  function genCompare(rng, opts) {
    opts = opts || {};
    const warm = !!opts.warm;
    const count = warm ? 3 : rng.int(3, 4);
    const data = makeCategories(rng, count, 1, warm ? 5 : 9);
    const categories = data.categories;
    const kind = opts.kind || (warm ? 'difference' : rng.pick(['difference', 'total', 'range']));
    let answer, requiredDistractor, leftKey = null, rightKey = null, omittedKey = null;

    if (kind === 'difference') {
      const pair = rng.shuffle(categories).slice(0, 2).sort((a, b) => b.value - a.value);
      leftKey = pair[0].key; rightKey = pair[1].key;
      answer = pair[0].value - pair[1].value;
      requiredDistractor = pair[0].value + pair[1].value; // 典型錯誤：把相減做成相加
    } else if (kind === 'total') {
      answer = categories.reduce((s, c) => s + c.value, 0);
      const omitted = rng.pick(categories);
      omittedKey = omitted.key;
      requiredDistractor = answer - omitted.value;       // 典型錯誤：漏算一根
    } else {
      const sorted = categories.slice().sort((a, b) => b.value - a.value);
      leftKey = sorted[0].key; rightKey = sorted[sorted.length - 1].key;
      answer = sorted[0].value - sorted[sorted.length - 1].value;
      requiredDistractor = sorted[0].value + sorted[sorted.length - 1].value;
    }

    const nearby = answer > 0 ? answer - 1 : answer + 1;
    return {
      type: 'compare', kind, warm, theme: data.theme, categories,
      yMax: yMaxFor(categories, warm ? 5 : 9), leftKey, rightKey, omittedKey,
      answer, requiredDistractor,
      options: makeOptions(answer, [requiredDistractor, nearby, answer + 1], rng, { min: 0, max: 40 }),
    };
  }

  function questionKey(q) {
    return q.type + ':' + q.kind + ':' + q.theme.key + ':'
      + q.categories.map((c) => c.key + '=' + c.value).join(',')
      + ':' + (q.targetKey || q.leftKey || '');
  }

  /* ---------------- 一場 5 題 ---------------- */
  function generateSession(lv, opts) {
    const rng = (opts && opts.rng) || new Rng();
    const out = [], seen = new Set();
    const kinds = lv === 1
      ? ['read', 'read', 'most', 'least', null]
      : lv === 3 ? ['difference', 'difference', 'total', 'range', null] : [null, null, null, null, null];

    for (let i = 0; i < 5; i++) {
      let q, guard = 0;
      do {
        const spec = { warm: i === 0 };
        if (kinds[i]) spec.kind = kinds[i];
        q = lv === 1 ? genRead(rng, spec) : lv === 2 ? genBuild(rng, spec) : genCompare(rng, spec);
        guard++;
      } while (seen.has(questionKey(q)) && guard < 60);
      seen.add(questionKey(q));
      out.push(q);
    }
    return out;
  }

  return {
    Rng, THEMES, distinctInts, makeCategories, makeOptions,
    genRead, genBuild, genCompare, questionKey, generateSession,
  };
});
