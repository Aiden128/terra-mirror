// Terra Mirror — DNS as the divine message bus.
// Interventions are carved into short-lived TXT records under _iv.*.terra.smarternic.com,
// consumed by the heartbeat, then erased. Genesis block lives beside them forever.

const ZONE = () => process.env.CF_ZONE_ID || '7dc2eb678c48cb2ca2014542748953ca';
const ROOT = 'terra.smarternic.com';

function headers() {
  return {
    Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function cf(method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE()}/${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json();
  if (!j.success) throw new Error(j.errors?.[0]?.message || `cf ${method} failed`);
  return j.result;
}

const encodePayload = (obj) => 'TM1.' + Buffer.from(JSON.stringify(obj)).toString('base64url');
const decodePayload = (txt) => {
  if (!txt.startsWith('TM1.')) return null;
  try {
    return JSON.parse(Buffer.from(txt.slice(4), 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

export async function carveIntervention({ id, action, args }) {
  const payload = { i: id.slice(0, 8), t: Date.now(), a: action, ...(args || {}) };
  const content = encodePayload(payload);
  if (content.length > 255) throw new Error('intervention too large');
  await cf('POST', 'dns_records', {
    type: 'TXT',
    name: `_iv.${payload.i}.${ROOT}`,
    content,
    ttl: 60,
  });
}

const isIvRecord = (name) =>
  name.startsWith('_iv.') && name.endsWith(`.${ROOT}`);

export async function listInterventions() {
  const recs = await cf(
    'GET',
    'dns_records?type=TXT&per_page=100&order=created_on&direction=asc'
  );
  return (recs || [])
    .filter((r) => isIvRecord(r.name))
    .map((r) => {
      const p = decodePayload(r.content);
      return p ? { recId: r.id, ...p } : null;
    })
    .filter(Boolean)
    .filter((p) => Date.now() - p.t < 3600e3);
}

export async function eraseIntervention(recId) {
  try {
    await cf('DELETE', `dns_records/${recId}`);
  } catch (e) {
    console.error('erase failed:', e.message);
  }
}
