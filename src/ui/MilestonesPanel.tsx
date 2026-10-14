import { CATEGORIES } from '../sim/catalog/products';
import type { Game } from '../sim/game';
import { MILESTONES } from '../sim/progress/progress';
import { BottomSheet } from './BottomSheet';
import { useGameVersion } from './hooks';
import { useNarrow } from './media';
import { formatGoalCount, formatGoalReward, goalProgressRatio } from './messages';

/** 每日目標（準備階段是即將開店那天的）：只限當天、不解鎖任何東西，所以和里程碑分開 */
function DailyGoalSection({ game }: { game: Game }) {
  const goal = game.dailyGoal;
  const judged = game.phase === 'report' || game.phase === 'gameover';
  const state = !goal
    ? null
    : judged
      ? goal.met
        ? '已達成'
        : '未達成'
      : goal.met && goal.kind !== 'served' && goal.kind !== 'sell-category'
        ? '守住中'
        : goal.met
          ? '已達標'
          : '進行中';
  return (
    <section className="goal-section" aria-label="每日目標">
      <h3>每日目標</h3>
      {goal ? (
        <div className={`daily-goal${goal.met ? ' done' : ''}`}>
          <div className="milestone-head">
            <strong>{goal.description}</strong>
            <span>{state}</span>
          </div>
          <div className="milestone-goal">
            {formatGoalCount(goal)} · 達成獎勵 {formatGoalReward(goal.reward)} · 打烊時判定，沒達成不扣分
          </div>
          <span className="bar">
            <span style={{ width: `${goalProgressRatio(goal) * 100}%` }} />
          </span>
        </div>
      ) : (
        <p className="milestone-goal">從第 2 天起，每天開店前一晚（準備階段）會出現一個每日目標，只限隔天營業。</p>
      )}
    </section>
  );
}

/** 里程碑與進度 */
export function MilestonesPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  useGameVersion(game);
  const narrow = useNarrow();
  const ctx = game.milestoneContext;
  const list = (
    <div className="goals-body">
      <DailyGoalSection game={game} />
      <section className="goal-section" aria-label="里程碑">
        <h3>里程碑</h3>
        <ul className="milestones">
          {MILESTONES.map((m) => {
            const done = game.isMilestoneAchieved(m.id);
            const progress = done ? 1 : m.progress(ctx);
            return (
              <li key={m.id} className={done ? 'done' : ''}>
                <div className="milestone-head">
                  <strong>{m.name}</strong>
                  <span>{done ? '已達成' : `${Math.floor(progress * 100)}%`}</span>
                </div>
                <div className="milestone-goal">
                  {m.goal}
                  {m.unlocks ? ` → 解鎖${CATEGORIES[m.unlocks].name}` : ' → 最終目標'}
                </div>
                <span className="bar">
                  <span style={{ width: `${progress * 100}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
  if (narrow) {
    return (
      <BottomSheet label="經營目標" title={<h2>經營目標</h2>} onClose={onClose} size="tall">
        {list}
      </BottomSheet>
    );
  }
  return (
    <div className="side-panel milestones-panel">
      <header>
        <h2>經營目標</h2>
        <button onClick={onClose} aria-label="關閉">
          ✕
        </button>
      </header>
      {list}
    </div>
  );
}
