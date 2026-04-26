let audioCtx       = null;
let masterGainNode = null;
let _volume        = 0.75;
let _muted         = false;

// ============================================================
// iOS AUDIO UNLOCK
//
// 1. capture:true touchstart/mousedown fires before any button handler —
//    AudioContext + resume() happen synchronously in the gesture.
// 2. Silent 1-sample BufferSource — the iOS gate that works even when
//    resume() alone is insufficient (iOS < 14).
// ============================================================
function _ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state !== 'running') {
    audioCtx.resume();
    try {
      const buf = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.start(0);
    } catch(e) {}
  }
}

// ============================================================
// iOS SILENT-SWITCH BYPASS (best-effort)
//
// Route WebAudio through an <audio> element via createMediaStreamDestination.
// Safari/WKWebView set the AVAudioSession to 'playback' category when an
// <audio> element is actively playing, which bypasses the silent switch.
// This only works on iOS 14+ (createMediaStreamDestination availability).
// ============================================================
let _sessionUnlockTried = false;

function _trySessionUnlock() {
  if (_sessionUnlockTried || !audioCtx) return;
  _sessionUnlockTried = true;
  try {
    if (typeof audioCtx.createMediaStreamDestination !== 'function') return;
    const dest  = audioCtx.createMediaStreamDestination();
    const audio = new Audio();
    audio.srcObject = dest.stream;
    audio.volume    = 0.001;
    audio.play().catch(() => {});
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    gain.gain.value = 0.0001; // inaudible
    osc.connect(gain);
    gain.connect(dest);
    const t = audioCtx.currentTime;
    osc.start(t);
    osc.stop(t + 0.5);
  } catch(e) { _sessionUnlockTried = false; }
}

document.addEventListener('touchstart', _ensureAudio, { passive: true, capture: true });
document.addEventListener('mousedown',  _ensureAudio, { passive: true, capture: true });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _ensureAudio();
});

function getAudio() {
  _ensureAudio();
  _trySessionUnlock();
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
// PLAY NOTE
// Synchronous scheduling — osc.start() stays in the user gesture stack.
// When suspended, schedule 300ms ahead so the clock is live before the
// notes are due (iOS resume() typically completes in < 100ms).
// ============================================================
function _doPlayNote(note) {
  const ctx = audioCtx;
  if (!ctx) return;

  try {
    const freq = 440 * Math.pow(2, (ID_SEMI[note.id] - 2 - 21) / 12);

    // Large lookahead when clock is frozen so notes land in the future
    // after iOS starts the clock. Small offset when already running.
    const now = ctx.currentTime + (ctx.state !== 'running' ? 0.3 : 0.02);

    const master = ctx.createGain();
    master.gain.setValueAtTime(0,   now);
    master.gain.linearRampToValueAtTime(0.8,  now + 0.04);
    master.gain.linearRampToValueAtTime(0.65, now + 0.50);
    master.gain.linearRampToValueAtTime(0,    now + 0.85);
    master.connect(getMasterGain());

    [[1, 0.5], [2, 0.3], [3, 0.15], [4, 0.05]].forEach(([mult, gain]) => {
      const o  = ctx.createOscillator();
      const gn = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = freq * mult;
      gn.gain.value = gain;
      o.connect(gn);
      gn.connect(master);
      o.start(now);
      o.stop(now + 0.9);
    });

  } catch(e) {
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t = ctx.currentTime + 0.1;
      o.frequency.value = 440 * Math.pow(2, (ID_SEMI[note.id] - 2 - 21) / 12);
      g.gain.value = 0.7;
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.8);
    } catch(e2) {}
  }
}

function playNote(note) {
  if (_muted) return;
  getAudio(); // create context + call resume() synchronously in the gesture
  _doPlayNote(note);
}
