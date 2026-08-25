// Terra Mirror — Oracle API (Vercel function).
// Visitor whispers are carved into DNS TXT records; the heartbeat reads them.
// Requires only a zone-scoped Cloudflare token — no GitHub credentials here.

const COSTS = { seed_plant: 5, rain: 15, meteor: 40, name_creature: 2 };

// in-memory only: per-serverless-instance, resets on cold start
const hits = new Map();

function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 6;
}

function sanitizeName(s) {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 20);
}

function validate(action, args) {
  if (!COSTS[action]) return 'unknown action';
  switch (action) {
    case 'seed_plant':
    case 'meteor': {
      const x = Number(args?.x), y = Number(args?.y);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= 96 || y < 0 || y >= 54)
        return 'invalid coordinates';
      break;
    }
    case 'rain':
      break;
    case 'name_creature': {
      if (!Number.isInteger(Number(args?.cid))) return 'invalid creature id';
      if (!sanitizeName(args?.name)) return 'empty name';
      break;
    }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch {}

  const err = validate(body.action, body.args);
  if (err) return res.status(400).json({ error: err });

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'slow down, deity' });
  if (!process.env.CF_API_TOKEN)
    return res.status(503).json({ error: 'oracle offline' });

  try {
    const { carveIntervention } = await import('../engine/dnsq.mjs');
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await carveIntervention({
      id,
      action: body.action,
      args:
        body.action === 'name_creature'
          ? { cid: Number(body.args.cid), name: sanitizeName(body.args.name) }
          : body.action === 'rain'
            ? {}
            : { x: Number(body.args.x), y: Number(body.args.y) },
    });
    return res.status(200).json({
      ok: true,
      id,
      cost: COSTS[body.action],
      via: 'dns',
      note: '下一個心跳（≤5 分鐘）生效',
    });
  } catch (e) {
    console.error('oracle error:', e.message);
    return res.status(500).json({ error: 'the oracle is silent' });
  }
}
