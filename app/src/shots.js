// Fixed scenes for screenshots: ?shot=editor shows the page with photos
// loaded; ?shot=cover shows the cover alone, edge to edge. Query knobs:
// layout, size, grade, photo1/2/3 (sample names), title, tagline, single,
// select (which panel the outline marks). window.__shotReady is set once
// the scene is painted with the poster font in place.
import { SIZES, SAMPLES } from './cover.js';

function setActive(groupId, value) {
  document.querySelectorAll(`#${groupId} button[data-value]`).forEach((b) => {
    b.classList.toggle('is-active', b.dataset.value === value);
  });
}

export async function runShot(shot, query, api) {
  const { state, loadImage, resizeCanvas, redraw, syncPanelControls, selectPanel } = api;
  if (shot === 'cover') document.body.classList.add('shot-cover');
  // A cover shot shows the exported art: no selection outline on it.
  state.showSelection = shot !== 'cover';

  const layout = query.get('layout');
  if (layout) state.layout = layout;
  const size = query.get('size');
  if (size && SIZES[size]) state.size = size;
  const grade = query.get('grade');
  if (grade) state.grade = grade;
  const title = query.get('title');
  if (title !== null) state.title = title;
  const tagline = query.get('tagline');
  if (tagline !== null) state.tagline = tagline;
  state.singlePhoto = query.get('single') === '1';

  // Keep the visible controls in step with the scene.
  setActive('layout-group', state.layout);
  setActive('size-group', state.size);
  setActive('grade-group', state.grade);
  document.getElementById('title').value = state.title;
  document.getElementById('tagline').value = state.tagline;
  document.getElementById('single').checked = state.singlePhoto;

  const names = [0, 1, 2].map((i) => {
    const asked = query.get(`photo${i + 1}`);
    return SAMPLES.includes(asked) ? asked : SAMPLES[i];
  });
  resizeCanvas();
  const images = await Promise.all(names.map((n) => loadImage(`samples/${n}.jpg`)));
  images.forEach((img, i) => {
    state.panels[i].img = img;
    state.panels[i].zoom = 1;
    state.panels[i].ox = 0;
    state.panels[i].oy = 0;
  });

  const select = Number(query.get('select'));
  selectPanel(Number.isInteger(select) && select >= 0 && select <= 2 ? select : 0);
  syncPanelControls();
  redraw();

  // Wait for the poster font, then two frames, so the paint is final.
  try {
    await document.fonts.load('900 100px "Poster Black"');
    await document.fonts.ready;
  } catch {
    // The fallback font still paints a cover.
  }
  redraw();
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  window.__shotReady = true;
}
