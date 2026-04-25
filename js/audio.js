let audioCtx       = null;
let masterGainNode = null;
let _volume        = 0.75;
let _muted         = false;
let _trumpetWave   = null; // cached PeriodicWave

// ============================================================
// iOS AUDIO UNLOCK
//
// Problem: iOS creates AudioContext in 'suspended' state.
// resume() is async — if we schedule audio immediately after
// calling resume(), ctx.currentTime is still 0 and the notes
// are "in the past" when the context actually starts, so silence.
//
// Fix: pre-create + resume the context on the VERY FIRST gesture
// (capture:true fires before any button handler), so by the time
// the user's tap reaches playNote() the context is already running.
// ============================================================
function _ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state !== 'running') audioCtx.resume();
}

// capture:true fires before any button click/touchend handlers
document.addEventListener('touchstart', _ensureAudio, { passive: true, capture: true });
document.addEventListener('mousedown',  _ensureAudio, { passive: true, capture: true });

// Re-unlock when app returns from background (iOS suspends audio in background tabs)
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
//
// One oscillator with a custom PeriodicWave encodes ALL harmonics
// phase-locked (no inter-oscillator beating). Amplitudes from
// measured trumpet spectra at mezzo-forte.
// ============================================================
function _getTrumpetWave(ctx) {
  if (_trumpetWave) return _trumpetWave;
  // Sine (imag) components: index k = k-th harmonic, k=1 is fundamental
  const amps = [0, 0.28, 0.62, 1.00, 0.90, 0.72, 0.50, 0.32, 0.18, 0.09, 0.04, 0.02];
  const real = new Float32Array(amps.length); // cosine: all zero (pure sine phases)
  const imag = new Float32Array(amps);
  _trumpetWave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  return _trumpetWave;
}

// ============================================================
// PLAY NOTE
//
// If AudioContext is still suspended (e.g. on iOS before the
// resume() Promise resolves), defer scheduling until it's running.
// ============================================================
function _doPlayNote(note) {
  const ctx = audioCtx;
  const concertSemi = ID_SEMI[note.id] - 2;
  const freq = 440 * Math.pow(2, (concertSemi - 21) / 12);
  const now  = ctx.currentTime;

  // Envelope: tongued 8ms attack → exponential decay → long sustain → release
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(1.0, now + 0.008);      // crisp attack
  env.gain.setTargetAtTime(0.72, now + 0.008, 0.018);      // initial decay (~50ms)
  env.gain.setTargetAtTime(0.58, now + 0.12,  0.20);       // slow sustain drift
  env.gain.setTargetAtTime(0.001, now + 0.78, 0.036);      // release

  // Lowpass filter: bright on attack, mellows during sustain
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(Math.min(freq * 14, 22000), now);
  filt.frequency.setTargetAtTime(freq * 5.5, now, 0.07);
  filt.Q.value = 0.6;

  env.connect(filt);
  filt.connect(getMasterGain());

  // Single oscillator with trumpet PeriodicWave (no beating, no WaveShaper distortion)
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(_getTrumpetWave(ctx));
  osc.frequency.value = freq;
  osc.connect(env);

  // Vibrato LFO: 5.8 Hz, ±6 cents depth, fades in after 150ms
  const lfo    = ctx.createOscillator();
  const lfoAmp = ctx.createGain();
  lfo.frequency.value = 5.8;
  lfoAmp.gain.setValueAtTime(0, now);
  lfoAmp.gain.setTargetAtTime(freq * 0.0034, now + 0.15, 0.12); // ≈ ±6 cents
  lfo.connect(lfoAmp);
  lfoAmp.connect(osc.frequency);

  osc.start(now);  osc.stop(now + 1.05);
  lfo.start(now);  lfo.stop(now + 1.05);
}

function playNote(note) {
  if (_muted) return;
  const ctx = getAudio();
  // If context not yet running (iOS resume() still pending), wait for it
  if (ctx.state !== 'running') {
    ctx.resume().then(() => _doPlayNote(note));
  } else {
    _doPlayNote(note);
  }
}
