// Vice Cover Studio — wires the editor page: the controls, the live
// preview canvas (click to pick a panel, drag to pan, scroll to zoom, drop
// a file onto a panel) and the PNG export. A `?shot=` query sets up a
// fixed scene for a screenshot instead (./shots.js).
import { drawCover, panelRects, coverScale, clampOffset, SIZES, SAMPLES } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const statusEl = document.getElementById('status');
const zoomSlider = document.getElementById('zoom');
const singleToggle = document.getElementById('single');
const titleInput = document.getElementById('title');
const taglineInput = document.getElementById('tagline');

const state = {
  layout: 'grid',
  size: 'square',
  grade: 'sunset',
  singlePhoto: false,
  title: 'Boulevard Queen',
  tagline: 'Vice City, After Dark',
  selected: 0,
  showSelection: true,
  panels: SAMPLES.map(() => ({ img: null, zoom: 1, ox: 0, oy: 0 })),
};
// Which sample each panel shows; the Sample button cycles it.
const sampleIndex = [0, 1, 2];

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function resizeCanvas() {
  const { w, h } = SIZES[state.size];
  canvas.width = w;
  canvas.height = h;
}

function redraw() {
  drawCover(canvas, state);
}

function setStatus(text) {
  statusEl.textContent = text;
}

/** Keeps the zoom slider and panel rows in step with the selection. */
function syncPanelControls() {
  zoomSlider.value = String(Math.round(state.panels[state.selected].zoom * 100));
  document.querySelectorAll('.panel-row').forEach((row, i) => {
    row.classList.toggle('is-selected', i === state.selected);
  });
}

function selectPanel(i) {
  state.selected = i;
  syncPanelControls();
  redraw();
}

function applyFraming(i, frame) {
  const panel = state.panels[i];
  Object.assign(panel, frame);
  if (panel.img) {
    const { panels } = panelRects(state.layout, canvas.width, canvas.height);
    const rect = panels[Math.min(i, panels.length - 1)];
    const clamped = clampOffset(panel.img, rect, panel.zoom, panel.ox, panel.oy);
    panel.ox = clamped.ox;
    panel.oy = clamped.oy;
  }
}

async function setPanelSample(i) {
  const name = SAMPLES[sampleIndex[i]];
  try {
    state.panels[i].img = await loadImage(`samples/${name}.jpg`);
    applyFraming(i, { zoom: 1, ox: 0, oy: 0 });
    redraw();
  } catch (err) {
    setStatus(`Could not load the ${name} sample.`);
  }
}

async function setPanelFile(i, file) {
  if (!file || !file.type.startsWith('image/')) {
    setStatus('That file is not an image.');
    return;
  }
  try {
    const url = URL.createObjectURL(file);
    state.panels[i].img = await loadImage(url);
    applyFraming(i, { zoom: 1, ox: 0, oy: 0 });
    setStatus(`Panel ${i + 1}: ${file.name}`);
    redraw();
  } catch (err) {
    setStatus('Could not read that image.');
  }
}

/** Maps a pointer event on the canvas to canvas pixels. */
function canvasPoint(event) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - r.left) * (canvas.width / r.width),
    y: (event.clientY - r.top) * (canvas.height / r.height),
  };
}

/** Which panel (if any) holds this canvas point. */
function hitPanel(x, y) {
  const { panels } = panelRects(state.layout, canvas.width, canvas.height);
  return panels.findIndex((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);
}

// --- Pointer: click selects, drag pans, wheel zooms toward the cursor. ---
let drag = null;

canvas.addEventListener('pointerdown', (event) => {
  const { x, y } = canvasPoint(event);
  const hit = hitPanel(x, y);
  if (hit === -1) return;
  selectPanel(hit);
  const panel = state.panels[hit];
  drag = { panel: hit, startX: x, startY: y, ox: panel.ox, oy: panel.oy };
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('is-dragging');
});

canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const { x, y } = canvasPoint(event);
  applyFraming(drag.panel, { ox: drag.ox + (x - drag.startX), oy: drag.oy + (y - drag.startY) });
  redraw();
});

function endDrag(event) {
  if (!drag) return;
  drag = null;
  canvas.classList.remove('is-dragging');
  if (event.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const { x, y } = canvasPoint(event);
  const hit = hitPanel(x, y);
  if (hit === -1) return;
  const panel = state.panels[hit];
  if (!panel.img) return;
  const { panels } = panelRects(state.layout, canvas.width, canvas.height);
  const rect = panels[hit];
  selectPanel(hit);
  // Zoom toward the cursor: the image point under it stays put.
  const base = coverScale(panel.img, rect);
  const s0 = base * panel.zoom;
  const dw0 = panel.img.naturalWidth * s0;
  const dh0 = panel.img.naturalHeight * s0;
  const ix = (x - rect.x - (rect.w - dw0) / 2 - panel.ox) / s0;
  const iy = (y - rect.y - (rect.h - dh0) / 2 - panel.oy) / s0;
  const zoom = Math.max(1, Math.min(3, panel.zoom * Math.exp(-event.deltaY * 0.0016)));
  const s1 = base * zoom;
  const dw1 = panel.img.naturalWidth * s1;
  const dh1 = panel.img.naturalHeight * s1;
  applyFraming(hit, {
    zoom,
    ox: x - rect.x - (rect.w - dw1) / 2 - ix * s1,
    oy: y - rect.y - (rect.h - dh1) / 2 - iy * s1,
  });
  syncPanelControls();
  redraw();
}, { passive: false });

// --- Drag and drop a file straight onto a panel. ---
canvas.addEventListener('dragover', (event) => {
  event.preventDefault();
  const { x, y } = canvasPoint(event);
  const hit = hitPanel(x, y);
  if (hit !== -1) selectPanel(hit);
  event.dataTransfer.dropEffect = 'copy';
});

canvas.addEventListener('drop', (event) => {
  event.preventDefault();
  const file = event.dataTransfer.files && event.dataTransfer.files[0];
  const { x, y } = canvasPoint(event);
  const hit = hitPanel(x, y);
  if (file && hit !== -1) setPanelFile(hit, file);
});

// --- Control groups: one active button each. ---
function wireGroup(groupId, apply) {
  const group = document.getElementById(groupId);
  group.querySelectorAll('button[data-value]').forEach((button) => {
    button.addEventListener('click', () => {
      group.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
      button.classList.add('is-active');
      apply(button.dataset.value);
    });
  });
}

wireGroup('layout-group', (value) => {
  state.layout = value;
  if (value === 'hero') selectPanel(0);
  redraw();
});
wireGroup('size-group', (value) => {
  state.size = value;
  resizeCanvas();
  redraw();
});
wireGroup('grade-group', (value) => {
  state.grade = value;
  redraw();
});

// --- Photo rows: upload, sample, single-photo mode, zoom, reframe. ---
document.querySelectorAll('.panel-row').forEach((row, i) => {
  const fileInput = row.querySelector('input[type=file]');
  row.querySelector('.upload-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) setPanelFile(i, fileInput.files[0]);
    fileInput.value = '';
  });
  row.querySelector('.sample-btn').addEventListener('click', () => {
    sampleIndex[i] = (sampleIndex[i] + 1) % SAMPLES.length;
    setPanelSample(i);
  });
  row.addEventListener('click', (event) => {
    if (event.target.closest('button, input')) return;
    selectPanel(i);
  });
});

singleToggle.addEventListener('change', () => {
  state.singlePhoto = singleToggle.checked;
  redraw();
});

zoomSlider.addEventListener('input', () => {
  applyFraming(state.selected, { zoom: Number(zoomSlider.value) / 100 });
  redraw();
});

document.getElementById('reframe').addEventListener('click', () => {
  applyFraming(state.selected, { zoom: 1, ox: 0, oy: 0 });
  syncPanelControls();
  redraw();
});

// --- Caption. ---
titleInput.addEventListener('input', () => {
  state.title = titleInput.value;
  redraw();
});
taglineInput.addEventListener('input', () => {
  state.tagline = taglineInput.value;
  redraw();
});

// --- Export: a clean render at full size, no selection outline. ---
document.getElementById('export').addEventListener('click', () => {
  const { w, h } = SIZES[state.size];
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  drawCover(out, { ...state, showSelection: false });
  out.toBlob((blob) => {
    if (!blob) {
      setStatus('Export failed — try again.');
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vice-cover-${w}x${h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    setStatus(`Saved vice-cover-${w}x${h}.png`);
  }, 'image/png');
});

// The poster font arrives after first paint; redraw once it is ready.
if (document.fonts) {
  document.fonts.load('900 100px "Poster Black"').then(redraw).catch(() => {});
  document.fonts.ready.then(redraw).catch(() => {});
}

// A small hook for automated tests.
window.__vice = { state, redraw, canvas };

// --- Start up: size the canvas, load the samples, or run a shot scene. ---
resizeCanvas();
syncPanelControls();

const query = new URLSearchParams(location.search);
const shot = query.get('shot');
if (shot) {
  runShot(shot, query, {
    state,
    loadImage,
    applyFraming,
    resizeCanvas,
    redraw,
    syncPanelControls,
    selectPanel,
    setStatus,
  });
} else {
  redraw();
  Promise.all([0, 1, 2].map((i) => setPanelSample(i))).then(() => {
    setStatus('Three sample scenes loaded — replace any panel with your own photo.');
  });
}
