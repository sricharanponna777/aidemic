let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.08,
  startDelay = 0,
) {
  const ac = getCtx();
  if (!ac) return;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);

  const t = ac.currentTime + startDelay;
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.start(t);
  osc.stop(t + duration + 0.01);
}

export const sfx = {
  click() {
    tone(900, 0.04, 'square', 0.055);
  },
  nav() {
    tone(520, 0.07, 'sine', 0.07);
    tone(720, 0.09, 'sine', 0.05, 0.055);
  },
  success() {
    tone(660, 0.1, 'sine', 0.09);
    tone(990, 0.14, 'sine', 0.07, 0.09);
  },
  error() {
    tone(260, 0.18, 'sawtooth', 0.07);
  },
};
