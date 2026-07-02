/* Danlu Kids Space — 星圖（localStorage 學習紀錄，免帳號）
 * 結構：{ money: { add: 5, sub: 4, ... }, train: { lv1: 5, ... }, clock: { lv1: 3, ... } }
 * 每個模式存「最佳星數」；隱私模式或 localStorage 失效時安靜降級（回傳空資料）。 */
(function (root) {
  'use strict';

  const KEY = 'danlu-kids-stars';

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      const d = raw ? JSON.parse(raw) : {};
      return (d && typeof d === 'object' && !Array.isArray(d)) ? d : {};
    } catch (e) { return {}; }
  }
  function write(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 隱私模式 */ }
  }

  root.Starmap = {
    // 回報一場的星數，只在破紀錄時更新
    add(game, mode, stars) {
      stars = Math.max(0, Math.min(5, Number(stars) || 0));
      const d = read();
      if (!d[game]) d[game] = {};
      if (stars > (d[game][mode] || 0)) {
        d[game][mode] = stars;
        write(d);
      }
      return d[game][mode];
    },
    best(game, mode) {
      const d = read();
      return (d[game] && d[game][mode]) || 0;
    },
    gameTotal(game) {
      const d = read();
      if (!d[game]) return 0;
      return Object.values(d[game]).reduce((s, v) => s + (Number(v) || 0), 0);
    },
    total() {
      const d = read();
      let s = 0;
      for (const g of Object.values(d)) {
        for (const v of Object.values(g)) s += Number(v) || 0;
      }
      return s;
    },
    data() { return read(); },
  };
})(window);
