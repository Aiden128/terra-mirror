import { daylight } from './climate-lite.js';

const TERRAIN_COLORS = [
  '#0a1420', '#0c1725', '#101d2e',
  '#2b2f26', '#39412e', '#465436',
  '#4e6440', '#58754a', '#628754', '#6d995f',
];

export class Renderer {
  constructor(canvas, tooltip) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.tooltip = tooltip;
    this.state = null;
    this.terrainCanvas = null;
    this.armedPower = null;
    this.onSelect = null;
    this.onWorldClick = null;
    this.hover = null;
    this._fit();
    addEventListener('resize', () => this._fit());
    canvas.addEventListener('mousemove', (e) => this._hover(e));
    canvas.addEventListener('mouseleave', () => { this.hover = null; this.tooltip.hidden = true; });
    canvas.addEventListener('click', (e) => this._click(e));
    requestAnimationFrame(() => this._frame());
  }

  _fit() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const rect = this.cv.getBoundingClientRect();
    const w = Math.max(320, rect.width), h = Math.max(180, rect.height);
    const scale = Math.min(w / 96, h / 54);
    this.cssW = 96 * scale; this.cssH = 54 * scale;
    this.cell = scale;
    this.cv.width = Math.round(96 * scale * dpr);
    this.cv.height = Math.round(54 * scale * dpr);
    this.dpr = dpr;
  }

  setState(st) {
    if (!this.state || st.seed !== this.state.seed) this.terrainCanvas = null;
    this.state = st;
    if (!this.terrainCanvas) this._bakeTerrain();
  }

  _bakeTerrain() {
    const t = document.createElement('canvas');
    const dpr = Math.min(2, devicePixelRatio || 1);
    t.width = Math.round(this.cell * 96 * dpr);
    t.height = Math.round(this.cell * 54 * dpr);
    const c = t.getContext('2d');
    c.scale(dpr, dpr);
    for (let y = 0; y < 54; y++) {
      for (let x = 0; x < 96; x++) {
        c.fillStyle = TERRAIN_COLORS[this.state.terrain[y * 96 + x]] || '#333';
        c.fillRect(x * this.cell, y * this.cell, this.cell + 0.5, this.cell + 0.5);
      }
    }
    this.terrainCanvas = t;
  }

  _frame() {
    requestAnimationFrame(() => this._frame());
    if (!this.state) return;
    const { ctx, cell, dpr } = this;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    if (this.terrainCanvas) ctx.drawImage(this.terrainCanvas, 0, 0, this.cssW, this.cssH);

    const now = Date.now();

    const veil = ctx.createLinearGradient(0, 0, this.cssW, 0);
    for (let s = 0; s <= 24; s++) {
      const x = Math.round((s / 24) * 95);
      const l = daylight(x, new Date(now));
      veil.addColorStop(s / 24, `rgba(4,8,18,${(1 - l) * 0.62})`);
    }
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    const kp = this.state.real?.kp;
    if (kp != null && kp >= 5) {
      const strength = Math.min(1, (kp - 4) / 4);
      for (let band = 0; band < 3; band++) {
        const yy =
          (14 + band * 9 + Math.sin(now / 2400 + band * 2.1) * 7) * cell;
        const grad = ctx.createLinearGradient(0, yy - 16 * cell, 0, yy + 10 * cell);
        const hue = band === 1 ? 285 : 150;
        grad.addColorStop(0, `hsla(${hue},90%,60%,0)`);
        grad.addColorStop(0.5, `hsla(${hue},90%,62%,${0.20 * strength})`);
        grad.addColorStop(1, `hsla(${hue},90%,60%,0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, yy - 16 * cell, this.cssW, 26 * cell);
      }
    }

    if (this.state.rainTicks > 0 && Math.random() < 0.85) {
      ctx.strokeStyle = 'rgba(150,190,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 60; i++) {
        const rx = Math.random() * this.cssW, ry = Math.random() * this.cssH;
        ctx.moveTo(rx, ry); ctx.lineTo(rx - 2, ry + 6);
      }
      ctx.stroke();
    }

    for (const p of this.state.plants) {
      const x = p.i % 96, y = Math.floor(p.i / 96);
      const s = Math.min(cell * 1.4, 1 + Math.sqrt(p.e) * 0.35) ;
      ctx.fillStyle = 'rgba(110,231,183,0.75)';
      ctx.fillRect(x * cell + cell / 2 - s / 2, y * cell + cell / 2 - s / 2, s, s);
    }

    for (const cr of this.state.creatures) {
      const px = (cr.x + 0.5) * cell, py = (cr.y + 0.5) * cell;
      const rad = (1.6 + cr.g.sz * 2.6) * Math.max(0.55, cell / 8);
      ctx.save();
      ctx.translate(px, py);

      if (cr.name) {
        ctx.strokeStyle = 'rgba(251,191,36,0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(0, 0, rad + 3, 0, Math.PI * 2); ctx.stroke();
      }
      const pulse = 1 + Math.sin(now / 300 + cr.id) * 0.08;
      ctx.scale(pulse, pulse);
      if (cr.sp === 'H') {
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = `hsl(${cr.g.hue},68%,58%)`;
        ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
      } else {
        ctx.fillStyle = `hsl(${cr.g.hue},72%,42%)`;
        ctx.strokeStyle = `hsl(${cr.g.hue},80%,70%)`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(0, -rad * 1.4); ctx.lineTo(rad * 1.15, rad); ctx.lineTo(-rad * 1.15, rad);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();

      if (cr.name && cell >= 7) {
        ctx.fillStyle = 'rgba(251,191,36,0.95)';
        ctx.font = `${Math.max(9, cell * 1.15)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(cr.name, px, py - rad - 5);
      }
    }

    if (this.hover) {
      const { cx, cy } = this.hover;
      ctx.strokeStyle = 'rgba(216,228,245,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx * cell, cy * cell, cell, cell);
      if (this.armedPower) {
        const rr = (this.armedPower === 'meteor' ? 7 : 3) * cell;
        ctx.strokeStyle = this.armedPower === 'meteor' ? 'rgba(248,113,113,0.8)' : 'rgba(110,231,183,0.8)';
        ctx.beginPath(); ctx.arc((cx + .5) * cell, (cy + .5) * cell, rr, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  _xyFromEvent(e) {
    const rect = this.cv.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (this.cssW / rect.width);
    const sy = (e.clientY - rect.top) * (this.cssH / rect.height);
    return { x: sx, y: sy, cx: Math.floor(sx / this.cell), cy: Math.floor(sy / this.cell) };
  }

  _nearestCreature(wx, wy, maxDist) {
    let best = null, bd = maxDist * maxDist;
    for (const c of this.state.creatures) {
      const dx = (c.x + 0.5) * this.cell - wx, dy = (c.y + 0.5) * this.cell - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = c; }
    }
    return best;
  }

  _hover(e) {
    if (!this.state) return;
    const p = this._xyFromEvent(e);
    this.hover = p;
    const cr = this._nearestCreature(p.x, p.y, this.cell * 4);
    if (cr) {
      this.tooltip.innerHTML = cr.name
        ? `<b style="color:#fbbf24">${esc(cr.name)}</b><br>${cr.sp === 'H' ? '噬草獸' : '獵影獸'} · 第${cr.gen}代 · ${Math.floor(cr.age / 60)}h齡`
        : `${cr.sp === 'H' ? '噬草獸' : '獵影獸'} #${cr.id} · 第${cr.gen}代`;
      this.tooltip.hidden = false;
      this.tooltip.style.left = `${p.x + 14}px`;
      this.tooltip.style.top = `${p.y + 8}px`;
      this.cv.style.cursor = 'pointer';
    } else {
      this.tooltip.hidden = true;
      this.cv.style.cursor = this.armedPower ? 'crosshair' : 'default';
    }
  }

  _click(e) {
    if (!this.state) return;
    const p = this._xyFromEvent(e);
    if (this.armedPower) {
      this.onWorldClick?.(this.armedPower, clampX(p.cx), clampY(p.cy));
      return;
    }
    const cr = this._nearestCreature(p.x, p.y, this.cell * 4);
    if (cr) this.onSelect?.(cr);
  }
}

const clampX = (v) => Math.max(0, Math.min(95, v));
const clampY = (v) => Math.max(0, Math.min(53, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
