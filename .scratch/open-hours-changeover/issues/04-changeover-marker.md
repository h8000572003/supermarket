# 04: 場景中的 ⇄ 換貨圖示

**What to build:** 場景中，換貨中的格位所在那一格陳列櫃上方浮出 ⇄ 圖示，與既有的問題膠囊錯開位置、並存；下架完成（換貨結束）後圖示消失。風格與現有美術一致（深色描邊、平塗）。

規格：`.scratch/open-hours-changeover/spec.md`（使用者故事 32）

**Blocked by:** 01（換貨主流程）

**Status:** resolved

- [x] 換貨中的格位上方出現 ⇄，與問題膠囊同時出現時不重疊
- [x] 下架完成後 ⇄ 消失；打烊後沒有殘留
- [x] 手動於瀏覽器確認四個朝向的陳列櫃都正確顯示
- [x] `npm test`、`npm run lint`、`npm run build` 通過
