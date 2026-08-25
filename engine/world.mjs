// Terra Mirror — the living world simulation
import { W, H, isDaylight, daylight, season, growthAt, earthToCell } from './climate.mjs';
import { randomGenome, mutate, genomeCost, lifespan, reproThreshold } from './genetics.mjs';
import { autoName } from './names.mjs';

// ---------- deterministic rng ----------
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- constants ----------
const CAP_PLANTS = 900;
const CAP_H = 160;
const CAP_P = 40;
const TICK_MS = 60000;          // 1 real minute = 1 world tick
const MAX_CATCHUP_TICKS = 30;
const CHRONICLE_CAP = 250;
const EVENTS_CAP = 60;
const HIST_CAP = 288;

// ---------- terrain ----------
function makeTerrain(seed) {
  const r = mulberry32(seed);
  // coarse value-noise grid
  const gw = 13, gh = 8;
  const noise = Array.from({ length: gh * gw }, () => r());
  const smooth = (x, y) => {
    const fx = (x / W) * (gw - 1), fy = (y / H) * (gh - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const v =
      noise[y0 * gw + x0] * (1 - sx) * (1 - sy) +
      noise[y0 * gw + x1] * sx * (1 - sy) +
      noise[y1 * gw + x0] * (1 - sx) * sy +
      noise[y1 * gw + x1] * sx * sy;
    return v;
  };
  const terr = new Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // temperate belts are fertile; poles and deserts less so
      const latN = 1 - (2 * y) / H;
      const belt = Math.exp(-Math.pow((Math.abs(latN) - 0.45) / 0.28, 2));
      const v = smooth(x, y) * 0.72 + belt * 0.42;
      terr[y * W + x] = Math.max(0, Math.min(9, Math.floor(v * 11)));
    }
  }
  return terr;
}

// ---------- genesis ----------
export function createWorld(seed = Date.now() % 2147483647) {
  const r = mulberry32(seed);
  const st = {
    v: 1,
    seed,
    tick: 0,
    epoch: 1,
    epochStartTick: 0,
    lastRealTime: Date.now(),
    terrain: makeTerrain(seed),
    plants: [],
    creatures: [],
    nextId: 1,
    rainTicks: 0,
    real: { kp: null, quakes: [], fetchedAt: 0 },
    stats: { popH: 0, popP: 0, plants: 0, birthsThisEpoch: 0, deathsThisEpoch: 0 },
    hist: [],
    events: [],
    chronicle: [],
    divine: { pool: 200, dayStamp: utcDay(), spentToday: {} },
    meta: {
      genesis: false,
      totalBirths: 0,
      totalDeaths: 0,
      maxPopH: 0,
      maxPopP: 0,
      extinctStreak: 0,
      quakeIds: [],
    },
  };
  // seed life
  for (let i = 0; i < 420; i++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H);
    if (st.terrain[y * W + x] >= 4) st.plants.push({ i: y * W + x, e: 8 + r() * 14 });
  }
  for (let k = 0; k < 12; k++) spawnCreature(st, 'H', r);
  for (let k = 0; k < 4; k++) spawnCreature(st, 'P', r);
  chron(st, `創世。太陽直射點落在東經 ${Math.round(subsolarLonNow())}°，第一株植物在鏡地甦醒。`, '🌱');
  return st;
}

function subsolarLonNow() {
  const d = new Date();
  return 180 - (d.getUTCHours() + d.getUTCMinutes() / 60) * 15;
}

function utcDay() {
  return Math.floor(Date.now() / 86400000);
}

function spawnCreature(st, sp, r, g = null, parent = null, x = null, y = null) {
  if (x == null) {
    let tries = 0;
    do {
      x = Math.floor(r() * W);
      y = Math.floor(r() * H);
    } while (st.terrain[y * W + x] < 3 && ++tries < 20);
  }
  const c = {
    id: st.nextId++,
    sp,
    x, y,
    g: g || randomGenome(r),
    e: 55 + r() * 25,
    age: 0,
    gen: parent ? parent.gen + 1 : 0,
    parent: parent ? parent.id : null,
    name: null,
  };
  st.creatures.push(c);
  return c;
}

// ---------- chronicle / events ----------
function chron(st, txt, ic = '•') {
  st.chronicle.push({ rt: new Date().toISOString(), tk: st.tick, ep: st.epoch, ic, txt });
  if (st.chronicle.length > CHRONICLE_CAP) st.chronicle.splice(0, st.chronicle.length - CHRONICLE_CAP);
}
function ev(st, txt) {
  st.events.push({ tk: st.tick, txt });
  if (st.events.length > EVENTS_CAP) st.events.splice(0, st.events.length - EVENTS_CAP);
}

// ---------- helpers ----------
const idx = (x, y) => ((y + H) % H) * W + ((x + W) % W);

function findNearest(st, cx, cy, list, maxR2) {
  let best = null, bd = Infinity;
  for (const p of list) {
    const px = p.i != null ? p.i % W : p.x;
    const py = p.i != null ? Math.floor(p.i / W) : p.y;
    const dx = px - cx, dy = py - cy;
    // torus-aware distance
    const wx = dx > W / 2 ? dx - W : dx < -W / 2 ? dx + W : dx;
    const wy = dy > H / 2 ? dy - H : dy < -H / 2 ? dy + H : dy;
    const d2 = wx * wx + wy * wy;
    if (d2 <= maxR2 && d2 < bd) { bd = d2; best = { t: p, x: px, y: py }; }
  }
  return best;
}

function moveToward(c, tx, ty, speed) {
  let dx = tx - c.x, dy = ty - c.y;
  if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
  if (dy > H / 2) dy -= H; if (dy < -H / 2) dy += H;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const step = Math.min(dist, speed);
  c.x = ((c.x + (dx / dist) * step) % W + W) % W | 0;
  c.y = ((c.y + (dy / dist) * step) % H + H) % H | 0;
}

function drift(c, speed, r) {
  const ang = r() * Math.PI * 2;
  c.x = (((c.x + Math.cos(ang) * speed) % W) + W) % W | 0;
  c.y = (((c.y + Math.sin(ang) * speed) % H) + H) % H | 0;
}

// ---------- main advance ----------
export function advanceWorld(st, ticks, now = Date.now()) {
  const r = mulberry32((st.seed ^ st.tick) + ticks);
  const seas = season(new Date(now));
  const kp = st.real.kp;
  const radiation = kp != null && kp >= 5 ? 1 + (kp - 4) * 0.35 : 1;
  const rainBoost = st.rainTicks > 0;

  for (let t = 0; t < ticks; t++) {
    st.tick++;

    // --- plants ---
    if (st.plants.length < CAP_PLANTS) {
      const newborns = [];
      for (const p of st.plants) {
        const x = p.i % W, y = Math.floor(p.i / W);
        const light = daylight(x, new Date(now));
        const fert = st.terrain[p.i];
        p.e += 1.6 * light * growthAt(y, seas) * (fert / 9) * (rainBoost ? 1.8 : 1);
        if (p.e > 26 && r() < 0.05 && st.plants.length + newborns.length < CAP_PLANTS) {
          const nx = x + Math.floor(r() * 5) - 2, ny = y + Math.floor(r() * 5) - 2;
          const ni = idx(nx, ny);
          if (st.terrain[ni] >= 3) { p.e -= 12; newborns.push({ i: ni, e: 10 }); }
        }
      }
      st.plants.push(...newborns);
    }

    // --- creatures ---
    const born = [];
    const dead = [];
    const byId = new Map(st.creatures.map((c) => [c.id, c]));
    const grazers = st.creatures.filter((c) => c.sp === 'H' && !dead.includes(c));

    for (const c of st.creatures) {
      if (dead.includes(c)) continue;
      c.age++;
      const lifeCap = lifespan(c.g);
      const cost = genomeCost(c.g) * 0.34;
      c.e -= cost;

      if (c.e <= 0 || c.age > lifeCap) { dead.push(c.id); continue; }

      if (c.sp === 'H') {
        const senseR2 = 4 + c.g.sns * 120;
        const target = findNearest(st, c.x, c.y, st.plants, senseR2);
        if (target) {
          moveToward(c, target.x, target.y, 0.6 + c.g.spd * 2.2);
          if (Math.abs(target.x - c.x) <= 1 && Math.abs(target.y - c.y) <= 1) {
            const bite = Math.min(target.t.e, 10 + c.g.sz * 12);
            target.t.e -= bite;
            c.e += bite * 0.85;
          }
        } else {
          drift(c, 0.5 + c.g.spd, r);
        }
        // reproduce
        if (
          c.e > reproThreshold(c.g) &&
          st.creatures.length + born.length < CAP_H + CAP_P &&
          grazers.filter((g2) => !dead.includes(g2.id)).length + born.filter((b) => b.sp === 'H').length < CAP_H &&
          r() < 0.06
        ) {
          c.e *= 0.45;
          born.push(spawnCreature(st, 'H', r, mutate(c.g, 0.18, radiation, r), c, c.x, c.y));
        }
      } else {
        // predator hunts grazers
        const prey = findNearest(
          st, c.x, c.y,
          st.creatures.filter((o) => o.sp === 'H' && !dead.includes(o.id)),
          9 + c.g.sns * 260
        );
        if (prey) {
          moveToward(c, prey.x, prey.y, 0.7 + c.g.spd * 2.6);
          if (Math.abs(prey.x - c.x) <= 1 && Math.abs(prey.y - c.y) <= 1 && r() < 0.35 + c.g.sz * 0.4) {
            const pc = byId.get(prey.t.id);
            if (pc && !dead.includes(pc.id)) {
              c.e = Math.min(c.e + pc.e * 0.7 + 22, 190);
              dead.push(pc.id);
              ev(st, `${c.sp === 'P' ? '獵影' : '獸'} #${c.id} 捕食了 #${pc.id}`);
            }
          }
        } else {
          drift(c, 0.6 + c.g.spd, r);
        }
        if (
          c.e > reproThreshold(c.g) + 30 &&
          st.creatures.filter((o) => o.sp === 'P').length + born.filter((b) => b.sp === 'P').length < CAP_P &&
          r() < 0.04
        ) {
          c.e *= 0.5;
          born.push(spawnCreature(st, 'P', r, mutate(c.g, 0.18, radiation, r), c, c.x, c.y));
        }
      }
    }

    // remove dead, add born
    if (dead.length) {
      const dset = new Set(dead);
      for (const c of st.creatures) {
        if (dset.has(c.id)) {
          st.stats.deathsThisEpoch++;
          st.meta.totalDeaths++;
          if (c.name) chron(st, `${c.name}（${c.sp === 'H' ? '噬草獸' : '獵影獸'}）殞落了。`, '🥀');
          // corpse returns a little energy to the soil
          if (st.plants.length < CAP_PLANTS && r() < 0.5) {
            st.plants.push({ i: idx(c.x, c.y), e: 6 + c.g.sz * 10 });
          }
        }
      }
      st.creatures = st.creatures.filter((c) => !dset.has(c.id));
    }
    if (born.length) {
      for (const b of born) {
        st.stats.birthsThisEpoch++;
        st.meta.totalBirths++;
        if (b.gen >= 8 && r() < 0.15) ev(st, `第 ${b.gen} 代「${autoName(b.sp, b.id)}」誕生`);
      }
      st.creatures.push(...born);
    }

    // --- geomagnetic storm edges ---
    if (t === 0) maybeStormChron(st, kp);

    // --- apply queued divine interventions (once per advance batch) ---
    if (t === 0) applyInterventions(st, r);
    if (st.rainTicks > 0) st.rainTicks--;

    // --- history sample ---
    if (st.tick % 5 === 0) {
      st.hist.push({
        t: st.tick,
        h: st.creatures.filter((c) => c.sp === 'H').length,
        p: st.creatures.filter((c) => c.sp === 'P').length,
        pl: st.plants.length,
      });
      if (st.hist.length > HIST_CAP) st.hist.shift();
    }
  }

  // --- extinction watch / panspermia ---
  const pH = st.creatures.filter((c) => c.sp === 'H').length;
  const pP = st.creatures.filter((c) => c.sp === 'P').length;
  st.stats.popH = pH; st.stats.popP = pP; st.stats.plants = st.plants.length;
  st.meta.maxPopH = Math.max(st.meta.maxPopH, pH);
  st.meta.maxPopP = Math.max(st.meta.maxPopP, pP);

  if (pH === 0 && pP === 0) {
    st.meta.extinctStreak += ticks;
    if (st.meta.extinctStreak >= 90) {
      const r2 = mulberry32(st.seed + st.tick);
      for (let k = 0; k < 12; k++) spawnCreature(st, 'H', r2);
      for (let k = 0; k < 4; k++) spawnCreature(st, 'P', r2);
      st.meta.extinctStreak = 0;
      st.epoch++;
      st.epochStartTick = st.tick;
      chron(st, `大滅絕之後，方舟開啟。新的血脈進入鏡地 —— 第 ${st.epoch} 紀元開始。`, '⛵');
    }
  } else {
    st.meta.extinctStreak = 0;
  }

  // --- mass-extinction → new epoch ---
  if (st.epochStartTick < st.tick - 4000 && st.stats.deathsThisEpoch > 500) {
    st.epoch++;
    st.epochStartTick = st.tick;
    st.stats.birthsThisEpoch = 0; st.stats.deathsThisEpoch = 0;
    chron(st, `舊秩序崩解，倖存者散入荒野 —— 第 ${st.epoch} 紀元揭幕。`, '🌋');
  }

  // --- divine pool refill ---
  const today = utcDay();
  if (today !== st.divine.dayStamp) {
    st.divine.pool = Math.min(240, st.divine.pool + 120);
    st.divine.dayStamp = today;
    st.divine.spentToday = {};
  }

  st.lastRealTime = now;
  return st;
}

function maybeStormChron(st, kp) {
  const prev = st.real._prevKp ?? kp ?? 0;
  if (kp != null && kp >= 5 && prev < 5) {
    chron(st, `地磁風暴侵襲（Kp ${kp.toFixed(1)}）。輻射穿過大氣，突變率上升，夜空中泛起極光。`, '🌌');
  }
  st.real._prevKp = kp;
}

// ---------- real earthquakes → mirror disasters ----------
export function applyQuakes(st, quakes) {
  if (!Array.isArray(quakes)) return;
  const seen = new Set(st.meta.quakeIds || []);
  let newIds = [];
  for (const q of quakes) {
    if (!q || q.mag == null) continue;
    const qid = `${q.time}|${Math.round(q.lon * 10)}|${Math.round(q.lat * 10)}`;
    if (seen.has(qid)) continue;
    newIds.push(qid);
    if (q.mag >= 5) {
      const { x, y } = earthToCell(q.lon, q.lat);
      const rad = Math.floor(q.mag / 2) + 2;
      const r = mulberry32(st.seed ^ Math.floor(q.lon * 100));
      const beforeC = st.creatures.length;
      const beforeP = st.plants.length;
      st.creatures = st.creatures.filter(
        (c) => Math.hypot(c.x - x, c.y - y) > rad
      );
      st.plants = st.plants.filter((p) => {
        const px = p.i % W, py = Math.floor(p.i / W);
        return Math.hypot(px - x, py - y) > rad;
      });
      const lost = beforeC - st.creatures.length + (beforeP - st.plants.length);
      chron(
        st,
        `現實中規模 ${q.mag.toFixed(1)} 的地震${q.place ? `（${q.place}）` : ''}撼動了鏡地 (${x},${y}) —— 半徑 ${rad} 格內的生命被大地吞沒。`,
        '🌍'
      );
      if (lost > 0) ev(st, `地震帶走 ${lost} 個生命`);
      // aftershock fertility: life returns stronger at edges
      for (let k = 0; k < 6 && st.plants.length < CAP_PLANTS; k++) {
        const nx = x + Math.floor(r() * (rad * 2 + 4)) - rad - 2;
        const ny = y + Math.floor(r() * (rad * 2 + 4)) - rad - 2;
        const ni = idx(nx, ny);
        if (st.terrain[ni] >= 3) st.plants.push({ i: ni, e: 14 });
      }
    }
  }
  st.meta.quakeIds = [...seen, ...newIds].slice(-80);
}

// ---------- divine interventions ----------
const DIVINE_COST = { seed_plant: 5, rain: 15, meteor: 40, name_creature: 2 };

export function applyInterventions(st, r) {
  // st._pending is injected by tick runner before advancing
  const q = st._pending || [];
  if (!q.length) return;
  for (const iv of q) {
    try {
      const cost = DIVINE_COST[iv.action] ?? 0;
      if (!cost || st.divine.pool < cost) continue;
      switch (iv.action) {
        case 'seed_plant': {
          const { x, y } = iv.args;
          if (st.plants.length < CAP_PLANTS && st.terrain[idx(x, y)] >= 2) {
            st.plants.push({ i: idx(x, y), e: 26 });
            ev(st, `🌿 一顆神諭之種在 (${x},${y}) 生根`);
          }
          break;
        }
        case 'rain': {
          st.rainTicks = Math.min(90, st.rainTicks + 30);
          ev(st, `🌧️ 甘霖降下 —— 植物生長加速`);
          break;
        }
        case 'meteor': {
          const { x, y } = iv.args;
          let killed = 0;
          st.plants = st.plants.filter((p) => {
            const px = p.i % W, py = Math.floor(p.i / W);
            const keep = Math.hypot(px - x, py - y) > 7;
            if (!keep) killed++;
            return keep;
          });
          const before = st.creatures.length;
          st.creatures = st.creatures.filter(
            (c) => Math.hypot(c.x - x, c.y - y) > 7
          );
          killed += before - st.creatures.length;
          chron(st, `一顆隕石墜落在 (${x},${y})，半徑七格內化為焦土。${killed ? `${killed} 個生命消逝。` : ''}`, '☄️');
          break;
        }
        case 'name_creature': {
          const c = st.creatures.find((k) => k.id === iv.args.cid);
          if (c && !c.name) {
            const nm = String(iv.args.name).slice(0, 20).trim();
            if (nm) {
              c.name = nm;
              ev(st, `✨ 「${nm}」被賜名`);
              chron(st, `一位訪客將名字賜予了 ${autoName(c.sp, c.id)} —— 牠現在叫做「${nm}」。`, '✨');
            }
          }
          break;
        }
      }
      st.divine.pool -= cost;
    } catch (e) {
      console.error('intervention failed', iv?.action, e.message);
    }
  }
  st._pendingApplied = q.map((v) => v.id);
  st._pending = [];
}
