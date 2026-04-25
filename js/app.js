// ============================================================
// STATE
// ============================================================
const appState = {
  mode:              'transient',
  selectedId:        null,
  persistSet:        new Set(),
  persistOrder:      [],        // ordered note ids for persistent mode
  activeSet:         null,
  degreeMap:         {},
  currentType:       'chromatic',
  currentRoot:       'C',
  isDark:            false,
  isPlaying:         false,
  seqTimeouts:       [],
  playingId:         null,
  containerH:        325,
  noteDuration:      1,         // beats per note in beat-synced sequence (1, 2, 4)
  countIn:           false,     // one-bar count-in before sequence
  _seqNotes:         [],
  _seqIdx:           -1,
  _seqSynced:        false,
  _seqBeatCount:     0,
  _isCountingIn:     false,
  _countInBeat:      0,
  _metroStartedForSeq: false,   // true when we auto-started metronome for a sequence
};

// ============================================================
// RENDER HELPERS
// ============================================================
function redrawStaff() {
  drawStaff(appState.containerH, appState, handleNoteClick);
}

function refreshFingerPanel(note) {
  renderFingerPanel(note, appState, { playNote, playSequence, stopSequence });
}

function refreshPersistPanel() {
  updatePersistPanel(appState, {
    onCardRemove(id) {
      appState.persistSet.delete(id);
      appState.persistOrder = appState.persistOrder.filter(i => i !== id);
      if (appState.selectedId === id) {
        appState.selectedId = null;
        refreshFingerPanel(null);
      }
      saveSequence();
      refreshPersistPanel();
      redrawStaff();
    },
    onReorder(fromId, toId) {
      const fi = appState.persistOrder.indexOf(fromId);
      const ti = appState.persistOrder.indexOf(toId);
      if (fi < 0 || ti < 0 || fi === ti) return;
      appState.persistOrder.splice(fi, 1);
      appState.persistOrder.splice(ti, 0, fromId);
      saveSequence();
      refreshPersistPanel();
    },
  });
}

function refreshMetronome() {
  renderMetronome(METRO, {
    onToggle()        { _metroToggleHandler(); },
    onBpmChange(bpm)  { metroSetBpm(bpm); },
    onTap()           { return metroTap(); },
    onTimeSig(sig)    { _metroTimeSigHandler(sig); },
    onDuration(d)     { appState.noteDuration = d; refreshMetronome(); },
    onCountIn()       { appState.countIn = !appState.countIn; refreshMetronome(); },
    onVolume(v)       { setVolume(v); },
    onMute()          { setMuted(!getMuted()); refreshMetronome(); },
  }, {
    noteDuration: appState.noteDuration,
    countIn:      appState.countIn,
    volume:       getVolume(),
    muted:        getMuted(),
  });
}

// Update seq play button text/colour without re-rendering the whole panel
function updatePlayBtn() {
  const btn = document.getElementById('seq-play-btn');
  if (!btn) return;
  btn.innerHTML = appState.isPlaying
    ? '<span>■</span> <span>Stop</span>'
    : '<span>▶</span> <span>Play Sequence</span>';
  btn.className = 'play-btn' + (appState.isPlaying ? ' stop' : '');
  btn.onclick = () => appState.isPlaying ? stopSequence() : playSequence();
}

// ============================================================
// COUNT-IN DISPLAY
// ============================================================
function showCountDisplay(n) {
  const el = document.getElementById('count-display');
  if (!el) return;
  el.textContent = String(n);
  el.classList.add('visible');
}

function hideCountDisplay() {
  const el = document.getElementById('count-display');
  if (!el) return;
  el.classList.remove('visible');
}

// ============================================================
// SEQUENCE SAVE / RESTORE (localStorage)
// ============================================================
function saveSequence() {
  try {
    localStorage.setItem('fingr-seq', JSON.stringify({
      order: appState.persistOrder,
      type:  appState.currentType,
      root:  appState.currentRoot,
    }));
  } catch (e) {}
}

function loadSequence() {
  try {
    const raw = localStorage.getItem('fingr-seq');
    if (!raw) return;
    const { order, type, root } = JSON.parse(raw);
    if (!Array.isArray(order) || order.length === 0) return;

    if (type) {
      appState.currentType = type;
      document.getElementById('type-select').value = type;
    }
    if (root) {
      appState.currentRoot = root;
      document.getElementById('root-select').value = root;
    }
    document.getElementById('root-select').style.display =
      appState.currentType === 'chromatic' ? 'none' : 'inline-block';

    // updateScale clears persistOrder — restore it after
    updateScale();

    order.slice(0, 16).forEach(id => {
      if (NOTES.find(n => n.id === id) && !appState.persistSet.has(id)) {
        appState.persistSet.add(id);
        appState.persistOrder.push(id);
      }
    });

    if (appState.persistOrder.length > 0) {
      appState.mode = 'persistent';
      document.getElementById('btn-persistent').classList.add('active');
      document.getElementById('btn-transient').classList.remove('active');
      saveSequence(); // re-save with restored order (updateScale saved empty)
      refreshPersistPanel();
      refreshFingerPanel(null);
      redrawStaff();
    }
  } catch (e) {}
}

// ============================================================
// NOTE CLICK
// ============================================================
function handleNoteClick(id) {
  const note = NOTES.find(n => n.id === id);
  if (!note) return;

  if (appState.mode === 'transient') {
    appState.selectedId = id;
    playNote(note);
    refreshFingerPanel(note);
  } else {
    if (appState.persistSet.has(id)) {
      appState.persistSet.delete(id);
      appState.persistOrder = appState.persistOrder.filter(i => i !== id);
      if (appState.selectedId === id) {
        appState.selectedId = null;
        refreshFingerPanel(null);
      }
    } else {
      if (appState.persistOrder.length >= 16) return;
      appState.persistSet.add(id);
      appState.persistOrder.push(id);
      appState.selectedId = id;
      playNote(note);
      refreshFingerPanel(note);
    }
    saveSequence();
    refreshPersistPanel();
  }
  redrawStaff();
}

// ============================================================
// MODE
// ============================================================
function setMode(m) {
  stopSequence();
  appState.mode = m;
  document.getElementById('btn-transient').classList.toggle('active', m === 'transient');
  document.getElementById('btn-persistent').classList.toggle('active', m === 'persistent');
  if (m === 'transient') {
    appState.persistSet.clear();
    appState.persistOrder = [];
    saveSequence();
    refreshPersistPanel();
  }
  appState.selectedId = null;
  refreshFingerPanel(null);
  redrawStaff();
}

// ============================================================
// SCALE
// ============================================================
function onTypeChange() {
  appState.currentType = document.getElementById('type-select').value;
  document.getElementById('root-select').style.display =
    appState.currentType === 'chromatic' ? 'none' : 'inline-block';
  updateScale();
  saveSequence();
}

function onRootChange() {
  appState.currentRoot = document.getElementById('root-select').value;
  updateScale();
  saveSequence();
}

function updateScale() {
  appState.degreeMap = {};
  appState.persistSet.clear();
  appState.persistOrder = [];
  stopSequence();
  refreshPersistPanel();
  appState.selectedId = null;

  if (appState.currentType === 'chromatic') {
    appState.activeSet = null;
    document.getElementById('scale-info').textContent = 'F♯3 — C6';
  } else {
    const { currentType, currentRoot } = appState;
    const rootSemi  = NOTE_SEMI[currentRoot];
    const intervals = SCALES[currentType];
    const semiSet   = new Set(intervals.map(i => (rootSemi + i) % 12));

    appState.activeSet = new Set();
    NOTES.forEach(n => {
      if (semiSet.has(NOTE_SEMI[n.name])) {
        appState.activeSet.add(n.id);
        const rel = ((NOTE_SEMI[n.name] - rootSemi) + 12) % 12;
        const idx = intervals.indexOf(rel);
        if (idx >= 0) appState.degreeMap[n.id] = idx;
      }
    });

    const rd = currentRoot.replace('s', '♯');
    document.getElementById('scale-info').textContent =
      `${rd} ${SCALE_NAMES[currentType]}`;
  }

  refreshFingerPanel(null);
  redrawStaff();
}

// ============================================================
// SEQUENCE PLAYBACK
// Two modes: free-tempo (setTimeout) or beat-synced (onBeat callback).
// Beat-synced activates when metronome is on OR count-in is enabled.
// ============================================================
const SEQ_NOTE_DUR = 0.65;
const SEQ_GAP      = 0.1;

function playSequence() {
  if (appState.persistOrder.length === 0) return;
  stopSequence();

  appState._seqNotes = appState.persistOrder
    .map(id => NOTES.find(n => n.id === id))
    .filter(Boolean);
  appState.isPlaying     = true;
  // Pre-charge so first note plays on the very first beat (not after noteDuration beats)
  appState._seqBeatCount = appState.noteDuration - 1;
  updatePlayBtn();

  if (METRO.isOn || appState.countIn) {
    // Beat-synced mode
    if (!METRO.isOn) {
      metroStart();
      updateMetroToggle(true);
      appState._metroStartedForSeq = true;
    }
    appState._seqSynced = true;
    appState._seqIdx    = -1;

    if (appState.countIn) {
      appState._isCountingIn = true;
      appState._countInBeat  = 0;
    }
  } else {
    // Free-tempo: schedule all notes with setTimeout
    appState._seqSynced = false;
    appState._seqNotes.forEach((note, idx) => {
      const delay = idx * (SEQ_NOTE_DUR + SEQ_GAP) * 1000;
      appState.seqTimeouts.push(setTimeout(() => playNote(note), delay));
      appState.seqTimeouts.push(setTimeout(() => {
        appState.playingId = note.id;
        redrawStaff();
        highlightPersistCard(note.id);
      }, delay));
      if (idx === appState._seqNotes.length - 1) {
        appState.seqTimeouts.push(
          setTimeout(stopSequence, delay + SEQ_NOTE_DUR * 1000)
        );
      }
    });
  }
}

function stopSequence() {
  appState.seqTimeouts.forEach(t => clearTimeout(t));
  appState.seqTimeouts     = [];
  appState.isPlaying       = false;
  appState.playingId       = null;
  appState._seqSynced      = false;
  appState._seqIdx         = -1;
  appState._seqNotes       = [];
  appState._isCountingIn   = false;
  appState._countInBeat    = 0;
  appState._seqBeatCount   = 0;

  if (appState._metroStartedForSeq) {
    metroStop();
    updateMetroToggle(false);
    appState._metroStartedForSeq = false;
  }

  hideCountDisplay();
  updatePlayBtn();
  redrawStaff();
  refreshPersistPanel();
}

// Called on each beat by the metronome engine
function _onBeat(beat, bpb) {
  updateMetroBeat(beat, bpb);

  // Count-in: show beat numbers, don't advance sequence yet
  if (appState._isCountingIn) {
    appState._countInBeat++;
    showCountDisplay(appState._countInBeat);
    if (appState._countInBeat >= bpb) {
      appState._isCountingIn = false;
      setTimeout(hideCountDisplay, 250);
    }
    return;
  }

  // Advance beat-synced sequence
  if (!appState.isPlaying || !appState._seqSynced) return;

  appState._seqBeatCount++;
  if (appState._seqBeatCount < appState.noteDuration) return;
  appState._seqBeatCount = 0;

  appState._seqIdx++;
  if (appState._seqIdx >= appState._seqNotes.length) {
    stopSequence();
    return;
  }
  const note = appState._seqNotes[appState._seqIdx];
  playNote(note);
  appState.playingId = note.id;
  redrawStaff();
  highlightPersistCard(note.id);
}

// ============================================================
// METRONOME CONTROL HANDLERS
// ============================================================
function _metroToggleHandler() {
  metroToggle();
  updateMetroToggle(METRO.isOn);
  if (!METRO.isOn) {
    if (appState._seqSynced) stopSequence();
    appState._metroStartedForSeq = false;
  }
}

function _metroTimeSigHandler(sig) {
  metroSetTimeSig(sig);
  refreshMetronome();
}

// ============================================================
// THEME
// ============================================================
function toggleTheme() {
  appState.isDark = !appState.isDark;
  document.documentElement.setAttribute('data-theme', appState.isDark ? 'dark' : '');
  document.getElementById('theme-btn').textContent = appState.isDark ? '☾' : '☀';
  const note = appState.selectedId ? NOTES.find(n => n.id === appState.selectedId) : null;
  refreshFingerPanel(note);
  refreshMetronome();
  redrawStaff();
}

// ============================================================
// STAFF SIZING — ResizeObserver
// ============================================================
function initStaffResize() {
  const scrollEl = document.querySelector('.staff-scroll');
  const ro = new ResizeObserver(entries => {
    for (const entry of entries) {
      const h = entry.contentRect.height;
      if (h > 0) {
        appState.containerH = h;
        redrawStaff();
      }
    }
  });
  ro.observe(scrollEl);
}

// ============================================================
// CLEAR ALL
// ============================================================
function clearAllPersist() {
  stopSequence();
  appState.persistSet.clear();
  appState.persistOrder = [];
  appState.selectedId = null;
  saveSequence();
  refreshPersistPanel();
  refreshFingerPanel(null);
  redrawStaff();
}

// ============================================================
// INIT
// ============================================================
document.getElementById('btn-transient').addEventListener('click', () => setMode('transient'));
document.getElementById('btn-persistent').addEventListener('click', () => setMode('persistent'));
document.getElementById('type-select').addEventListener('change', onTypeChange);
document.getElementById('root-select').addEventListener('change', onRootChange);
document.getElementById('theme-btn').addEventListener('click', toggleTheme);
document.getElementById('persist-clear').addEventListener('click', clearAllPersist);

// Connect metronome beat callback
METRO.onBeat = _onBeat;

// Render initial metronome UI
refreshMetronome();

// Staff sizing via ResizeObserver
initStaffResize();

// Restore saved sequence from localStorage
loadSequence();

// Service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
