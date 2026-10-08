import type { Game, GameEvent } from '../sim/game';

export type SoundName = 'click' | 'place' | 'error' | 'sale' | 'abandon' | 'open' | 'day-end' | 'milestone';

const BASE = `${import.meta.env.BASE_URL}assets/kenney-audio/`;

/** Kenney Interface Sounds / UI Audio（CC0） */
const FILES: Record<SoundName, string> = {
  click: 'click1.ogg',
  place: 'drop_002.ogg',
  error: 'error_001.ogg',
  sale: 'glass_002.ogg',
  abandon: 'error_004.ogg',
  open: 'bong_001.ogg',
  'day-end': 'maximize_003.ogg',
  milestone: 'confirmation_004.ogg',
};

/** 同一個音效最短的播放間隔，避免高倍速時連續成交洗版 */
const MIN_INTERVAL_MS = 90;
const VOLUME = 0.5;
const MUTE_KEY = 'convenience-store-sim/muted';

function readMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * 音效播放器。瀏覽器規定須在使用者互動後才能播放聲音，
 * 所以第一次點擊時才建立 AudioContext 並載入音效。
 */
export class SoundBoard {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private readonly lastPlayed = new Map<SoundName, number>();
  private readonly listeners = new Set<() => void>();
  private _muted = readMuted();

  get muted(): boolean {
    return this._muted;
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    try {
      globalThis.localStorage?.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // 偏好存不了也不影響遊戲
    }
    for (const l of this.listeners) l();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 在使用者互動的事件處理中呼叫 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    if (typeof AudioContext === 'undefined') return;
    this.ctx = new AudioContext();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = VOLUME;
    this.gain.connect(this.ctx.destination);
    for (const [name, file] of Object.entries(FILES) as [SoundName, string][]) {
      void fetch(BASE + file)
        .then((r) => r.arrayBuffer())
        .then((data) => this.ctx?.decodeAudioData(data))
        .then((buffer) => buffer && this.buffers.set(name, buffer))
        .catch(() => {
          // 某些瀏覽器不支援 ogg：少一個音效不影響遊戲
        });
    }
  }

  play(name: SoundName): void {
    if (this._muted || !this.ctx || !this.gain) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < MIN_INTERVAL_MS) return;
    this.lastPlayed.set(name, now);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    source.start();
  }
}

const EVENT_SOUND: Record<GameEvent['type'], SoundName> = {
  'store-opened': 'open',
  sale: 'sale',
  abandon: 'abandon',
  'day-ended': 'day-end',
  milestone: 'milestone',
};

/** 讓模擬事件發出對應音效；回傳取消函式 */
export function connectGameSounds(game: Game, sounds: SoundBoard): () => void {
  return game.onEvent((event) => sounds.play(EVENT_SOUND[event.type]));
}

/** 所有按鈕點擊發出點擊聲，並在第一次互動時解鎖音效 */
export function connectUiSounds(sounds: SoundBoard): () => void {
  const onPointerDown = (e: PointerEvent) => {
    sounds.unlock();
    if (e.target instanceof Element && e.target.closest('button')) sounds.play('click');
  };
  window.addEventListener('pointerdown', onPointerDown, true);
  return () => window.removeEventListener('pointerdown', onPointerDown, true);
}
