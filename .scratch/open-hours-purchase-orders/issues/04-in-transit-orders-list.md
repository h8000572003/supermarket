# 04: 在途進貨清單

**What to build:** 進貨面板在營業中與準備階段都列出待送的一般進貨單：每張單的商品與數量，標示「明天開店前送達」。今天準備階段與營業中下的單都會列出；送達後（下一個準備階段開始時）就不再列出。緊急叫貨的「送貨中」清單維持原樣、分開顯示。手機卡片頁與桌機表格都要有。

規格：`.scratch/open-hours-purchase-orders/spec.md`（使用者故事 12、18）

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] 營業中與準備階段都顯示在途清單，內容與 `pendingOrders` 一致
- [ ] 營業中下單後清單立即更新
- [ ] 進入下一個準備階段後，已送達的單不再列出
- [ ] 手動驗證手機與桌機
- [ ] `npm test`、`npm run lint`、`npm run build` 通過
