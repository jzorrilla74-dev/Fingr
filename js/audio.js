let audioCtx      = null;
let masterGainNode = null;
let _volume        = 0.75;
let _muted         = false;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

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

function playNote(note) {
  if (_muted) return;
  const ctx = getAudio();
  const concertSemi = ID_SEMI[note.id] - 2;
  const freq = 440 * Math.pow(2, (concertSemi - 21) / 12);
  const now  = ctx.currentTime;

  const noteGain = ctx.createGain();
  noteGain.gain.setValueAtTime(0, now);
  noteGain.gain.linearRampToValueAtTime(0.9, now + 0.015);
  noteGain.gain.exponentialRampToValueAtTime(0.7, now + 0.08);
  noteGain.gain.exponentialRampToValueAtTime(0.5, now + 0.5);
  noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq * 6;
  filter.Q.value = 0.5;

  noteGain.connect(filter);
  filter.connect(getMasterGain());

  // Trumpet-weighted sine harmonics (replaces sawtooth)
  [[1, 0.6], [2, 0.5], [3, 0.4], [4, 0.25], [5, 0.15], [6, 0.08], [7, 0.04]].forEach(([m, g]) => {
    const osc = ctx.createOscillator();
    const gn  = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * m;
    gn.gain.value = g;
    osc.connect(gn);
    gn.connect(noteGain);
    osc.start(now);
    osc.stop(now + 0.9);
  });
}
