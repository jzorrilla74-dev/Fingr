// ============================================================
// METRONOME ENGINE
// Web Audio look-ahead scheduler — accurate, drift-free.
// Visual callbacks fire via setTimeout aligned to audio clock.
// ============================================================

const METRO = {
  bpm:      60,
  timeSig:  '4/4',
  isOn:     false,
  beat:     0,          // current beat index (0-based)
  _nextTime: 0,         // next beat time in AudioContext seconds
  _timerID:  null,
  _tapTimes: [],        // tap tempo history (ms timestamps)
  onBeat:   null,       // callback(beatIndex, beatsPerBar) — set by app.js
};

const BEATS_PER_BAR = { '4/4': 4, '3/4': 3, '6/8': 6 };
const LOOKAHEAD     = 0.12;  // seconds of audio to schedule ahead
const TICK_INTERVAL = 25;    // ms between scheduler calls

function metroStart() {
  if (METRO.isOn) return;
  METRO.isOn = true;
  METRO.beat = 0;
  const ctx = getAudio();
  const doStart = () => {
    METRO._nextTime = ctx.currentTime + 0.1;
    _metroTick();
  };
  if (ctx.state !== 'running') {
    ctx.resume().then(doStart);
  } else {
    doStart();
  }
}

function metroStop() {
  METRO.isOn = false;
  clearTimeout(METRO._timerID);
  METRO._timerID = null;
}

function metroToggle() {
  if (METRO.isOn) metroStop(); else metroStart();
}

function metroSetBpm(bpm) {
  METRO.bpm = Math.min(200, Math.max(40, Math.round(bpm)));
}

function metroSetTimeSig(sig) {
  METRO.timeSig = sig;
  METRO.beat    = 0; // reset beat position on time sig change
}

// Tap tempo — averages last 4 inter-tap intervals
function metroTap() {
  const now = performance.now();

  // Reset tap history if more than 2s since last tap
  if (METRO._tapTimes.length > 0 && now - METRO._tapTimes[METRO._tapTimes.length - 1] > 2000) {
    METRO._tapTimes = [];
  }

  METRO._tapTimes.push(now);
  if (METRO._tapTimes.length > 5) METRO._tapTimes.shift();

  if (METRO._tapTimes.length >= 2) {
    let totalInterval = 0;
    for (let i = 1; i < METRO._tapTimes.length; i++) {
      totalInterval += METRO._tapTimes[i] - METRO._tapTimes[i - 1];
    }
    const avg = totalInterval / (METRO._tapTimes.length - 1);
    metroSetBpm(60000 / avg);
  }

  return METRO.bpm;
}

// ============================================================
// SCHEDULER LOOP
// ============================================================
function _metroTick() {
  const ctx = getAudio();
  const bpb = BEATS_PER_BAR[METRO.timeSig];

  while (METRO._nextTime < ctx.currentTime + LOOKAHEAD) {
    _scheduleClick(METRO._nextTime, METRO.beat, bpb);
    METRO._nextTime += 60 / METRO.bpm;
    METRO.beat = (METRO.beat + 1) % bpb;
  }

  if (METRO.isOn) {
    METRO._timerID = setTimeout(_metroTick, TICK_INTERVAL);
  }
}

// Schedule one click burst + fire visual callback at the right time
function _scheduleClick(time, beat, bpb) {
  const ctx  = getAudio();

  // Beat 1 (index 0): high square click
  // Beat 4 in 6/8 (index 3): mid accent
  // All others: low click
  let freq, vol;
  if (beat === 0) {
    freq = 1100; vol = 0.45;
  } else if (METRO.timeSig === '6/8' && beat === 3) {
    freq = 900;  vol = 0.30;
  } else {
    freq = 750;  vol = 0.22;
  }

  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.05);

  // Fire visual callback aligned to audio (slightly early to compensate for rendering lag)
  const delayMs = Math.max(0, (time - ctx.currentTime) * 1000 - 8);
  setTimeout(() => {
    if (METRO.isOn && METRO.onBeat) METRO.onBeat(beat, bpb);
  }, delayMs);
}
