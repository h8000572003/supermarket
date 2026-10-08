# 模擬核心與渲染分離

遊戲邏輯（顧客、店員、庫存、資金、時鐘）寫成不依賴 PixiJS 或 React 的純 TypeScript 模組，以固定 tick 推進；PixiJS 只負責把模擬狀態畫成等角場景，React 只負責疊加 UI 面板。選擇 PixiJS + React 而非 Phaser，是因為 Phaser 的 UI 能力弱、且其場景系統會誘使邏輯與渲染耦合，讓模擬難以單元測試與倍速運行。
