// Vice Cover Studio — the poster renderer. Paints a multi-panel GTA-style
// cover onto any 2D canvas: one photo per panel (cover-fit, pannable,
// zoomable), a colour grade, and bold poster lettering over a caption band.
// Pure canvas, no libraries, no network. The live preview and the exported
// PNG are drawn by the same function, so what you see is what you get.

export const SIZES = {
  square: { w: 1080, h: 1080, label: 'Square 1080 x 1080' },
  portrait: { w: 1080, h: 1350, label: 'Portrait 1080 x 1350' },
  wide: { w: 1920, h: 1080, label: 'Wide 1920 x 1080' },
};

export const LAYOUTS = {
  vice: { label: 'Vice Grid', panels: 3 },
  triptych: { label: 'Triptych', panels: 3 },
  hero: { label: 'Hero Shot', panels: 1 },
};

export const GRADES = {
  sunset: 'Vice Sunset',
  neon: 'Neon Night',
  noir: 'Palm Noir',
  pastel: 'Pastel Miami',
};

// Seeded PRNG (splitmix32): deterministic, so the grain and the placeholder
// skyline look identical on every render of the same cover.
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return ((z ^ (z >>> 15)) >>> 0) / 4294967296;
  };
}

const BAND = 0.24; // caption band height, as a fraction of the canvas height

// Panel rectangles in canvas pixels, per layout. Vice and triptych keep the
// panels above the caption band; hero is one full-bleed panel.
function panelsFor(layout, w, h) {
  const gap = Math.round(Math.min(w, h) * 0.01);
  const top = Math.round(h * (1 - BAND));
  if (layout === 'hero') return [{ x: 0, y: 0, w, h }];
  if (layout === 'triptych') {
    const pw = Math.round((w - gap * 2) / 3);
    return [0, 1, 2].map((i) => ({
      x: i * (pw + gap), y: 0, w: pw, h: top,
    }));
  }
  // Vice Grid: one large panel on the left, two stacked panels on the right.
  const leftW = Math.round(w * 0.6);
  const rightW = w - leftW - gap;
  const halfH = Math.round((top - gap) / 2);
  return [
    { x: 0, y: 0, w: leftW, h: top },
    { x: leftW + gap, y: 0, w: rightW, h: halfH },
    { x: leftW + gap, y: halfH + gap, w: rightW, h: top - halfH - gap },
  ];
}

export function layoutPanels(layout, w, h) {
  return panelsFor(layout, w, h);
}

// A sunset placeholder for a panel with no photo yet: gradient sky, sun disc
// and a dark skyline, so an empty panel still reads as poster art.
function paintPlaceholder(ctx, rect) {
  const sky = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  sky.addColorStop(0, '#2a1150');
  sky.addColorStop(0.5, '#7c2468');
  sky.addColorStop(0.85, '#e85d3d');
  sky.addColorStop(1, '#ffb03d');
  ctx.fillStyle = sky;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const cx = rect.x + rect.w * 0.5;
  const cy = rect.y + rect.h * 0.4;
  const r = Math.min(rect.w, rect.h) * 0.2;
  ctx.fillStyle = 'rgba(255, 222, 140, 0.95)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(16, 6, 26, 0.9)';
  const rnd = seededRandom(11);
  let bx = rect.x;
  while (bx < rect.x + rect.w) {
    const bw = rect.w * (0.09 + rnd() * 0.11);
    const bh = rect.h * (0.1 + rnd() * 0.24);
    ctx.fillRect(bx, rect.y + rect.h - bh, bw, bh);
    bx += bw + 3;
  }
}

// Paints one photo cover-fitting its panel. pan is the fraction of the
// overflow shifted (-0.5..0.5, positive moves the photo right/down); zoom is
// the extra magnification (1..2.5). `filter` is a CSS filter string or null.
function paintPhoto(ctx, photo, rect, pan, zoom, filter) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  if (!photo) {
    paintPlaceholder(ctx, rect);
    ctx.restore();
    return;
  }
  const cover = Math.max(rect.w / photo.naturalWidth, rect.h / photo.naturalHeight);
  const scale = cover * zoom;
  const dw = photo.naturalWidth * scale;
  const dh = photo.naturalHeight * scale;
  const overX = (dw - rect.w) / 2;
  const overY = (dh - rect.h) / 2;
  // Centred when pan is 0; at pan 0.5 the photo's far edge meets the panel's.
  const dx = rect.x - overX + pan.x * 2 * overX;
  const dy = rect.y - overY + pan.y * 2 * overY;
  if (filter) ctx.filter = filter;
  ctx.drawImage(photo, dx, dy, dw, dh);
  ctx.filter = 'none';
  ctx.restore();
}

// The colour grade: a wash over the whole cover, a blend-mode pass, then a
// vignette and fine seeded grain.
function gradeCover(ctx, w, h, grade) {
  const wash = (stops, composite) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    for (const [at, colour] of stops) g.addColorStop(at, colour);
    if (composite) ctx.globalCompositeOperation = composite;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  };
  let vignette;
  if (grade === 'sunset') {
    wash([[0, 'rgba(255,110,50,0.04)'], [0.55, 'rgba(255,80,110,0.15)'],
      [1, 'rgba(170,20,100,0.36)']]);
    wash([[0, 'rgba(255,160,90,0.30)'], [1, 'rgba(255,160,90,0.30)']], 'soft-light');
    vignette = 0.32;
  } else if (grade === 'neon') {
    wash([[0, 'rgba(0,210,255,0.15)'], [0.5, 'rgba(110,0,170,0.09)'],
      [1, 'rgba(255,0,140,0.28)']]);
    wash([[0, 'rgba(0,170,255,0.20)'], [1, 'rgba(0,170,255,0.20)']], 'overlay');
    vignette = 0.48;
  } else if (grade === 'noir') {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(0,80,90,0.26)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    wash([[0, 'rgba(255,255,255,0.05)'], [1, 'rgba(0,0,0,0.28)']]);
    vignette = 0.52;
  } else {
    // pastel
    wash([[0, 'rgba(255,175,200,0.45)'], [1, 'rgba(255,175,200,0.45)']], 'soft-light');
    wash([[0, 'rgba(110,220,210,0.30)'], [1, 'rgba(110,220,210,0.30)']], 'soft-light');
    vignette = 0.18;
  }
  const v = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.36,
    w / 2, h / 2, Math.max(w, h) * 0.72,
  );
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(8,0,16,${vignette})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  const rnd = seededRandom(20261120);
  const dots = Math.round((w * h) / 1000);
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  for (let i = 0; i < dots; i++) {
    ctx.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1.5, 1.5);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let i = 0; i < dots / 2; i++) {
    ctx.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1.5, 1.5);
  }
}


// Canvas has no reliable letter-spacing, so spaced text is drawn one glyph
// at a time. Returns the total width drawn.
function paintSpaced(ctx, text, x, y, gap) {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + gap;
  }
  return cursor - x - gap;
}

function spacedWidth(ctx, text, gap) {
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + gap;
  return total - gap;
}

const POSTER_FONT = (size) => `900 ${size}px PosterBlack, 'Arial Black', sans-serif`;

// Greedy wrap of `words` into lines no wider than maxWidth at the current
// font. Returns the lines, or null when a single word is too wide.
function wrapWords(ctx, words, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth) {
      line = trial;
    } else {
      if (!line) return null;
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Shrinks the title until it wraps into at most two lines inside maxWidth
// and its block (baselines plus descenders) fits inside maxHeight.
function fitTitle(ctx, text, maxWidth, startSize, maxHeight) {
  const words = text.split(/\s+/).filter(Boolean);
  let size = startSize;
  while (size > 26) {
    ctx.font = POSTER_FONT(size);
    const lines = wrapWords(ctx, words, maxWidth);
    const lineH = size * 1.04;
    const block = lines
      ? lineH * 0.94 + (lines.length - 1) * lineH + size * 0.24
      : Infinity;
    if (lines && lines.length <= 2 && block <= maxHeight) {
      return { lines, size };
    }
    size -= 4;
  }
  ctx.font = POSTER_FONT(size);
  return { lines: [text], size };
}

// The caption: a pink-to-gold rule, the title in poster black (one or two
// lines, auto-fitted), and the letterspaced tagline beneath it.
function paintCaption(ctx, zone, title, tagline, align) {
  const heading = title.trim().toUpperCase();
  const sub = tagline.trim().toUpperCase();
  if (!heading && !sub) return;
  const pad = zone.w * 0.045;
  const innerW = zone.w - pad * 2;
  const x0 = align === 'center' ? zone.x + zone.w / 2 : zone.x + pad;
  const ruleW = Math.min(innerW * 0.2, 200);
  const ruleH = Math.max(4, zone.h * 0.04);
  const ruleX = align === 'center' ? x0 - ruleW / 2 : x0;
  const ruleY = zone.y + zone.h * 0.13;
  const rule = ctx.createLinearGradient(ruleX, 0, ruleX + ruleW, 0);
  rule.addColorStop(0, '#ff2e88');
  rule.addColorStop(0.55, '#ff7a3d');
  rule.addColorStop(1, '#ffd23d');
  ctx.fillStyle = rule;
  ctx.fillRect(ruleX, ruleY, ruleW, ruleH);
  ctx.textAlign = align === 'center' ? 'center' : 'left';
  ctx.textBaseline = 'alphabetic';
  // The tagline's size is fixed by the zone, so work it out first and
  // reserve its room before the title is fitted — otherwise a tall title
  // crowds it and the two overlap.
  const gapFor = (s) => s * 0.3;
  let tSize = 0;
  if (sub) {
    tSize = Math.min(zone.h * 0.15, 32);
    ctx.font = `700 ${tSize}px 'Segoe UI', system-ui, sans-serif`;
    while (spacedWidth(ctx, sub, gapFor(tSize)) > innerW && tSize > 11) {
      tSize -= 1;
      ctx.font = `700 ${tSize}px 'Segoe UI', system-ui, sans-serif`;
    }
  }
  let cursorY = ruleY + ruleH;
  let lastBaseline = null;
  let titleSize = 0;
  if (heading) {
    const budget = zone.h * 0.83 - (sub ? tSize * 1.05 : 0);
    const { lines, size } = fitTitle(ctx, heading, innerW,
      Math.min(zone.h * 0.4, 148), budget);
    titleSize = size;
    const lineH = size * 1.04;
    cursorY += lineH * 0.94;
    ctx.font = POSTER_FONT(size);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(16, 4, 26, 0.9)';
    ctx.lineWidth = Math.max(2, size * 0.07);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = size * 0.12;
    ctx.shadowOffsetY = size * 0.04;
    for (const line of lines) {
      lastBaseline = cursorY;
      ctx.strokeText(line, x0, cursorY);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, x0, cursorY);
      cursorY += lineH;
    }
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
  if (sub) {
    // The title loop left ctx.font on the poster face; put the tagline's
    // own face back before measuring or drawing it.
    ctx.font = `700 ${tSize}px 'Segoe UI', system-ui, sans-serif`;
    const tw = spacedWidth(ctx, sub, gapFor(tSize));
    const tx = align === 'center' ? x0 - tw / 2 : x0;
    // Sit below the title's descenders with room to spare.
    let tagY = lastBaseline !== null
      ? lastBaseline + titleSize * 0.24 + tSize * 1.05
      : cursorY + tSize * 0.9;
    tagY = Math.min(tagY, zone.y + zone.h - 6);
    ctx.fillStyle = '#ffd23d';
    paintSpaced(ctx, sub, tx, tagY, gapFor(tSize));
  }
}

/**
 * Paints the whole cover onto `canvas` at its own pixel size.
 * state: { photos, pans, zooms, layout, grade, title, tagline, singlePhoto }
 * — photos/pans/zooms are arrays of 3, one per panel; hero uses slot 0.
 * guides: { selected } draws a dashed outline around the selected panel
 * (editor preview only; pass null for a clean export).
 */
export function drawCover(canvas, state, guides) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#160a1e';
  ctx.fillRect(0, 0, w, h);
  const rects = panelsFor(state.layout, w, h);
  const filter = state.grade === 'noir'
    ? 'grayscale(0.85) contrast(1.12) brightness(1.03)'
    : null;
  rects.forEach((rect, i) => {
    const slot = state.singlePhoto ? 0 : i;
    paintPhoto(ctx, state.photos[slot] || null, rect,
      state.pans[slot], state.zooms[slot], filter);
  });
  gradeCover(ctx, w, h, state.grade);
  // Dark seams between panels.
  const gap = Math.round(Math.min(w, h) * 0.01);
  if (state.layout !== 'hero') {
    ctx.fillStyle = 'rgba(10, 4, 16, 0.9)';
    for (const r of rects) {
      ctx.fillRect(r.x + r.w, r.y, gap, r.h);
      ctx.fillRect(r.x, r.y + r.h, r.w, gap);
    }
  }
  if (state.layout === 'hero') {
    const scrim = ctx.createLinearGradient(0, h * 0.52, 0, h);
    scrim.addColorStop(0, 'rgba(10, 4, 16, 0)');
    scrim.addColorStop(1, 'rgba(10, 4, 16, 0.85)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, h * 0.52, w, h * 0.48);
    paintCaption(ctx, { x: 0, y: h * 0.66, w, h: h * 0.34 },
      state.title, state.tagline, 'left');
  } else {
    const bandY = Math.round(h * (1 - BAND));
    ctx.fillStyle = '#160a1e';
    ctx.fillRect(0, bandY, w, h - bandY);
    const edge = ctx.createLinearGradient(0, 0, w, 0);
    edge.addColorStop(0, '#ff2e88');
    edge.addColorStop(0.5, '#ff7a3d');
    edge.addColorStop(1, '#ffd23d');
    ctx.fillStyle = edge;
    ctx.fillRect(0, bandY, w, Math.max(3, h * 0.004));
    paintCaption(ctx, { x: 0, y: bandY, w, h: h - bandY },
      state.title, state.tagline, 'left');
  }
  if (guides && guides.selected != null && rects[guides.selected]) {
    const r = rects[guides.selected];
    ctx.save();
    ctx.strokeStyle = '#ffd23d';
    ctx.lineWidth = Math.max(3, w * 0.004);
    ctx.setLineDash([18, 10]);
    ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    ctx.restore();
  }
}
