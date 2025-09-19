import {
  haversine, bearing, formatKm, formatDuration, speedToMps, utcHourISO,
  log, lerp, hexToRgb, rgbToHex, lerpColor, PALETTE, colorFromPalette,
  makeTempColorer, updateLegend, getPercentInput, convertWindToGrade,
  utcQuarterISO
} from './utils.js';

import {
  parseGPX, cumulDistance, segmentBearings, buildSampleIndices,
  getBreaks, breakOffsetSeconds, nearestByIdx, getBreakTimeWindows, insertBreaksIntoPoints
} from './gpx.js';

import {
  getForecast, pickHourAt
} from './weather.js';

import {
  ensureMap, dirArrow8, getWeatherIcon, windBarbs, routeLayerGroup, getWeatherPictogram
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
const speedUp = document.getElementById("speedUp");
const speedDown = document.getElementById("speedDown");
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
  map = ensureMap(providerSel.value);
  map.on("zoomend", () => {
  const zoom = map.getZoom();
  // pick a scaling factor relative to zoom
  const scale = 1 + (zoom - 10) * 0.2; // adjust base zoom and multiplier

  document.querySelectorAll(".weather-icon, .break-icon").forEach(el => {
    el.style.transform = `scale(${scale})`;
    el.style.transformOrigin = "center center";
  });
});
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
  const thresholdMeters = 500; // adjust as needed
  if (minDist > thresholdMeters) {
    log(`Click too far from route (distance: ${minDist.toFixed(1)} m, threshold: ${thresholdMeters} m).`);
    return;
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
  log(`Break added at ${distKm} km (map click, ${minDist.toFixed(1)} m from route).`);
};
  map.on("click", window.mapClickBreakHandler);
});

[
  startTimeInput, speedInput, speedUp, speedDown, speedUnit,
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
    const speedValUp = getPercentInput("speedUp");
    const speedValDown = getPercentInput("speedDown");
    const mps = speedToMps(speedVal, speedUnit.value);
    const mpsUp = speedToMps(speedVal * (1 - speedValUp ?? 0), speedUnit.value);
    const mpsDown = speedToMps(speedVal * (1 + speedValDown ?? 0), speedUnit.value);
    if (!mps) return log("Invalid average speed.");

    const maxCalls = Math.max(5, Math.min(200, parseInt(maxCallsInput.value || "60", 10)));
    const minSpacing = parseInt(sampleMetersSelect.value, 10);
    const minTimeSpacing = parseInt(sampleMinutesSelect.value, 10);
    const provider = providerSel.value;
    const mbKey = meteoblueKeyInput.value.trim();

    processBtn.disabled = true;
    await processRoute(gpxText, startDate, mps, mpsUp, mpsDown, maxCalls, minSpacing, minTimeSpacing, provider, mbKey);
  } catch (e) {
    log("Failed: " + e.message);
  } finally {
    validateReady();
  }
});

// ---------- Core: processRoute ----------
async function processRoute(gpxText, startDate, avgSpeedMps, avgSpeedMpsUp, avgSpeedMpsDown, maxCalls, minSpacing, minTimeSpacing, provider, mbKey) {
  // Reset UI
  clearWeatherMarkers();
  routeLayerGroup.clearLayers();
  document.getElementById("statDistance").textContent = "–";
  document.getElementById("statDuration").textContent = "–";
  document.getElementById("statTempRange").textContent = "–";
  document.getElementById("statWetShare").textContent = "–";
  document.getElementById("log").textContent = "";
  resetChart();

  log("Parsing GPX...");

  const pointsRaw = parseGPX(gpxText);
  const breaks = getBreaks(pointsRaw);
  const points = insertBreaksIntoPoints(pointsRaw, breaks, minTimeSpacing);
  log(`Route has ${pointsRaw.length} points, ${formatKm(cumulDistance(points).total)} total.`);
  log(`Expected travel time (no breaks): ${formatDuration(cumulDistance(points).total / avgSpeedMps)} at an average speed of ${(avgSpeedMps*3.6).toFixed(1)} km/h.`);
    if (breaks.length) {
        log(`Expected travel time (with breaks): ${formatDuration(cumulDistance(points).total / avgSpeedMps + breakOffsetSeconds(cumulDistance(points).total, breaks))}.`);
    }
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
    const breakFlag = L.divIcon({
      html:
      //'<span class="break-icon" style="font-size:20px; color:orange;">📌</span>',
      `<div class="break-icon" style="display:flex; flex-direction:column; align-items:center; line-height:1; justify-content: right;">
            <span style="font-size:16px; vertical-align: top;">📌</span>`,
      className: "",
      iconSize: [20, 20],
      iconAnchor: [11, 20]
    });
    L.marker([b.lat, b.lon], { icon: breakFlag, title: `Break at ${Math.round(b.distMeters/1000)} km` })
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
  const sampleIdx = buildSampleIndices(points, cum, maxCalls, minSpacing, minTimeSpacing, avgSpeedMps, avgSpeedMpsUp, avgSpeedMpsDown, startDate, breaks);
  log(`Sampling ${sampleIdx.length} points (limit ${maxCalls}, spacing ≥ ${minSpacing} m).`);
  console.log('Sample indices', sampleIdx);
  const segmentSpeeds = [];

    for (let s = 0; s < sampleIdx.length - 1; s++) {
      const i1 = sampleIdx[s];
      const i2 = sampleIdx[s + 1];

      const p1 = points[i1];
      const p2 = points[i2];
      const dist = cum[i2] - cum[i1];
      const elev1 = p1.ele ?? 0;
      const elev2 = p2.ele ?? 0;
      const slope = (elev2 - elev1) / dist ?? 0;

      let speed;
      // If both points are break samples from the same break, set speed to 0
      if (
        p1.isBreak && p2.isBreak &&
        p1.breakIdx !== undefined && p1.breakIdx === p2.breakIdx
      ) {
        speed = 0;
      } else {
        speed = avgSpeedMps;
        if (slope > 0.05) speed = avgSpeedMpsUp;
        else if (slope < -0.04) speed = avgSpeedMpsDown;
      }
      segmentSpeeds.push({ from: i1, to: i2, speed });
    }
  // Fetch forecasts
  const results = []; // { idx, lat, lon, eta, etaISOHour, tempC, windKmH, windDeg, precip, travelBearing }
  const errors = [];
  const CONCURRENCY = 8;
  let i = 0;

async function worker() {
  let lastBreakEndSec = null;
  let breakStartSec = null;
  let lastWasBreak = false;
  const breakTimes = {}; // { [breakIdx]: { start: sec, end: sec } }

  while (i < sampleIdx.length) {
    const my = i++;
    const idx = sampleIdx[my];
    const p = points[idx];

    let etaSec = 0;
    // If this is the first break sample, record break start
    if (p.isBreak && p.breakSample === 0) {
      // Find the last normal point before this break
      let lastNormalIdx = idx - 1;
      while (lastNormalIdx >= 0 && points[lastNormalIdx].isBreak) lastNormalIdx--;
      let etaSec = 0;
      for (const seg of segmentSpeeds) {
        if (seg.to > lastNormalIdx) break;
        const segDist = cum[seg.to] - cum[seg.from];
        if (seg.speed === 0) continue;
        etaSec += segDist / seg.speed;
      }
      etaSec += breakOffsetSeconds(cum[lastNormalIdx], breaks);
        breakTimes[p.breakIdx] = {
          start: etaSec,
          end: etaSec + breaks[p.breakIdx].durSec
        };
        breakStartSec = breakTimes[p.breakIdx].start;
        lastBreakEndSec = breakTimes[p.breakIdx].end;
        lastWasBreak = true;
    }

if (p.isBreak) {
  // If breakTimes for this breakIdx is not set, compute it now
  if (!breakTimes[p.breakIdx]) {
    // Find the last normal point before this break
    let lastNormalIdx = idx - 1;
    while (lastNormalIdx >= 0 && points[lastNormalIdx].isBreak) lastNormalIdx--;
    let etaSecTmp = 0;
    for (const seg of segmentSpeeds) {
      if (seg.to > lastNormalIdx) break;
      const segDist = cum[seg.to] - cum[seg.from];
      if (seg.speed === 0) continue;
      etaSecTmp += segDist / seg.speed;
    }
    etaSecTmp += breakOffsetSeconds(cum[lastNormalIdx], breaks);
    breakTimes[p.breakIdx] = {
      start: etaSecTmp,
      end: etaSecTmp + breaks[p.breakIdx].durSec
    };
  }
  const spacingSec = minTimeSpacing * 60;
  const bt = breakTimes[p.breakIdx];
  breakStartSec = bt.start;
  lastBreakEndSec = bt.end;
  etaSec = breakStartSec + (p.breakSample ?? 0) * spacingSec;
  lastWasBreak = true;
}
    else if (lastWasBreak && lastBreakEndSec !== null) {
      etaSec = lastBreakEndSec;
      lastBreakEndSec = null;
      breakStartSec = null;
      lastWasBreak = false;
    } else {
      // Normal segment: sum as usual
      for (const seg of segmentSpeeds) {
        if (seg.to > idx) break;
        const segDist = cum[seg.to] - cum[seg.from];
        if (seg.speed === 0) continue;
        etaSec += segDist / seg.speed;
      }
      etaSec += breakOffsetSeconds(cum[idx], breaks);
      lastWasBreak = false;
    }

    const eta = new Date(startDate.getTime() + etaSec * 1000);
    const etaISOHour = utcQuarterISO(eta);
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
        ...p,
        eta,
        etaISOHour,
        tempC: Number(fc.tempC[k]),
        feltTempC: Number(fc.feltTempC[k]),
        gusts: Number(fc.windGusts[k]),
        windKmH: Number(fc.windSpeedKmH[k]),
        windDeg: Number(fc.windFromDeg[k]),
        precip: Number(fc.precipMmHr[k]),
        cloudCover: Number(fc.cloudCover[k]),
        cloudCoverLow: Number(fc.cloudCoverLow[k]),
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

  results.sort((a,b) => a.eta - b.eta);
  console.log('sorted results', results);
  if (!results.length) { log("No forecast results to render."); return; }
  const lastEta = results[results.length - 1]?.eta;
if (lastEta) {
  const durationMs = lastEta.getTime() - startDate.getTime();
  const durationSec = durationMs / 1000;
  document.getElementById("statDuration").textContent = formatDuration(durationSec);
}
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

  // Add black outline first
  const fullRoute = points.map(p => [p.lat, p.lon]);
  const outline = L.polyline(fullRoute, {color: "black", weight: 8, opacity: 0.85});
  routeLayerGroup.addLayer(outline);

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
    const weatherIcon = getWeatherIcon(r.tempC, r.precip, r.isDay);
    // Uncomment to use Meteoblue pictograms instead of simple emojis
    // const weatherIcon = getWeatherPictogram(r.tempC, r.precip, r.cloudCover, r.cloudCoverLow, r.isDay, r.windKmH, r.gusts)
    const windGrade = convertWindToGrade(r.windKmH, 'km/h');

    /* Uncomment to use Meteoblue pictograms instead of simple emojis
    const icon = L.divIcon({
       html: `
        <div class="weather-icon" style="display:flex; flex-direction:column; align-items:center; line-height:1; justify-content: center;">
        <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
          <img src="images/meteoblue_pictograms/${weatherIcon}.svg"
             style="width: 100%; height: 100%; object-fit: contain;" />
        </div>
        <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
          <img src="images/beaufort_scale/wind${windGrade}.svg"
               style="width: 100%; height: 100%; object-fit: contain; margin-top: -8px;" />
        </div>
        </div>`,
      className: "",
      iconSize: [20, 22],
      iconAnchor: [10, 11]
    });
    */

    const icon = L.divIcon({
       html: `
        <div class="weather-icon" style="display:flex; flex-direction:column; align-items:center; line-height:1; justify-content: center;">
            <span style="font-size:16px; vertical-align: middle;">${weatherIcon}</span>
        <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
          <img src="images/beaufort_scale/wind${windGrade}.svg"
               style="width: 100%; height: 100%; object-fit: contain; margin-top: -8px;" />
        </div>
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
        🌧️ Precipitation: ${isNaN(r.precip) ? '0.0' : r.precip.toFixed(1)} mm/h<br/>
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
    .map(r => ({ t: r.eta, tempC: r.tempC, feltTempC: r.feltTempC, gusts: r.gusts,
    precip: r.precip, windKmh: r.windKmH, windDeg: r.windDeg, cloudCover: r.cloudCover,
    cloudCoverLow: r.cloudCoverLow, isDay: r.isDay, isBreak: r.isBreak }))
    .sort((a,b) => +a.t - +b.t);
  buildTempChart(chartSeries);
  buildPrecipChart(chartSeries)
  buildWindChart(chartSeries);

  if (errors.length) log(`Completed with ${errors.length} missing points (outside forecast range or fetch errors).`);
  else log("Completed successfully.");
}