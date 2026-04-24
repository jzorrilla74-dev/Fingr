import { NOTES } from './notes.js';
import { SCALES, SCALE_NAMES, NOTE_SEMI } from './scales.js';
import { playNote } from './audio.js';
import { drawStaff } from './staff.js';
import { renderFingerPanel, updatePersistPanel, highlightPersistCard } from './ui.js';

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
};

// ============================================================
// RENDER HELPERS
// ============================================================
function redrawStaff() {
  drawStaff(appState.containerH, appState, handleNoteClick);
}

function refreshFingerPanel(note) {
  renderFingerPanel(note, appState, {
    playNote,
    playSequence,
    stopSequence,
  });
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

// Update the seq play button in-place (called during/after sequence)
function updatePlayBtn() {
  const btn = document.getElementById('seq-play-btn');
  if (!btn) return;
  btn.innerHTML = appState.isPlaying
    ? '<span>■</span> <span>Stop</span>'
    : '<span>▶</span> <span>Play Sequence</span>';
  btn.className = 'play-btn' + (appState.isPlaying ? ' stop' : '');
  // Re-bind click (innerHTML wipes listeners)
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
  const showRoot = appState.currentType !== 'chromatic';
  document.getElementById('root-select').style.display = showRoot ? 'inline-block' : 'none';
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
    document.getElementById('scale-info').textContent = `${rd} ${SCALE_NAMES[currentType]}`;
  }

  refreshFingerPanel(null);
  redrawStaff();
}

// ============================================================
// SEQUENCE PLAYBACK
// ============================================================
const SEQ_NOTE_DUR = 0.65;
const SEQ_GAP      = 0.1;

function playSequence() {
  if (appState.persistSet.size === 0) return;
  stopSequence();
  appState.isPlaying = true;
  updatePlayBtn();

  const sorted = NOTES.filter(n => appState.persistSet.has(n.id));

  sorted.forEach((note, idx) => {
    const delay = idx * (SEQ_NOTE_DUR + SEQ_GAP) * 1000;

    appState.seqTimeouts.push(setTimeout(() => playNote(note), delay));

    appState.seqTimeouts.push(setTimeout(() => {
      appState.playingId = note.id;
      redrawStaff();
      highlightPersistCard(note.id);
    }, delay));

    if (idx === sorted.length - 1) {
      appState.seqTimeouts.push(setTimeout(stopSequence, delay + SEQ_NOTE_DUR * 1000));
    }
  });
}

function stopSequence() {
  appState.seqTimeouts.forEach(t => clearTimeout(t));
  appState.seqTimeouts = [];
  appState.isPlaying  = false;
  appState.playingId  = null;
  updatePlayBtn();
  redrawStaff();
  refreshPersistPanel();
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

  // Fallback: draw immediately if ResizeObserver is slow to fire
  requestAnimationFrame(() => {
    const h = scrollEl.clientHeight;
    if (h > 0 && h !== appState.containerH) {
      appState.containerH = h;
      redrawStaff();
    }
  });
}

// ============================================================
// CLEAR ALL (persistent mode)
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
function init() {
  // Mode toggle
  document.getElementById('btn-transient').addEventListener('click', () => setMode('transient'));
  document.getElementById('btn-persistent').addEventListener('click', () => setMode('persistent'));

  // Scale selectors
  document.getElementById('type-select').addEventListener('change', onTypeChange);
  document.getElementById('root-select').addEventListener('change', onRootChange);

  // Theme
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);

  // Clear all
  document.getElementById('persist-clear').addEventListener('click', clearAllPersist);

  // Initial draw via ResizeObserver (also handles resize events)
  initStaffResize();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

init();
