# 05: 觸控放置的預覽與確認

**What to build:** 觸控模式下，放置與移動設施改成「預覽、確認」：在放置／移動模式中點地板只移動預覽（可放為綠、不可放為紅），不扣錢、不提交。預覽格附近出現浮動按鈕「✓ 放置／⟳ 旋轉／✕ 取消」；不可放時 ✓ 停用，並顯示原因。controller 新增 `confirmPlacement()`；由 render 提供格子座標換算成螢幕座標，用來定位浮動按鈕，並在平移、縮放時跟著移動。滑鼠模式的流程完全不變。

規格：`.scratch/mobile-ui/spec.md`（使用者故事 8–14）

**Blocked by:** 02, 04

**Status:** resolved

- [x] controller 測試：觸控模式下 `click` 不會放置；`confirmPlacement` 在可放時放置並扣款，不可放時拒絕
- [x] 移動既有設施也走同樣流程，取消時設施回到原位
- [x] 平移或縮放時浮動按鈕會跟著預覽格移動
- [x] 滑鼠模式下左鍵仍直接放置（既有測試通過）
- [x] 三種尺寸（iPhone 13 直向、iPhone 13 橫向、1440×900 桌機）的 Playwright 截圖符合預期
- [x] `npm test`、`npm run lint`、`npm run build` 通過
