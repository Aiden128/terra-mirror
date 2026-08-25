import { intervene } from './net.js';

const $ = (id) => document.getElementById(id);

export function renderChronicle(chronicle) {
  const ol = $('chronicle-list');
  ol.innerHTML = '';
  for (const c of [...chronicle].reverse().slice(0, 60)) {
    const li = document.createElement('li');
    const d = new Date(c.rt);
    const t = `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
    li.innerHTML = `<span class="ic">${c.ic || '•'}</span><time>${t}</time><span>${esc(c.txt)}</span>`;
    ol.appendChild(li);
  }
}

export function renderEvents(events) {
  $('event-list').innerHTML = events
    .slice(-14)
    .reverse()
    .map((e) => `<li>${esc(e.txt)}</li>`)
    .join('');
}

export function updateChips(st) {
  const now = new Date();
  $('chip-clock').querySelector('span').textContent =
    `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}Z`;
  const kp = st.real?.kp;
  const kpEl = $('chip-kp');
  kpEl.querySelector('span').textContent = kp != null ? kp.toFixed(1) : '—';
  kpEl.style.borderColor = kp >= 5 ? 'rgba(167,139,250,.7)' : '';
  const bigQuakes = (st.real?.quakes || []).filter((q) => q.mag >= 4.5).length;
  $('chip-quake').querySelector('span').textContent = `${bigQuakes} 強`;
  $('chip-epoch').querySelector('span').textContent = st.epoch;
  $('chip-tick').querySelector('span').textContent = `tick ${st.tick}`;

  const h = st.creatures.filter((c) => c.sp === 'H').length;
  const p = st.creatures.filter((c) => c.sp === 'P').length;
  $('stat-pop').textContent = `噬草獸 ${h} · 獵影獸 ${p}`;
  $('stat-plants').textContent = `植物 ${st.plants.length}`;
  $('stat-daynight').textContent = `誕生總數 ${st.meta.totalBirths} · 殞落總數 ${st.meta.totalDeaths}`;
}

export function updateDivinePool(pool) {
  $('divine-pool').textContent = `${Math.floor(pool)} / 240`;
}

const GENES = [
  ['spd', '速度', '#6ee7b7'],
  ['sns', '感知', '#7dd3fc'],
  ['met', '代謝', '#fbbf24'],
  ['sz', '體型', '#f472b6'],
];

let selectedId = null;

export function showInspector(cr, onRefresh) {
  selectedId = cr.id;
  $('panel-inspector').hidden = false;
  const body = $('inspector-body');
  const rows = GENES.map(
    ([k, label, color]) => `
    <div class="genome-row">
      <div class="glabel"><span>${label}</span><span>${(cr.g[k] * 100).toFixed(0)}</span></div>
      <div class="gbar"><i style="width:${cr.g[k] * 100}%;background:${color}"></i></div>
    </div>`
  ).join('');

  body.innerHTML = `
    <div class="cname">${cr.name ? esc(cr.name) : `<i style="color:var(--dim)">未命名</i>`}</div>
    <div class="meta-line">${cr.sp === 'H' ? '噬草獸 Grazer' : '獵影獸 Stalker'} · #${cr.id} · 第 ${cr.gen} 代${cr.parent ? ` · 母系 #${cr.parent}` : ''}</div>
    <div class="meta-line">年齡 ${(cr.age / 60).toFixed(1)} 世界時 · 能量 ${Math.round(cr.e)} · 色相 ${Math.round(cr.g.hue)}°</div>
    <div style="margin-top:8px;display:flex;align-items:center;gap:8px">
      <span style="width:22px;height:22px;border-radius:50%;background:hsl(${cr.g.hue},68%,58%);display:inline-block"></span>
      <span class="meta-line">基因組決定牠的一切</span>
    </div>
    ${rows}
    ${
      cr.name
        ? ''
        : `<form id="name-form">
      <input maxlength="20" placeholder="賜予名字…" required>
      <button type="submit">命名 ✨2</button>
    </form>`
    }
  `;
  const form = $('name-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const name = form.querySelector('input').value.trim();
      if (!name) return;
      try {
        await intervene('name_creature', { cid: cr.id, name });
        form.innerHTML = `<span style="color:var(--accent);font-size:13px">神諭已送出 — 下一個心跳生效（≤5 分鐘）</span>`;
        onRefresh?.();
      } catch (err) {
        alert(err.message);
      }
    };
  }
}

$('inspector-close').onclick = () => {
  $('panel-inspector').hidden = true;
};

export function wireDivineButtons(onArm, onFire) {
  let armed = null;
  document.querySelectorAll('.powers button').forEach((btn) => {
    btn.onclick = () => {
      if (armed === btn.dataset.power) {
        disarm();
        return;
      }
      armed = btn.dataset.power;
      document.querySelectorAll('.powers button').forEach((b) => b.classList.remove('armed'));
      btn.classList.add('armed');
      onArm(armed);
    };
  });
  const disarm = () => {
    armed = null;
    document.querySelectorAll('.powers button').forEach((b) => b.classList.remove('armed'));
    onArm(null);
  };
  return {
    fire: async (power, x, y) => {
      try {
        await intervene(power, { x, y });
        disarm();
        onFire?.(power);
      } catch (err) {
        alert(err.message);
      }
    },
    isArmed: () => armed,
  };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
