# 01: 瀏覽器設定、safe-area 與 CSS 變數

**What to build:** 為手機版打底。`index.html` 的 viewport 加上 `viewport-fit=cover`；畫布設定 `touch-action: none`，頁面設定 `overscroll-behavior: none`，並禁止雙擊放大。HUD、工具列和面板避開 `env(safe-area-inset-*)`。在 `:root` 定義顏色、間距、圓角、字級、觸控目標（44px）的 CSS 變數，現有面板改用這些變數，外觀維持不變。新增 `usePointerCoarse()` hook，作為「觸控操作」的唯一判斷來源。

規格：`.scratch/mobile-ui/spec.md`（使用者故事 42–46）

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 在觸控 context 中，對畫布做雙指操作時網頁本身不會縮放
- [x] 模擬有瀏海的 safe-area 時，HUD 與工具列不被遮住
- [x] `styles.css` 中的顏色、圓角、間距都改用變數（美術用色除外）
- [x] 窄版版面下，所有按鈕至少 44×44px
- [x] `usePointerCoarse()` 依 `matchMedia('(pointer: coarse)')` 回傳結果，並在變化時更新
- [x] 三種尺寸（iPhone 13 直向、iPhone 13 橫向、1440×900 桌機）的 Playwright 截圖符合預期
- [x] `npm test`、`npm run lint`、`npm run build` 通過
