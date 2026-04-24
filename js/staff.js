import { NOTES } from './notes.js';
import { NOTE_SEMI, ROMANS } from './scales.js';

function se(tag, attrs, txt) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  if (txt !== undefined) el.textContent = txt;
  return el;
}

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Compute staff metrics proportional to container height.
// At containerH=325 these equal the original fixed values (LG=22, SB=212).
function metrics(containerH) {
  const LG  = Math.max(14, containerH * 0.07);
  const SB  = containerH * 0.64;
  const NRX = LG * 0.5;
  const NRY = LG * 0.34;
  const PER = LG * 1.32;       // horizontal pixels per note slot
  const CLEF_W = LG * 4.5;    // space reserved for treble clef
  return { LG, SB, NRX, NRY, PER, CLEF_W };
}

export function pY(pos, LG, SB) {
  return SB - pos * (LG / 2);
}

export function drawStaff(containerH, appState, onNoteClick) {
  const svg = document.getElementById('staff-svg');
  svg.innerHTML = '';

  const { LG, SB, NRX, NRY, PER, CLEF_W } = metrics(containerH);
  const { mode, selectedId, persistSet, activeSet, degreeMap, currentRoot, playingId } = appState;

  const N = NOTES.length;
  const W = CLEF_W + N * PER + 30;
  const H = containerH;

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.removeAttribute('preserveAspectRatio');

  const ink    = getCSSVar('--ink');
  const ink3   = getCSSVar('--ink3');
  const teal   = getCSSVar('--teal');
  const copper = getCSSVar('--copper');

  // Staff lines (pos 0, 2, 4, 6, 8)
  for (let i = 0; i <= 4; i++) {
    const y = pY(i * 2, LG, SB);
    svg.appendChild(se('line', {
      x1: 28, x2: W - 8, y1: y, y2: y,
      stroke: ink, 'stroke-width': 1.4
    }));
  }

  // Treble clef — Bravura SMuFL U+E050, origin on G line (pos 2 = 2nd line)
  // Anchored at pos 3 so the glyph sits correctly; font-size = LG * 4
  svg.appendChild(se('text', {
    x: 16, y: pY(3, LG, SB),
    'font-family': 'Bravura, serif',
    'font-size': LG * 4,
    fill: ink,
    'dominant-baseline': 'auto',
    'text-anchor': 'start'
  }, ''));

  const x0 = CLEF_W + 6;

  NOTES.forEach((note, idx) => {
    const isActive    = !activeSet || activeSet.has(note.id);
    const isSel       = mode === 'transient' ? note.id === selectedId : persistSet.has(note.id);
    const isRoot      = activeSet && NOTE_SEMI[note.name] === NOTE_SEMI[currentRoot];
    const isPlaying   = playingId === note.id;
    const x           = x0 + idx * PER + PER / 2;
    const y           = pY(note.pos, LG, SB);
    const op          = isActive ? 1 : 0.2;

    const col = isPlaying        ? teal
              : isSel            ? teal
              : isRoot && activeSet ? copper
              : isActive         ? ink
              :                    ink3;

    // Ledger lines below staff (at even positions below 0)
    if (note.pos < 0) {
      for (let lp = -2; lp >= note.pos; lp -= 2) {
        const ly = pY(lp, LG, SB);
        svg.appendChild(se('line', {
          x1: x - 14, x2: x + 14, y1: ly, y2: ly,
          stroke: ink, 'stroke-width': 1.2, opacity: op
        }));
      }
    }

    // Ledger lines above staff (at even positions above 8)
    if (note.pos > 8) {
      for (let lp = 10; lp <= note.pos; lp += 2) {
        const ly = pY(lp, LG, SB);
        svg.appendChild(se('line', {
          x1: x - 14, x2: x + 14, y1: ly, y2: ly,
          stroke: ink, 'stroke-width': 1.2, opacity: op
        }));
      }
    }

    // Glow ring for persistent-selected or currently playing note
    if ((isSel && mode === 'persistent') || isPlaying) {
      svg.appendChild(se('ellipse', {
        cx: x, cy: y,
        rx: NRX + 5, ry: NRY + 5,
        fill: isPlaying ? teal : 'none',
        stroke: teal, 'stroke-width': 1.5,
        opacity: isPlaying ? 0.25 : 0.4
      }));
    }

    // Accidental sharp (sits at same staff position as natural, drawn to left)
    if (note.acc) {
      const accSz = LG * 0.68;
      svg.appendChild(se('text', {
        x: x - NRX - 3, y: y + accSz * 0.35,
        'font-size': accSz, 'font-family': 'serif',
        fill: col, 'text-anchor': 'middle', opacity: op
      }, '♯'));
    }

    // Note head
    svg.appendChild(se('ellipse', {
      cx: x, cy: y, rx: NRX, ry: NRY,
      fill: col, opacity: op,
      cursor: isActive ? 'pointer' : 'default',
      'data-id': note.id
    }));

    // Transparent hit area (generous for touch)
    if (isActive) {
      svg.appendChild(se('rect', {
        x: x - NRX - 6, y: y - NRY - 8,
        width: (NRX + 6) * 2, height: (NRY + 8) * 2,
        fill: 'transparent', cursor: 'pointer', 'data-id': note.id
      }));
    }

    // Scale degree label above staff (Roman numeral)
    if (activeSet && activeSet.has(note.id) && degreeMap[note.id] !== undefined) {
      svg.appendChild(se('text', {
        x, y: pY(14, LG, SB),
        'font-size': LG * 0.5,
        'font-family': 'Jost, sans-serif',
        fill: isRoot ? copper : teal,
        'text-anchor': 'middle', 'font-weight': '700'
      }, ROMANS[degreeMap[note.id]]));
    }

    // Note name label below staff
    svg.appendChild(se('text', {
      x, y: pY(-8, LG, SB),
      'font-size': LG * 0.41,
      'font-family': 'Jost, sans-serif',
      fill: isActive ? (isRoot && activeSet ? copper : ink3) : ink3,
      'text-anchor': 'middle',
      opacity: isActive ? 1 : 0.3
    }, note.disp + note.oct));
  });

  // Click handler
  svg.onclick = e => {
    const id = e.target.getAttribute('data-id');
    if (!id) return;
    if (!activeSet || activeSet.has(id)) onNoteClick(id);
  };

  // Touch handler — uses elementFromPoint for accuracy on mobile
  svg.ontouchend = e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const id = el && el.getAttribute('data-id');
    if (id && (!activeSet || activeSet.has(id))) onNoteClick(id);
  };
}
