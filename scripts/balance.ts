/**
 * 無畫面平衡報告：npm run balance [天數] [種子數]
 * 以數種固定策略各經營 N 天，列出每天收支與里程碑。
 */
import { STRATEGIES, forecastAware, ignoreNuisances, simulate, standard } from '../src/sim/balance/strategies';

// 專案只裝瀏覽器型別；此腳本在 Node（tsx）執行，只用到 argv
declare const process: { argv: string[] };

const days = Number(process.argv[2] ?? 30);
const seeds = Number(process.argv[3] ?? 3);

for (const strategy of STRATEGIES) {
  console.log(`\n=== ${strategy.name} ===`);
  for (let seed = 1; seed <= seeds; seed++) {
    const rows = simulate(strategy, days, seed);
    const last = rows.at(-1)!;
    const milestones = rows.flatMap((r) => r.milestones.map((m) => `${m}@${r.day}`));
    const firstProfit = rows.find((r) => r.net > 0)?.day ?? '—';
    console.log(
      `seed ${seed}: 第 ${last.day} 天 資金 ${last.funds}  口碑 ${last.reputation}  ` +
        `首次獲利 第 ${firstProfit} 天  ${last.bankrupt ? '【破產】' : ''}  里程碑 ${milestones.join(' ') || '—'}`,
    );
    if (seed === 1) {
      console.log('  day  revenue    net    funds  rep  in/served/empty/abandon  staff  incident  nuisance');
      for (const r of rows) {
        console.log(
          `  ${String(r.day).padStart(3)} ${String(r.revenue).padStart(8)} ${String(r.net).padStart(6)} ${String(r.funds).padStart(8)} ` +
            `${String(r.reputation).padStart(4)}  ${r.entered}/${r.served}/${r.leftEmpty}/${r.abandoned}  ${r.staff}  ${r.incidentCosts}  ${r.nuisances}`,
        );
      }
    }
  }
}

// 麻煩值不值得處理：放著不管與標準經營的累計營收比
console.log(`\n=== ${ignoreNuisances.name} ÷ ${standard.name}（累計營收比）===`);
for (let seed = 1; seed <= seeds; seed++) {
  const revenue = (s: typeof standard) => simulate(s, days, seed).reduce((sum, r) => sum + r.revenue, 0);
  console.log(`seed ${seed}: ${(revenue(ignoreNuisances) / revenue(standard)).toFixed(3)}`);
}

// 預報值不值得看：依預報進貨與標準經營的期末資金差
console.log(`\n=== ${forecastAware.name} − ${standard.name}（期末資金差）===`);
for (let seed = 1; seed <= seeds; seed++) {
  const funds = (s: typeof standard) => simulate(s, days, seed).at(-1)!.funds;
  console.log(`seed ${seed}: ${funds(forecastAware) - funds(standard)}`);
}
