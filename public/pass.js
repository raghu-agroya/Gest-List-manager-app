// Draws the Diwali Sundowner entry pass (1080x1920) on a canvas.
// Requires the global `qrcode` (qrcode-generator) and the Great Vibes + Montserrat web fonts.

const EVENT = {date: 'SAT, 7 NOV 2026', time: ['5 PM', 'ONWARDS'], venue: ['ROOFTOP', 'ALL DAY KITCHEN']};
const W = 1080, H = 1920;
const FONTS = ['400 190px "Great Vibes"', '500 40px Montserrat', '600 30px Montserrat', '700 36px Montserrat', '800 60px Montserrat'];

async function loadFonts() {
  try {
    await Promise.race([
      document.fonts.ready.then(() => Promise.all(FONTS.map(f => document.fonts.load(f)))),
      new Promise(r => setTimeout(r, 4000)),
    ]);
  } catch { /* fall back to system fonts */ }
}

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function spacedWidth(ctx, text, sp) {
  const chars = [...text];
  return chars.reduce((s, c) => s + ctx.measureText(c).width, 0) + sp * (chars.length - 1);
}

// Letter-spaced text (canvas letterSpacing is not supported everywhere).
function spaced(ctx, text, x, y, sp, align = 'center') {
  const total = spacedWidth(ctx, text, sp);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const c of text) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + sp; }
  ctx.textAlign = prev;
  return total;
}

function fit(ctx, weight, size, family, text, maxW, sp = 0, min = 18) {
  do { ctx.font = `${weight} ${size}px ${family}`; size -= 2; }
  while (size >= min && spacedWidth(ctx, text, sp) > maxW);
}

function glow(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function bulb(ctx, x, y, size = 9) {
  glow(ctx, x, y, size * 4.5, 'rgba(255,224,160,.55)');
  ctx.fillStyle = '#fff4cf';
  ctx.beginPath(); ctx.ellipse(x, y, size, size * 1.2, 0, 0, Math.PI * 2); ctx.fill();
}

function frond(ctx, x0, y0, ang, len, droop) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const pt = t => [x0 + dx * len * t, y0 + dy * len * t + droop * t * t];
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0);
  for (let t = 0; t <= 1.001; t += 0.02) ctx.lineTo(...pt(t));
  ctx.lineWidth = 7; ctx.stroke();
  for (let t = 0.1; t < 0.97; t += 0.05) {
    const [p, q] = pt(t), [p2, q2] = pt(t + 0.01);
    const a = Math.atan2(q2 - q, p2 - p);
    const l = 150 * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (1 - t * 0.35);
    for (const s of [-1, 1]) {
      const la = a + s * 0.75;
      const tx = p + Math.cos(la) * l, ty = q + Math.sin(la) * l + l * 0.45;
      const mx = (p + tx) / 2, my = (q + ty) / 2, nx = -(ty - q) / l * 9, ny = (tx - p) / l * 9;
      ctx.beginPath(); ctx.moveTo(p, q);
      ctx.quadraticCurveTo(mx + nx, my + ny, tx, ty);
      ctx.quadraticCurveTo(mx - nx, my - ny, p + Math.cos(a) * 14, q + Math.sin(a) * 14);
      ctx.fill();
    }
  }
}

function crowd(ctx, rand, baseY, minR, maxR, color) {
  ctx.fillStyle = color;
  for (let x = -30; x < W + 40;) {
    const r = minR + rand() * (maxR - minR), y = baseY + rand() * 26;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    rr(ctx, x - r * 1.9, y + r * 0.95, r * 3.8, H, r * 1.4); ctx.fill();
    x += r * 2.3 + rand() * r * 1.5;
  }
}

function drawScene(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  [[0, '#3a3157'], [0.2, '#584268'], [0.4, '#935d78'], [0.58, '#d57d69'], [0.72, '#f19858'], [0.79, '#f8b45c'], [0.86, '#3b2223'], [1, '#110b0f']]
    .forEach(([o, c]) => sky.addColorStop(o, c));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // Sun
  glow(ctx, 540, 1545, 560, 'rgba(255,214,140,.6)');
  const sun = ctx.createRadialGradient(540, 1530, 10, 540, 1545, 110);
  sun.addColorStop(0, '#fff0b0'); sun.addColorStop(1, '#ffb55a');
  ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(540, 1545, 105, 0, Math.PI * 2); ctx.fill();

  // String lights, top right
  const wire = t => [(1 - t) ** 2 * 690 + 2 * (1 - t) * t * 860 + t * t * 1100, (1 - t) ** 2 * -10 + 2 * (1 - t) * t * 95 + t * t * 150];
  ctx.strokeStyle = 'rgba(25,15,25,.85)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); for (let t = 0; t <= 1.001; t += 0.02) ctx.lineTo(...wire(t)); ctx.stroke();
  for (const t of [0.12, 0.42, 0.7, 0.93]) {
    const [x, y] = wire(t);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 14); ctx.stroke();
    bulb(ctx, x, y + 24);
  }

  // Palm fronds, top left
  ctx.strokeStyle = ctx.fillStyle = 'rgba(20,12,26,.95)';
  [[-0.2, 330, 110], [0.3, 360, 130], [0.85, 330, 70], [1.3, 260, 30]]
    .forEach(([a, l, d]) => frond(ctx, -40, -50, a, l, d));

  // Pergola with lights, right
  ctx.fillStyle = '#1b1014';
  ctx.beginPath(); ctx.moveTo(775, 1400); ctx.lineTo(1080, 1372); ctx.lineTo(1080, 1394); ctx.lineTo(775, 1416); ctx.fill();
  for (let x = 790; x < 1080; x += 26) ctx.fillRect(x, 1368 + (1080 - x) * 0.06, 7, 14);
  for (const x of [800, 920, 1050]) ctx.fillRect(x, 1400, 12, 200);
  ctx.strokeStyle = 'rgba(40,25,25,.8)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(800, 1430); ctx.quadraticCurveTo(925, 1470, 1080, 1428); ctx.stroke();
  for (let t = 0.05; t < 1; t += 0.11) {
    const x = (1 - t) ** 2 * 800 + 2 * (1 - t) * t * 925 + t * t * 1080;
    const y = (1 - t) ** 2 * 1430 + 2 * (1 - t) * t * 1470 + t * t * 1428;
    bulb(ctx, x, y + 6, 5);
  }

  // Crowd + DJ silhouettes
  const rand = rng(7);
  crowd(ctx, rand, 1535, 13, 18, '#3a2126');
  ctx.fillStyle = '#1a0f13';
  ctx.beginPath(); ctx.arc(150, 1442, 22, 0, Math.PI * 2); ctx.fill();
  rr(ctx, 115, 1466, 72, 90, 22); ctx.fill();
  ctx.fillRect(80, 1500, 190, 70);
  glow(ctx, 225, 1497, 30, 'rgba(255,200,130,.6)');
  crowd(ctx, rand, 1585, 20, 27, '#160d11');

  const ground = ctx.createLinearGradient(0, 1600, 0, 1680);
  ground.addColorStop(0, 'rgba(17,11,15,0)'); ground.addColorStop(1, '#110b0f');
  ctx.fillStyle = ground; ctx.fillRect(0, 1600, W, 80);
  ctx.fillStyle = '#110b0f'; ctx.fillRect(0, 1680, W, H - 1680);
}

function drawHeader(ctx) {
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
  ctx.fillStyle = '#f7e7da'; ctx.font = '500 46px Montserrat';
  spaced(ctx, 'DIWALI', 540, 170, 28);

  const sg = ctx.createLinearGradient(170, 0, 910, 0);
  sg.addColorStop(0, '#fff1dd'); sg.addColorStop(0.5, '#fbd0a0'); sg.addColorStop(1, '#f39553');
  ctx.save();
  ctx.shadowColor = 'rgba(255,160,80,.55)'; ctx.shadowBlur = 26;
  ctx.fillStyle = sg; fit(ctx, 400, 200, '"Great Vibes", cursive', 'Sundowner', 860);
  ctx.fillText('Sundowner', 540, 340);
  ctx.strokeStyle = sg; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(240, 398); ctx.quadraticCurveTo(520, 362, 820, 350); ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#f3dccb'; ctx.font = '600 28px Montserrat';
  const w = spaced(ctx, '3RD EDITION', 540, 432, 12);
  ctx.strokeStyle = 'rgba(243,220,203,.7)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(540 - w / 2 - 110, 422); ctx.lineTo(540 - w / 2 - 28, 422);
  ctx.moveTo(540 + w / 2 + 28, 422); ctx.lineTo(540 + w / 2 + 110, 422);
  ctx.stroke();

  ctx.fillStyle = '#f8dfcb'; ctx.font = '600 52px Montserrat';
  spaced(ctx, 'ENTRY PASS', 540, 540, 32);
}

function drawCard(ctx, g) {
  const x = 145, y = 585, w = 790, h = 750;
  ctx.save();
  ctx.shadowColor = 'rgba(60,20,35,.35)'; ctx.shadowBlur = 45;
  const cg = ctx.createLinearGradient(0, y, 0, y + h);
  cg.addColorStop(0, 'rgba(255,218,205,.32)'); cg.addColorStop(1, 'rgba(255,210,170,.34)');
  ctx.fillStyle = cg; rr(ctx, x, y, w, h, 52); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,242,230,.85)'; ctx.lineWidth = 3; rr(ctx, x, y, w, h, 52); ctx.stroke();

  const name = String(g.name || 'Guest').toUpperCase();
  ctx.fillStyle = '#1b1216'; ctx.textAlign = 'center';
  fit(ctx, 800, 66, 'Montserrat', name, 700);
  ctx.fillText(name, 540, 695);

  // QR code
  const bx = 357, by = 742, bs = 366;
  ctx.fillStyle = '#fffdf8'; rr(ctx, bx, by, bs, bs, 24); ctx.fill();
  const qr = qrcode(0, 'M'); qr.addData(String(g.id)); qr.make();
  const n = qr.getModuleCount(), cell = Math.floor((bs - 44) / n), off = Math.floor((bs - cell * n) / 2);
  ctx.fillStyle = '#111111';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    if (qr.isDark(r, c)) ctx.fillRect(bx + off + c * cell, by + off + r * cell, cell, cell);

  // Pass ID pill
  const pg = ctx.createLinearGradient(318, 0, 762, 0);
  pg.addColorStop(0, '#5a2f22'); pg.addColorStop(0.5, '#7b4532'); pg.addColorStop(1, '#4c271c');
  ctx.fillStyle = pg; rr(ctx, 318, 1120, 444, 66, 33); ctx.fill();
  const idText = `PASS ID:  ${g.id}`;
  ctx.fillStyle = '#fbeee2'; fit(ctx, 600, 32, 'Montserrat', idText, 390, 3);
  spaced(ctx, idText, 540, 1165, 3);

  ctx.strokeStyle = 'rgba(255,245,235,.75)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(220, 1228); ctx.lineTo(860, 1228); ctx.stroke();

  const pax = Number(g.pax) || 1;
  const valid = `VALID FOR ${pax} GUEST${pax === 1 ? '' : 'S'}`;
  ctx.fillStyle = '#2a1918'; fit(ctx, 700, 38, 'Montserrat', valid, 680, 6);
  spaced(ctx, valid, 540, 1292, 6);
}

function drawFooter(ctx) {
  const gold = '#f2c07f';
  ctx.strokeStyle = gold; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  // Calendar
  rr(ctx, 74, 1664, 48, 44, 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(74, 1678); ctx.lineTo(122, 1678);
  ctx.moveTo(87, 1656); ctx.lineTo(87, 1668); ctx.moveTo(109, 1656); ctx.lineTo(109, 1668); ctx.stroke();
  // Clock
  ctx.beginPath(); ctx.arc(484, 1686, 25, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(484, 1686); ctx.lineTo(484, 1671); ctx.moveTo(484, 1686); ctx.lineTo(495, 1694); ctx.stroke();
  // Pin
  ctx.beginPath(); ctx.arc(758, 1678, 19, Math.PI * 0.82, Math.PI * 0.18); ctx.lineTo(758, 1713); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.arc(758, 1678, 6.5, 0, Math.PI * 2); ctx.stroke();

  ctx.strokeStyle = 'rgba(255,230,200,.3)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(418, 1648); ctx.lineTo(418, 1726); ctx.moveTo(706, 1648); ctx.lineTo(706, 1726); ctx.stroke();

  ctx.fillStyle = '#fbefe3'; ctx.textAlign = 'left';
  fit(ctx, 600, 30, 'Montserrat', EVENT.date, 255); ctx.fillText(EVENT.date, 146, 1697);
  fit(ctx, 600, 28, 'Montserrat', EVENT.time[1], 160);
  ctx.fillText(EVENT.time[0], 526, 1678); ctx.fillText(EVENT.time[1], 526, 1712);
  fit(ctx, 600, 27, 'Montserrat', EVENT.venue[1], 262);
  ctx.fillText(EVENT.venue[0], 798, 1678); ctx.fillText(EVENT.venue[1], 798, 1712);

  const line = ctx.createLinearGradient(90, 0, 990, 0);
  line.addColorStop(0, 'rgba(242,192,127,0)'); line.addColorStop(0.5, 'rgba(242,192,127,.6)'); line.addColorStop(1, 'rgba(242,192,127,0)');
  ctx.strokeStyle = line; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(90, 1768); ctx.lineTo(990, 1768); ctx.stroke();

  ctx.fillStyle = '#e9ddd2'; ctx.font = '500 25px Montserrat';
  spaced(ctx, 'PLEASE PRESENT THIS PASS AT ENTRY.', 540, 1826, 8);
}

export async function renderPass(g) {
  if (typeof qrcode !== 'function') throw new Error('QR library failed to load. Check your connection and reload.');
  await loadFonts();
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawScene(ctx);
  drawHeader(ctx);
  drawCard(ctx, g);
  drawFooter(ctx);
  return canvas;
}
