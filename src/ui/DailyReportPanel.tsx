import { productById } from '../sim/catalog/products';
import type { Game } from '../sim/game';
import { useGameVersion } from './hooks';
import { formatMoney } from './messages';

/** 每日結算畫面；M6 會補上營收、來客與口碑 */
export function DailyReportPanel({ game }: { game: Game }) {
  useGameVersion(game);
  const report = game.lastReport;
  if (game.phase !== 'report' || !report) return null;
  const change = report.fundsAtEnd - report.fundsAtStart;
  const c = report.customers;

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label={`第 ${report.day} 天每日結算`}>
        <h2>第 {report.day} 天 每日結算</h2>
        <dl className="report">
          <dt>營收</dt>
          <dd className="positive">{formatMoney(report.revenue)}</dd>
          <dt>進貨支出</dt>
          <dd>{formatExpense(report.purchases)}</dd>
          <dt>租金</dt>
          <dd>{formatExpense(report.rent)}</dd>
          <dt>店員日薪</dt>
          <dd>{formatExpense(report.wages)}</dd>
          <dt>資金變化</dt>
          <dd className={change < 0 ? 'negative' : 'positive'}>
            {change >= 0 ? '+' : '−'}
            {formatMoney(Math.abs(change))}
          </dd>
          <dt>目前資金</dt>
          <dd>{formatMoney(report.fundsAtEnd)}</dd>
        </dl>
        <dl className="report">
          <dt>來客</dt>
          <dd>{c.entered} 人</dd>
          <dt>結帳</dt>
          <dd>{c.served} 人</dd>
          <dt>空手離開（缺貨或嫌貴）</dt>
          <dd>{c.leftEmpty} 人</dd>
          <dt>排隊太久放棄</dt>
          <dd>{c.abandoned} 人</dd>
          <dt>平均滿意度</dt>
          <dd>{c.avgSatisfaction === null ? '—' : Math.round(c.avgSatisfaction)}</dd>
        </dl>
        {report.waste.length > 0 && (
          <p className="report-note">
            今天開店前報廢：
            {report.waste.map((w) => `${productById(w.productId)?.name} ${w.qty} 個`).join('、')}（損失{' '}
            {formatMoney(report.waste.reduce((s, w) => s + w.cost, 0))}）
          </p>
        )}
        <button className="primary" onClick={() => game.startNextDay()}>
          開始第 {report.day + 1} 天
        </button>
      </div>
    </div>
  );
}

const formatExpense = (n: number) => (n > 0 ? `−${formatMoney(n)}` : formatMoney(0));
