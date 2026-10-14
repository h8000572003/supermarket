# 02: 讀不了的存檔保留不刪

**What to build:** `loadGame` 能區分「沒有存檔」「讀取成功」「無法讀取」（版本早於 v5、比遊戲新、JSON 損毀、遷移或還原拋錯）。無法讀取時，遊戲不再像現在這樣開新局並立刻自動存檔覆蓋，而是提示「存檔無法讀取」並提供「開新遊戲」；玩家確認前不自動存檔、不清除存檔，確認後才開新局並恢復自動存檔。

規格：`.scratch/open-hours-purchase-orders/spec.md`（使用者故事 21–23；ADR 0006）

**Blocked by:** 01

**Status:** resolved

- [x] `loadGame` 回報三種結果；比遊戲新、早於 v5、JSON 損毀、遷移拋錯都歸為「無法讀取」
- [x] 無法讀取時存檔內容不被改動或移除（測試驗證 storage 內容不變）
- [x] `main.tsx` 在無法讀取時不自動存檔，顯示提示；確認開新遊戲後才覆蓋並恢復自動存檔
- [x] 手動驗證：把 localStorage 的存檔版本改成 99，重新整理後看到提示，存檔仍在
- [x] `npm test`、`npm run lint`、`npm run build` 通過
