const STATE_URL =
  'https://raw.githubusercontent.com/Aiden128/terra-mirror/main/state/world.json';

export async function fetchState() {
  const res = await fetch(`${STATE_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`state fetch ${res.status}`);
  return res.json();
}

export function intervene(action, args = {}) {
  return fetch('/api/intervene', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }),
  }).then(async (res) => {
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `oracle ${res.status}`);
    return j;
  });
}
