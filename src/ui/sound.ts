/**
 * Tiny synthesised UI sounds (Web Audio, no audio files). Quiet by design (peak gain 0.05),
 * created lazily on the first user gesture as browsers require, and silent when the user turns
 * sounds off in Settings. On iOS 17+ the "ambient" audio session respects the ring/silent switch.
 */
export type SoundName = 'tap' | 'open' | 'success' | 'undo' | 'delete';

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundsEnabled(on: boolean) {
  enabled = on;
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'ambient';
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

type Note = { f: number; t: number; d: number; type?: OscillatorType; g?: number };

const SOUNDS: Record<SoundName, Note[]> = {
  tap: [{ f: 880, t: 0, d: 0.04, type: 'sine', g: 0.025 }],
  open: [{ f: 520, t: 0, d: 0.07 }, { f: 780, t: 0.05, d: 0.08 }],
  success: [{ f: 660, t: 0, d: 0.08 }, { f: 880, t: 0.07, d: 0.09 }, { f: 1320, t: 0.14, d: 0.14, g: 0.035 }],
  undo: [{ f: 700, t: 0, d: 0.07 }, { f: 470, t: 0.06, d: 0.1 }],
  delete: [{ f: 330, t: 0, d: 0.1, type: 'triangle' }],
};

export function play(name: SoundName) {
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime;
  for (const n of SOUNDS[name]) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.value = n.f;
    const start = now + n.t;
    const peak = n.g ?? 0.05;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + n.d);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + n.d + 0.02);
  }
}
