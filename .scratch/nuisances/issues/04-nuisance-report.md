# 04: 每日結算的麻煩摘要

**What to build:** `DailyReport` 加上麻煩摘要：各種類的出現數、處理數，以及全部麻煩累計在場的遊戲分鐘數（打烊清除與奧客自行離開的，在場時間算到消失為止）。每日結算畫面多一行顯示。

規格：`.scratch/nuisances/spec.md`（使用者故事 20）

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `DailyReport` 的麻煩摘要：各種類出現數、處理數、累計在場分鐘
- [ ] 打烊清除與自行離開的麻煩，在場時間算到消失為止；這些不算「處理」
- [ ] 每日結算畫面（桌機與手機）顯示摘要
- [ ] `npm test`、`npm run lint`、`npm run build` 通過
