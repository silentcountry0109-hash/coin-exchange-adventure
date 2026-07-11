/* 柑仔店 — 商品卡通 SVG 插畫（100×100 viewBox，粗描邊，配 DanluKids）
 * window.ShopArt.draw(key) → svg 字串 */
(function (root) {
  'use strict';

  const INK = '#3a3844';
  function svg(inner) {
    return '<svg class="item-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">'
      + '<g stroke="' + INK + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">'
      + inner + '</g></svg>';
  }
  const noStroke = (s) => s.replace('stroke="' + INK + '"', 'stroke="none"');

  const ART = {
    // 糖果：圓身＋兩側包裝摺
    candy() {
      return svg(
        '<polygon points="18,50 6,34 10,50 6,66" fill="#f2a3bd"/>' +
        '<polygon points="82,50 94,34 90,50 94,66" fill="#f2a3bd"/>' +
        '<circle cx="50" cy="50" r="24" fill="#f76d8e"/>' +
        '<path d="M 36 38 q 14 -8 28 0" fill="none" stroke-width="3.5"/>' +
        '<path d="M 36 62 q 14 8 28 0" fill="none" stroke-width="3.5"/>' +
        '<circle cx="42" cy="46" r="4" fill="#ffd3df" stroke="none"/>');
    },
    // 棒棒糖：漩渦圓＋棒子
    lollipop() {
      return svg(
        '<rect x="47" y="52" width="6" height="42" rx="3" fill="#f5f0e6"/>' +
        '<circle cx="50" cy="34" r="26" fill="#ff8f5e"/>' +
        '<path d="M 50 34 m 0 -18 a 18 18 0 1 1 -13 31 a 13 13 0 1 0 9 -22 a 8 8 0 1 1 -6 13" fill="none" stroke="#fff" stroke-width="5"/>' +
        '<circle cx="50" cy="34" r="26" fill="none"/>');
    },
    // 餅乾：咬一口的巧克力豆餅乾
    cookie() {
      return svg(
        '<path d="M 50 10 a 40 40 0 1 0 0 80 a 40 40 0 0 0 28 -12 a 14 14 0 0 1 -12 -22 a 14 14 0 0 1 20 -6 a 40 40 0 0 0 -36 -40 Z" fill="#d9a05b"/>' +
        '<circle cx="36" cy="36" r="5" fill="#6b4a2b" stroke="none"/>' +
        '<circle cx="58" cy="28" r="5" fill="#6b4a2b" stroke="none"/>' +
        '<circle cx="30" cy="60" r="5" fill="#6b4a2b" stroke="none"/>' +
        '<circle cx="52" cy="66" r="5" fill="#6b4a2b" stroke="none"/>');
    },
    // 牛奶：屋頂盒
    milk() {
      return svg(
        '<polygon points="30,34 70,34 78,20 38,20" fill="#eef3f8"/>' +
        '<polygon points="70,34 78,20 78,78 70,90" fill="#d7e2ee"/>' +
        '<rect x="26" y="34" width="44" height="56" rx="4" fill="#fff"/>' +
        '<rect x="26" y="52" width="44" height="18" fill="#7db4e8" stroke-width="3.5"/>' +
        '<text x="48" y="66" font-size="13" font-weight="bold" text-anchor="middle" fill="#fff" stroke="none" font-family="sans-serif">牛奶</text>');
    },
    // 果汁：杯＋吸管＋橘子片
    juice() {
      return svg(
        '<rect x="52" y="8" width="6" height="26" rx="3" transform="rotate(18 55 21)" fill="#f76d8e"/>' +
        '<path d="M 28 30 L 72 30 L 66 90 L 34 90 Z" fill="#ffd166"/>' +
        '<path d="M 30 48 L 70 48 L 66 90 L 34 90 Z" fill="#ffb340" stroke="none"/>' +
        '<path d="M 28 30 L 72 30 L 66 90 L 34 90 Z" fill="none"/>' +
        '<circle cx="66" cy="36" r="12" fill="#ff9f43"/>' +
        '<path d="M 66 24 v 24 M 54 36 h 24 M 58 28 l 16 16 M 74 28 l -16 16" stroke-width="2.5" fill="none"/>');
    },
    // 麵包：吐司
    bread() {
      return svg(
        '<path d="M 18 42 a 14 14 0 0 1 14 -14 h 36 a 14 14 0 0 1 8 26 v 32 h -58 v -32 a 14 14 0 0 1 0 -12 Z" fill="#e8b06a" transform="translate(0,-2)"/>' +
        '<path d="M 26 44 a 10 10 0 0 1 10 -10 h 28 a 10 10 0 0 1 6 18 v 26 h -44 v -26 a 10 10 0 0 1 0 -8 Z" fill="#f7dfb0" stroke-width="3"/>');
    },
    // 小汽車
    car() {
      return svg(
        '<path d="M 14 62 q 0 -14 14 -14 l 6 -12 q 2 -4 7 -4 h 18 q 5 0 7 4 l 6 12 q 14 0 14 14 v 8 h -72 Z" fill="#5f92dd"/>' +
        '<path d="M 40 36 h 16 q 3 0 4 3 l 4 9 h -28 l 3 -9 q 1 -3 4 -3 Z" fill="#cfe6ff" stroke-width="3"/>' +
        '<circle cx="32" cy="72" r="10" fill="#3a3844"/>' +
        '<circle cx="32" cy="72" r="4" fill="#cfd3dd" stroke="none"/>' +
        '<circle cx="68" cy="72" r="10" fill="#3a3844"/>' +
        '<circle cx="68" cy="72" r="4" fill="#cfd3dd" stroke="none"/>');
    },
    // 皮球：經典紅白沙灘球
    ball() {
      return svg(
        '<circle cx="50" cy="50" r="36" fill="#fff"/>' +
        '<path d="M 50 14 a 36 36 0 0 1 0 72 c 12 -20 12 -52 0 -72 Z" fill="#ef6a5a" stroke-width="3.5"/>' +
        '<path d="M 50 14 a 36 36 0 0 0 0 72 c -12 -20 -12 -52 0 -72 Z" fill="#5f92dd" stroke-width="3.5"/>' +
        '<circle cx="50" cy="50" r="36" fill="none"/>' +
        '<circle cx="38" cy="34" r="6" fill="#ffffff" stroke="none" opacity=".8"/>');
    },
  };

  root.ShopArt = {
    has(key) { return !!ART[key]; },
    draw(key) { return (ART[key] || ART.candy)(); },
  };
})(window);
