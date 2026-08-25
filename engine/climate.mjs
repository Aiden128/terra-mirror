// Terra Mirror — real-world coupling: sun, season, quakes (USGS), geomagnetic Kp (NOAA)

export const W = 96;
export const H = 54;

// --- Solar position -------------------------------------------------------
// day of year
function doy(d) {
  return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
}

export function solarDeclination(now = new Date()) {
  // ±23.44°, approximation good to ~1°
  return 23.44 * Math.sin(((2 * Math.PI) / 365) * (doy(now) - 81));
}

// Subsolar longitude: where it is local noon right now.
export function subsolarLon(now = new Date()) {
  const utcH =
    now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  return 180 - utcH * 15; // wraps
}

// Is the cell at grid-x in daylight? x∈[0,W) maps to lon [-180,180)
export function isDaylight(x, now = new Date()) {
  const lon = (x / W) * 360 - 180;
  let d = ((lon - subsolarLon(now) + 540) % 360) - 180; // signed distance from noon meridian
  return Math.abs(d) < 90;
}

// 0..1 light intensity for rendering/photynthesis
export function daylight(x, now = new Date()) {
  const lon = (x / W) * 360 - 180;
  let d = ((lon - subsolarLon(now) + 540) % 360) - 180;
  if (Math.abs(d) >= 90) return 0;
  return Math.cos((d * Math.PI) / 180); // 1 at noon → 0 at terminator
}

// Season: -1 deep winter … +1 high summer for northern hemisphere band
export function season(now = new Date()) {
  return Math.sin(((2 * Math.PI) / 365) * (doy(now) - 81));
}

// Growth multiplier by latitude band y (y=0 top = north pole side)
export function growthAt(y, monthSeason) {
  const latN = 1 - (2 * y) / H; // +1 north … -1 south
  const localSummer = monthSeason * latN; // hemisphere-aware
  return 0.55 + 0.45 * Math.max(0.05, (localSummer + 1) / 2);
}

// Map real Earth coords onto the world grid
export function earthToCell(lon, lat) {
  return {
    x: Math.min(W - 1, Math.max(0, Math.floor((((lon + 180) % 360) / 360) * W))),
    y: Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H))),
  };
}

// --- Live feeds (public, no keys) -----------------------------------------
async function fetchJSON(url, ms = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { 'User-Agent': 'terra-mirror/1.0 (world simulation; contact via domain)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchQuakes() {
  try {
    // significant quakes over the last 6h — small payload
    const j = await fetchJSON(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'
    );
    const cutoff = Date.now() - 12 * 3600e3;
    return j.features
      .map((f) => ({
        mag: f.properties.mag ?? 0,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        place: f.properties.place || '',
        time: f.properties.time,
      }))
      .filter((q) => q.time > cutoff && q.mag != null)
      .sort((a, b) => b.time - a.time)
      .slice(0, 30);
  } catch {
    return null; // keep cached
  }
}

export async function fetchKp() {
  try {
    const j = await fetchJSON(
      'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'
    );
    const rows = (Array.isArray(j) ? j : []).filter(
      (r) => r && r.Kp != null && !isNaN(parseFloat(r.Kp))
    );
    if (!rows.length) return null;
    return parseFloat(rows[rows.length - 1].Kp);
  } catch {
    return null;
  }
}
