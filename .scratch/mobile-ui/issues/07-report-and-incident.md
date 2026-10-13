# 07: 每日結算與狀況的手機版

**What to build:** 窄版版面下，每日結算改用 06 的 `FullScreenPage`，底部固定一顆「進入下一天」。狀況對話框改用 03 的 `BottomSheet`，設定為不可下拉關閉；遊戲暫停，必須擇一選項。寬版版面也套用 01 的 CSS 變數，外觀與其他面板一致。

規格：`.scratch/mobile-ui/spec.md`（使用者故事 40–41）

**Blocked by:** 03, 06

**Status:** ready-for-agent

- [ ] 直向時每日結算內容可捲動，「進入下一天」始終可見
- [ ] 狀況抽屜無法用下拉或點背景關閉，選擇選項後遊戲才繼續
- [ ] 三種尺寸（iPhone 13 直向、iPhone 13 橫向、1440×900 桌機）的 Playwright 截圖符合預期
- [ ] `npm test`、`npm run lint`、`npm run build` 通過
