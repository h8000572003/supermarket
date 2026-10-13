# 03: 底部抽屜與設施面板

**What to build:** 新增共用元件 `BottomSheet`：可設定高度與能否下拉關閉；橫向手機時改從右側滑出，寬度約 40%。窄版版面下，選取設施後打開的面板（旋轉／移動／出售、SlotPanel、DispatchPanel）和「目標」面板都改用 `BottomSheet`，高度約半個畫面。打開抽屜時呼叫 02 的平移 API，讓被選取的設施露在抽屜上方。點地板空白處或下拉抽屜就關閉，並取消選取。寬版版面維持現狀。

規格：`.scratch/mobile-ui/spec.md`（使用者故事 26–30）

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] 直向時，選取一個靠近店面底部的設施，抽屜打開後該設施仍在抽屜上方可見
- [ ] 下拉抽屜或點地板空白處會關閉抽屜並取消選取
- [ ] 橫向時抽屜從右側滑出
- [ ] 「目標」面板在窄版下為抽屜
- [ ] `BottomSheet` 設定為不可關閉時，下拉和點背景都不會關閉它（供 07 使用）
- [ ] 三種尺寸（iPhone 13 直向、iPhone 13 橫向、1440×900 桌機）的 Playwright 截圖符合預期
- [ ] `npm test`、`npm run lint`、`npm run build` 通過
