// Vice Cover Studio — the editor wiring: photo slots, panel picking, drag
// to pan, scroll to zoom, layout/size/grade pickers, and PNG export.
// A `?shot=` query sets up a fixed scene for a screenshot instead (shots.js).
import { drawCover, layoutPanels, SIZES } from './cover.js';
import { runShot } from './shots.js';

const SAMPLES = ['samples/boulevard.jpg', 'samples/pier.jpg', 'samples/synthwave.jpg'];
const canvas = document.getElementById('cover');
const status = document.getElementById('status');
const zoomInput = document.getElementById('zoom');

const state = {
  photos: [null, null, null],
  pans: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
  zooms: [1, 1, 1],
  layout: 'vice',
  sizeKey: 'square',
  grade: 'sunset',
  title: 'Boulevard Queen',
  tagline: 'Vice City, after dark',
  singlePhoto: false,
  selected: 0,
};
const sampleCycle = [0, 1, 2];

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function redraw() {
  const size = SIZES[state.sizeKey];
  if (canvas.width !== size.w || canvas.height !== size.h) {
    canvas.width = size.w;
    canvas.height = size.h;
  }
  const guides = document.body.classList.contains('shot-cover')
    ? null
    : { selected: state.selected };
  drawCover(canvas, state, guides);
  document.querySelectorAll('.slot').forEach((el, i) => {
    el.classList.toggle('sel', i === state.selected);
  });
  zoomInput.value = state.zooms[state.selected];
}

// One segmented control: highlight the active button, run the handler.
function bindPicker(segId, key, apply) {
  const seg = document.getElementById(segId);
  seg.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const value = btn.dataset[key];
    seg.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', b === btn);
    });
    apply(value);
    redraw();
  });
}

bindPicker('layoutSeg', 'layout', (value) => {
  state.layout = value;
  if (value === 'hero') state.selected = 0;
});
bindPicker('sizeSeg', 'size', (value) => { state.sizeKey = value; });
bindPicker('gradeSeg', 'grade', (value) => { state.grade = value; });

// --- Caption ---
document.getElementById('title').addEventListener('input', (e) => {
  state.title = e.target.value;
  redraw();
});
document.getElementById('tagline').addEventListener('input', (e) => {
  state.tagline = e.target.value;
  redraw();
});

// --- Photo slots ---
async function assignPhoto(slot, source) {
  const img = typeof source === 'string'
    ? await loadImage(source)
    : await loadImage(URL.createObjectURL(source));
  state.photos[slot] = img;
  state.pans[slot] = { x: 0, y: 0 };
  state.zooms[slot] = 1;
  state.selected = slot;
  redraw();
}
document.querySelectorAll('[data-upload]').forEach((input) => {
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      await assignPhoto(Number(input.dataset.upload), file);
      status.textContent = 'Photo loaded.';
    } catch {
      status.textContent = 'Could not read that image.';
    }
    input.value = '';
  });
});
document.querySelectorAll('[data-sample]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const slot = Number(btn.dataset.sample);
    const url = SAMPLES[sampleCycle[slot] % SAMPLES.length];
    sampleCycle[slot] += 1;
    try {
      await assignPhoto(slot, url);
      status.textContent = 'Sample photo loaded.';
    } catch {
      status.textContent = 'Sample photo failed to load.';
    }
  });
});
document.getElementById('singlePhoto').addEventListener('change', (e) => {
  state.singlePhoto = e.target.checked;
  redraw();
});
zoomInput.addEventListener('input', () => {
  state.zooms[state.selected] = Number(zoomInput.value);
  redraw();
});
document.getElementById('reframe').addEventListener('click', () => {
  state.pans[state.selected] = { x: 0, y: 0 };
  state.zooms[state.selected] = 1;
  redraw();
});

// --- Canvas interaction: click a panel to select it, drag to pan its photo
// (the photo follows the pointer), scroll to zoom. Pointer coordinates are
// converted from the displayed canvas to its pixel size, so it works at any
// preview scale.
function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}
function panelAt(x, y) {
  const rects = layoutPanels(state.layout, canvas.width, canvas.height);
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return null;
}
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  const p = canvasPoint(e);
  const hit = panelAt(p.x, p.y);
  if (hit === null) return;
  state.selected = state.singlePhoto ? 0 : hit;
  drag = { x: p.x, y: p.y, pan: { ...state.pans[state.selected] } };
  canvas.setPointerCapture(e.pointerId);
  redraw();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = canvasPoint(e);
  const rects = layoutPanels(state.layout, canvas.width, canvas.height);
  const rect = rects[state.selected];
  const pan = state.pans[state.selected];
  pan.x = Math.max(-0.5, Math.min(0.5,
    drag.pan.x + ((p.x - drag.x) / rect.w) * 0.9));
  pan.y = Math.max(-0.5, Math.min(0.5,
    drag.pan.y + ((p.y - drag.y) / rect.h) * 0.9));
  redraw();
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const z = state.zooms[state.selected] * Math.exp(-e.deltaY * 0.0012);
  state.zooms[state.selected] = Math.max(1, Math.min(2.5, z));
  redraw();
}, { passive: false });

// Drop an image file onto a panel to fill that panel with it.
canvas.addEventListener('dragover', (e) => e.preventDefault());
canvas.addEventListener('drop', async (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  const p = canvasPoint(e);
  const hit = panelAt(p.x, p.y);
  try {
    await assignPhoto(hit === null ? state.selected : hit, file);
    status.textContent = 'Photo loaded.';
  } catch {
    status.textContent = 'Could not read that image.';
  }
});

// --- Export: paint the cover without editor guides onto an offscreen
// canvas at the chosen size, then download it as a PNG.
document.getElementById('export').addEventListener('click', async () => {
  const size = SIZES[state.sizeKey];
  const out = document.createElement('canvas');
  out.width = size.w;
  out.height = size.h;
  try { await document.fonts.ready; } catch { /* draw with what loaded */ }
  drawCover(out, state, null);
  out.toBlob((blob) => {
    if (!blob) {
      status.textContent = 'Export failed — try again.';
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vice-cover-${size.w}x${size.h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    status.textContent = `Saved vice-cover-${size.w}x${size.h}.png`;
  }, 'image/png');
});

// --- Start: preload the three samples so the app opens as a finished
// poster, repaint once the poster font arrives, and honour ?shot= scenes.
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
async function init() {
  const [a, b, c] = await Promise.all(
    SAMPLES.map((url) => loadImage(url).catch(() => null)),
  );
  if (a) state.photos[0] = a;
  if (b) state.photos[1] = b;
  if (c) state.photos[2] = c;
  redraw();
  if (document.fonts && document.fonts.load) {
    document.fonts.load('900 100px PosterBlack').then(redraw).catch(() => {});
    document.fonts.ready.then(redraw).catch(() => {});
  }
  if (shot) await runShot(shot, params, state, redraw);
}
init();
