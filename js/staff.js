function _se(tag, attrs, txt) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  if (txt !== undefined) el.textContent = txt;
  return el;
}

function _getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Compute staff metrics from container height.
// Natural size is LG=22 at H=325 (original design). On large screens the SVG
// stays at natural size (CSS centres it vertically). On small screens it scales
// down so the staff fits within the available space.
function _staffMetrics(containerH) {
  // Scale down only — never exceed the natural LG=22
  const LG     = Math.min(22, Math.max(12, containerH * (22 / 325)));
  // SVG height derived from LG (not from container) using original proportions
  const H      = Math.round(LG * (325 / 22));
  const SB     = LG * (212 / 22);
  const NRX    = LG * (11  / 22);
  const NRY    = LG * (7.5 / 22);
  const PER    = LG * (29  / 22);
  const CLEF_W = LG * (100 / 22);
  return { LG, H, SB, NRX, NRY, PER, CLEF_W };
}

function staffPY(pos, LG, SB) {
  return SB - pos * (LG / 2);
}

function drawStaff(containerH, appState, onNoteClick) {
  const svg = document.getElementById('staff-svg');
  svg.innerHTML = '';

  const { LG, H, SB, NRX, NRY, PER, CLEF_W } = _staffMetrics(containerH);
  const { mode, selectedId, persistSet, activeSet, degreeMap, currentRoot, playingId } = appState;

  const W = CLEF_W + NOTES.length * PER + 30;

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.removeAttribute('preserveAspectRatio');

  const ink    = _getCSSVar('--ink');
  const ink3   = _getCSSVar('--ink3');
  const teal   = _getCSSVar('--teal');
  const copper = _getCSSVar('--copper');

  // Staff lines (treble clef: E4=pos0, G4=pos2, B4=pos4, D5=pos6, F5=pos8)
  for (let i = 0; i <= 4; i++) {
    const y = staffPY(i * 2, LG, SB);
    svg.appendChild(_se('line', {
      x1: 28, x2: W - 8, y1: y, y2: y,
      stroke: ink, 'stroke-width': 1.4
    }));
  }

  // Treble clef — Bravura SMuFL U+E050, anchored so origin sits on G line
  svg.appendChild(_se('text', {
    x: 16, y: staffPY(3, LG, SB),
    'font-family': 'Bravura, serif',
    'font-size': LG * 4,
    fill: ink,
    'dominant-baseline': 'auto',
    'text-anchor': 'start'
  }, ''));

  const x0 = CLEF_W + 6;

  NOTES.forEach((note, idx) => {
    const isActive  = !activeSet || activeSet.has(note.id);
    const isSel     = mode === 'transient' ? note.id === selectedId : persistSet.has(note.id);
    const isRoot    = activeSet && NOTE_SEMI[note.name] === NOTE_SEMI[currentRoot];
    const isPlaying = playingId === note.id;
    const x         = x0 + idx * PER + PER / 2;
    const y         = staffPY(note.pos, LG, SB);
    const op        = isActive ? 1 : 0.2;

    const col = isPlaying             ? teal
              : isSel                 ? teal
              : (isRoot && activeSet) ? copper
              : isActive              ? ink
              :                         ink3;

    // Ledger lines below staff
    if (note.pos < 0) {
      for (let lp = -2; lp >= note.pos; lp -= 2) {
        const ly = staffPY(lp, LG, SB);
        svg.appendChild(_se('line', { x1: x-14, x2: x+14, y1: ly, y2: ly, stroke: ink, 'stroke-width': 1.2, opacity: op }));
      }
    }

    // Ledger lines above staff
    if (note.pos > 8) {
      for (let lp = 10; lp <= note.pos; lp += 2) {
        const ly = staffPY(lp, LG, SB);
        svg.appendChild(_se('line', { x1: x-14, x2: x+14, y1: ly, y2: ly, stroke: ink, 'stroke-width': 1.2, opacity: op }));
      }
    }

    // Glow ring for persistent-selected or currently playing
    if (isPlaying) {
      // Outer soft halo
      svg.appendChild(_se('ellipse', {
        cx: x, cy: y, rx: NRX + 14, ry: NRY + 14,
        fill: teal, opacity: 0.22
      }));
      // Inner ring
      svg.appendChild(_se('ellipse', {
        cx: x, cy: y, rx: NRX + 7, ry: NRY + 7,
        fill: teal, stroke: teal, 'stroke-width': 2.5,
        opacity: 0.55
      }));
    } else if (isSel && mode === 'persistent') {
      svg.appendChild(_se('ellipse', {
        cx: x, cy: y, rx: NRX + 5, ry: NRY + 5,
        fill: 'none',
        stroke: teal, 'stroke-width': 1.5,
        opacity: 0.5
      }));
    }

    // Sharp accidental (same staff position as natural, drawn to left)
    if (note.acc) {
      const accSz = LG * 0.68;
      svg.appendChild(_se('text', {
        x: x - NRX - 3, y: y + accSz * 0.35,
        'font-size': accSz, 'font-family': 'serif',
        fill: col, 'text-anchor': 'middle', opacity: op
      }, '♯'));
    }

    // Note head
    svg.appendChild(_se('ellipse', {
      cx: x, cy: y, rx: NRX, ry: NRY,
      fill: col, opacity: op,
      cursor: isActive ? 'pointer' : 'default',
      'data-id': note.id
    }));

    // Transparent hit area (generous for touch)
    if (isActive) {
      svg.appendChild(_se('rect', {
        x: x - NRX - 6, y: y - NRY - 8,
        width: (NRX + 6) * 2, height: (NRY + 8) * 2,
        fill: 'transparent', cursor: 'pointer', 'data-id': note.id
      }));
    }

    // Scale degree (Roman numeral above staff)
    if (activeSet && activeSet.has(note.id) && degreeMap[note.id] !== undefined) {
      svg.appendChild(_se('text', {
        x, y: staffPY(14, LG, SB),
        'font-size': LG * 0.5,
        'font-family': 'Jost, sans-serif',
        fill: isRoot ? copper : teal,
        'text-anchor': 'middle', 'font-weight': '700'
      }, ROMANS[degreeMap[note.id]]));
    }

    // Note name label below staff
    svg.appendChild(_se('text', {
      x, y: staffPY(-8, LG, SB),
      'font-size': LG * 0.41,
      'font-family': 'Jost, sans-serif',
      fill: isActive ? (isRoot && activeSet ? copper : ink3) : ink3,
      'text-anchor': 'middle',
      opacity: isActive ? 1 : 0.3
    }, note.disp + note.oct));
  });

  svg.onclick = e => {
    const id = e.target.getAttribute('data-id');
    if (!id) return;
    if (!activeSet || activeSet.has(id)) onNoteClick(id);
  };

  svg.ontouchend = e => {
    e.preventDefault();
    const t  = e.changedTouches[0];
    // elementFromPoint can return SVG root on iOS — walk up to find data-id
    let el = document.elementFromPoint(t.clientX, t.clientY);
    while (el && el !== svg && !el.getAttribute('data-id')) el = el.parentElement;
    const id = el && el.getAttribute('data-id');
    if (id && (!activeSet || activeSet.has(id))) onNoteClick(id);
  };
}
