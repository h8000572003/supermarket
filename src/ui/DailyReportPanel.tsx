import { CATEGORIES, CATEGORY_IDS, productById } from '../sim/catalog/products';
import type { CategoryId } from '../sim/catalog/products';
import type { Game } from '../sim/game';
import { BANKRUPTCY_DAYS, MILESTONES } from '../sim/progress/progress';
import type { DailyReport } from '../sim/report/daily-report';
import { useGameVersion } from './hooks';
import { formatMoney } from './messages';
import { startNewGame } from './new-game';

/** 每日結算畫面；破產時改為結束畫面 */
export function DailyReportPanel({ game }: { game: Game }) {
  useGameVersion(game);
  const report = game.lastReport;
  if ((game.phase !== 'report' && game.phase !== 'gameover') || !report) return null;
  const p = report.progress;
  const net = report.fundsAtEnd - report.fundsAtStart;
  const c = report.customers;
  const wasteCost = report.waste.reduce((s, w) => s + w.cost, 0);
  const stockoutRanking = CATEGORY_IDS.map((id) => [id, report.stockouts[id] ?? 0] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const repDelta = p.reputationAfter - p.reputationBefore;

  return (
    <div className="modal-backdrop">
      <div className="modal report-modal" role="dialog" aria-label={`第 ${report.day} 天每日結算`}>
        <h2>{p.bankrupt ? '破產了' : `第 ${report.day} 天 每日結算`}</h2>

        {p.bankrupt && (
          <p className="report-alert">
            資金連續 {BANKRUPTCY_DAYS} 天為負，便利商店經營到第 {report.day} 天為止。
          </p>
        )}

        {p.milestonesReached.map((id) => {
          const m = MILESTONES.find((x) => x.id === id);
          if (!m) return null;
          return (
            <p key={id} className="report-milestone">
              達成里程碑「{m.name}」：{m.goal}
              {m.unlocks ? `，解鎖${CATEGORIES[m.unlocks].name}！` : '！'}
            </p>
          );
        })}

        <section>
          <h3>收支</h3>
          <dl className="report">
            <dt>營收</dt>
            <dd className="positive">{formatMoney(report.revenue)}</dd>
            <dt>進貨支出</dt>
            <dd>{formatExpense(report.purchases)}</dd>
            {report.fixtures !== 0 && (
              <>
                <dt>設施購置（扣除出售回收）</dt>
                <dd>{report.fixtures > 0 ? formatExpense(report.fixtures) : `+${formatMoney(-report.fixtures)}`}</dd>
              </>
            )}
            <dt>租金</dt>
            <dd>{formatExpense(report.rent)}</dd>
            <dt>店員日薪</dt>
            <dd>{formatExpense(report.wages)}</dd>
            <dt className="total">淨利</dt>
            <dd className={`total ${net < 0 ? 'negative' : 'positive'}`}>{formatSigned(net)}</dd>
            <dt>目前資金</dt>
            <dd className={report.fundsAtEnd < 0 ? 'negative' : ''}>{formatMoney(report.fundsAtEnd)}</dd>
            {wasteCost > 0 && (
              <>
                <dt>報廢損失（已含在進貨）</dt>
                <dd>{formatMoney(wasteCost)}</dd>
              </>
            )}
          </dl>
          {!p.bankrupt && p.negativeDays > 0 && (
            <p className="report-alert">
              資金已連續 {p.negativeDays} 天為負；連續 {BANKRUPTCY_DAYS} 天就會破產。
            </p>
          )}
        </section>

        <section>
          <h3>顧客</h3>
          <dl className="report">
            <dt>來客 / 結帳</dt>
            <dd>
              {c.entered} / {c.served} 人
            </dd>
            <dt>空手離開（沒賣、缺貨或嫌貴）</dt>
            <dd>{c.leftEmpty} 人</dd>
            <dt>排隊太久放棄</dt>
            <dd>{c.abandoned} 人</dd>
            <dt>平均滿意度</dt>
            <dd>{c.avgSatisfaction === null ? '—' : Math.round(c.avgSatisfaction)}</dd>
            <dt>口碑</dt>
            <dd>
              {Math.round(p.reputationAfter)}{' '}
              {Math.abs(repDelta) < 0.05 ? (
                <span>（持平）</span>
              ) : (
                <span className={repDelta < 0 ? 'negative' : 'positive'}>
                  （{repDelta > 0 ? '+' : '−'}
                  {Math.abs(repDelta).toFixed(1)}）
                </span>
              )}
            </dd>
          </dl>
        </section>

        <section>
          <h3>各類別銷量</h3>
          <CategorySales report={report} />
          {stockoutRanking.length > 0 && (
            <p className="report-note">
              缺貨最多：
              {stockoutRanking
                .slice(0, 3)
                .map(([id, n]) => `${CATEGORIES[id].name} ${n} 次`)
                .join('、')}
            </p>
          )}
          {report.waste.length > 0 && (
            <p className="report-note">
              今天開店前報廢：{report.waste.map((w) => `${productById(w.productId)?.name} ${w.qty} 個`).join('、')}
            </p>
          )}
        </section>

        {p.bankrupt ? (
          <button className="primary" onClick={startNewGame}>
            重新開始
          </button>
        ) : (
          <button className="primary" onClick={() => game.startNextDay()}>
            開始第 {report.day + 1} 天
          </button>
        )}
      </div>
    </div>
  );
}

function CategorySales({ report }: { report: DailyReport }) {
  const byCategory = new Map<CategoryId, number>();
  for (const [productId, qty] of Object.entries(report.sales)) {
    const category = productById(productId)?.category;
    if (category) byCategory.set(category, (byCategory.get(category) ?? 0) + qty);
  }
  const max = Math.max(1, ...byCategory.values());
  const rows = CATEGORY_IDS.filter((id) => byCategory.has(id));
  if (rows.length === 0) return <p className="report-note">今天沒有賣出任何商品。</p>;
  return (
    <ul className="bars">
      {rows.map((id) => {
        const qty = byCategory.get(id) ?? 0;
        return (
          <li key={id}>
            <span>{CATEGORIES[id].name}</span>
            <span className="bar">
              <span style={{ width: `${(qty / max) * 100}%` }} />
            </span>
            <span className="bar-value">{qty}</span>
          </li>
        );
      })}
    </ul>
  );
}

const formatExpense = (n: number) => (n > 0 ? `−${formatMoney(n)}` : formatMoney(0));
const formatSigned = (n: number) => `${n >= 0 ? '+' : '−'}${formatMoney(Math.abs(n))}`;
