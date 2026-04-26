let audioCtx       = null;
let masterGainNode = null;
let _volume        = 0.75;
let _muted         = false;

// ============================================================
// iOS AUDIO UNLOCK
//
// 1. capture:true touchstart/mousedown fires before any button handler
//    so AudioContext + resume() happen synchronously in the gesture.
// 2. Silent 1-sample BufferSource — the iOS gate that works even when
//    resume() alone is insufficient (iOS < 14).
// 3. playNote() waits for resume() to resolve before scheduling — on iOS
//    currentTime is frozen while suspended, so notes scheduled against it
//    land in the past and are silently dropped. Scheduling inside .then()
//    guarantees the clock is live.
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
// PLAY NOTE
// Multi-harmonic sawtooth synthesis — simpler and more compatible
// across iOS versions than createPeriodicWave.
// ============================================================
function _doPlayNote(note) {
  const ctx = audioCtx;
  if (!ctx) return;

  try {
    const freq = 440 * Math.pow(2, (ID_SEMI[note.id] - 2 - 21) / 12);
    const now  = ctx.currentTime + 0.02;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0,    now);
    master.gain.linearRampToValueAtTime(0.22, now + 0.04);
    master.gain.linearRampToValueAtTime(0.18, now + 0.50);
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
      const t = ctx.currentTime;
      o.frequency.value = 440 * Math.pow(2, (ID_SEMI[note.id] - 2 - 21) / 12);
      g.gain.setValueAtTime(0.4, t);
      g.gain.linearRampToValueAtTime(0, t + 0.7);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.8);
    } catch(e2) {}
  }
}

function playNote(note) {
  if (_muted) return;
  const ctx = getAudio();
  if (ctx.state === 'running') {
    _doPlayNote(note);
  } else {
    ctx.resume()
      .then(() => _doPlayNote(note))
      .catch(() => {});
  }
}
