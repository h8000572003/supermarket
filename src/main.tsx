import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Game } from './sim/game';
import { Controller } from './ui/controller';
import { Interaction } from './ui/interaction';
import './styles.css';

const controller = new Controller(new Game({ seed: Date.now() }), new Interaction());

// 開發模式下方便在 console 檢查與布置狀態
if (import.meta.env.DEV) Object.assign(window, { __game: controller.game });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App controller={controller} />
  </StrictMode>,
);
