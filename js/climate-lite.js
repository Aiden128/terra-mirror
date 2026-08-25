const W = 96, H = 54;

function dayOfYear(d) {
  return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
}

export function subsolarLon(now) {
  const h = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  return 180 - h * 15;
}

export function daylight(x, now) {
  const lon = (x / W) * 360 - 180;
  let d = ((lon - subsolarLon(now) + 540) % 360) - 180;
  if (Math.abs(d) >= 90) return 0;
  return Math.cos((d * Math.PI) / 180);
}

export function season(now) {
  return Math.sin(((2 * Math.PI) / 365) * (dayOfYear(now) - 81));
}

export { W, H };
