let audioCtx      = null;
let masterGainNode = null;
let _volume        = 0.75;
let _muted         = false;
let _brassCurveCache = null;

function getAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // iOS starts AudioContext suspended — resume on every call (safe no-op if running)
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Unlock audio on first touch (iOS requires a user-gesture gate)
document.addEventListener('touchstart', function _unlock() {
  if (audioCtx) audioCtx.resume();
  document.removeEventListener('touchstart', _unlock);
}, { passive: true });

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

// Soft-clip WaveShaper — adds warm brass saturation without harsh clipping
function _getBrassCurve() {
  if (_brassCurveCache) return _brassCurveCache;
  const n = 512;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = Math.tanh(3 * x) * 0.85;
  }
  _brassCurveCache = c;
  return c;
}

function playNote(note) {
  if (_muted) return;
  const ctx = getAudio();
  const concertSemi = ID_SEMI[note.id] - 2;
  const freq = 440 * Math.pow(2, (concertSemi - 21) / 12);
  const now  = ctx.currentTime;

  // Envelope: sharp attack → quick decay → long sustain → release
  const noteGain = ctx.createGain();
  noteGain.gain.setValueAtTime(0, now);
  noteGain.gain.linearRampToValueAtTime(1.0, now + 0.010); // crisp tongued attack
  noteGain.gain.exponentialRampToValueAtTime(0.75, now + 0.06);
  noteGain.gain.exponentialRampToValueAtTime(0.62, now + 0.35);
  noteGain.gain.exponentialRampToValueAtTime(0.52, now + 0.70);
  noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.92);

  // Formant filter: sweeps bright→warm (mimics trumpet bell resonance opening)
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.min(freq * 12, 18000), now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 3.5, 400), now + 0.12);
  filter.Q.value = 1.2;

  // WaveShaper for brass character (adds odd harmonics / warmth)
  const shaper = ctx.createWaveShaper();
  shaper.curve = _getBrassCurve();
  shaper.oversample = '2x';

  noteGain.connect(filter);
  filter.connect(shaper);
  shaper.connect(getMasterGain());

  // Trumpet harmonic series — dominant at H3–H5 (real trumpet spectral profile)
  [
    [1, 0.32], [2, 0.68], [3, 1.00], [4, 0.92],
    [5, 0.70], [6, 0.45], [7, 0.24], [8, 0.11], [9, 0.05]
  ].forEach(([m, g]) => {
    const osc = ctx.createOscillator();
    const gn  = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * m;
    gn.gain.value = g * 0.14; // normalise so sum ≈ 1
    osc.connect(gn);
    gn.connect(noteGain);
    osc.start(now);
    osc.stop(now + 0.95);
  });
}
