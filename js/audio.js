let audioCtx       = null;
let masterGainNode = null;
let _volume        = 0.75;
let _muted         = false;
let _trumpetWave   = null;

// ============================================================
// iOS AUDIO UNLOCK
//
// Three-layer unlock:
// 1. capture:true touchstart fires before any button handler, so
//    AudioContext + resume() happen synchronously in the gesture.
// 2. Silent 1-sample BufferSource — the original iOS trick that works
//    even when resume() alone isn't sufficient (iOS < 14).
// 3. playNote() also calls getAudio() (= _ensureAudio) so resume() is
//    called again directly in the touchend gesture that fired the note.
// ============================================================
function _ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state !== 'running') {
    audioCtx.resume();
    // Silent buffer — belt-and-suspenders iOS unlock
    try {
      const buf = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.start(0);
    } catch(e) {}
  }
}

document.addEventListener('touchstart', _ensureAudio, { passive: true, capture: true });
document.addEventListener('mousedown',  _ensureAudio, { passive: true, capture: true });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _ensureAudio();
});

function getAudio() {
  _ensureAudio();
  return audioCtx;
}

// ============================================================
// MASTER GAIN
// ============================================================
function getMasterGain() {
  const ctx = getAudio();
  if (!masterGainNode) {
    masterGainNode = ctx.createGain();
    masterGainNode.gain.value = _muted ? 0 : _volume;
    masterGainNode.connect(ctx.destination);
  }
  return masterGainNode;
}

function setVolume(v) {
  _volume = Math.max(0, Math.min(1, v));
  if (masterGainNode && !_muted) masterGainNode.gain.value = _volume;
}

function setMuted(m) {
  _muted = !!m;
  if (masterGainNode) masterGainNode.gain.value = _muted ? 0 : _volume;
}

function getVolume() { return _volume; }
function getMuted()  { return _muted; }

// ============================================================
// TRUMPET PERIODIC WAVE
// No third argument to createPeriodicWave — the options dictionary
// was added in Safari 14.1 and throws on older WebKit.
// ============================================================
function _getTrumpetWave(ctx) {
  if (_trumpetWave) return _trumpetWave;
  try {
    const amps = [0, 0.28, 0.62, 1.00, 0.90, 0.72, 0.50, 0.32, 0.18, 0.09, 0.04, 0.02];
    const real = new Float32Array(amps.length);
    const imag = new Float32Array(amps);
    _trumpetWave = ctx.createPeriodicWave(real, imag);
  } catch(e) {
    _trumpetWave = null;
  }
  return _trumpetWave;
}

// ============================================================
// PLAY NOTE
// ============================================================
function _doPlayNote(note) {
  const ctx = audioCtx;
  if (!ctx) return;

  try {
    const freq = 440 * Math.pow(2, (ID_SEMI[note.id] - 2 - 21) / 12);

    // If the context was just resumed, currentTime may still be at the
    // frozen value and iOS starts the clock a few ms ahead. A small offset
    // ensures envelope events are never "in the past" when processing begins.
    const now = ctx.currentTime + (ctx.state === 'running' ? 0 : 0.05);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(1.0, now + 0.008);
    env.gain.setTargetAtTime(0.72, now + 0.008, 0.018);
    env.gain.setTargetAtTime(0.58, now + 0.12,  0.20);
    env.gain.setTargetAtTime(0.001, now + 0.78, 0.036);

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(Math.min(freq * 14, 22000), now);
    filt.frequency.setTargetAtTime(freq * 5.5, now, 0.07);
    filt.Q.value = 0.6;

    env.connect(filt);
    filt.connect(getMasterGain());

    const osc = ctx.createOscillator();
    const wave = _getTrumpetWave(ctx);
    if (wave) {
      osc.setPeriodicWave(wave);
    } else {
      osc.type = 'sawtooth'; // fallback if PeriodicWave unsupported
    }
    osc.frequency.value = freq;
    osc.connect(env);

    const lfo    = ctx.createOscillator();
    const lfoAmp = ctx.createGain();
    lfo.frequency.value = 5.8;
    lfoAmp.gain.setValueAtTime(0, now);
    lfoAmp.gain.setTargetAtTime(freq * 0.0034, now + 0.15, 0.12);
    lfo.connect(lfoAmp);
    lfoAmp.connect(osc.frequency);

    osc.start(now);  osc.stop(now + 1.05);
    lfo.start(now);  lfo.stop(now + 1.05);

  } catch(e) {
    // Last-resort fallback: plain sine directly to destination
    try {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      const t    = ctx.currentTime;
      osc.frequency.value = 440 * Math.pow(2, (ID_SEMI[note.id] - 2 - 21) / 12);
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.setTargetAtTime(0.001, t + 0.6, 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.8);
    } catch(e2) {}
  }
}

function playNote(note) {
  if (_muted) return;
  getAudio(); // unlock in the current gesture before scheduling
  _doPlayNote(note);
}
