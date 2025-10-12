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

export function interpolateValues(points, aligned, key) {
  let ai = 0;
  return points.map((p, i) => {
    while (ai < aligned.length - 1 && aligned[ai + 1].idx <= i) {
      ai++;
    }
    const a1 = aligned[ai];
    const a2 = aligned[Math.min(ai + 1, aligned.length - 1)];

    const v1 = a1 ? a1[key] : null;
    const v2 = a2 ? a2[key] : null;

    if (!isFinite(v1)) return null;
    if (!isFinite(v2) || a1.idx === a2.idx) return v1;

    const f = (i - a1.idx) / (a2.idx - a1.idx);
    return v1 + f * (v2 - v1);
  });
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

export function updateLabels() {
  document.querySelectorAll('input[type="range"]').forEach(slider => {
    const valueSpan = document.getElementById(slider.id + "Value");
    if (valueSpan) {
      valueSpan.textContent = slider.value + "%";
      slider.addEventListener("input", () => {
        valueSpan.textContent = slider.value + "%";
      });
    }
  });
}

// ---------- Date and time utils ----------
export function parseDateInput(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function parseTimeInput(value) {
  const [h, min] = value.split(":").map(Number);
  return { hours: h, minutes: min };
}

export function toLocalDateTimeString(date) {
  const pad = n => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function normalizeDateTimeLocal(val) {
  if (!val) return "";

  // If it's already a full yyyy-MM-ddTHH:mm string, just return it
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val)) {
    return val;
  }

  // If it's just "HH:mm", expand it to tomorrow's date
  if (/^\d{2}:\d{2}$/.test(val)) {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const pad = n => n.toString().padStart(2, "0");
    const dateStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
    return `${dateStr}T${val}`;
  }

  // Fallback: return as-is
  return val;
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

export function closestIndex(arr, target) {
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  // lo is the first index >= target
  if (lo > 0 && Math.abs(arr[lo - 1] - target) < Math.abs(arr[lo] - target)) {
    return lo - 1;
  }
  return lo;
}

export function pickForecastAtETAs(results, startDate) {
  const aligned = results.map(r => {
    // compute shifted ETA for this point
    const shiftedEta = new Date(startDate.getTime() + r.accumTime * 1000);

    // find nearest forecast index for this point
    let idx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < r.times.length; i++) {
      const diff = Math.abs(r.times[i] - shiftedEta);
      if (diff < minDiff) {
        minDiff = diff;
        idx = i;
      }
    }

    return {
      ...r,
      times: r.times[idx], // should be the same as etaQuarter
      eta: shiftedEta, // actual forecast timestamp used
      tempC: r.tempC[idx],
      feltTempC: r.feltTempC[idx],
      gusts: r.gusts[idx],
      windKmH: r.windKmH[idx],
      windDeg: r.windDeg[idx],
      windEffectiveKmH: r.windEffectiveKmH[idx],
      precip: r.precip[idx],
      precipProb: r.precipProb[idx],
      cloudCover: r.cloudCover[idx],
      cloudCoverLow: r.cloudCoverLow[idx],
      isDay: r.isDay[idx],
      pictocode: r.pictocode[idx],
    };
  });

  aligned.sort((a, b) => a.eta - b.eta);

  return aligned;
}

// ---------- Logging ----------
export function log(msg) {
  const el = document.getElementById("log");
  el.textContent += (el.textContent ? "\n" : "") + msg;
  el.scrollTop = el.scrollHeight;
}

// ---------- Progress ----------
export function createProgressUpdater({ progressBar, progressText, progressOverlay, total, titleEl }) {
  let completed = 0;

  return function updateProgress() {
    completed++;
    const pct = Math.round((completed / total) * 100);
    progressBar.style.width = pct + "%";
    progressText.textContent = pct + "%";

    if (completed === total) {
      progressText.textContent = "Done ✔";
      setTimeout(() => {
        progressOverlay.style.display = "none";
      }, 1500);
    }
  };
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

export function filterCandidates(timeSteps, rangeDateMin, rangeDateMax, rangeTimeMin, rangeTimeMax) {
  const now = new Date();

  return timeSteps.filter(t => {
    const d = new Date(t);
    if (d < now) return false;

    // Date check
    const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (dateOnly < rangeDateMin || dateOnly > rangeDateMax) return false;

    // Time check
    const minutes = d.getHours() * 60 + d.getMinutes();
    const minMinutes = rangeTimeMin.hours * 60 + rangeTimeMin.minutes;
    const maxMinutes = rangeTimeMax.hours * 60 + rangeTimeMax.minutes;

    return minutes >= minMinutes && minutes <= maxMinutes;
  });
}