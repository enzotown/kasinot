/* Kasinot — tur och statistik för barn 4–6 år.
   Tre maskiner (hjul, tärning, kort). Varje resultat räknas i ett stapeldiagram
   längst ner, så barnet ser vilket resultat som kommer oftast. Inget kan förloras. */

'use strict';

/* Skolappars kodsnutt: säger till katalogen när en omgång är klar (inga id:n, inga cookies) */
function skolKlar(pct) {
  try { if (window.skolappar && skolappar.event) skolappar.event('round_done', Math.max(0, Math.min(100, Math.round(pct)))); } catch (e) {}
}

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const DPR = Math.min(window.devicePixelRatio || 1, 2.5);
let W = 0, H = 0, S = 1;

const BG = '#fdf3e7';
const INK = '#4a3f39';
const DIM = '#8d7c6c';

const WHEEL = [
  { name: 'Röd',    col: '#ef6a5a' },
  { name: 'Gul',    col: '#efc93d' },
  { name: 'Grön',   col: '#6fbf85' },
  { name: 'Blå',    col: '#45b7d1' },
  { name: 'Lila',   col: '#9b6bc9' },
  { name: 'Orange', col: '#ef9a3d' }
];
const DICE = [
  { name: 'Ett',   pips: [[0, 0]] },
  { name: 'Två',   pips: [[-1, -1], [1, 1]] },
  { name: 'Tre',   pips: [[-1, -1], [0, 0], [1, 1]] },
  { name: 'Fyra',  pips: [[-1, -1], [1, -1], [-1, 1], [1, 1]] },
  { name: 'Fem',   pips: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]] },
  { name: 'Sex',   pips: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }
];
const CARDS = [
  { name: 'Stjärna', shape: 'star',  col: '#efc93d' },
  { name: 'Hjärta',  shape: 'heart', col: '#ef6a5a' },
  { name: 'Måne',    shape: 'moon',  col: '#6f7fd1' },
  { name: 'Sol',     shape: 'sun',   col: '#ef9a3d' }
];

const MODES = [
  { id: 'hjul',     label: 'HJUL',     action: 'SNURRA', verb: 'snurrade', uppmaning: 'Tryck på snurra hjulet' },
  { id: 'tarning',  label: 'TÄRNING',  action: 'SLÅ',    verb: 'slog',     uppmaning: 'Tryck på slå tärningen' },
  { id: 'kort',     label: 'KORT',     action: 'DRA',    verb: 'drog',     uppmaning: 'Tryck på dra ett kort' }
];

const G = {
  mode: 'hjul',
  counts: { hjul: new Array(WHEEL.length).fill(0), tarning: new Array(DICE.length).fill(0), kort: new Array(CARDS.length).fill(0) },
  rounds: 0,
  totalRounds: 0,
  stars: 0,
  anim: null,          // {t0, dur, kind, result}
  result: null,        // {idx, at}
  done: false,
  help: false,          // förklaringsrutan om statistik
  guess: null,          // vald färg innan snurret (hjul)
  guessFresh: false,   // tryckt sedan förra snurret
  guessResult: null,    // 'right' | 'wrong' efter snurret
  guessN: 0,
  guessHit: 0,
  hits: [],
  pulse: 0,
  angle: -Math.PI / 2 - Math.PI / WHEEL.length,   // mitt i första fältet vid start
  diceShake: 0,
  cardFlip: 1,
  helpT: 0
};

try { G.stars = parseInt(localStorage.getItem('kasinot-stjarnor') || '0', 10) || 0; } catch (e) { G.stars = 0; }

/* ---------- ljud ---------- */
let actx = null;
function audio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { actx = new AC(); master = actx.createGain(); master.gain.value = 0.9; master.connect(actx.destination); }
  }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}
let master = null;
function tone(f, dur, vol, type, slideTo) {
  if (!audio()) return;
  const t = actx.currentTime;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(f, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.012);
  g.gain.setTargetAtTime(0.0001, t + dur * 0.55, dur * 0.22);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.08);
}
function tick() { tone(880, 0.05, 0.06, 'square'); }
function chime(idx) {
  const base = 392 + idx * 44;
  [0, 4, 7].forEach((semi, k) => setTimeout(() => tone(base * Math.pow(2, semi / 12), 0.3, 0.14, 'triangle'), k * 90));
}

/* ---------- röst ---------- */
let voiceOn = true;
function say(text) {
  /* rösten är en inspelad mp3-fil (Shipholm TTS) – saknas den är appen tyst */
  if (!text) return;
  if (window.__rost && window.__rost(text)) return;
}

/* ---------- layout ---------- */
function resize() {
  W = Math.max(300, window.innerWidth);
  H = Math.max(320, window.innerHeight);
  cv.width = Math.round(W * DPR);
  cv.height = Math.round(H * DPR);
  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
  S_ = Math.min(Math.max(Math.sqrt(W * H) / 1000, 0.72), 1.22);  // samma skala i porträtt och landskap
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
let S_ = 1;

function scaleNow() {
  return Math.min(Math.max(Math.sqrt(W * H) / 1000, 0.72), 1.22);
}

function layout() {
  const s = S_ = scaleNow();
  const portrait = H > W * 1.05;
  const pad = 14 * s;
  const titleH = (portrait ? 54 : 46) * s;
  const tabH = Math.max(44, 46 * s);   // aldrig mindre än 44 px träffyta
  const chartH = Math.min(H * 0.30, (portrait ? 190 : 150) * s);
  const top = pad + titleH + tabH + 10 * s;

  const tabs = [];
  const tabW = Math.min((W - pad * 2 - 16 * s) / 3, 210 * s);
  const gap = 8 * s;
  const totalW = tabW * 3 + gap * 2;
  let x0 = W / 2 - totalW / 2;
  MODES.forEach((m, i) => {
    tabs.push({ id: m.id, x: x0 + i * (tabW + gap), y: pad + titleH, w: tabW, h: tabH, label: m.label });
  });

  const stage = { x: pad, y: top, w: W - pad * 2, h: H - chartH - top - pad - 6 * s };
  const chart = { x: pad, y: H - chartH - pad, w: W - pad * 2, h: chartH };

  const r = Math.min(stage.w * 0.13, stage.h * 0.16, 76 * s);
  const rr = Math.max(44, r);
  const labelRoom = 32 * s;                       // plats för "SNURRA" under knappen
  const btn = { x: W / 2, y: stage.y + stage.h - rr - labelRoom - 8 * s, r: rr };

  return { s, pad, portrait, titleH, tabs, stage, chart, btn };
}

/* ---------- rita ---------- */
function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function font(px, weight) {
  ctx.font = (weight || 'bold') + ' ' + Math.round(px) + 'px "Trebuchet MS", Verdana, sans-serif';
}

function fitText(text, maxW, startPx, weight, minPx) {
  let px = startPx;
  for (;;) {
    font(px, weight);
    if (ctx.measureText(text).width <= maxW || px <= (minPx || 12)) break;
    px -= 1;
  }
  return px;
}

function drawHeader(L) {
  const s = L.s;
  font(26 * s, 'bold');
  ctx.fillStyle = INK;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const title = 'Kasinot';
  ctx.fillText(title, L.pad + 2, L.pad + L.titleH / 2);

  // stjärnor
  const starTxt = '★ ' + G.stars;
  font(20 * s, 'bold');
  const sw = ctx.measureText(starTxt).width + 24 * s;
  const sh = 34 * s;
  const sx = W - L.pad - sw, sy = L.pad + (L.titleH - sh) / 2;
  ctx.fillStyle = 'rgba(239, 201, 61, .22)';
  roundRect(sx, sy, sw, sh, sh / 2); ctx.fill();
  ctx.fillStyle = '#b8860b';
  ctx.textAlign = 'center';
  ctx.fillText(starTxt, sx + sw / 2, sy + sh / 2 + 1);

  // frågetecken: berättar vad statistik är
  const bh = Math.max(44, 40 * s);   // minst 44 px träffyta även på mobil
  const bx = sx - bh - 8 * s, by = L.pad + (L.titleH - bh) / 2;
  ctx.beginPath(); ctx.arc(bx + bh / 2, by + bh / 2, bh / 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(69,183,209,.18)'; ctx.fill();
  font(20 * s, 'bold');
  ctx.fillStyle = '#2f7f95';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('?', bx + bh / 2, by + bh / 2 + 1);
  G.hits.push({ kind: 'info', x: bx, y: by, w: bh, h: bh });
}

function drawTabs(L) {
  const s = L.s;
  L.tabs.forEach((t) => {
    const on = G.mode === t.id;
    ctx.fillStyle = on ? '#ffffff' : 'rgba(74,63,57,.07)';
    roundRect(t.x, t.y, t.w, t.h, 14 * s); ctx.fill();
    if (on) {
      ctx.strokeStyle = '#ef9a3d'; ctx.lineWidth = 2.5 * s;
      roundRect(t.x, t.y, t.w, t.h, 14 * s); ctx.stroke();
    }
    const px = fitText(t.label, t.w - 18 * s, 17 * s, 'bold', 11);
    font(px, 'bold');
    ctx.fillStyle = on ? INK : DIM;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t.label, t.x + t.w / 2, t.y + t.h / 2 + 1);
    G.hits.push({ kind: 'tab', id: t.id, x: t.x, y: t.y, w: t.w, h: t.h });
  });
}

function drawStage(L) {
  const s = L.s;
  const st = L.stage;
  ctx.fillStyle = '#ffffff';
  roundRect(st.x, st.y, st.w, st.h, 22 * s); ctx.fill();
  ctx.strokeStyle = 'rgba(74,63,57,.08)'; ctx.lineWidth = 2 * s;
  roundRect(st.x, st.y, st.w, st.h, 22 * s); ctx.stroke();

  const cx = st.x + st.w / 2;
  // ytan ovanför knappen: hjulet + pekaren får plats, med en rad luft för resultatordet
  const above = (L.btn.y - L.btn.r) - st.y;
  const gap = 36 * s;                             // luft mellan spelplan och knapp
  const guessRoom = 104 * s;   // rad med "vilken tror du?" (alla tre maskinerna)
  const room = Math.max(60 * s, above - gap - 8 * s - guessRoom);
  const r = Math.min(st.w * 0.34, room / 2.22, 210 * s);
  const cy = st.y + 8 * s + r * 1.20;             // pekarens spets tar 0,2 r ovanför hjulet

  if (G.mode === 'hjul') drawWheel(cx, cy, r);
  else if (G.mode === 'tarning') drawDice(cx, cy, r);
  else drawCards(cx, cy, r);
  drawGuessRow(L);

  drawAction(L);
  drawResultLine(L);
}

function drawWheel(cx, cy, r) {
  const n = WHEEL.length;
  const seg = (Math.PI * 2) / n;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(G.angle);
  WHEEL.forEach((f, i) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, i * seg, (i + 1) * seg);
    ctx.closePath();
    ctx.fillStyle = f.col;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3;
    ctx.stroke();
  });
  ctx.restore();

  // nav + pekare
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = '#fffaf3'; ctx.fill();
  ctx.strokeStyle = 'rgba(74,63,57,.15)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.98);
  ctx.lineTo(cx - r * 0.10, cy - r * 1.20);
  ctx.lineTo(cx + r * 0.10, cy - r * 1.20);
  ctx.closePath();
  ctx.fillStyle = INK; ctx.fill();
}

function pips(dice, cx, cy, size, col) {
  const d = size * 0.26;
  dice.pips.forEach(([px, py]) => {
    ctx.beginPath();
    ctx.arc(cx + px * d, cy + py * d, size * 0.085, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill();
  });
}

function drawDice(cx, cy, r) {
  const shake = G.diceShake;
  const size = r * 1.5;
  const dx = Math.sin(G.pulse * 34) * shake * 9;
  const dy = Math.cos(G.pulse * 41) * shake * 7;
  const idx = G.anim ? (G.anim.shown || 0) : (G.result ? G.result.idx : 0);
  ctx.save();
  ctx.translate(cx + dx, cy + dy);
  ctx.fillStyle = '#fffaf3';
  roundRect(-size / 2, -size / 2, size, size, size * 0.2); ctx.fill();
  ctx.strokeStyle = '#e8dccb'; ctx.lineWidth = 4; ctx.stroke();
  pips(DICE[idx], 0, 0, size, INK);
  ctx.restore();
}

function cardShape(shape, cx, cy, r, col) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = col;
  if (shape === 'star') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 ? r * 0.46 : r;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  } else if (shape === 'heart') {
    ctx.beginPath();
    ctx.moveTo(0, r * 0.85);
    ctx.bezierCurveTo(-r * 1.25, r * 0.05, -r * 0.62, -r * 0.95, 0, -r * 0.34);
    ctx.bezierCurveTo(r * 0.62, -r * 0.95, r * 1.25, r * 0.05, 0, r * 0.85);
    ctx.fill();
  } else if (shape === 'moon') {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(r * 0.42, -r * 0.22, r * 0.76, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.beginPath(); ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
      ctx.lineTo(Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02);
      ctx.lineWidth = r * 0.12; ctx.strokeStyle = col; ctx.stroke();
    }
  }
  ctx.restore();
}

function drawCards(cx, cy, r) {
  const idx = G.result ? G.result.idx : 0;
  const cw = r * 1.16, chh = r * 1.62;
  const flip = G.cardFlip;      // 1 = framsida, 0 = baksida
  ctx.save();
  ctx.translate(cx, cy);
  // skugga
  ctx.fillStyle = 'rgba(74,63,57,.10)';
  roundRect(-cw / 2 + 4, -chh / 2 + 6, cw, chh, cw * 0.14); ctx.fill();
  // baksida
  ctx.fillStyle = '#6f7fd1';
  roundRect(-cw / 2, -chh / 2, cw, chh, cw * 0.14); ctx.fill();
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - flip);
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * cw * 0.16, 0, cw * 0.05, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // framsida
  if (flip > 0.02) {
    ctx.save();
    ctx.globalAlpha = flip;
    ctx.fillStyle = '#fffaf3';
    roundRect(-cw / 2, -chh / 2, cw, chh, cw * 0.14); ctx.fill();
    cardShape(CARDS[idx].shape, 0, 0, r * 0.52, CARDS[idx].col);
    ctx.restore();
  }
  ctx.restore();
}

function drawAction(L) {
  const b = L.btn;
  const s = L.s;
  const busy = !!G.anim || G.done;
  const pulse = 1 + 0.035 * Math.sin(G.pulse * 6.2);
  const r = b.r * (busy ? 0.94 : pulse);

  ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.12, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(239,154,61,.16)'; ctx.fill();

  const grad = ctx.createLinearGradient(b.x - r, b.y - r, b.x + r, b.y + r);
  grad.addColorStop(0, busy ? '#d9cbb8' : '#f5b25c');
  grad.addColorStop(1, busy ? '#cbbba5' : '#ec8b3c');
  ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad; ctx.fill();

  // ikon: play-triangel
  ctx.beginPath();
  const t = r * 0.44;
  ctx.moveTo(b.x - t * 0.55, b.y - t);
  ctx.lineTo(b.x + t * 0.9, b.y);
  ctx.lineTo(b.x - t * 0.55, b.y + t);
  ctx.closePath();
  ctx.fillStyle = '#ffffff'; ctx.fill();

  font(Math.max(12, 13 * s), 'bold');
  ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  const m = MODES.find((x) => x.id === G.mode);
  ctx.fillText(G.anim ? '…' : m.action, b.x, b.y + r + 24 * s);

  G.hits.push({ kind: 'action', x: b.x - r * 1.15, y: b.y - r * 1.15, w: r * 2.3, h: r * 2.3 });
}

/* rad att gissa på innan man snurrar/slår/drar – en bricka per möjligt utfall */
function drawGuessRow(L) {
  const s = L.s, st = L.stage;
  const list = outcomeList();
  const n = list.length;
  const spacing = Math.max(44, Math.min(76 * s, (st.w - 24 * s) / n));
  const chipR = G.mode === 'tarning' ? Math.min(spacing * 0.36, 20 * s)
    : G.mode === 'kort' ? Math.min(spacing * 0.34, 24 * s)
      : Math.min(spacing * 0.40, 22 * s);
  const cy = L.btn.y - L.btn.r - 64 * s;
  const x0 = st.x + st.w / 2 - (n * spacing) / 2 + spacing / 2;

  // etikett / kvitto
  let label = 'VILKEN TROR DU?';
  let col = 'rgba(74,63,57,.45)';
  if (G.guessResult) {
    label = G.guessResult === 'right' ? 'DU GISSADE RÄTT!' : 'DU GISSADE FEL';
    col = G.guessResult === 'right' ? '#2f8f6b' : '#c4705c';
  }
  font(Math.max(10, Math.min(13 * s, spacing * 0.30)), 'bold');
  ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(label, st.x + st.w / 2, cy - chipR - 8 * s);

  list.forEach((item, i) => {
    const x = x0 + i * spacing;
    const sel = G.guess === i;
    G.hits.push({ kind: 'guess', id: i, x: x - spacing / 2, y: cy - spacing / 2, w: spacing, h: spacing });
    if (sel) {   // markering bakom brickan
      ctx.beginPath(); ctx.arc(x, cy, chipR * 1.30, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(74,63,57,.10)'; ctx.fill();
    }
    item.draw(x, cy, chipR);
    if (sel) {
      ctx.beginPath(); ctx.arc(x, cy, chipR * 1.30, 0, Math.PI * 2);
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(3, chipR * 0.16); ctx.stroke();
    }
  });
}

function outcomeList(mode) {
  const m = mode || G.mode;
  if (m === 'hjul') return WHEEL.map((f, i) => ({ idx: i, name: f.name, draw: (x, y, r) => wheelChip(f, x, y, r) }));
  if (m === 'tarning') return DICE.map((d, i) => ({ idx: i, name: d.name, draw: (x, y, r) => diceChip(d, x, y, r) }));
  return CARDS.map((c, i) => ({ idx: i, name: c.name, draw: (x, y, r) => cardShape(c.shape, x, y, r, c.col) }));
}

function wheelChip(f, x, y, r) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = f.col; ctx.fill();
}

function diceChip(d, x, y, r) {
  ctx.fillStyle = '#fffaf3';
  roundRect(x - r, y - r, r * 2, r * 2, r * 0.4); ctx.fill();
  ctx.strokeStyle = '#e8dccb'; ctx.lineWidth = 2; ctx.stroke();
  pips(d, x, y, r * 1.9, INK);
}

function drawResultLine(L) {
  const s = L.s, st = L.stage;
  const y = L.btn.y - L.btn.r - 10 * s;
  if (!G.result) {
    font(15 * s, 'normal');
    ctx.fillStyle = 'rgba(74,63,57,.45)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const m = MODES.find((x) => x.id === G.mode);
    ctx.fillText('Tryck för att ' + m.action.toLowerCase() + '!', st.x + st.w / 2, y);
    return;
  }
  const list = outcomeList();
  const item = list[G.result.idx];
  const age = (performance.now() - G.result.at) / 1000;   // resultatordet står kvar tills nästa snurr
  const scale = 1 + 0.18 * Math.sin(Math.min(1, age * 6) * Math.PI);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.translate(st.x + st.w / 2, y);
  ctx.scale(scale, scale);
  const px = fitText(item.name.toUpperCase(), st.w * 0.7, 30 * s, 'bold', 14);
  font(px, 'bold');
  ctx.fillStyle = INK;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(item.name.toUpperCase(), 0, 0);
  ctx.restore();
}

function star(cx, cy, r, col) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const rr = k % 2 ? r * 0.46 : r;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
}

function barColor(item) {
  if (G.mode === 'hjul') return WHEEL[item.idx].col;
  if (G.mode === 'kort') return CARDS[item.idx].col;
  return '#ef9a3d';
}

function drawChart(L) {
  const s = L.s, ch = L.chart;
  ctx.fillStyle = '#ffffff';
  roundRect(ch.x, ch.y, ch.w, ch.h, 20 * s); ctx.fill();
  ctx.strokeStyle = 'rgba(74,63,57,.08)'; ctx.lineWidth = 2 * s;
  roundRect(ch.x, ch.y, ch.w, ch.h, 20 * s); ctx.stroke();

  font(13 * s, 'bold');
  ctx.fillStyle = DIM; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('SÅ MÅNGA GÅNGER', ch.x + 16 * s, ch.y + 10 * s);

  const list = outcomeList();
  const counts = G.counts[G.mode];
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...counts);
  const bestIdx = counts.indexOf(Math.max(...counts));

  const innerX = ch.x + 16 * s;
  const innerW = ch.w - 32 * s;
  const colW = innerW / list.length;
  const baseY = ch.y + ch.h - 14 * s;
  const iconY = ch.y + 52 * s;                 // fast rad med ikoner högst upp
  const topY = iconY + 16 * s;                 // staplarna börjar under ikonerna
  const maxH = Math.max(10 * s, baseY - topY);

  list.forEach((item, i) => {
    const cx = innerX + colW * (i + 0.5);
    const frac = counts[i] / max;
    const h = Math.max(3 * s, frac * maxH);

    ctx.fillStyle = 'rgba(74,63,57,.055)';
    roundRect(cx - colW * 0.28, topY, colW * 0.56, maxH, 8 * s); ctx.fill();

    if (counts[i] > 0) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = barColor(item);
      roundRect(cx - colW * 0.28, baseY - h, colW * 0.56, h, 8 * s); ctx.fill();
      ctx.restore();
    }

    // ikonen står still, så staplarna kan växa utan att krocka med den
    const chipR = Math.min(colW * 0.16, 13 * s);
    ctx.beginPath(); ctx.arc(cx, iconY, chipR + 2.5 * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
    item.draw(cx, iconY, chipR);

    if (total > 0 && i === bestIdx && counts[i] > 0) {
      star(cx, iconY - chipR - 7 * s, 7 * s, '#f2b630');   // tecknad stjärna, inte emoji
    }

    font(Math.max(12, 14 * s), 'bold');
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = h >= 24 * s ? 'rgba(74,63,57,.85)' : INK;
    ctx.fillText(String(counts[i]), cx, baseY - 6 * s);
  });
}

function drawDone(L) {
  const s = L.s;
  ctx.fillStyle = 'rgba(74,63,57,.45)';
  ctx.fillRect(0, 0, W, H);

  const pw = Math.min(W - 40 * s, 460 * s);
  const ph = Math.min(H - 60 * s, 400 * s);
  const px = W / 2 - pw / 2, py = H / 2 - ph / 2;
  ctx.fillStyle = '#fffaf3';
  roundRect(px, py, pw, ph, 26 * s); ctx.fill();
  ctx.strokeStyle = 'rgba(239,154,61,.5)'; ctx.lineWidth = 3 * s;
  roundRect(px, py, pw, ph, 26 * s); ctx.stroke();

  font(24 * s, 'bold');
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('DU LEKTE ' + G.rounds + ' RUNDOR!', W / 2, py + 46 * s);

  const list = outcomeList();
  const counts = G.counts[G.mode];
  const order = counts.map((c, i) => [c, i]).sort((a, b) => b[0] - a[0]);
  const top = order[0];
  let line = 'Alla kom lika ofta!';
  if (top[0] > 0) line = 'Oftast: ' + list[top[1]].name + ' – ' + top[0] + ' gånger';
  const fpx = fitText(line, pw - 50 * s, 17 * s, 'normal', 12);
  font(fpx, 'normal');
  ctx.fillStyle = '#6b5b4d';
  ctx.fillText(line, W / 2, py + 90 * s);

  // påminnelse om vad diagrammet heter
  font(13 * s, 'normal');
  ctx.fillStyle = '#2f7f95';
  const gLine = G.guessN > 0
    ? 'Du gissade rätt ' + G.guessHit + ' av ' + G.guessN + ' gånger'
    : 'Sådant här kallas statistik!';
  ctx.fillText(gLine, W / 2, py + 112 * s);

  // stapelrad med ikoner
  const rowY = py + 140 * s;
  const cw = Math.min((pw - 60 * s) / list.length, 54 * s);
  list.forEach((item, i) => {
    const cx = W / 2 + (i - (list.length - 1) / 2) * cw;
    item.draw(cx, rowY, cw * 0.26);
    font(12 * s, 'bold');
    ctx.fillStyle = DIM; ctx.textBaseline = 'top';
    ctx.fillText(String(counts[i]), cx, rowY + cw * 0.34);
  });

  // igen-knapp (stor rund med cirkelpil)
  const br = Math.min(46 * s, pw * 0.13);
  const bx = W / 2, by = py + ph - br - 42 * s;
  ctx.beginPath(); ctx.arc(bx, by, br * 1.12, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(111,191,133,.18)'; ctx.fill();
  ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fillStyle = '#6fbf85'; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = br * 0.16; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(bx, by, br * 0.46, -Math.PI * 0.85, Math.PI * 0.75);
  ctx.stroke();
  ctx.beginPath();
  const ax = bx + Math.cos(Math.PI * 0.75) * br * 0.46;
  const ay = by + Math.sin(Math.PI * 0.75) * br * 0.46;
  ctx.moveTo(ax + br * 0.26, ay - br * 0.02);
  ctx.lineTo(ax - br * 0.06, ay - br * 0.20);
  ctx.moveTo(ax + br * 0.26, ay - br * 0.02);
  ctx.lineTo(ax - br * 0.02, ay + br * 0.18);
  ctx.stroke();

  font(13 * s, 'bold');
  ctx.fillStyle = '#5b8f6c'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('IGEN', bx, by + br + 6 * s);
  G.hits.push({ kind: 'again', x: bx - br * 1.2, y: by - br * 1.2, w: br * 2.4, h: br * 2.4 });
}

/* ---------- förklaringen: vad är statistik? ---------- */
const HELP_TITLE = 'Visste du?';
const HELP_BODY = [
  'Att räkna hur många gånger något kommer upp kallas statistik.',
  'Snurrar man många, många gånger kommer alla färger upp ungefär lika ofta.',
  'Innan du snurrar, slår eller drar kan du gissa vad det blir – då ser du hur ofta du gissar rätt.',
  'Men gissar man bara en enda gång är chansen liten att man väljer rätt färg – ungefär lika liten som att pappa har ketchup på glassen, eller att mamma äter korv med sylt!'
];
const HELP_SAY = 'Visste du? Att räkna hur många gånger något kommer upp kallas statistik. ' +
  'Snurrar man många, många gånger kommer alla färger upp ungefär lika ofta. ' +
  'Men gissar man bara en enda gång är chansen liten att man väljer rätt färg. ' +
  'Ungefär lika liten som att pappa har ketchup på glassen, eller att mamma äter korv med sylt.';

function wrapLines(text, maxW, px) {
  font(px, 'normal');
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  words.forEach((w) => {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  });
  if (cur) lines.push(cur);
  return lines;
}

/* två tokiga rätter: glass med ketchup, korv med sylt */
function drawSilly(cx, cy, sz, kind) {
  ctx.save();
  ctx.translate(cx, cy);
  if (kind === 'glass') {
    // strut
    ctx.beginPath();
    ctx.moveTo(0, sz * 1.05);
    ctx.lineTo(-sz * 0.62, -sz * 0.15);
    ctx.lineTo(sz * 0.62, -sz * 0.15);
    ctx.closePath();
    ctx.fillStyle = '#e0b071'; ctx.fill();
    ctx.strokeStyle = 'rgba(74,63,57,.25)'; ctx.lineWidth = Math.max(1.5, sz * 0.05); ctx.stroke();
    // glasskula
    ctx.beginPath(); ctx.arc(0, -sz * 0.42, sz * 0.52, 0, Math.PI * 2);
    ctx.fillStyle = '#fbe3ea'; ctx.fill();
    ctx.strokeStyle = 'rgba(74,63,57,.15)'; ctx.stroke();
    // ketchup ovanpå
    ctx.beginPath(); ctx.arc(0, -sz * 0.80, sz * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = '#d63a2a'; ctx.fill();
    ctx.beginPath(); ctx.arc(-sz * 0.15, -sz * 0.52, sz * 0.09, 0, Math.PI * 2);
    ctx.fillStyle = '#d63a2a'; ctx.fill();
  } else {
    // bröd
    roundRect(-sz * 0.85, -sz * 0.30, sz * 1.7, sz * 0.60, sz * 0.30);
    ctx.fillStyle = '#f0c079'; ctx.fill();
    ctx.strokeStyle = 'rgba(74,63,57,.18)'; ctx.lineWidth = Math.max(1.5, sz * 0.05); ctx.stroke();
    // korv
    roundRect(-sz * 0.78, -sz * 0.14, sz * 1.56, sz * 0.28, sz * 0.14);
    ctx.fillStyle = '#c9613f'; ctx.fill();
    // sylt
    ctx.beginPath(); ctx.arc(0, -sz * 0.16, sz * 0.17, 0, Math.PI * 2);
    ctx.fillStyle = '#c0304f'; ctx.fill();
    ctx.beginPath(); ctx.arc(sz * 0.22, -sz * 0.05, sz * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = '#c0304f'; ctx.fill();
  }
  ctx.restore();
}

function drawHelp(L) {
  const s = L.s;
  ctx.fillStyle = 'rgba(74,63,57,.45)';
  ctx.fillRect(0, 0, W, H);

  const pw = Math.min(W - 34 * s, 620 * s);
  const inner = pw - 56 * s;
  // hitta en textstorlek som får plats: krymp tills rutan ryms i höjden
  let fs = 19 * s, lines = [], hBody = 0;
  for (; fs >= 11 * s; fs -= 1) {
    lines = [];
    HELP_BODY.forEach((par, i) => {
      if (i) lines.push(null);        // tom rad mellan styckena
      wrapLines(par, inner, fs).forEach((ln) => lines.push(ln));
    });
    hBody = lines.length * fs * 1.42;
    if (60 * s + hBody + 182 * s < H - 30 * s) break;
  }
  const ph = Math.min(H - 30 * s, 66 * s + hBody + 184 * s);
  const px = W / 2 - pw / 2, py = H / 2 - ph / 2;
  ctx.fillStyle = '#fffaf3';
  roundRect(px, py, pw, ph, 26 * s); ctx.fill();
  ctx.strokeStyle = 'rgba(69,183,209,.55)'; ctx.lineWidth = 3 * s;
  roundRect(px, py, pw, ph, 26 * s); ctx.stroke();

  font(25 * s, 'bold');
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(HELP_TITLE, W / 2, py + 22 * s);

  font(fs, 'normal');
  ctx.fillStyle = '#4a3f39'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  let y = py + 62 * s;
  lines.forEach((ln) => {
    if (ln) ctx.fillText(ln, px + 28 * s, y);
    y += fs * 1.42;
  });

  // de två tokiga kombinationerna, ritade (emoji finns inte i alla typsnitt)
  const iy = Math.min(y + 34 * s, py + ph - 130 * s);
  const isz = Math.min(34 * s, 30 * s + 4 * s);
  drawSilly(W / 2 - pw * 0.20, iy, isz, 'glass');
  drawSilly(W / 2 + pw * 0.20, iy, isz, 'korv');
  font(Math.max(11 * s, fs * 0.66), 'normal');
  ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('ketchup på glass', W / 2 - pw * 0.20, iy + isz * 1.15);
  ctx.fillText('korv med sylt', W / 2 + pw * 0.20, iy + isz * 1.15);

  // stäng
  const bw = Math.min(inner, 260 * s), bh = Math.max(52 * s, 46 * s);
  const bx = W / 2 - bw / 2, by = py + ph - bh - 22 * s;
  ctx.fillStyle = '#ef9a3d';
  roundRect(bx, by, bw, bh, bh / 2); ctx.fill();
  font(19 * s, 'bold');
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('TILLBAKA', W / 2, by + bh / 2 + 1);
  G.hits.push({ kind: 'helpclose', x: bx, y: by, w: bw, h: bh });
}

/* ---------- spellogik ---------- */
function rand(n) {
  return Math.floor(Math.random() * n);
}

function startAnim() {
  if (G.anim || G.done) return;
  const n = G.mode === 'hjul' ? WHEEL.length : G.mode === 'tarning' ? DICE.length : CARDS.length;
  const idx = rand(n);
  const dur = G.mode === 'hjul' ? 1500 : G.mode === 'tarning' ? 1100 : 900;
  G.result = null;
  G.cardFlip = G.mode === 'kort' ? 0 : 1;
  const guess = G.guessFresh ? G.guess : null;
  G.guessFresh = false;
  G.guess = null;
  G.guessResult = null;
  G.anim = { t0: performance.now(), dur, idx, kind: G.mode, mode: G.mode, shown: 0, lastTick: 0, guess };
  audio();
  if (G.mode === 'hjul') tone(300, 0.2, 0.1, 'sawtooth', 520);
  else if (G.mode === 'tarning') tone(180, 0.12, 0.12, 'square', 90);
  else tone(660, 0.1, 0.1, 'triangle', 880);
}

function finishAnim() {
  const a = G.anim;
  G.anim = null;
  const list = outcomeList(a.mode);
  const item = list[a.idx];
  if (!item) { return; }                 // om något gått snett: hellre hoppa över än att frysa
  if (G.mode === a.mode) G.result = { idx: a.idx, at: performance.now() };
  G.counts[a.mode][a.idx]++;
  G.rounds++;
  G.totalRounds++;
  G.stars++;
  try { localStorage.setItem('kasinot-stjarnor', String(G.stars)); } catch (e) {}
  G.cardFlip = 1;

  chime(a.idx);
  if (a.guess != null) {
    const right = a.guess === a.idx;
    G.guess = a.guess;
    G.guessResult = right ? 'right' : 'wrong';
    G.guessN++;
    if (right) G.guessHit++;
    const low = (n) => n.toLowerCase();
    if (right) {
      say('Rätt gissat! Det blev ' + low(item.name));
    } else {
      /* två meningar i rad – röstfilerna spelas efter varandra */
      var hal1 = 'Det blev ' + low(item.name) + '.';
      var hal2 = 'Du gissade ' + low(list[a.guess].name) + '.';
      if (!(window.__rostFler && window.__rostFler([hal1, hal2]))) say(hal1 + ' ' + hal2);
    }
  } else {
    G.guessResult = null;
    say(item.name + '!');
  }
  if (G.rounds >= 12) {
    setTimeout(() => { G.done = true; say('Vad duktig du är!'); skolKlar(100); }, 700);
  }
}

function reset() {
  G.counts = { hjul: new Array(WHEEL.length).fill(0), tarning: new Array(DICE.length).fill(0), kort: new Array(CARDS.length).fill(0) };
  G.rounds = 0;
  G.result = null;
  G.anim = null;
  G.done = false;
  G.guess = null;
  G.guessFresh = false;
  G.guessResult = null;
  G.guessN = 0;
  G.guessHit = 0;
  G.cardFlip = 1;
  G.angle = -Math.PI / 2 - Math.PI / WHEEL.length;   // mitt i första fältet, som hjulets slutläge
  say('Igen!');
}

function update(dt) {
  G.pulse += dt;
  if (G.anim) {
    const a = G.anim;
    const t = Math.min(1, (performance.now() - a.t0) / a.dur);
    if (a.kind === 'hjul') {
      const ease = 1 - Math.pow(1 - t, 3);
      const turns = 6;
      // pekaren står rakt upp. Fält i ligger på vinkeln (i+0,5)*seg räknat medurs
      // från klockan 12, så hjulet ska vridas -(i+0,5)*seg (plus ett helt varv, så att
      // det snurrar medurs) för att fältets mitt ska hamna under pekaren.
      const seg = (Math.PI * 2) / WHEEL.length;
      const target = -Math.PI / 2 + (turns + 1) * Math.PI * 2 - (a.idx + 0.5) * seg;
      G.angle = -Math.PI / 2 + (target + Math.PI / 2) * ease;
      if (t < 0.92 && G.pulse - a.lastTick > 0.09) { a.lastTick = G.pulse; tick(); }
    } else if (a.kind === 'tarning') {
      G.diceShake = t < 0.75 ? (1 - t) : 0;
      a.shown = rand(DICE.length);
      if (G.pulse - a.lastTick > 0.075) { a.lastTick = G.pulse; tick(); }
      if (t >= 1) G.diceShake = 0;
    } else {
      G.cardFlip = Math.min(1, t / 0.85);
    }
    if (t >= 1) finishAnim();
  } else {
    G.diceShake = 0;
  }
}

/* ---------- loop ---------- */
let last = performance.now();
window.__errs = window.__errs || [];

function draw(now) {
  try {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (Math.abs(window.innerWidth - W) > 1 || Math.abs(window.innerHeight - H) > 1) resize();
    update(dt);

    G.hits = [];
    const L = layout();

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    drawHeader(L);
    drawTabs(L);
    drawStage(L);
    drawChart(L);
    if (G.done) drawDone(L);
    if (G.help) drawHelp(L);
  } catch (err) {
    window.__errs.push(String(err && err.message || err));
    G.anim = null;
  }
  requestAnimationFrame(draw);
}

/* ---------- pek ---------- */
function hitTest(x, y) {
  for (let i = G.hits.length - 1; i >= 0; i--) {
    const h = G.hits[i];
    if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
  }
  return null;
}

function talkMode() {
  const m = MODES.find((x) => x.id === G.mode);
  if (m.id === 'hjul') say('Snurra hjulet!');
  else if (m.id === 'tarning') say('Slå tärningen!');
  else say('Dra ett kort!');
}

cv.addEventListener('pointerdown', onDown, { passive: false });
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));

/* ---------- testkrokar ---------- */
window.__ko = {
  state: () => ({
    mode: G.mode, rounds: G.rounds, stars: G.stars, done: G.done,
    anim: !!G.anim, result: G.result ? G.result.idx : null,
    counts: JSON.parse(JSON.stringify(G.counts)),
    total: G.counts[G.mode].reduce((a, b) => a + b, 0),
    w: W, h: H, scale: S_, angle: G.angle, wheel: WHEEL.length,
    guess: G.guess, guessResult: G.guessResult, guessN: G.guessN, guessHit: G.guessHit
  }),
  mode: (id) => { G.mode = id; G.result = null; G.cardFlip = 1; },
  spin: () => startAnim(),
  reset: () => reset(),
  finish: () => { if (G.anim) { G.anim.t0 = performance.now() - G.anim.dur; } },
  rundor: (n) => {
    // snabbspelar n rundor utan animation (för genomspelning i test)
    for (let i = 0; i < n && !G.done; i++) {
      const len = G.mode === 'hjul' ? WHEEL.length : G.mode === 'tarning' ? DICE.length : CARDS.length;
      const idx = rand(len);
      G.counts[G.mode][idx]++;
      G.rounds++; G.totalRounds++; G.stars++;
      G.result = { idx, at: performance.now() };
      if (G.rounds >= 12) G.done = true;
    }
    try { localStorage.setItem('kasinot-stjarnor', String(G.stars)); } catch (e) {}
    return window.__ko.state();
  },
  rects: () => { const L = layout(); return { stage: { x: L.stage.x, y: L.stage.y, w: L.stage.w, h: L.stage.h }, chart: { x: L.chart.x, y: L.chart.y, w: L.chart.w, h: L.chart.h }, btn: { x: L.btn.x, y: L.btn.y, r: L.btn.r }, tabs: L.tabs }; },
  hits: () => G.hits.map((h) => ({ kind: h.kind, id: h.id || null, x: Math.round(h.x), y: Math.round(h.y), w: Math.round(h.w), h: Math.round(h.h) }))
};

resize();
requestAnimationFrame(draw);