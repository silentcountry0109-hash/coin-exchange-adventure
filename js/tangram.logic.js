/* ============================================================
   七巧板 — 邏輯模組（純函式，Node 測試與瀏覽器共用）
   座標系：格子單位（原始大正方形邊長 8），y 向下。
   lv1 形狀變變變（2~3 塊拼基本形）
   lv2 圖案拼拼樂（4~5 塊拼圖案，有內框線）
   lv3 影子挑戰（只有剪影，提示要扣星）
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TangramLogic = factory();
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

  /* ---------------- 七塊的標準形（rot=0、未鏡像） ----------------
     poly 第一個頂點＝擺放錨點（at 格式繞它旋轉）。
     sym＝旋轉對稱（幾步 45° 轉回自己）：三角形 8、平行四邊形 4、正方形 2 */
  const SQ2 = Math.SQRT2;
  const PIECES = {
    lt: { zh: '大三角形', poly: [[0, 0], [8, 0], [4, -4]], sym: 8, isTri: true },
    mt: { zh: '中三角形', poly: [[0, 0], [4, 0], [0, -4]], sym: 8, isTri: true },
    st: { zh: '小三角形', poly: [[0, 0], [4, 0], [2, -2]], sym: 8, isTri: true },
    sq: { zh: '正方形', poly: [[0, 0], [2, -2], [4, 0], [2, 2]], sym: 2, isTri: false },
    par: { zh: '平行四邊形', poly: [[0, 0], [4, 0], [6, -2], [2, -2]], sym: 4, isTri: false },
  };
  // 每種可用數量（標準七巧板）
  const INVENTORY = { lt: 2, mt: 1, st: 2, sq: 1, par: 1 };

  /* ---------------- 多邊形小工具 ---------------- */
  function polyArea(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      s += x1 * y2 - x2 * y1;
    }
    return Math.abs(s) / 2;
  }
  function polyCentroid(pts) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      const cr = x1 * y2 - x2 * y1;
      a += cr; cx += (x1 + x2) * cr; cy += (y1 + y2) * cr;
    }
    a /= 2;
    return [cx / (6 * a), cy / (6 * a)];
  }
  function pointInPoly(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function bboxOf(ptsList) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pts of ptsList) {
      for (const [x, y] of pts) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  // 繞原點旋轉 steps×45°（y 向下，正向＝順時針視覺）
  function rotPt(x, y, steps) {
    const a = (steps * Math.PI) / 4;
    const c = Math.cos(a), s = Math.sin(a);
    return [x * c - y * s, x * s + y * c];
  }

  /* at 格式 → 頂點：先鏡像（x 取負）、再繞第一頂點轉 rot、再把第一頂點移到 at */
  function placePiece(type, at, rot, flip) {
    const base = PIECES[type].poly;
    const p0 = base[0];
    return base.map(([x, y]) => {
      let dx = x - p0[0], dy = y - p0[1];
      if (flip) dx = -dx;
      const [rx, ry] = rotPt(dx, dy, rot || 0);
      return [at[0] + rx, at[1] + ry];
    });
  }

  /* 由「已擺好的頂點」反推 rot/flip（頂點集合比對，容差 eps）。
     三角形與正方形鏡像對稱，一定解得 flip=false；只有平行四邊形有手性 */
  function resolvePiece(type, pts) {
    const def = PIECES[type];
    if (!def) return { ok: false, err: '未知的塊：' + type };
    if (pts.length !== def.poly.length) return { ok: false, err: type + ' 頂點數不對' };
    const c = polyCentroid(pts);
    const eps = 0.03;
    for (const flip of [false, true]) {
      for (let rot = 0; rot < 8; rot++) {
        const cand = placePiece(type, [0, 0], rot, flip);
        const cc = polyCentroid(cand);
        const moved = cand.map(([x, y]) => [x - cc[0] + c[0], y - cc[1] + c[1]]);
        const used = new Array(pts.length).fill(false);
        let all = true;
        for (const [mx, my] of moved) {
          let hit = false;
          for (let k = 0; k < pts.length; k++) {
            if (!used[k] && Math.abs(pts[k][0] - mx) < eps && Math.abs(pts[k][1] - my) < eps) {
              used[k] = true; hit = true; break;
            }
          }
          if (!all || !hit) { all = false; break; }
        }
        if (all) return { ok: true, rot, flip: !!flip };
      }
    }
    return { ok: false, err: type + ' 的頂點不是合法的七巧板塊形狀' };
  }

  /* ---------------- 圖案正規化與驗證 ----------------
     圖案 pieces 支援兩種寫法：
       { type, pts: [[x,y],...] }            直接給頂點
       { type, at: [x,y], rot, flip }        錨點＋旋轉（好手算）
     normalizeFigure 補齊 pts / rot / flip / centroid，並把整體平移到 bbox 原點 */
  function normalizeFigure(fig) {
    const pieces = fig.pieces.map((p) => {
      const pts = p.pts ? p.pts.map((q) => q.slice()) : placePiece(p.type, p.at, p.rot || 0, !!p.flip);
      return { type: p.type, pts };
    });
    const bb = bboxOf(pieces.map((p) => p.pts));
    const out = pieces.map((p) => {
      const pts = p.pts.map(([x, y]) => [x - bb.minX, y - bb.minY]);
      const r = resolvePiece(p.type, pts);
      return {
        type: p.type,
        pts,
        rot: r.ok ? r.rot : 0,
        flip: r.ok ? r.flip : false,
        valid: r.ok,
        err: r.err,
        centroid: polyCentroid(pts),
      };
    });
    return {
      id: fig.id, zh: fig.zh, say: fig.say || '',
      eye: fig.eye ? [fig.eye[0] - bb.minX, fig.eye[1] - bb.minY] : null,
      pieces: out,
      bbox: { w: bb.maxX - bb.minX, h: bb.maxY - bb.minY },
    };
  }

  /* 柵格化驗證：0.25 格取樣，檢查不重疊、面積守恆、相連 */
  function validateFigure(fig) {
    const errors = [];
    const f = normalizeFigure(fig);
    for (const p of f.pieces) if (!p.valid) errors.push(p.err);

    // 數量限制
    const cnt = {};
    for (const p of f.pieces) cnt[p.type] = (cnt[p.type] || 0) + 1;
    for (const t in cnt) {
      if (!INVENTORY[t]) errors.push('未知的塊：' + t);
      else if (cnt[t] > INVENTORY[t]) errors.push(t + ' 用了 ' + cnt[t] + ' 塊，超過 ' + INVENTORY[t]);
    }
    if (f.bbox.w > 14.01 || f.bbox.h > 11.01) {
      errors.push('圖案太大：' + f.bbox.w.toFixed(1) + '×' + f.bbox.h.toFixed(1) + '（上限 14×11）');
    }
    if (errors.length) return { ok: false, errors, fig: f };

    // 取樣（微偏移避開 0/45/90° 邊：樣本點壓在邊上會被 ray-cast 排除）
    const step = 0.25, ox = 0.0113, oy = 0.0071;
    const nx = Math.ceil(f.bbox.w / step), ny = Math.ceil(f.bbox.h / step);
    const cover = new Int8Array(nx * ny);
    let overlap = 0, cells = 0;
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const x = (ix + 0.5) * step + ox, y = (iy + 0.5) * step + oy;
        let hits = 0;
        for (const p of f.pieces) if (pointInPoly(x, y, p.pts)) hits++;
        if (hits > 1) overlap++;
        if (hits >= 1) { cover[iy * nx + ix] = 1; cells++; }
      }
    }
    if (overlap > 0) errors.push('有 ' + overlap + ' 個取樣點被兩塊蓋住（塊重疊了）');
    // 面積只做粗防呆（斜邊會天然少算半格帶寬；重疊的精準防線是上面那條）
    const areaSum = f.pieces.reduce((s, p) => s + polyArea(p.pts), 0);
    const cellArea = cells * step * step;
    if (Math.abs(cellArea - areaSum) > areaSum * 0.15) {
      errors.push('面積差太多（座標可能錯了）：取樣 ' + cellArea.toFixed(1) + ' vs 塊總和 ' + areaSum.toFixed(1));
    }
    // 相連（4 方向 BFS）
    if (cells > 0) {
      const seen = new Int8Array(nx * ny);
      let start = -1;
      for (let i = 0; i < nx * ny; i++) if (cover[i]) { start = i; break; }
      const stack = [start]; seen[start] = 1;
      let reach = 0;
      while (stack.length) {
        const i = stack.pop(); reach++;
        const ix = i % nx, iy = (i / nx) | 0;
        const nb = [[ix - 1, iy], [ix + 1, iy], [ix, iy - 1], [ix, iy + 1]];
        for (const [jx, jy] of nb) {
          if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
          const j = jy * nx + jx;
          if (cover[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
      }
      if (reach < cells) errors.push('圖案不相連（有分離的塊）：' + reach + '/' + cells);
    }
    return { ok: errors.length === 0, errors, fig: f };
  }

  /* ASCII 預覽（0.5 格解析度）：設計圖案時肉眼檢查用 */
  function renderAscii(fig) {
    const f = normalizeFigure(fig);
    const step = 0.5;
    const nx = Math.ceil(f.bbox.w / step), ny = Math.ceil(f.bbox.h / step);
    const chars = 'ABCDEFG';
    let out = '';
    for (let iy = 0; iy < ny; iy++) {
      let row = '';
      for (let ix = 0; ix < nx; ix++) {
        const x = (ix + 0.5) * step, y = (iy + 0.5) * step;
        let ch = '·';
        for (let k = 0; k < f.pieces.length; k++) {
          if (pointInPoly(x, y, f.pieces[k].pts)) { ch = chars[k % chars.length]; break; }
        }
        row += ch;
      }
      out += row + '\n';
    }
    return out;
  }

  /* ---------------- Lv1 固定五題：形狀變變變 ---------------- */
  const FIGURES_LV1 = [
    {
      id: 'diamond', zh: '正方形', say: '斜斜放也是正方形喔！',
      shapeAnswer: '正方形',
      lesson: '兩個三角形，變成一個正方形！',
      pieces: [
        { type: 'st', pts: [[0, 2], [4, 2], [2, 4]] },
        { type: 'st', pts: [[0, 2], [4, 2], [2, 0]] },
      ],
    },
    {
      id: 'bigtri', zh: '三角形', say: '兩塊合體，變大三角形！',
      shapeAnswer: '三角形',
      lesson: '兩個小三角形，拼成一個大三角形！',
      pieces: [
        { type: 'st', pts: [[0, 4], [4, 4], [2, 2]] },
        { type: 'st', pts: [[0, 4], [2, 2], [0, 0]] },
      ],
    },
    {
      id: 'para', zh: '平行四邊形', say: '變成溜滑梯的形狀了！',
      shapeAnswer: '平行四邊形',
      lesson: '兩個三角形，拼成平行四邊形！',
      pieces: [
        { type: 'st', pts: [[0, 2], [4, 2], [2, 0]] },
        { type: 'st', pts: [[4, 2], [2, 0], [6, 0]] },
      ],
    },
    {
      id: 'bigsquare', zh: '正方形', say: '三塊拼出正正的大正方形！',
      shapeAnswer: '正方形',
      lesson: '中三角形加兩個小三角形，變成正方形！',
      pieces: [
        { type: 'mt', pts: [[0, 4], [4, 4], [0, 0]] },
        { type: 'st', pts: [[4, 0], [2, 2], [4, 4]] },
        { type: 'st', pts: [[4, 0], [2, 2], [0, 0]] },
      ],
    },
    {
      id: 'bigtri3', zh: '三角形', say: '跟大三角形塊一樣大了！',
      shapeAnswer: '三角形',
      lesson: '兩個小三角形加正方形，變成大三角形！',
      pieces: [
        { type: 'st', pts: [[0, 4], [4, 4], [2, 2]] },
        { type: 'st', pts: [[4, 4], [8, 4], [6, 2]] },
        { type: 'sq', pts: [[2, 2], [4, 0], [6, 2], [4, 4]] },
      ],
    },
  ];

  /* ---------------- Lv2 / Lv3 圖案庫（拼圖工作流產出：12 設計代理＋對抗審圖） ---------------- */
  const FIGURES_LV2 = [
    {
      id: 'rocket', zh: '小火箭', say: '咻！火箭發射囉！',
      pieces: [
        { type: 'mt', pts: [[2.8284, 2.8284], [8.4853, 2.8284], [5.6569, 0]] },
        { type: 'lt', pts: [[2.8284, 2.8284], [8.4853, 2.8284], [2.8284, 8.4853]] },
        { type: 'lt', pts: [[8.4853, 2.8284], [8.4853, 8.4853], [2.8284, 8.4853]] },
        { type: 'st', pts: [[2.8284, 9.8995], [0, 9.8995], [2.8284, 7.0711]] },
        { type: 'st', pts: [[8.4853, 9.8995], [11.3137, 9.8995], [8.4853, 7.0711]] },
      ],
    },
    {
      id: 'fish', zh: '小魚', say: '小魚游啊游！', eye: [2.2, 3.3],
      pieces: [
        { type: 'lt', pts: [[4, 0], [4, 8], [0, 4]] },
        { type: 'mt', pts: [[4, 2], [8, 2], [4, 6]] },
        { type: 'st', pts: [[8, 2], [8, 6], [6, 4]] },
        { type: 'st', pts: [[10, 0], [10, 4], [8, 2]] },
        { type: 'par', pts: [[8, 2], [8, 6], [10, 8], [10, 4]] },
      ],
    },
    {
      id: 'house', zh: '小房子', say: '小房子蓋好了！',
      pieces: [
        { type: 'lt', pts: [[0, 4], [8, 4], [4, 0]] },
        { type: 'mt', pts: [[0, 4], [4, 4], [0, 8]] },
        { type: 'lt', pts: [[0, 8], [8, 8], [4, 4]] },
        { type: 'st', pts: [[4, 4], [8, 4], [6, 6]] },
        { type: 'st', pts: [[8, 4], [8, 8], [6, 6]] },
      ],
    },
    {
      id: 'sailboat', zh: '小帆船', say: '小帆船出航囉！',
      pieces: [
        { type: 'mt', pts: [[4, 4], [0, 4], [4, 0]] },
        { type: 'st', pts: [[4, 4], [8, 4], [6, 2]] },
        { type: 'par', pts: [[0, 4], [4, 4], [6, 6], [2, 6]] },
        { type: 'st', pts: [[4, 4], [8, 4], [6, 6]] },
      ],
    },
    {
      id: 'tree', zh: '小樹', say: '小樹長高高！',
      pieces: [
        { type: 'st', pts: [[2, 2], [6, 2], [4, 0]] },
        { type: 'par', pts: [[0, 4], [4, 4], [6, 2], [2, 2]] },
        { type: 'st', pts: [[4, 4], [8, 4], [6, 2]] },
        { type: 'sq', pts: [[2.5858, 4], [5.4142, 4], [5.4142, 6.8284], [2.5858, 6.8284]] },
      ],
    },
    {
      id: 'bird', zh: '小鳥', say: '啾啾！小鳥來囉！', eye: [10.5, 3.6],
      pieces: [
        { type: 'lt', pts: [[4, 8], [12, 8], [8, 4]] },
        { type: 'par', pts: [[0, 8], [4, 8], [6, 6], [2, 6]] },
        { type: 'st', pts: [[4, 4], [8, 4], [6, 6]] },
        { type: 'sq', pts: [[8, 4], [10, 2], [12, 4], [10, 6]] },
        { type: 'st', pts: [[10, 2], [14, 2], [12, 4]] },
      ],
    },
  ];
  const FIGURES_LV3 = [
    {
      id: 'arrow', zh: '箭頭', say: '咻！箭頭指過去！',
      pieces: [
        { type: 'mt', pts: [[0, 2], [4, 2], [0, 6]] },
        { type: 'st', pts: [[4, 2], [4, 6], [2, 4]] },
        { type: 'st', pts: [[0, 6], [4, 6], [2, 4]] },
        { type: 'lt', pts: [[4, 0], [4, 8], [8, 4]] },
      ],
    },
    {
      id: 'mountain', zh: '小山', say: '兩座山尖尖的！',
      pieces: [
        { type: 'lt', pts: [[0, 4], [8, 4], [4, 0]] },
        { type: 'st', pts: [[8, 0], [8, 4], [6, 2]] },
        { type: 'mt', pts: [[8, 4], [12, 4], [8, 0]] },
      ],
    },
    {
      id: 'icecream', zh: '冰淇淋', say: '冰冰涼涼，好好吃！',
      pieces: [
        { type: 'lt', pts: [[0, 0], [5.6569, 0], [0, 5.6569]] },
        { type: 'lt', pts: [[5.6569, 0], [5.6569, 5.6569], [0, 5.6569]] },
        { type: 'st', pts: [[0, 5.6569], [2.8284, 5.6569], [2.8284, 8.4853]] },
        { type: 'st', pts: [[2.8284, 5.6569], [5.6569, 5.6569], [2.8284, 8.4853]] },
      ],
    },
    {
      id: 'cat', zh: '貓咪', say: '喵嗚～尖耳朵貓咪！', eye: [3.5, 5.5],
      pieces: [
        { type: 'st', pts: [[2, 2], [2, 6], [4, 4]] },
        { type: 'st', pts: [[6, 2], [6, 6], [4, 4]] },
        { type: 'sq', pts: [[2, 6], [4, 4], [6, 6], [4, 8]] },
        { type: 'lt', pts: [[2, 10], [10, 10], [6, 6]] },
        { type: 'par', pts: [[8, 8], [12, 8], [14, 10], [10, 10]] },
      ],
    },
    {
      // 審圖員的修正版：st 從左下搬到右側，讓下巴凹口與尾巴出現
      id: 'rabbit', zh: '小兔子', say: '長耳朵兔兔蹦蹦跳！', eye: [1.2, 5.8],
      pieces: [
        { type: 'par', pts: [[0, 2], [0, 6], [2, 4], [2, 0]] },
        { type: 'st', pts: [[4, 2], [4, 6], [2, 4]] },
        { type: 'sq', pts: [[0, 6], [2, 4], [4, 6], [2, 8]] },
        { type: 'st', pts: [[4, 6], [8, 6], [6, 8]] },
        { type: 'lt', pts: [[0, 10], [8, 10], [4, 6]] },
      ],
    },
    {
      id: 'swan', zh: '天鵝', say: '天鵝優雅游過來囉！', eye: [10.9, 1.8],
      pieces: [
        { type: 'lt', pts: [[10, 2], [10, 10], [6, 6]] },
        { type: 'lt', pts: [[2, 10], [10, 10], [6, 6]] },
        { type: 'mt', pts: [[4, 4], [8, 4], [4, 8]] },
        { type: 'par', pts: [[12, 2], [12, 6], [10, 8], [10, 4]] },
        { type: 'st', pts: [[10, 0], [10, 4], [12, 2]] },
      ],
    },
  ];

  /* ---------------- 出題 ---------------- */
  const SHAPE_POOL = ['正方形', '三角形', '長方形', '平行四邊形', '圓形'];

  function makeShapeOptions(answer, rng) {
    const others = rng.shuffle(SHAPE_POOL.filter((s) => s !== answer)).slice(0, 2);
    return rng.shuffle([answer].concat(others));
  }
  function triCount(fig) {
    return fig.pieces.filter((p) => PIECES[p.type].isTri).length;
  }
  function makeCountOptions(n, rng) {
    const set = new Set([n]);
    for (const d of rng.shuffle([-1, 1, 2, -2])) {
      if (set.size >= 3) break;
      if (n + d >= 1) set.add(n + d);
    }
    let k = n + 3;
    while (set.size < 3) set.add(k++);
    return rng.shuffle(Array.from(set));
  }

  /* 一場 5 題 */
  function generateSession(lv, opts) {
    const rng = (opts && opts.rng) || new Rng();
    if (lv === 1) {
      return FIGURES_LV1.map((raw) => {
        const fig = normalizeFigure(raw);
        return {
          type: 'shape', fig,
          zh: raw.zh, say: raw.say, lesson: raw.lesson,
          answer: raw.shapeAnswer,
          options: makeShapeOptions(raw.shapeAnswer, rng),
        };
      });
    }
    const lib = lv === 2 ? FIGURES_LV2 : FIGURES_LV3;
    // 抽 5 個，塊數少的排前面（暖身 → 挑戰）
    const chosen = rng.shuffle(lib).slice(0, 5)
      .sort((a, b) => a.pieces.length - b.pieces.length);
    return chosen.map((raw) => {
      const fig = normalizeFigure(raw);
      if (lv === 2) {
        const n = triCount(fig);
        return {
          type: 'count', fig, zh: raw.zh, say: raw.say,
          answer: n, options: makeCountOptions(n, rng),
        };
      }
      return { type: 'shadow', fig, zh: raw.zh, say: raw.say, answer: null, options: null };
    });
  }

  return {
    Rng, PIECES, INVENTORY,
    polyArea, polyCentroid, pointInPoly, bboxOf, rotPt,
    placePiece, resolvePiece, normalizeFigure, validateFigure, renderAscii,
    FIGURES_LV1, FIGURES_LV2, FIGURES_LV3,
    SHAPE_POOL, makeShapeOptions, makeCountOptions, triCount, generateSession,
    SQ2,
  };
});
