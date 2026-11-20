// Vice Cover Studio — the cover engine.
//
// Draws a multi-panel GTA-style poster onto a canvas: photos framed per
// panel, a colour grade, vignette and seeded grain, then a title block with
// bold poster lettering and a letterspaced tagline. Pure canvas 2D, no
// network, no libraries. Deterministic: the same state always paints the
// same pixels (the grain comes from a seeded generator).

export const SIZES = {
  square: { w: 1080, h: 1080, label: '1080 × 1080' },
  portrait: { w: 1080, h: 1350, label: '1080 × 1350' },
  wide: { w: 1920, h: 1080, label: '1920 × 1080' },
};

export const LAYOUTS = ['grid', 'triptych', 'hero'];
export const GRADES = ['sunset', 'neon', 'noir', 'pastel'];
export const SAMPLES = ['boulevard', 'pier', 'synthwave'];

export const GRADE_NAMES = {
  sunset: 'Vice Sunset',
  neon: 'Neon Night',
  noir: 'Palm Noir',
  pastel: 'Pastel Miami',
};

// Each grade: a canvas filter applied while the photo is drawn, plus a
// coloured wash laid over the panel afterwards.
const GRADE_FILTERS = {
  sunset: 'saturate(1.28) contrast(1.07) brightness(1.03)',
  neon: 'saturate(1.35) contrast(1.12) brightness(0.94) hue-rotate(-14deg)',
  noir: 'saturate(0.42) contrast(1.20) brightness(0.88)',
  pastel: 'saturate(1.12) contrast(0.94) brightness(1.09)',
};

const GRADE_WASH = {
  sunset: ['rgba(255, 110, 60, 0.16)', 'rgba(205, 30, 110, 0.30)'],
  neon: ['rgba(40, 200, 255, 0.18)', 'rgba(150, 40, 255, 0.32)'],
  noir: ['rgba(10, 10, 26, 0.10)', 'rgba(0, 0, 0, 0.34)'],
  pastel: ['rgba(255, 170, 210, 0.20)', 'rgba(120, 220, 200, 0.20)'],
};

const POSTER_FONT = '"Poster Black", "Arial Narrow", sans-serif';
const BAND_DARK = '#150e1d';

/** A tiny seeded generator, so the grain is the same on every paint. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let grainTile = null;
/** One 192 px noise tile, built once from a fixed seed and tiled over covers. */
function getGrainTile() {
  if (grainTile) return grainTile;
  const tile = document.createElement('canvas');
  tile.width = 192;
  tile.height = 192;
  const tctx = tile.getContext('2d');
  const img = tctx.createImageData(192, 192);
  const rand = mulberry32(20261120);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rand() * 256);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 22;
  }
  tctx.putImageData(img, 0, 0);
  grainTile = tile;
  return tile;
}

/**
 * Panel geometry for a layout: the three panel rects (hero uses only the
 * first, full-bleed) and the title band rect. All in canvas pixels.
 */
export function panelRects(layout, w, h) {
  const bandH = Math.round(h * (layout === 'hero' ? 0.26 : 0.19));
  const band = { x: 0, y: h - bandH, w, h: bandH };
  const gap = Math.max(4, Math.round(w * 0.0055));
  const ph = h - bandH;
  if (layout === 'hero') {
    return { panels: [{ x: 0, y: 0, w, h }], band, gap };
  }
  if (layout === 'triptych') {
    const cw = (w - gap * 2) / 3;
    return {
      panels: [0, 1, 2].map((i) => ({ x: i * (cw + gap), y: 0, w: cw, h: ph })),
      band,
      gap,
    };
  }
  // grid: hero panel on the left, two stacked panels on the right.
  const heroW = Math.round(w * 0.62);
  const sideW = w - heroW - gap;
  const sideH = (ph - gap) / 2;
  return {
    panels: [
      { x: 0, y: 0, w: heroW, h: ph },
      { x: heroW + gap, y: 0, w: sideW, h: sideH },
      { x: heroW + gap, y: sideH + gap, w: sideW, h: sideH },
    ],
    band,
    gap,
  };
}

/** The cover-fit scale that makes `img` fill `rect` with nothing showing. */
export function coverScale(img, rect) {
  return Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight);
}

/** Clamps a pan offset so the framed photo always covers its panel. */
export function clampOffset(img, rect, zoom, ox, oy) {
  const s = coverScale(img, rect) * zoom;
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  const mx = Math.max(0, (dw - rect.w) / 2);
  const my = Math.max(0, (dh - rect.h) / 2);
  return { ox: Math.max(-mx, Math.min(mx, ox)), oy: Math.max(-my, Math.min(my, oy)) };
}

/** Draws one framed photo into its panel, clipped to the panel rect. */
function drawFramedPhoto(ctx, img, rect, frame, grade) {
  const { ox, oy } = clampOffset(img, rect, frame.zoom, frame.ox, frame.oy);
  const s = coverScale(img, rect) * frame.zoom;
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  const dx = rect.x + (rect.w - dw) / 2 + ox;
  const dy = rect.y + (rect.h - dh) / 2 + oy;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.filter = GRADE_FILTERS[grade] || 'none';
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.filter = 'none';
  // Colour wash: a vertical gradient in overlay blend.
  const [top, bottom] = GRADE_WASH[grade] || GRADE_WASH.sunset;
  const wash = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  wash.addColorStop(0, top);
  wash.addColorStop(1, bottom);
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = wash;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalCompositeOperation = 'source-over';
  // Vignette: darker corners, clear centre.
  const vg = ctx.createRadialGradient(
    rect.x + rect.w / 2, rect.y + rect.h / 2, Math.min(rect.w, rect.h) * 0.42,
    rect.x + rect.w / 2, rect.y + rect.h / 2, Math.max(rect.w, rect.h) * 0.75,
  );
  vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vg.addColorStop(1, 'rgba(0, 0, 0, 0.26)');
  ctx.fillStyle = vg;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

/** An empty panel: dark hatch with a centred label, so the grid still reads. */
function drawEmptyPanel(ctx, rect) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.fillStyle = '#241a30';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 2;
  for (let x = -rect.h; x < rect.w + rect.h; x += 26) {
    ctx.beginPath();
    ctx.moveTo(rect.x + x, rect.y + rect.h);
    ctx.lineTo(rect.x + x + rect.h, rect.y);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = `700 ${Math.max(16, rect.w * 0.05)}px ${POSTER_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ADD A PHOTO', rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.restore();
}

/**
 * Wraps `text` into at most `maxLines` lines that fit `maxWidth` at the
 * current font; the last line is ellipsised if words still remain.
 */
export function wrapTitle(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth || !line) {
      line = trial;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    const used = lines.join(' ').split(/\s+/).length;
    if (used < words.length) {
      let last = lines[lines.length - 1];
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[lines.length - 1] = `${last}…`;
    }
  }
  return lines;
}

/** Draws `text` with even letter tracking, one glyph at a time. */
function drawTrackedText(ctx, text, x, y, tracking) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
  return cx - tracking - x;
}

/**
 * The title block: gradient rule, auto-fit title (1–2 lines) and a
 * letterspaced tagline. The title gets a fixed height budget above the
 * tagline, so descenders can never touch it.
 */
function drawTitleBlock(ctx, band, title, tagline, w) {
  const { x, y, h: bh } = band;
  const padX = w * 0.045;
  const maxTextW = w - padX * 2;
  // Gradient rule.
  const ruleH = Math.max(3, bh * 0.05);
  const ruleY = y + bh * 0.13;
  const rule = ctx.createLinearGradient(x + padX, 0, x + padX + w * 0.17, 0);
  rule.addColorStop(0, '#ff2e88');
  rule.addColorStop(0.55, '#ff7a3c');
  rule.addColorStop(1, '#ffd166');
  ctx.fillStyle = rule;
  ctx.fillRect(x + padX, ruleY, w * 0.17, ruleH);

  const text = (title || '').trim().toUpperCase();
  const titleTop = y + bh * 0.22;
  const titleBudget = bh * 0.50;
  if (text) {
    let size = bh * 0.44;
    let lines = [];
    while (size > 20) {
      ctx.font = `900 ${size}px ${POSTER_FONT}`;
      lines = wrapTitle(ctx, text, maxTextW, 2);
      const fitsW = lines.every((ln) => ctx.measureText(ln).width <= maxTextW);
      const fitsH = lines.length * size * 1.04 <= titleBudget;
      if (fitsW && fitsH) break;
      size -= 2;
    }
    ctx.font = `900 ${size}px ${POSTER_FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = size * 0.12;
    ctx.shadowOffsetY = size * 0.03;
    lines.forEach((ln, i) => {
      ctx.fillText(ln, x + padX, titleTop + size * 0.92 + i * size * 1.04);
    });
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  const tag = (tagline || '').trim().toUpperCase();
  if (tag) {
    let size = bh * 0.145;
    const tracking = () => size * 0.32;
    const widthAt = (s) => {
      ctx.font = `700 ${s}px ${POSTER_FONT}`;
      let total = 0;
      for (const ch of tag) total += ctx.measureText(ch).width + s * 0.32;
      return total - s * 0.32;
    };
    while (size > 12 && widthAt(size) > maxTextW) size -= 1;
    ctx.font = `700 ${size}px ${POSTER_FONT}`;
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    drawTrackedText(ctx, tag, x + padX, y + bh * 0.90, tracking());
  }
}

/**
 * Paints the whole cover onto `canvas` from `state`:
 * { layout, grade, panels: [{ img, zoom, ox, oy }], singlePhoto,
 *   title, tagline, selected, showSelection }.
 */
export function drawCover(canvas, state) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const { panels, band, gap } = panelRects(state.layout, w, h);

  ctx.fillStyle = '#0d0912';
  ctx.fillRect(0, 0, w, h);

  const frames = state.panels;
  const firstImg = frames[0] ? frames[0].img : null;
  if (state.layout === 'hero') {
    const frame = frames[0];
    if (frame && frame.img) drawFramedPhoto(ctx, frame.img, panels[0], frame, state.grade);
    else drawEmptyPanel(ctx, panels[0]);
    // Scrim so the lettering reads over the photo.
    const scrim = ctx.createLinearGradient(0, band.y - h * 0.16, 0, h);
    scrim.addColorStop(0, 'rgba(13, 8, 18, 0)');
    scrim.addColorStop(0.45, 'rgba(13, 8, 18, 0.55)');
    scrim.addColorStop(1, 'rgba(13, 8, 18, 0.92)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, band.y - h * 0.16, w, h - (band.y - h * 0.16));
  } else {
    panels.forEach((rect, i) => {
      const frame = frames[i];
      const img = state.singlePhoto ? firstImg : frame && frame.img;
      if (img) drawFramedPhoto(ctx, img, rect, frame, state.grade);
      else drawEmptyPanel(ctx, rect);
    });
    // Accent seam above the title band.
    const seam = ctx.createLinearGradient(0, 0, w, 0);
    seam.addColorStop(0, '#ff2e88');
    seam.addColorStop(0.5, '#ff7a3c');
    seam.addColorStop(1, '#ffd166');
    ctx.fillStyle = seam;
    ctx.fillRect(0, band.y - Math.max(2, gap * 0.5), w, Math.max(2, gap * 0.5));
    ctx.fillStyle = BAND_DARK;
    ctx.fillRect(0, band.y, w, band.h);
  }

  // Seeded grain over the whole cover.
  const tile = getGrainTile();
  const pattern = ctx.createPattern(tile, 'repeat');
  if (pattern) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  drawTitleBlock(ctx, band, state.title, state.tagline, w);

  // Selection outline, preview only — never in an export.
  if (state.showSelection && state.layout !== 'hero') {
    const rect = panels[state.selected];
    if (rect) {
      ctx.save();
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = Math.max(2, w * 0.002);
      ctx.setLineDash([Math.max(8, w * 0.012), Math.max(6, w * 0.008)]);
      ctx.strokeRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4);
      ctx.restore();
    }
  }
}
