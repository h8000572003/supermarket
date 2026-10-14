# 01: 進貨單送達日與 v5→v6 存檔遷移

**What to build:** 每張進貨單下單時記下送達日（第 1 天開幕進貨 = 當天，其餘 = 今天 + 1）；打烊時轉成待送進貨的緊急叫貨，送達日 = 今天 + 1。下一個營業日開始時只送達「送達日已到」的單。快照升到 v6，待送單帶送達日；新增遷移模組，讀檔時從 v5 依序升到最新版，v5→v6 替待送單補上 `deliveryDay = placedDay + 1`。這一張不改玩家看得到的行為。

規格：`.scratch/open-hours-purchase-orders/spec.md`（使用者故事 13、19、20；ADR 0005、0006）

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `PurchaseOrder` 帶 `deliveryDay`；準備階段、打烊轉入的緊急叫貨都設對
- [ ] `startNextDay` 只送達 `deliveryDay <= 新的一天` 的單；送達日較晚的單留在待送清單
- [ ] `SNAPSHOT_VERSION = 6`；v6 存讀檔後狀態相等
- [ ] 遷移模組：v5→v6 補上送達日；手寫的 v5 存檔（含待送單）讀得進來，隔天照常送達
- [ ] 既有平衡守門測試通過，`npm run balance` 結果不變
- [ ] `npm test`、`npm run lint`、`npm run build` 通過
