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

export function roundToNearestQuarter(date) {
  const rounded = new Date(date); // clone the original date
  const minutes = rounded.getMinutes();
  const remainder = minutes % 15;

  if (remainder < 8) {
    rounded.setMinutes(minutes - remainder);
  } else {
    rounded.setMinutes(minutes + (15 - remainder));
  }

  rounded.setSeconds(0);
  rounded.setMilliseconds(0);

  // Format as local time: YYYY-MM-DDTHH:MM
  const yyyy = rounded.getFullYear();
  const mm = String(rounded.getMonth() + 1).padStart(2, "0");
  const dd = String(rounded.getDate()).padStart(2, "0");
  const hh = String(rounded.getHours()).padStart(2, "0");
  const min = String(rounded.getMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

// ---------- Logging ----------
export function log(msg) {
  const el = document.getElementById("log");
  el.textContent += (el.textContent ? "\n" : "") + msg;
  el.scrollTop = el.scrollHeight;
}

// ---------- Color Interpolation ----------
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}

function rgbToHex({ r, g, b }) {
  const c = x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}

function lerpColor(c1, c2, t) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  return rgbToHex({
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t)
  });
}

const TEMP_PALETTE = ["#2c7bb6", "#abd9e9", "#ffffbf", "#fdae61", "#d7191c"];
const WIND_PALETTE = ["#d7191c", "#fdae61", "#cccccc", "#a6d96a", "#1a9641"];

function colorFromPalette(t01, type = "temp") {
  const palette = (type === "wind") ? WIND_PALETTE : TEMP_PALETTE;
  const n = palette.length - 1;
  if (t01 <= 0) return palette[0];
  if (t01 >= 1) return palette[n];
  const pos = t01 * n;
  const i = Math.floor(pos);
  const frac = pos - i;
  return lerpColor(palette[i], palette[i + 1], frac);
}

export function makeColorer(min, max, type = "temp") {
  const span = Math.max(0.1, max - min);

  return function toColor(value) {
    const clamped = Math.max(min, Math.min(max, value));
    const pct = (clamped - min) / span;
    return colorFromPalette(pct, type);
  };
}

function angleDiff(a, b) {
  let d = (a - b + 540) % 360 - 180;
  return d;
}

export function effectiveWind(bearingDeg, windFromDeg, windSpeed) {
  if (windSpeed == null) return 0;
  const rel = angleDiff(bearingDeg, windFromDeg);
  const factor = - Math.cos((rel * Math.PI) / 180); // in radians
  return windSpeed * factor; // - = headwind, + = tailwind
}

export function updateLegendRange(minVal, maxVal, barId, ticksId, type = "temp") {
  const palette = (type === "wind") ? WIND_PALETTE : TEMP_PALETTE;
  const bar = document.getElementById(barId);
  const ticks = document.getElementById(ticksId);
  if (!bar || !ticks) return;

  // For wind: force symmetric range around 0
  if (type === "wind") {
    const maxAbs = Math.max(Math.abs(minVal), Math.abs(maxVal));
    minVal = -maxAbs;
    maxVal = +maxAbs;
  }

  const stops = palette.map((c, i, arr) => `${c} ${Math.round((i/(arr.length-1))*100)}%`).join(", ");
  bar.style.background = `linear-gradient(90deg, ${stops})`;

  const t0 = minVal,
        t1 = minVal + (maxVal - minVal) * 0.25,
        t2 = minVal + (maxVal - minVal) * 0.5,
        t3 = minVal + (maxVal - minVal) * 0.75,
        t4 = maxVal;

  // Format numbers differently for wind
  function fmt(val) {
    if (type === "wind") {
      return Math.abs(val).toFixed(0); // show magnitude only
    }
    return val.toFixed(0);
  }

  ticks.innerHTML = `
    <span>${fmt(t0)}</span>
    <span>${fmt(t1)}</span>
    <span>${fmt(t2)}</span>
    <span>${fmt(t3)}</span>
    <span>${fmt(t4)}</span>
  `;
}