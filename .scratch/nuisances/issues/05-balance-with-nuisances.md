# 05: 平衡策略處理麻煩

**What to build:** 平衡策略的「標準經營」在麻煩出現時立刻派工處理（名額滿時等空位）。既有三條平衡斷言照樣通過，必要時調整麻煩的機率與倍率，不放寬斷言。新增「放著不管」策略（只差在不處理麻煩），斷言它的累計營收明顯低於標準經營。

規格：`.scratch/nuisances/spec.md`（Implementation Decisions › 平衡）

**Blocked by:** 01, 02, 03

**Status:** ready-for-agent

- [ ] 標準經營策略會對麻煩派工
- [ ] 既有三條平衡斷言通過
- [ ] 新增「放著不管」策略與斷言：累計營收明顯低於標準經營
- [ ] `npm run balance` 的結果更新並記錄調整過的數值
- [ ] `npm test`、`npm run lint`、`npm run build` 通過
