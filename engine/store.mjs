// Terra Mirror — persistence: local file store (Actions context) + genesis block
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createWorld } from './world.mjs';

const WORLD_PATH = new URL('../state/world.json', import.meta.url).pathname;
const PENDING_PATH = new URL('../state/pending.json', import.meta.url).pathname;

export function loadWorld() {
  try {
    if (existsSync(WORLD_PATH)) {
      const st = JSON.parse(readFileSync(WORLD_PATH, 'utf8'));
      if (st && st.v === 1) return st;
    }
  } catch (e) {
    console.error('load failed, creating new world:', e.message);
  }
  return createWorld();
}

export function saveWorld(st) {
  const clean = { ...st };
  delete clean._pending;
  delete clean._pendingApplied;
  writeFileSync(WORLD_PATH, JSON.stringify(clean));
}

export function loadPending() {
  try {
    if (existsSync(PENDING_PATH)) return JSON.parse(readFileSync(PENDING_PATH, 'utf8'));
  } catch { /* corrupt queue → drop */ }
  return [];
}

export function savePending(list) {
  writeFileSync(PENDING_PATH, JSON.stringify(list));
}

// Genesis block: carve the world's birth into a DNS TXT record.
// The world's memory lives in the Domain Name System — nobody does this.
export async function writeGenesisBlock(st) {
  if (st.meta.genesis) return;
  const token = process.env.CF_API_TOKEN;
  const zone = process.env.CF_ZONE_ID || '7dc2eb678c48cb2ca2014542748953ca';
  if (!token) {
    console.log('genesis: no CF token, skipping (will retry next tick)');
    return;
  }
  const name = '_genesis.terra.smarternic.com';
  const content = `TERRA-MIRROR v1 seed=${st.seed} born=${new Date(st.lastRealTime).toISOString()} grid=96x54`;
  try {
    // create (ignore "already exists" errors)
    await cf(zone, 'POST', 'dns_records', { type: 'TXT', name, content, ttl: 3600 });
    console.log('genesis block carved into DNS:', name);
  } catch (e) {
    console.log('genesis dns:', e.message);
  }
  st.meta.genesis = true;
}

async function cf(zone, method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json();
  if (!j.success) throw new Error(j.errors?.[0]?.message || `cf ${method} ${path} failed`);
  return j.result;
}
function token() {
  return process.env.CF_API_TOKEN;
}
