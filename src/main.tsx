import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SoundBoard, connectGameSounds, connectUiSounds } from './audio/sounds';
import { readSave, saveGame } from './persistence/save';
import { Game } from './sim/game';
import { Controller } from './ui/controller';
import { Interaction } from './ui/interaction';
import './styles.css';

const save = readSave();
const game = save.status === 'loaded' ? save.game : new Game({ seed: Date.now() });
// ADR 0006：存檔無法讀取時不自動存檔，避免覆蓋；玩家確認開新遊戲後才清除
const unreadableSave = save.status === 'unreadable';
// ADR 0002：只保存準備階段的狀態；營業中離開會回到當天的準備階段
if (!unreadableSave) {
  game.subscribe(() => {
    if (game.phase === 'prep') saveGame(game);
  });
  saveGame(game);
}

const sounds = new SoundBoard();
connectGameSounds(game, sounds);
connectUiSounds(sounds);

const controller = new Controller(game, new Interaction(), sounds);

// 開發模式下方便在 console 檢查與布置狀態
if (import.meta.env.DEV) Object.assign(window, { __game: controller.game, __ctl: controller });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App controller={controller} sounds={sounds} unreadableSave={unreadableSave} />
  </StrictMode>,
);
