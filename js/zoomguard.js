/* 手機防縮放：iOS Safari 自 iOS 10 起忽略 user-scalable=no（無障礙政策），
 * 快速連點會觸發「雙擊縮放」、雙指會捏合縮放，需要 JS 層防護。
 * 兩頁（index.html 入口、game.html 遊戲）共用。 */
(function () {
  'use strict';

  // 雙擊縮放：300ms 內的第二次 touchend 直接吃掉。
  // 遊戲核心互動（點硬幣計數、點盤子倒錢、拖曳）全走 pointerdown，不受影響；
  // 按鈕的第一次 tap 已正常觸發 click，被吃掉的只有快速第二擊（本來就不該重複觸發）。
  let lastTouchEnd = 0;
  document.addEventListener('touchend', function (e) {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  // 雙擊事件保險
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });

  // 捏合縮放（Safari 專有 gesture 事件）
  const gestures = ['gesturestart', 'gesturechange', 'gestureend'];
  for (let i = 0; i < gestures.length; i++) {
    document.addEventListener(gestures[i], function (e) { e.preventDefault(); });
  }

  // 多指觸控保險（Android／其他瀏覽器；頁面本身不捲動，擋掉無副作用）
  document.addEventListener('touchmove', function (e) {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
})();
