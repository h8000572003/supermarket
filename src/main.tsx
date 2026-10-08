import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Game } from './sim/game';
import { Controller } from './ui/controller';
import { Interaction } from './ui/interaction';
import './styles.css';

const controller = new Controller(new Game({ seed: Date.now() }), new Interaction());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App controller={controller} />
  </StrictMode>,
);
