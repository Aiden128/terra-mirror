#!/usr/bin/env node
// Terra Mirror — heartbeat. Runs in GitHub Actions every 5 minutes.
// The world advances whether or not anyone is watching.
import { loadWorld, saveWorld, writeGenesisBlock } from './store.mjs';
import { advanceWorld, applyQuakes } from './world.mjs';
import { fetchQuakes, fetchKp } from './climate.mjs';
import { listInterventions, eraseIntervention } from './dnsq.mjs';

const TICK_MS = 60000;
const MAX_CATCHUP = 60;

async function main() {
  const st = loadWorld();
  const now = Date.now();

  let ticks = Math.round((now - st.lastRealTime) / TICK_MS);
  if (!isFinite(ticks) || ticks < 1) ticks = 1;
  if (ticks > MAX_CATCHUP) ticks = MAX_CATCHUP;

  const [quakes, kp] = await Promise.all([fetchQuakes(), fetchKp()]);
  if (kp != null) st.real.kp = kp;
  if (quakes) st.real.quakes = quakes;
  st.real.fetchedAt = now;

  // divine whispers arrive through DNS
  try {
    const pending = await listInterventions();
    if (pending.length) {
      st._pending = pending.map((p) => ({ id: p.i, action: p.a, args: p }));
      st._pendingRecIds = pending.map((p) => p.recId);
    }
  } catch (e) {
    console.error('dns queue read failed:', e.message);
  }

  applyQuakes(st, quakes || []);
  advanceWorld(st, ticks, now);

  for (const recId of st._pendingRecIds || []) await eraseIntervention(recId);
  delete st._pending;
  delete st._pendingRecIds;

  await writeGenesisBlock(st);
  saveWorld(st);

  const popH = st.creatures.filter((c) => c.sp === 'H').length;
  const popP = st.creatures.filter((c) => c.sp === 'P').length;
  console.log(
    `[tick ${st.tick}] +${ticks} | plants=${st.plants.length} H=${popH} P=${popP} | kp=${st.real.kp ?? '?'} | quakes=${(st.real.quakes || []).length} | epoch ${st.epoch}`
  );
}

main().catch((e) => {
  console.error('heartbeat error:', e);
  process.exit(0);
});
