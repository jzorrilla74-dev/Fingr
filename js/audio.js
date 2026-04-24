let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playNote(note) {
  const ctx = getAudio();
  const concertSemi = ID_SEMI[note.id] - 2;
  const freq = 440 * Math.pow(2, (concertSemi - 21) / 12);
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(0.22, now + 0.04);
  master.gain.linearRampToValueAtTime(0.18, now + 0.5);
  master.gain.linearRampToValueAtTime(0, now + 0.85);
  master.connect(ctx.destination);
  [[1, 0.5], [2, 0.3], [3, 0.15], [4, 0.05]].forEach(([m, g]) => {
    const o = ctx.createOscillator();
    const gn = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = freq * m;
    gn.gain.value = g;
    o.connect(gn);
    gn.connect(master);
    o.start(now);
    o.stop(now + 0.9);
  });
}
