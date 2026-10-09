# 便利商店模擬

以等角 2.5D 呈現的網頁版便利商店經營遊戲，玩法參考《便利商店6》。玩家是店長：擺設陳列櫃與收銀台、指定格位商品、進貨、定價、雇用店員，然後開店看顧客與店員在店裡活動，每天打烊後看結算、調整策略。

**線上遊玩：https://h8000572003.github.io/supermarket/**（推送到 `master` 時由 GitHub Actions 自動測試並部署）

## 執行

```bash
npm install
```

```bash
npm run dev
```

其他指令：

| 指令 | 用途 |
|---|---|
| `npm test` | 執行所有測試（模擬核心、存檔、平衡守門） |
| `npm run lint` | ESLint；並禁止 `src/sim` 依賴畫面相關程式 |
| `npm run build` | 型別檢查並打包成靜態網站到 `dist/` |
| `npm run balance [天數] [種子數]` | 無畫面平衡報告：以數種固定策略各經營 N 天 |

## 怎麼玩

1. **準備階段**：用底部工具列放置一般貨架、冷藏櫃、收銀台（R 旋轉、右鍵或 Esc 取消）；點選陳列櫃指定每個格位的商品；用「商品與進貨」調整售價並下進貨單（隔天開店前送達）；用 ＋／－ 雇用店員。
2. **營業中**（07:00–23:00，1x 約 4 分鐘，可暫停或 2x／4x）：店員從倉庫門取貨補上架、有人排隊時去收銀；顧客照購物清單找商品、排隊結帳，等太久會放棄。
3. **每日結算**：看營收、淨利、來客、缺貨、口碑變化，再進入下一天。

口碑會影響來客量；達成里程碑可解鎖鮮食與日用品；資金連續 3 天為負就破產。遊戲在準備階段自動存檔（瀏覽器 localStorage）。

## 專案結構

```
src/
├── sim/          模擬核心（純 TypeScript，可在 Node 中測試與無畫面執行）
├── render/       PixiJS 等角場景
├── ui/           React 介面
├── audio/        音效
└── persistence/  存讀檔
```

設計文件：

- [CONTEXT.md](CONTEXT.md)：領域詞彙
- [docs/implementation-plan.md](docs/implementation-plan.md)：實作計畫
- [docs/adr/](docs/adr/)：架構決策紀錄

## 素材授權

- 家具與紙箱圖：[Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)（CC0）
- 音效：[Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds)、[Kenney UI Audio](https://kenney.nl/assets/ui-audio)（CC0）

各素材資料夾內附原始授權檔。音效為 ogg 格式，較舊的 Safari 可能無法播放（只會沒有聲音，不影響遊戲）。
