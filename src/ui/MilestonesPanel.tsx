import { CATEGORIES } from '../sim/catalog/products';
import type { Game } from '../sim/game';
import { MILESTONES } from '../sim/progress/progress';
import { useGameVersion } from './hooks';

/** 里程碑與進度 */
export function MilestonesPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  useGameVersion(game);
  const ctx = game.milestoneContext;
  return (
    <div className="side-panel milestones-panel">
      <header>
        <h2>經營目標</h2>
        <button onClick={onClose} aria-label="關閉">
          ✕
        </button>
      </header>
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
    </div>
  );
}
