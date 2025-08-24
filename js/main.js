import {
  haversine, bearing, formatKm, formatDuration, speedToMps, utcHourISO,
  log, lerp, hexToRgb, rgbToHex, lerpColor, PALETTE, colorFromPalette,
  makeTempColorer, updateLegend
} from './utils.js';

import {
  parseGPX, cumulDistance, segmentBearings, buildSampleIndices,
  getBreaks, breakOffsetSeconds, nearestByIdx, getBreakTimeWindows
} from './gpx.js';

import {
  getForecast, pickHourAt
} from './weather.js';

import {
  ensureMap, dirArrow8, getWeatherIcon, windBarbs, routeLayerGroup
} from './map.js';

import {
  buildTempChart, buildPrecipChart, buildWindChart, resetChart, destroyChartById
} from './charts.js';

// ---------- Global ----------
let gpxText = null;
let map;
let weatherMarkers = [];

// ---------- DOM Elements (match your HTML) ----------
const fileInput = document.getElementById("gpxFile");
const providerSel = document.getElementById("provider");
const meteoblueKeyInput = document.getElementById("meteoblueKey");
const meteoblueKeyRow = document.getElementById("meteoblueKeyRow");
const startTimeInput = document.getElementById("startTime");
const speedInput = document.getElementById("speed");
const speedUnit = document.getElementById("speedUnit");
const processBtn = document.getElementById("processBtn");
const maxCallsInput = document.getElementById("maxCalls");
const sampleMetersSelect = document.getElementById("sampleMeters");
const sampleMinutesSelect = document.getElementById("sampleMinutes");
const breaksContainer = document.getElementById("breaksContainer");
const addBreakBtn = document.getElementById("addBreakBtn");

// ---------- Init ----------
window.addEventListener("DOMContentLoaded", () => {
  // Set default start time to tomorrow at 07:00 (LOCAL string for datetime-local)
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 7, 0, 0, 0);
  const pad = n => n.toString().padStart(2, "0");
  startTimeInput.value =
    `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;

  // Default speed
  speedInput.value = 14;

  // Initialize map
  map = ensureMap();

  validateReady();
});

// ---------- Helpers ----------
function validateReady() {
  const ok = !!gpxText && startTimeInput.value && parseFloat(speedInput.value) > 0;
  processBtn.disabled = !ok;
}

function clearWeatherMarkers() {
  weatherMarkers.forEach(m => routeLayerGroup.removeLayer(m));
  weatherMarkers = [];
}

function addWeatherMarker(marker) {
  weatherMarkers.push(marker);
}

// ---------- UI wiring ----------
providerSel.addEventListener("change", () => {
  meteoblueKeyRow.style.display = providerSel.value === "meteoblue" ? "block" : "none";
  validateReady();
});

addBreakBtn.addEventListener("click", () => {
  const row = document.createElement("div");
  row.className = "break-row";
  row.innerHTML = `
    <input type="number" class="break-km" min="0" step="0.1" placeholder="distance km" />
    <input type="number" class="break-min" min="1" step="1" placeholder="duration min" />
    <button type="button" title="Remove break">✕</button>
  `;
  row.querySelector("button").addEventListener("click", () => row.remove());
  breaksContainer.appendChild(row);
  validateReady();
});

fileInput.addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    gpxText = await f.text();
    log(`Loaded file: ${f.name} (${Math.round(f.size / 1024)} kB)`);
  } catch (err) {
    log("Error reading file: " + err.message);
    gpxText = null;
  }
  validateReady();

  // Remove previous map click handler if any
  if (window.mapClickBreakHandler) {
    map.off("click", window.mapClickBreakHandler);
  }

  // Add new map click handler for adding breaks at nearest route point
  window.mapClickBreakHandler = function(e) {
    if (!gpxText) {
      log("Load a GPX file first.");
      return;
    }
    let points, cum;
    try {
      points = parseGPX(gpxText);
      cum = cumulDistance(points).cum;
    } catch (err) {
      log("Error: " + err.message);
      return;
    }
    // Nearest route point to click
    let minDist = Infinity, nearestIdx = 0;
    for (let i = 0; i < points.length; i++) {
      const d = haversine(e.latlng.lat, e.latlng.lng, points[i].lat, points[i].lon);
      if (d < minDist) { minDist = d; nearestIdx = i; }
    }
    const distKm = (cum[nearestIdx] / 1000).toFixed(2);

    const row = document.createElement("div");
    row.className = "break-row";
    row.innerHTML = `
      <input type="number" class="break-km" min="0" step="0.1" value="${distKm}" />
      <input type="number" class="break-min" min="1" step="1" placeholder="duration min" />
      <button type="button" title="Remove break">✕</button>
    `;
    row.querySelector("button").addEventListener("click", () => row.remove());
    breaksContainer.appendChild(row);
    validateReady();
    log(`Break added at ${distKm} km (map click).`);
  };
  map.on("click", window.mapClickBreakHandler);
});

[
  startTimeInput, speedInput, speedUnit,
  maxCallsInput, sampleMetersSelect,
  meteoblueKeyInput, providerSel
].forEach(el => {
  el.addEventListener("input", validateReady);
  el.addEventListener("change", validateReady);
});

processBtn.addEventListener("click", async () => {
  try {
    const startDate = new Date(startTimeInput.value);
    if (isNaN(startDate.getTime())) return log("Invalid start time.");

    const speedVal = parseFloat(speedInput.value);
    const mps = speedToMps(speedVal, speedUnit.value);
    if (!mps) return log("Invalid average speed.");

    const maxCalls = Math.max(5, Math.min(200, parseInt(maxCallsInput.value || "60", 10)));
    const minSpacing = parseInt(sampleMetersSelect.value, 10);
    const minTimeSpacing = parseInt(sampleMinutesSelect.value, 15);  // minutes
    const provider = providerSel.value;
    const mbKey = meteoblueKeyInput.value.trim();

    processBtn.disabled = true;
    await processRoute(gpxText, startDate, mps, maxCalls, minSpacing, minTimeSpacing, provider, mbKey);
  } catch (e) {
    log("Failed: " + e.message);
  } finally {
    validateReady();
  }
});

// ---------- Core: processRoute ----------
async function processRoute(gpxText, startDate, avgSpeedMps, maxCalls, minSpacing, minTimeSpacing, provider, mbKey) {
  // Reset UI
  clearWeatherMarkers();
  routeLayerGroup.clearLayers();
  document.getElementById("statDistance").textContent = "–";
  document.getElementById("statDuration").textContent = "–";
  document.getElementById("statTempRange").textContent = "–";
  document.getElementById("statWetShare").textContent = "–";
  document.getElementById("log").textContent = "";
  resetChart();

  const breaks = getBreaks();

  log("Parsing GPX...");
  const points = parseGPX(gpxText);
  const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon]));
  map.fitBounds(bounds.pad(0.1));

  // Start/End flags
  const start = points[0];
  const end = points[points.length - 1];

  const startFlag = L.divIcon({
    html: '<span style="font-size:22px;">🏁</span>',
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 22]
  });
  L.marker([start.lat, start.lon], { icon: startFlag, title: "Start" }).addTo(routeLayerGroup);

  const endFlag = L.divIcon({
    html: '<span style="font-size:22px; color:#e74c3c;">🏁</span>',
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 22]
  });
  L.marker([end.lat, end.lon], { icon: endFlag, title: "End" }).addTo(routeLayerGroup);

  const { cum, total } = cumulDistance(points);
  const brngs = segmentBearings(points);

  // Break markers (orange pins)
  for (const b of breaks) {
    let breakIdx = 0;
    for (let i = 1; i < cum.length; i++) { if (cum[i] >= b.distMeters) { breakIdx = i; break; } }
    const pt = points[breakIdx];
    const breakFlag = L.divIcon({
      html: '<span style="font-size:20px; color:orange;">📌</span>',
      className: "",
      iconSize: [20, 20],
      iconAnchor: [11, 20]
    });
    L.marker([pt.lat, pt.lon], { icon: breakFlag, title: `Break at ${Math.round(b.distMeters/1000)} km` })
      .addTo(routeLayerGroup)
      .bindPopup(`<strong>Break</strong><br>Distance: ${(b.distMeters/1000).toFixed(1)} km<br>Duration: ${Math.round(b.durSec/60)} min`);
  }

  const travelTimeSec = total / avgSpeedMps;
  const totalBreaks = breakOffsetSeconds(total, breaks);
  const durationSec = travelTimeSec + totalBreaks;

  document.getElementById("statDistance").textContent = formatKm(total);
  document.getElementById("statDuration").textContent = formatDuration(durationSec);

  // Grey base line
  const baseLine = L.polyline(points.map(p => [p.lat, p.lon]), { color: "#777", weight: 3, opacity: 0.35 });
  routeLayerGroup.addLayer(baseLine);

  // Sampling
  const sampleIdx = buildSampleIndices(points, cum, maxCalls, minSpacing, minTimeSpacing, avgSpeedMps, startDate, breaks);
  log(`Sampling ${sampleIdx.length} points (limit ${maxCalls}, spacing ≥ ${minSpacing} m).`);

  // Fetch forecasts
  const results = []; // { idx, lat, lon, eta, etaISOHour, tempC, windKmH, windDeg, precip, travelBearing }
  const errors = [];
  const CONCURRENCY = 8;
  let i = 0;

  async function worker() {
    while (i < sampleIdx.length) {
      const my = i++;
      const idx = sampleIdx[my];
      const p = points[idx];
      const etaSec = cum[idx] / avgSpeedMps + breakOffsetSeconds(cum[idx], breaks);
      const eta = new Date(startDate.getTime() + etaSec * 1000);
      const etaISOHour = utcHourISO(eta);
      const travelBearing = brngs[idx];

      try {
        const fc = await getForecast(p.lat, p.lon, provider, mbKey);
        const k = pickHourAt(fc, etaISOHour);
        if (k === -1) {
          errors.push({ idx, reason: "Time out of forecast range", etaISOHour });
          log(`No forecast at ${etaISOHour} UTC for (${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}).`);
          continue;
        }
        results.push({
          idx,
          lat: p.lat, lon: p.lon,
          eta, etaISOHour,
          tempC: Number(fc.tempC[k]),
          feltTempC: Number(fc.feltTempC[k]),
          gusts: Number(fc.windGusts[k]),
          windKmH: Number(fc.windSpeedKmH[k]),
          windDeg: Number(fc.windFromDeg[k]),
          precip: Number(fc.precipMmHr[k]),
          isDay: Number(fc.isDay[k]),
          travelBearing
        });
      } catch (e) {
        errors.push({ idx, reason: e.message });
        log(`Forecast error @${idx}: ${e.message}`);
      }
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, sampleIdx.length) }, () => worker());
  await Promise.all(workers);

  results.sort((a,b) => a.idx - b.idx);
  if (!results.length) { log("No forecast results to render."); return; }

  // Temp range + legend (sidebar + map)
  const temps = results.map(r => r.tempC).filter(t => isFinite(t));
  let minT = Math.min(...temps);
  let maxT = Math.max(...temps);
  if (!isFinite(minT) || !isFinite(maxT)) { minT = 0; maxT = 1; }
  if (maxT - minT < 0.1) { maxT = minT + 0.1; }

  updateLegend(minT, maxT);
  const barMap = document.getElementById("legendBarMap");
  const ticksMap = document.getElementById("legendTicksMap");
  if (barMap && ticksMap) {
    const stops = PALETTE.map((c, i, arr) => `${c} ${Math.round((i/(arr.length-1))*100)}%`).join(", ");
    barMap.style.background = `linear-gradient(90deg, ${stops})`;
    const t0 = minT, t1 = minT + (maxT - minT) * 0.25, t2 = minT + (maxT - minT) * 0.5, t3 = minT + (maxT - minT) * 0.75, t4 = maxT;
    ticksMap.innerHTML = `
      <span>${t0.toFixed(0)}</span>
      <span>${t1.toFixed(0)}</span>
      <span>${t2.toFixed(0)}</span>
      <span>${t3.toFixed(0)}</span>
      <span>${t4.toFixed(0)}</span>
    `;
  }

  // Colorer + colored segments
  const tempColor = makeTempColorer(minT, maxT);
  let wetPts = 0;

  for (let s = 0; s < points.length - 1; s++) {
    const nearest = nearestByIdx(results, s);
    const t = nearest ? nearest.tempC : null;
    const color = (t == null) ? "#cccccc" : tempColor(t);
    const seg = L.polyline([[points[s].lat, points[s].lon],[points[s+1].lat, points[s+1].lon]], { color, weight: 5, opacity: 0.95 });
    routeLayerGroup.addLayer(seg);
  }

  // Sample markers with icons + popups
  for (const r of results) {
    const weatherIcon = getWeatherIcon(r.tempC, r.precip);
    const windArrow = dirArrow8(r.windDeg);
    const barbs = windBarbs(r.windKmH);

    const icon = L.divIcon({
      html: `<div style="font-size:15px; color:#444; display:flex; flex-direction:column; align-items:center;">
        <span>${weatherIcon}</span>
        <span style="font-size:13px; margin-top:-2px;">
          ${windArrow}<span style="font-size:10px; margin-left:2px;">${barbs}</span>
        </span>
      </div>`,
      className: "",
      iconSize: [20, 22],
      iconAnchor: [10, 11]
    });

    const marker = L.marker([r.lat, r.lon], { icon }).addTo(routeLayerGroup);
    addWeatherMarker(marker);

    const windKmh = (r.windKmH).toFixed(1);
    const etaStr = r.eta.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    const popupHtml = `
      <div style="min-width:200px">
        <strong>ETA:</strong> ${etaStr}<br/>
        <strong>Forecast:</strong><br/>
        ☀️ Temp: ${r.tempC.toFixed(1)}°C<br/>
        🌧️ Precipitation: ${r.precip.toFixed(1)} mm/h<br/>
        💨 Wind: ${windKmh} km/h from ${Math.round(r.windDeg)}° ${dirArrow8(r.windDeg)}
      </div>
    `;
    marker.bindPopup(popupHtml);

    if ((r.precip || 0) >= 0.1) wetPts++;
  }

  document.getElementById("statTempRange").textContent = `${minT.toFixed(1)}°C → ${maxT.toFixed(1)}°C`;
  document.getElementById("statWetShare").textContent = Math.round(100 * wetPts / results.length) + "%";

  // Charts
  const chartSeries = results
    .map(r => ({ t: r.eta, tempC: r.tempC, feltTempC: r.feltTempC, gusts: r.windGusts, precip: r.precip, windKmh: r.windKmH, windDeg: r.windDeg, isDay: r.isDay }))
    .sort((a,b) => +a.t - +b.t);
  buildTempChart(chartSeries);
  buildPrecipChart(chartSeries)
  buildWindChart(chartSeries);

  if (errors.length) log(`Completed with ${errors.length} missing points (outside forecast range or fetch errors).`);
  else log("Completed successfully.");
}