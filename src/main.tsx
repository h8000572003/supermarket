import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SoundBoard, connectGameSounds, connectUiSounds } from './audio/sounds';
import { loadGame, saveGame } from './persistence/save';
import { Game } from './sim/game';
import { Controller } from './ui/controller';
import { Interaction } from './ui/interaction';
import './styles.css';

const game = loadGame() ?? new Game({ seed: Date.now() });
// ADR 0002：只保存準備階段的狀態；營業中離開會回到當天的準備階段
game.subscribe(() => {
  if (game.phase === 'prep') saveGame(game);
});
saveGame(game);

const sounds = new SoundBoard();
connectGameSounds(game, sounds);
connectUiSounds(sounds);

const controller = new Controller(game, new Interaction(), sounds);

// 開發模式下方便在 console 檢查與布置狀態
if (import.meta.env.DEV) Object.assign(window, { __game: controller.game });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App controller={controller} sounds={sounds} />
  </StrictMode>,
);
