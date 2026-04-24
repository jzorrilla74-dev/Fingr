// ============================================================
// STATE
// ============================================================
const appState = {
  mode:        'transient',
  selectedId:  null,
  persistSet:  new Set(),
  activeSet:   null,
  degreeMap:   {},
  currentType: 'chromatic',
  currentRoot: 'C',
  isDark:      false,
  isPlaying:   false,
  seqTimeouts: [],
  playingId:   null,
  containerH:  325,
  // Beat-synced sequence state
  _seqNotes:   [],
  _seqIdx:     -1,
  _seqSynced:  false,
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
      if (appState.selectedId === id) {
        appState.selectedId = null;
        refreshFingerPanel(null);
      }
      refreshPersistPanel();
      redrawStaff();
    },
  });
}

function refreshMetronome() {
  renderMetronome(METRO, {
    onToggle()        { _metroToggleHandler(); },
    onBpmChange(bpm)  { metroSetBpm(bpm); },
    onTap()           { return metroTap(); },
    onTimeSig(sig)    { _metroTimeSigHandler(sig); },
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
      if (appState.selectedId === id) {
        appState.selectedId = null;
        refreshFingerPanel(null);
      }
    } else {
      appState.persistSet.add(id);
      appState.selectedId = id;
      playNote(note);
      refreshFingerPanel(note);
    }
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
}

function onRootChange() {
  appState.currentRoot = document.getElementById('root-select').value;
  updateScale();
}

function updateScale() {
  appState.degreeMap = {};
  appState.persistSet.clear();
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
// Two modes: free-tempo (setTimeout) or beat-synced (onBeat callback)
// ============================================================
const SEQ_NOTE_DUR = 0.65;
const SEQ_GAP      = 0.1;

function playSequence() {
  if (appState.persistSet.size === 0) return;
  stopSequence();

  appState._seqNotes = NOTES.filter(n => appState.persistSet.has(n.id));
  appState.isPlaying = true;
  updatePlayBtn();

  if (METRO.isOn) {
    // Beat-synced: onBeat callback drives note advancement
    appState._seqSynced = true;
    appState._seqIdx    = -1;
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
  appState.seqTimeouts = [];
  appState.isPlaying   = false;
  appState.playingId   = null;
  appState._seqSynced  = false;
  appState._seqIdx     = -1;
  appState._seqNotes   = [];
  updatePlayBtn();
  redrawStaff();
  refreshPersistPanel();
}

// Called on each beat by the metronome engine
function _onBeat(beat, bpb) {
  // 1. Update beat dot display
  updateMetroBeat(beat, bpb);

  // 2. Advance beat-synced sequence
  if (appState.isPlaying && appState._seqSynced) {
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
}

// ============================================================
// METRONOME CONTROL HANDLERS
// ============================================================
function _metroToggleHandler() {
  metroToggle();
  updateMetroToggle(METRO.isOn);
  // If sequence is playing free-tempo and metronome just turned on, keep as-is.
  // If sequence is beat-synced and metronome turns off, stop sequence.
  if (!METRO.isOn && appState._seqSynced) {
    stopSequence();
  }
}

function _metroTimeSigHandler(sig) {
  metroSetTimeSig(sig);
  // Re-render just the metronome section to update dots count and active button
  refreshMetronome();
  // If metronome is running, the beat count already resets inside metroSetTimeSig
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
  appState.selectedId = null;
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

// Service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
