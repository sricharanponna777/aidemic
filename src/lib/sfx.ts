/**
 * Latency budget:
 *  - AudioContext + GainNodes pre-created at mount (preloadSfx)
 *  - Buffers decoded off the hot path
 *  - Hot path per sound: createBufferSource() + connect() + start() only
 *  - If context is suspended (first gesture), resume then play — no sound is dropped
 */

let ctx: AudioContext | null = null;

interface Track {
  buffer: AudioBuffer;
  gain: GainNode; // pre-wired to destination, never recreated
}

const tracks = new Map<string, Track>();
const loadingPromises = new Map<string, Promise<void>>();

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

function loadTrack(url: string, volume: number): Promise<void> {
  if (tracks.has(url)) return Promise.resolve();
  if (loadingPromises.has(url)) return loadingPromises.get(url)!;

  const ac = getCtx();
  if (!ac) return Promise.resolve();

  // Pre-create and connect the gain node now — reused on every play of this track
  const gain = ac.createGain();
  gain.gain.value = volume;
  gain.connect(ac.destination);

  const promise = fetch(url)
    .then((r) => r.arrayBuffer())
    .then((ab) => ac.decodeAudioData(ab))
    .then((buffer) => {
      tracks.set(url, { buffer, gain });
      loadingPromises.delete(url);
    })
    .catch(() => { loadingPromises.delete(url); });

  loadingPromises.set(url, promise);
  return promise;
}

function playTrack(url: string) {
  const ac = getCtx();
  if (!ac) return;
  const track = tracks.get(url);
  if (!track) return;

  const fire = () => {
    const src = ac.createBufferSource();
    src.buffer = track.buffer;
    src.connect(track.gain);
    src.start();
  };

  // If context is running (normal case after first gesture), fire immediately
  if (ac.state === 'running') {
    fire();
  } else {
    // First gesture — resume then fire; no sound is dropped
    void ac.resume().then(fire);
  }
}

function playOsc(
  freqStart: number,
  freqEnd: number,
  volume: number,
  decay: number,
  startDelay = 0,
) {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const t = ac.currentTime + startDelay;
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freqStart, t);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, t + decay);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + decay);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t);
  osc.stop(t + decay + 0.01);
}

const CLICK_URL = '/matthewvakaliuk73627-mouse-click-290204.mp3';
const KEY_URL = '/COMType_Typewriter key (ID 2842)_BigSoundBank.com.wav';

/** Decode audio files and pre-wire gain nodes at mount — before first interaction. */
export function preloadSfx() {
  void loadTrack(CLICK_URL, 0.7);
  void loadTrack(KEY_URL, 0.5);
}

export const sfx = {
  click() { playTrack(CLICK_URL); },
  key()   { playTrack(KEY_URL); },
  nav() {
    playOsc(520, 520, 0.07, 0.07);
    playOsc(720, 720, 0.05, 0.09, 0.055);
  },
  success() {
    playOsc(660, 660, 0.09, 0.1);
    playOsc(990, 990, 0.07, 0.14, 0.09);
  },
  error() {
    playOsc(260, 200, 0.08, 0.18);
  },
};
