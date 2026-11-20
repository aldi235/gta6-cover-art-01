// Fixed scenes for screenshots. ?shot=editor shows the page with sample
// photos loaded; ?shot=cover hides the editor so the cover fills the frame.
// Query params: layout, size, grade, title, tagline, photo (sample offset).
// window.__shotReady is set once the scene has painted.
import { SIZES } from './cover.js';

const SAMPLES = ['samples/boulevard.jpg', 'samples/pier.jpg', 'samples/synthwave.jpg'];
const LAYOUTS = ['vice', 'triptych', 'hero'];
const GRADES = ['sunset', 'neon', 'noir', 'pastel'];

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function syncControl(segId, key, value) {
  document.querySelectorAll(`#${segId} button`).forEach((el) => {
    el.classList.toggle('on', el.dataset[key] === value);
  });
}

export async function runShot(shot, query, state, redraw) {
  if (shot === 'cover') document.body.classList.add('shot-cover');
  const layout = query.get('layout');
  if (layout && LAYOUTS.includes(layout)) state.layout = layout;
  const size = query.get('size');
  if (size && SIZES[size]) state.sizeKey = size;
  const grade = query.get('grade');
  if (grade && GRADES.includes(grade)) state.grade = grade;
  if (query.get('title') !== null) state.title = query.get('title');
  if (query.get('tagline') !== null) state.tagline = query.get('tagline');
  const offset = Number(query.get('photo') ?? 0) || 0;
  const [a, b, c] = await Promise.all([0, 1, 2].map((i) =>
    loadImage(SAMPLES[(offset + i) % SAMPLES.length]).catch(() => null)));
  if (a) state.photos[0] = a;
  if (b) state.photos[1] = b;
  if (c) state.photos[2] = c;
  state.pans = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
  state.zooms = [1, 1, 1];
  state.singlePhoto = false;
  // Sync the visible controls with the scene, so the editor shot is truthful.
  const titleInput = document.getElementById('title');
  const tagInput = document.getElementById('tagline');
  if (titleInput) titleInput.value = state.title;
  if (tagInput) tagInput.value = state.tagline;
  syncControl('layoutSeg', 'layout', state.layout);
  syncControl('sizeSeg', 'size', state.sizeKey);
  syncControl('gradeSeg', 'grade', state.grade);
  try { await document.fonts.ready; } catch { /* draw with what loaded */ }
  redraw();
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  window.__shotReady = true;
}
