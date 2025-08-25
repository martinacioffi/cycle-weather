// ---------- Math & Geospatial Utilities ----------
export const toRad = d => (d * Math.PI) / 180;

export function getPercentInput(id) {
  const raw = document.getElementById(id)?.value;
  const val = parseFloat(raw);
  return isFinite(val) ? val / 100 : 0;
}

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function bearing(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const λ1 = toRad(lon1), λ2 = toRad(lon2);
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  const θ = Math.atan2(y, x);
  return (θ * 180 / Math.PI + 360) % 360;
}

// ---------- Formatting ----------
export function formatKm(m) {
  return (m / 1000).toFixed(2) + " km";
}

export function formatDuration(seconds) {
  if (!isFinite(seconds) || seconds <= 0) return "–";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (h) parts.push(h + "h");
  parts.push((m < 10 && h ? "0" : "") + m + "m");
  return parts.join(" ");
}

export function speedToMps(val, unit) {
  const v = parseFloat(val);
  if (!isFinite(v) || v <= 0) return 0;
  if (unit === "kmh") return v / 3.6;
  if (unit === "mph") return v * 0.44704;
  return v; // m/s
}

export function utcHourISO(d) {
  const date = new Date(d.getTime());
  const mins = date.getUTCMinutes();
  const secs = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();
  if (mins > 30 || (mins === 30 && (secs > 0 || ms > 0))) {
    date.setUTCHours(date.getUTCHours() + 1);
  }
  date.setUTCMinutes(0, 0, 0);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d2 = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${d2}T${h}:00`;
}

// ---------- Logging ----------
export function log(msg) {
  const el = document.getElementById("log");
  el.textContent += (el.textContent ? "\n" : "") + msg;
  el.scrollTop = el.scrollHeight;
}

// ---------- Color Interpolation ----------
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}

export function rgbToHex({ r, g, b }) {
  const c = x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}

export function lerpColor(c1, c2, t) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  return rgbToHex({
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t)
  });
}

export const PALETTE = ["#2c7bb6", "#abd9e9", "#ffffbf", "#fdae61", "#d7191c"];

export function colorFromPalette(t01) {
  const n = PALETTE.length - 1;
  if (t01 <= 0) return PALETTE[0];
  if (t01 >= 1) return PALETTE[n];
  const pos = t01 * n;
  const i = Math.floor(pos);
  const frac = pos - i;
  return lerpColor(PALETTE[i], PALETTE[i + 1], frac);
}

export function makeTempColorer(minTemp, maxTemp) {
  const span = Math.max(0.1, maxTemp - minTemp);
  return function tempToColorDynamic(tempC) {
    const t = Math.max(minTemp, Math.min(maxTemp, tempC));
    const pct = (t - minTemp) / span;
    return colorFromPalette(pct);
  };
}

export function updateLegend(minTemp, maxTemp) {
  const bar = document.getElementById("legendBar");
  const ticks = document.getElementById("legendTicks");
  const stops = PALETTE.map((c, i, arr) => {
    const pct = Math.round((i / (arr.length - 1)) * 100);
    return `${c} ${pct}%`;
  }).join(", ");
  bar.style.background = `linear-gradient(90deg, ${stops})`;

  const t0 = minTemp;
  const t1 = minTemp + (maxTemp - minTemp) * 0.25;
  const t2 = minTemp + (maxTemp - minTemp) * 0.5;
  const t3 = minTemp + (maxTemp - minTemp) * 0.75;
  const t4 = maxTemp;
  ticks.innerHTML = `
    <span>${t0.toFixed(0)}</span>
    <span>${t1.toFixed(0)}</span>
    <span>${t2.toFixed(0)}</span>
    <span>${t3.toFixed(0)}</span>
    <span>${t4.toFixed(0)}</span>
  `;
}