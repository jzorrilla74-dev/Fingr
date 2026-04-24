import { NOTES } from './notes.js';
import { NOTE_SEMI, ROMANS } from './scales.js';

// ============================================================
// PERSISTENT PANEL
// ============================================================

export function updatePersistPanel(appState, callbacks) {
  const panel  = document.getElementById('persist-panel');
  const scroll = document.getElementById('persist-scroll');
  const { persistSet, activeSet, degreeMap, currentRoot, playingId } = appState;

  if (persistSet.size === 0) {
    panel.classList.remove('has-notes');
    scroll.innerHTML = '';
    return;
  }

  panel.classList.add('has-notes');
  const sorted = NOTES.filter(n => persistSet.has(n.id));

  scroll.innerHTML = '';
  sorted.forEach(note => {
    const isRoot = activeSet && NOTE_SEMI[note.name] === NOTE_SEMI[currentRoot];
    const deg    = degreeMap[note.id];
    const fng    = note.fingerings[0];

    const card = document.createElement('div');
    card.className = 'persist-card' + (isRoot ? ' is-root' : '') + (playingId === note.id ? ' playing' : '');
    card.setAttribute('data-id', note.id);

    const dotsHTML = [1, 2, 3].map(v =>
      `<div class="pc-dot${fng.v.includes(v) ? ' pressed' : ''}"></div>`
    ).join('');

    card.innerHTML = `
      <div class="pc-name">${note.disp}${note.oct}</div>
      <div class="pc-valves">${dotsHTML}</div>
      ${activeSet && deg !== undefined ? `<div class="pc-degree">${ROMANS[deg]}</div>` : ''}
    `;

    card.addEventListener('click', () => callbacks.onCardRemove(note.id));
    scroll.appendChild(card);
  });
}

export function highlightPersistCard(id) {
  document.querySelectorAll('.persist-card').forEach(c => {
    const isPlaying = c.getAttribute('data-id') === id;
    c.style.borderColor = isPlaying ? 'var(--teal)' : '';
  });
}

// ============================================================
// FINGER PANEL
// ============================================================

function fingerCard(fng, isPrimary) {
  const fm = { 1: 'index', 2: 'middle', 3: 'ring' };
  const vLabel = fng.v.length === 0 ? 'Open horn' : 'Valve ' + fng.v.join('+');
  const fText  = fng.v.length === 0 ? 'No valves pressed' : fng.v.map(v => fm[v]).join(' + ');
  return `<div class="fing-card${isPrimary ? ' primary' : ''}">
    <div class="valve-label-row">
      <div class="vlbl">1st</div><div class="vlbl">2nd</div><div class="vlbl">3rd</div>
    </div>
    <div class="valve-row">
      <div class="valve${fng.v.includes(1) ? ' pressed' : ''}">1</div>
      <div class="valve${fng.v.includes(2) ? ' pressed' : ''}">2</div>
      <div class="valve${fng.v.includes(3) ? ' pressed' : ''}">3</div>
    </div>
    <div class="fing-desc"><strong>${vLabel}</strong> · ${fng.desc}<br>${fText}</div>
  </div>`;
}

function legendHTML() {
  return `<div class="fp-legend">
    <div class="leg-item"><div class="leg-dot" style="background:var(--ink)"></div>Scale note</div>
    <div class="leg-item"><div class="leg-dot" style="background:var(--copper)"></div>Root</div>
    <div class="leg-item"><div class="leg-dot" style="background:var(--teal)"></div>Selected / playing</div>
    <div class="leg-item"><div class="leg-dot" style="background:var(--ink3);opacity:0.3"></div>Outside scale</div>
  </div>`;
}

export function renderFingerPanel(note, appState, callbacks) {
  const panel = document.getElementById('finger-panel');
  const { mode, activeSet, degreeMap, currentRoot, isPlaying, persistSet } = appState;

  // No note selected
  if (!note) {
    if (mode === 'persistent' && persistSet.size > 0) {
      panel.innerHTML = `
        <div class="fp-empty" style="margin-bottom:8px;">Tap a note to see fingering</div>
        <button class="play-btn${isPlaying ? ' stop' : ''}" id="seq-play-btn">
          <span>${isPlaying ? '■' : '▶'}</span>
          <span>${isPlaying ? 'Stop' : 'Play Sequence'}</span>
        </button>
        ${legendHTML()}`;
      _wireSeqBtn(panel, appState, callbacks);
    } else {
      panel.innerHTML = '<div class="fp-empty">Tap any note<br>on the staff</div>';
    }
    return;
  }

  const isRoot = activeSet && NOTE_SEMI[note.name] === NOTE_SEMI[currentRoot];
  const deg    = degreeMap[note.id];
  const alts   = note.fingerings.slice(1);

  let html = '';

  // Note header
  html += `<div class="fp-note-header">
    <div class="fp-note-name${isRoot ? ' is-root' : ''}">${note.disp}<span style="font-size:20px;color:var(--ink3);vertical-align:sub;">${note.oct}</span></div>
    <div class="fp-note-meta">
      ${activeSet && deg !== undefined ? `<div class="fp-degree">${ROMANS[deg]}</div>` : ''}
      <div class="fp-oct">${isRoot ? 'root · ' : ''}oct ${note.oct}</div>
    </div>
  </div>`;

  // Play button
  if (mode === 'transient') {
    html += `<button class="play-btn" id="note-play-btn">
      <span>▶</span> <span>Play</span>
    </button>`;
  } else {
    html += `<button class="play-btn${isPlaying ? ' stop' : ''}" id="seq-play-btn">
      <span>${isPlaying ? '■' : '▶'}</span>
      <span>${isPlaying ? 'Stop' : 'Play Sequence'}</span>
    </button>`;
  }

  // Primary fingering
  html += `<div class="fp-label">Primary fingering</div>`;
  html += fingerCard(note.fingerings[0], true);

  // Alternates
  if (alts.length > 0) {
    html += `<div class="alts-container" id="alts-container" style="display:none;">`;
    alts.forEach(a => { html += fingerCard(a, false); });
    html += `</div>
    <button class="alts-toggle" id="alts-toggle">
      <span id="alts-arrow">▸</span>
      <span id="alts-label">Show alternates (${alts.length})</span>
    </button>`;
  }

  html += legendHTML();
  panel.innerHTML = html;

  // Wire up play button
  if (mode === 'transient') {
    const playBtn = document.getElementById('note-play-btn');
    if (playBtn) playBtn.addEventListener('click', () => callbacks.playNote(note));
  } else {
    _wireSeqBtn(panel, appState, callbacks);
  }

  // Wire up alternates toggle
  const altsToggleBtn = document.getElementById('alts-toggle');
  if (altsToggleBtn) {
    altsToggleBtn.addEventListener('click', () => {
      const container = document.getElementById('alts-container');
      const arrow     = document.getElementById('alts-arrow');
      const label     = document.getElementById('alts-label');
      if (!container) return;
      const showing = container.style.display !== 'none';
      container.style.display = showing ? 'none' : 'flex';
      arrow.textContent = showing ? '▸' : '▾';
      label.textContent = showing ? `Show alternates (${alts.length})` : 'Hide alternates';
    });
  }
}

function _wireSeqBtn(panel, appState, callbacks) {
  const btn = document.getElementById('seq-play-btn');
  if (!btn) return;
  btn.onclick = () => {
    if (appState.isPlaying) callbacks.stopSequence();
    else callbacks.playSequence();
  };
}
