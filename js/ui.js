// ============================================================
// PERSISTENT PANEL
// ============================================================

function updatePersistPanel(appState, callbacks) {
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
    card.className = 'persist-card'
      + (isRoot ? ' is-root' : '')
      + (playingId === note.id ? ' playing' : '');
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

function highlightPersistCard(id) {
  document.querySelectorAll('.persist-card').forEach(c => {
    c.style.borderColor = c.getAttribute('data-id') === id ? 'var(--teal)' : '';
  });
}

// ============================================================
// FINGER PANEL
// renderFingerPanel targets #fp-content, leaving #metro-section untouched.
// ============================================================

function _fingerCard(fng, isPrimary) {
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

function _legendHTML() {
  return `<div class="fp-legend">
    <div class="leg-item"><div class="leg-dot" style="background:var(--ink)"></div>Scale note</div>
    <div class="leg-item"><div class="leg-dot" style="background:var(--copper)"></div>Root</div>
    <div class="leg-item"><div class="leg-dot" style="background:var(--teal)"></div>Selected / playing</div>
    <div class="leg-item"><div class="leg-dot" style="background:var(--ink3);opacity:0.3"></div>Outside scale</div>
  </div>`;
}

function renderFingerPanel(note, appState, callbacks) {
  // Target only fp-content — the metro-section below it is managed separately
  const content = document.getElementById('fp-content');
  const { mode, activeSet, degreeMap, currentRoot, isPlaying, persistSet } = appState;

  if (!note) {
    if (mode === 'persistent' && persistSet.size > 0) {
      content.innerHTML = `
        <div class="fp-empty" style="margin-bottom:8px;">Tap a note to see fingering</div>
        <button class="play-btn${isPlaying ? ' stop' : ''}" id="seq-play-btn">
          <span>${isPlaying ? '■' : '▶'}</span>
          <span>${isPlaying ? 'Stop' : 'Play Sequence'}</span>
        </button>
        ${_legendHTML()}`;
      _wireSeqBtn(appState, callbacks);
    } else {
      content.innerHTML = '<div class="fp-empty">Tap any note<br>on the staff</div>';
    }
    return;
  }

  const isRoot = activeSet && NOTE_SEMI[note.name] === NOTE_SEMI[currentRoot];
  const deg    = degreeMap[note.id];
  const alts   = note.fingerings.slice(1);

  let html = `<div class="fp-note-header">
    <div class="fp-note-name${isRoot ? ' is-root' : ''}">${note.disp}<span style="font-size:20px;color:var(--ink3);vertical-align:sub;">${note.oct}</span></div>
    <div class="fp-note-meta">
      ${activeSet && deg !== undefined ? `<div class="fp-degree">${ROMANS[deg]}</div>` : ''}
      <div class="fp-oct">${isRoot ? 'root · ' : ''}oct ${note.oct}</div>
    </div>
  </div>`;

  if (mode === 'transient') {
    html += `<button class="play-btn" id="note-play-btn"><span>▶</span> <span>Play</span></button>`;
  } else {
    html += `<button class="play-btn${isPlaying ? ' stop' : ''}" id="seq-play-btn">
      <span>${isPlaying ? '■' : '▶'}</span>
      <span>${isPlaying ? 'Stop' : 'Play Sequence'}</span>
    </button>`;
  }

  html += `<div class="fp-label">Primary fingering</div>`;
  html += _fingerCard(note.fingerings[0], true);

  if (alts.length > 0) {
    html += `<div class="alts-container" id="alts-container" style="display:none;">`;
    alts.forEach(a => { html += _fingerCard(a, false); });
    html += `</div>
    <button class="alts-toggle" id="alts-toggle">
      <span id="alts-arrow">▸</span>
      <span id="alts-label">Show alternates (${alts.length})</span>
    </button>`;
  }

  html += _legendHTML();
  content.innerHTML = html;

  if (mode === 'transient') {
    const btn = document.getElementById('note-play-btn');
    if (btn) btn.onclick = () => playNote(note);
  } else {
    _wireSeqBtn(appState, callbacks);
  }

  const altsBtn = document.getElementById('alts-toggle');
  if (altsBtn) {
    altsBtn.onclick = () => {
      const container = document.getElementById('alts-container');
      const arrow     = document.getElementById('alts-arrow');
      const label     = document.getElementById('alts-label');
      if (!container) return;
      const showing = container.style.display !== 'none';
      container.style.display = showing ? 'none' : 'flex';
      arrow.textContent = showing ? '▸' : '▾';
      label.textContent = showing ? `Show alternates (${alts.length})` : 'Hide alternates';
    };
  }
}

function _wireSeqBtn(appState, callbacks) {
  const btn = document.getElementById('seq-play-btn');
  if (!btn) return;
  btn.onclick = () => appState.isPlaying ? callbacks.stopSequence() : callbacks.playSequence();
}

// ============================================================
// METRONOME PANEL
// Rendered into #metro-section; survives renderFingerPanel() calls.
// ============================================================

function renderMetronome(metroState, callbacks) {
  const section = document.getElementById('metro-section');
  const { bpm, timeSig, isOn } = metroState;
  const bpb = { '4/4': 4, '3/4': 3, '6/8': 6 }[timeSig] || 4;

  const dotsHTML = Array.from({ length: bpb }, (_, i) =>
    `<div class="metro-dot${i === 0 ? ' beat1' : ''}" data-beat="${i}"></div>`
  ).join('');

  section.innerHTML = `
    <div class="metro-section">
      <div class="fp-label">Metronome</div>

      <div class="metro-header">
        <button class="metro-toggle${isOn ? ' active' : ''}" id="metro-toggle-btn">
          ${isOn ? '◉ ON' : '○ OFF'}
        </button>
        <div class="metro-bpm-wrap">
          <span class="metro-bpm-num" id="metro-bpm-num">${bpm}</span>
          <span class="metro-bpm-unit">BPM</span>
        </div>
        <button class="metro-tap" id="metro-tap-btn">TAP</button>
      </div>

      <div class="metro-slider-wrap">
        <span class="metro-slider-label">40</span>
        <input type="range" class="metro-slider" id="metro-slider"
               min="40" max="200" value="${bpm}">
        <span class="metro-slider-label right">200</span>
      </div>

      <div class="metro-sigs">
        ${['4/4', '3/4', '6/8'].map(sig =>
          `<button class="metro-sig-btn${sig === timeSig ? ' active' : ''}" data-sig="${sig}">${sig}</button>`
        ).join('')}
      </div>

      <div class="metro-dots" id="metro-dots">${dotsHTML}</div>
    </div>`;

  // Wire controls
  document.getElementById('metro-toggle-btn').onclick = callbacks.onToggle;

  const slider = document.getElementById('metro-slider');
  slider.oninput = () => {
    const v = parseInt(slider.value, 10);
    document.getElementById('metro-bpm-num').textContent = v;
    callbacks.onBpmChange(v);
  };

  document.getElementById('metro-tap-btn').onclick = () => {
    const newBpm = callbacks.onTap();
    slider.value = newBpm;
    document.getElementById('metro-bpm-num').textContent = newBpm;
  };

  section.querySelectorAll('.metro-sig-btn').forEach(btn => {
    btn.onclick = () => callbacks.onTimeSig(btn.getAttribute('data-sig'));
  });
}

// Update just the beat dots — called on every beat (no full re-render)
function updateMetroBeat(beat, bpb) {
  const dots = document.querySelectorAll('.metro-dot');
  if (!dots.length) return;
  dots.forEach((dot, i) => dot.classList.toggle('active', i === beat));
}

// Update toggle button state without full re-render
function updateMetroToggle(isOn) {
  const btn = document.getElementById('metro-toggle-btn');
  if (!btn) return;
  btn.className = 'metro-toggle' + (isOn ? ' active' : '');
  btn.textContent = isOn ? '◉ ON' : '○ OFF';
}
