// Vice Cover Studio — the poster renderer. Draws a multi-panel GTA-style cover
// onto any 2D canvas: photos per panel (cover-fit, pannable, zoomable), a colour
// grade, and bold poster lettering. Pure canvas, no network, no libraries.
// The same code draws the live preview and the exported PNG.

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

// Panel rectangles in fractions of the canvas, per layout. The caption band
// sits below the panels for vice/triptych; hero is full-bleed with the caption
// laid over a scrim at the foot.
function panelRects(layout, w, h) {
  const g = Math.round(Math.min(w, h) * 0.008); // gutter in px
  const band = 0.22; // caption band height, fraction of h
  const top = h * (1 - band);
  if (layout === 'hero') return [{ x: 0, y: 0, w, h }];
  if (layout === 'triptych') {
    const pw = (w - g * 2) / 3;
    return [0, 1, 2].map((i) => ({ x: Math.round(i * (pw + g)), y: 0, w: Math.round(pw), h: Math.round(top) }));
  }
  // vice: big hero panel left, two stacked panels right.
  const lw = Math.round(w * 0.62);
  const rw = w - lw - g;
  const rh = Math.round((top - g) / 2);
  return [
    { x: 0, y: 0, w: lw, h: Math.round(top) },
    { x: lw + g, y: 0, w: rw, h: rh },
    { x: lw + g, y: rh + g, w: rw, h: Math.round(top) - rh - g },
  ];
}

export function layoutPanels(layout, w, h) {
  return panelRects(layout, w, h);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Draws one photo cover-fitting a panel, with pan (fractions of the overflow,
// -0.5..0.5) and zoom (1..2.5). A missing photo leaves a gradient placeholder.
function drawPhoto(ctx, photo, rect, pan, zoom, filter) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  if (!photo) {
    const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    grad.addColorStop(0, '#3a1c5c');
    grad.addColorStop(0.55, '#8a2a6b');
    grad.addColorStop(1, '#e85d3d');
    ctx.fillStyle = grad;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    // Sun disc + skyline silhouette so an empty panel still reads as a poster.
    const cx = rect.x + rect.w * 0.5;
    const cy = rect.y + rect.h * 0.42;
    const r = Math.min(rect.w, rect.h) * 0.22;
    ctx.fillStyle = 'rgba(255, 214, 130, 0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(20, 8, 28, 0.85)';
    let bx = rect.x;
    const rnd = mulberry32(7);
    while (bx < rect.x + rect.w) {
      const bw = rect.w * (0.08 + rnd() * 0.1);
      const bh = rect.h * (0.12 + rnd() * 0.22);
      ctx.fillRect(bx, rect.y + rect.h - bh, bw, bh);
      bx += bw + 2;
    }
  } else {
    const base = Math.max(rect.w / photo.naturalWidth, rect.h / photo.naturalHeight);
    const s = base * zoom;
    const dw = photo.naturalWidth * s;
    const dh = photo.naturalHeight * s;
    const ox = (dw - rect.w) / 2;
    const oy = (dh - rect.h) / 2;
    const dx = rect.x + ox * -pan.x * 2 + (rect.w - dw) / 2;
    const dy = rect.y + oy * -pan.y * 2 + (rect.h - dh) / 2;
    if (filter) ctx.filter = filter;
    ctx.drawImage(photo, dx, dy, dw, dh);
    ctx.filter = 'none';
  }
  ctx.restore();
}

// Colour grade passes, applied over the whole cover after the photos.
function applyGrade(ctx, w, h, grade) {
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  if (grade === 'sunset') {
    const warm = ctx.createLinearGradient(0, 0, 0, h);
    warm.addColorStop(0, 'rgba(255,120,60,0.05)');
    warm.addColorStop(0.6, 'rgba(255,90,120,0.16)');
    warm.addColorStop(1, 'rgba(190,30,110,0.38)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(255,150,80,0.35)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    v.addColorStop(1, 'rgba(20,0,20,0.34)');
  } else if (grade === 'neon') {
    const top = ctx.createLinearGradient(0, 0, 0, h);
    top.addColorStop(0, 'rgba(0,220,255,0.16)');
    top.addColorStop(0.55, 'rgba(120,0,180,0.10)');
    top.addColorStop(1, 'rgba(255,0,150,0.30)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(0,180,255,0.22)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    v.addColorStop(1, 'rgba(5,0,25,0.5)');
  } else if (grade === 'noir') {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(0,70,80,0.28)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    const edge = ctx.createLinearGradient(0, 0, 0, h);
    edge.addColorStop(0, 'rgba(255,255,255,0.06)');
    edge.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
  } else {
    // pastel
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(255,180,205,0.5)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(120,225,215,0.35)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    v.addColorStop(1, 'rgba(60,20,60,0.20)');
  }
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  // Fine grain, seeded so every render of the same cover is identical.
  const rnd = mulberry32(20261120);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  const dots = Math.round((w * h) / 900);
  for (let i = 0; i < dots; i++) {
    const x = Math.floor(rnd() * w);
    const y = Math.floor(rnd() * h);
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let i = 0; i < dots / 2; i++) {
    ctx.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1.4, 1.4);
  }
}

// Draws text with manual letter spacing (canvas letterSpacing is not universal).
function drawSpaced(ctx, text, x, y, spacing) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return cx - x - spacing; // total width drawn
}

function spacedWidth(ctx, text, spacing) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return w - spacing;
}

// Fits the title into at most two lines inside maxWidth, shrinking the font
// until it fits. Returns the lines and the font size used.
function fitTitle(ctx, text, maxWidth, startSize) {
  const words = text.split(/\s+/).filter(Boolean);
  let size = startSize;
  while (size > 24) {
    ctx.font = `900 ${size}px PosterBlack, 'Arial Black', sans-serif`;
    if (words.length === 1) {
      if (ctx.measureText(words[0]).width <= maxWidth) return { lines: [words[0]], size };
    } else {
      // Greedy two-line wrap.
      const lines = [];
      let line = '';
      for (const word of words) {
        const trial = line ? `${line} ${word}` : word;
        if (ctx.measureText(trial).width <= maxWidth) line = trial;
        else {
          if (line) lines.push(line);
          line = word;
        }
      }
      if (line) lines.push(line);
      if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= maxWidth)) {
        return { lines, size };
      }
    }
    size -= 4;
  }
  ctx.font = `900 ${size}px PosterBlack, 'Arial Black', sans-serif`;
  return { lines: [text], size };
}

function drawTitleBlock(ctx, zone, title, tagline, align) {
  const text = title.trim().toUpperCase();
  if (!text && !tagline.trim()) return;
  const pad = zone.w * 0.045;
  const innerW = zone.w - pad * 2;
  const baseX = align === 'center' ? zone.x + zone.w / 2 : zone.x + pad;
  // Accent rule: pink-to-amber bar above the title.
  const ruleW = Math.min(innerW * 0.22, 220);
  const ruleH = Math.max(4, zone.h * 0.045);
  const ruleX = align === 'center' ? baseX - ruleW / 2 : baseX;
  const ruleY = zone.y + zone.h * 0.14;
  const rule = ctx.createLinearGradient(ruleX, 0, ruleX + ruleW, 0);
  rule.addColorStop(0, '#ff2e88');
  rule.addColorStop(0.55, '#ff7a3d');
  rule.addColorStop(1, '#ffd23d');
  ctx.fillStyle = rule;
  ctx.fillRect(ruleX, ruleY, ruleW, ruleH);
  ctx.textAlign = align === 'center' ? 'center' : 'left';
  ctx.textBaseline = 'alphabetic';
  let cursorY = ruleY + ruleH;
  let lastBaseline = null;
  if (text) {
    const startSize = Math.min(zone.h * 0.42, 150);
    const { lines, size } = fitTitle(ctx, text, innerW, startSize);
    const lineH = size * 1.02;
    cursorY += lineH * 0.92;
    ctx.font = `900 ${size}px PosterBlack, 'Arial Black', sans-serif`;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(18, 4, 28, 0.92)';
    ctx.lineWidth = Math.max(2, size * 0.07);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = size * 0.12;
    ctx.shadowOffsetY = size * 0.04;
    for (const line of lines) {
      lastBaseline = cursorY;
      ctx.strokeText(line, baseX, cursorY);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, baseX, cursorY);
      cursorY += lineH;
    }
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
  const tag = tagline.trim().toUpperCase();
  if (tag) {
    let tSize = Math.min(zone.h * 0.16, 34);
    const spacing = tSize * 0.28;
    ctx.font = `700 ${tSize}px 'Segoe UI', system-ui, sans-serif`;
    while (spacedWidth(ctx, tag, spacing) > innerW && tSize > 12) {
      tSize -= 1;
      ctx.font = `700 ${tSize}px 'Segoe UI', system-ui, sans-serif`;
    }
    const tw = spacedWidth(ctx, tag, tSize * 0.28);
    const tx = align === 'center' ? baseX - tw / 2 : baseX;
    // Sit the tagline just under the last title line, never past the zone.
    let tagY = lastBaseline !== null ? lastBaseline + tSize * 1.05 : cursorY + tSize * 0.9;
    tagY = Math.min(tagY, zone.y + zone.h - 8);
    ctx.fillStyle = '#ffd23d';
    drawSpaced(ctx, tag, tx, tagY, tSize * 0.28);
  }
}

/**
 * Draws the whole cover onto `canvas` at its own pixel size.
 * state: { photos, pans, zooms, layout, grade, title, tagline, singlePhoto }
 * photos/pans/zooms are arrays of 3 (one per panel); hero uses slot 0 only.
 * guides: when true (editor preview), draws the selected panel's outline.
 */
export function drawCover(canvas, state, guides) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#160a1e';
  ctx.fillRect(0, 0, w, h);
  const rects = panelRects(state.layout, w, h);
  const filter = state.grade === 'noir' ? 'grayscale(0.85) contrast(1.12) brightness(1.03)' : null;
  rects.forEach((rect, i) => {
    const slot = state.singlePhoto ? 0 : i;
    drawPhoto(ctx, state.photos[slot] || null, rect, state.pans[slot], state.zooms[slot], filter);
  });
  applyGrade(ctx, w, h, state.grade);
  // Gutters: thin dark seams between panels.
  ctx.fillStyle = 'rgba(10, 4, 16, 0.9)';
  const g = Math.round(Math.min(w, h) * 0.008);
  if (state.layout !== 'hero') {
    for (const r of rects) {
      ctx.fillRect(r.x + r.w, r.y, g, r.h);
      ctx.fillRect(r.x, r.y + r.h, r.w, g);
    }
  }
  // Caption zone.
  if (state.layout === 'hero') {
    const scrim = ctx.createLinearGradient(0, h * 0.55, 0, h);
    scrim.addColorStop(0, 'rgba(10, 4, 16, 0)');
    scrim.addColorStop(1, 'rgba(10, 4, 16, 0.82)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);
    drawTitleBlock(ctx, { x: 0, y: h * 0.68, w, h: h * 0.32 }, state.title, state.tagline, 'left');
  } else {
    const bandY = Math.round(h * 0.78);
    ctx.fillStyle = '#160a1e';
    ctx.fillRect(0, bandY, w, h - bandY);
    const rule = ctx.createLinearGradient(0, 0, w, 0);
    rule.addColorStop(0, '#ff2e88');
    rule.addColorStop(0.5, '#ff7a3d');
    rule.addColorStop(1, '#ffd23d');
    ctx.fillStyle = rule;
    ctx.fillRect(0, bandY, w, Math.max(3, h * 0.004));
    drawTitleBlock(ctx, { x: 0, y: bandY, w, h: h - bandY }, state.title, state.tagline, 'left');
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
