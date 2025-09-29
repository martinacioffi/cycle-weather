import {
  haversine, formatKm, formatDuration, speedToMps, log,
  makeColorer, effectiveWind,
  updateLegendRange, getPercentInput, roundToNearestQuarter
} from './utils.js';

import {
  parseGPX, cumulDistance, segmentBearings, buildSampleIndices,
  getBreaks, breakOffsetSeconds, nearestByIdx, insertBreaksIntoPoints
} from './gpx.js';

import {
  getForecast, pickHourAt
} from './weather.js';

import {
  ensureMap, dirArrow8, windArrowWithBarbs, routeLayerGroup, getWeatherPictogram,
  updateMapAttribution, arrowIcon, weatherMarkersLayerGroup, windMarkersLayerGroup, breakMarkersLayerGroup,
  weatherLayerVisible, windLayerVisible, breakLayerVisible
} from './map.js';

import {
  buildTempChart, buildPrecipChart, buildWindChart, resetChart, destroyChartById
} from './charts.js';

// ---------- Global ----------
let gpxText = null;
let map;
let layerControl;
let baseLayers;
let overlays;
let weatherMarkers = [];
let windMarkers = [];
let mapClickBreakHandler = null;

// ---------- DOM Elements (match your HTML) ----------
const fileInput = document.getElementById("gpxFile");
const providerSel = document.getElementById("provider");
const meteoblueKeyInput = document.getElementById("meteoblueKey");
const meteoblueKeyRow = document.getElementById("meteoblueKeyRow");
const pictogramsProviderRow = document.getElementById("pictogramsProviderRow");
const pictogramsProvider = document.getElementById("pictogramsProvider");
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
const isMobile = window.innerWidth <= 768;

// ---------- Init ----------
window.addEventListener("DOMContentLoaded", () => {
  // Set default start time to tomorrow at 07:00 (LOCAL string for datetime-local)
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 7, 0, 0, 0);
  const pad = n => n.toString().padStart(2, "0");
  startTimeInput.value =
    `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;

  // Initialize map
  const pictos = providerSel.value === "meteoblue" && pictogramsProvider.value === "meteoblue" ? "meteoblue" : "yr";
  ({ map, layerControl, baseLayers, overlays } = ensureMap(providerSel.value, pictos));
  // Initial attribution sync
  map.on('baselayerchange', function() {
    const currentProvider = providerSel.value;
    const currentPictos = currentProvider === "meteoblue" && pictogramsProvider.value === "meteoblue" ? "meteoblue" : "yr";
    updateMapAttribution(currentProvider, currentPictos);
  });

  if (window.innerWidth < 768) {
    map.scrollWheelZoom.disable(); // prevent accidental zoom while scrolling
    map.touchZoom.enable();        // allow pinch zoom
    map.doubleClickZoom.disable(); // optional: disable double-tap zoom
  }

  // When provider changes
  providerSel.addEventListener("change", () => {
  const currentProvider = providerSel.value;
  const currentPictos = currentProvider === "meteoblue" && pictogramsProvider.value === "meteoblue" ? "meteoblue" : "yr";
  updateMapAttribution(currentProvider, currentPictos);
  goatcounter.count({
    path: `/changedWeatherProvider/${currentProvider}`,
    title: `Weather Provider Changed to ${currentProvider}`,
    event: true
  });
  });

  // When pictograms provider changes
  pictogramsProvider.addEventListener("change", () => {
  const currentProvider = providerSel.value;
  const currentPictos = currentProvider === "meteoblue" && pictogramsProvider.value === "meteoblue" ? "meteoblue" : "yr";
  updateMapAttribution(currentProvider, currentPictos);
  goatcounter.count({
    path: `/changedPictogramsProvider/${currentPictos}`,
    title: `Pictograms Provider Changed to ${currentPictos}`,
    event: true
  });
  });

  map.on("zoomend", () => {
  const zoom = map.getZoom();
  // pick a scaling factor relative to zoom
  const scale = Math.max(0.4, 0.9 + (zoom - 10) * 0.15);

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
  weatherMarkers.forEach(m => weatherMarkersLayerGroup.removeLayer(m));
  weatherMarkers = [];
}

function addWeatherMarker(marker) {
  weatherMarkers.push(marker);
}

function clearWindMarkers() {
  windMarkers.forEach(m => windMarkersLayerGroup.removeLayer(m));
  windMarkers = [];
}

function addWindMarker(marker) {
  windMarkers.push(marker);
}

// ---------- UI wiring ----------
document.getElementById("demoBtn").addEventListener("click", async () => {
  goatcounter.count({
    path: `/demo`,
    title: `Demo Button Clicked`,
    event: true
  });
  try {
    const response = await fetch("assets/DemoOssona.gpx");
    const blob = await response.blob();
    const file = new File([blob], "DemoOssona.gpx", { type: "application/gpx+xml" });

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    const gpxInput = document.getElementById("gpxFile");
    gpxInput.files = dataTransfer.files;

    // Trigger change event if needed
    gpxInput.dispatchEvent(new Event("change"));

    // Wait a moment for parsing to complete (adjust if needed)
    setTimeout(() => {
    // Add a break automatically for the demo
    const breakRow = document.createElement("div");
    breakRow.className = "break-row";
    breakRow.innerHTML = `
      <input type="number" class="break-km" min="0" step="0.1" placeholder="distance km" value="37" />
      <input type="number" class="break-min" min="1" step="1" placeholder="duration min" value="50" />
      <button type="button" title="Remove break">✕</button>
    `;
    breakRow.querySelector("button").addEventListener("click", () => breakRow.remove());
    breaksContainer.appendChild(breakRow);
    validateReady();
      document.getElementById("processBtn").click();
    }, 500); // or longer if needed
  } catch (err) {
    console.error("Demo file load failed:", err);
    alert("Failed to load demo file.");
  }
});

providerSel.addEventListener("change", () => {
  meteoblueKeyRow.style.display = providerSel.value === "meteoblue" ? "block" : "none";
  validateReady();
});

providerSel.addEventListener("change", () => {
  pictogramsProviderRow.style.display = providerSel.value === "meteoblue" ? "block" : "none";
  validateReady();
});

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("gpxHelpBtn");
  const popover = document.getElementById("gpxHelpPopover");

  btn.addEventListener("click", (e) => {
    // Toggle visibility
    if (popover.style.display === "block") {
      popover.style.display = "none";
      return;
    }

    // Position near the button
    const rect = btn.getBoundingClientRect();
    popover.style.top = `${rect.bottom + window.scrollY + 4}px`;
    popover.style.left = `${rect.left + window.scrollX}px`;
    popover.style.display = "block";
  });

  // Hide if clicking outside
  document.addEventListener("click", (e) => {
    if (!popover.contains(e.target) && e.target !== btn) {
      popover.style.display = "none";
    }
  });
});

addBreakBtn.addEventListener("click", () => {
  goatcounter.count({
    path: `/breakButtonClicked`,
    title: `Break Button Clicked`,
    event: true
  });
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
  if (mapClickBreakHandler) {
    map.off("click", mapClickBreakHandler);
  }

  // Add new map click handler for adding breaks at nearest route point
  mapClickBreakHandler = function(e) {
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
  map.on("click", mapClickBreakHandler);
});

[
  startTimeInput, speedInput, speedUp, speedDown, speedUnit,
  maxCallsInput, sampleMetersSelect,
  meteoblueKeyInput, providerSel, pictogramsProvider
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
    const pictos = provider === "meteoblue" && pictogramsProvider.value === "meteoblue" ? "meteoblue" : "yr";
    const mbKey = meteoblueKeyInput.value.trim();

    processBtn.disabled = true;
    await processRoute(gpxText, startDate, mps, mpsUp, mpsDown, maxCalls, minSpacing, minTimeSpacing, provider, pictos, mbKey);
  } catch (e) {
    log("Failed: " + e.message);
  } finally {
    validateReady();
  }
});

// ---------- Core: processRoute ----------
async function processRoute(gpxText, startDate, avgSpeedMps, avgSpeedMpsUp, avgSpeedMpsDown, maxCalls, minSpacing, minTimeSpacing, provider, pictos, mbKey) {
  // Reset UI
  clearWeatherMarkers();
  clearWindMarkers();
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
      `<div class="break-icon" style="display:flex; flex-direction:column; align-items:center; line-height:1; justify-content: right;">
            <span style="font-size:20px; vertical-align: top;">📌</span>`,
      className: "",
      iconSize: [25, 25],
      iconAnchor: [5, 20]
    });
    L.marker([b.lat, b.lon], { icon: breakFlag, opacity: breakLayerVisible ? 1 : 0 })
      .addTo(breakMarkersLayerGroup)
      .bindTooltip(`<strong>Break</strong><br>Distance: ${(b.distMeters/1000).toFixed(1)} km<br>Duration: ${Math.round(b.durSec/60)} min`);
  }

  // Grey base line
  const baseLine = L.polyline(points.map(p => [p.lat, p.lon]), { color: "#777", weight: 3, opacity: 0.35 });
  routeLayerGroup.addLayer(baseLine);

  // Sampling
  const sampleIdx = buildSampleIndices(points, brngs, cum, maxCalls, minSpacing, minTimeSpacing, avgSpeedMps, avgSpeedMpsUp, avgSpeedMpsDown, startDate, breaks);
  log(`Sampling ${sampleIdx.length} points (limit ${maxCalls}, spacing ≥ ${minSpacing} m).`);
  const durationSec = sampleIdx[sampleIdx.length - 1].accumTime;
  const durationMeters = sampleIdx[sampleIdx.length - 1].accumDist;
  log(`Route has ${pointsRaw.length} points, ${formatKm(cumulDistance(points).total)} total.`);
  log(`Expected travel time (no breaks): ${formatDuration(durationSec - breakOffsetSeconds(cumulDistance(points).total, breaks))} at an average speed of ${(avgSpeedMps*3.6).toFixed(1)} km/h.`);
    if (breaks.length) {
        log(`Expected travel time (with breaks): ${formatDuration(durationSec)}.`);
    }
  document.getElementById("statDistance").textContent = formatKm(durationMeters);
  document.getElementById("statDuration").textContent = formatDuration(durationSec);

  // Fetch forecasts
  const results = [];
  const errors = [];
  const CONCURRENCY = 8;
  let i = 0;

async function worker() {

  while (i < sampleIdx.length) {
    const my = i++;
    const p = sampleIdx[my];

    try {
      const fc = await getForecast(p.lat, p.lon, provider, mbKey);
      const roundedEta = p.etaQuarter;
      const k = pickHourAt(fc, roundedEta);
      if (k === -1) {
        errors.push({ my, reason: "Time out of forecast range", roundedEta });
        log(`No forecast at ${roundedEta} for (${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}).`);
        continue;
      }
      results.push({
        ...p,
        tempC: Number(fc.tempC[k]),
        feltTempC: Number(fc.feltTempC[k]),
        gusts: Number(fc.windGusts[k]),
        windKmH: Number(fc.windSpeedKmH[k]),
        windDeg: Number(fc.windFromDeg[k]),
        windEffectiveKmH: effectiveWind(p.travelBearing, Number(fc.windFromDeg[k]), Number(fc.windSpeedKmH[k])),
        precip: Number(fc.precipMmHr[k]),
        precipProb: Number(fc.precipProb[k]),
        cloudCover: Number(fc.cloudCover[k]),
        cloudCoverLow: Number(fc.cloudCoverLow[k]),
        isDay: Number(fc.isDay[k]),
        pictocode: Number(fc.pictocode[k] ?? -1),
      });
    } catch (e) {
      errors.push({ my, reason: e.message });
      log(`Forecast error @${my}: ${e.message}`);
    }
  }
}
  const workers = Array.from({ length: Math.min(CONCURRENCY, sampleIdx.length) }, () => worker());
  await Promise.all(workers);

  // results.sort((a,b) => a.eta - b.eta);
  // sort by distMeters
  results.sort((a, b) => a.distMeters - b.distMeters);
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

  // Add black outline first
  const fullRoute = points.map(p => [p.lat, p.lon]);
  const outline = L.polyline(fullRoute, {color: "black", weight: 8, opacity: 0.85});
  routeLayerGroup.addLayer(outline);

  // Colorer + colored segments
  const tempColor = makeColorer(minT, maxT, "temp");
  const tempLayerGroup = overlays["Temperature"];
  let wetPts = 0;

  for (let s = 0; s < points.length - 1; s++) {
    const nearest = nearestByIdx(results, s);
    const t = nearest ? nearest.tempC : null;
    const color = (t == null) ? "#cccccc" : tempColor(t);
    const seg = L.polyline([[points[s].lat, points[s].lon],[points[s+1].lat, points[s+1].lon]], { color, weight: 5, opacity: 0.95 });
    tempLayerGroup.addLayer(seg);
  }

  // Wind range + legend (sidebar + map)
  const winds = results.map(r => r.windEffectiveKmH).filter(w => isFinite(w));
  let minW = Math.min(...winds);
  let maxW = Math.max(...winds);
  if (!isFinite(minW) || !isFinite(maxW)) { minW = -1; maxW = 1; }
  if (maxW - minW < 0.1) { maxW = minW + 0.1; }

  const windColor = makeColorer(minW, maxW, "wind");
  const windLayerGroup = overlays["Wind"];

  for (let s = 0; s < points.length - 1; s++) {
    const nearest = nearestByIdx(results, s);
    const eff = nearest ? nearest.windEffectiveKmH : 0;
    const color = (eff == null) ? "#cccccc" : windColor(eff);
    const seg = L.polyline([[points[s].lat, points[s].lon], [points[s+1].lat, points[s+1].lon]],{ color, weight: 5, opacity: 0.95 });
    windLayerGroup.addLayer(seg);
  }

  map.on("overlayadd", e => {
  if (e.layer === tempLayerGroup) {
    if (map.hasLayer(windLayerGroup)) {
      setTimeout(() => map.removeLayer(windLayerGroup), 0);
      // Uncheck Wind box
      layerControl._layerControlInputs.forEach(input => {
        if (input.nextSibling && input.nextSibling.textContent.trim() === "Wind") {
          input.checked = false;
        }
      });
          }
      updateLegendRange(minT, maxT, "legendBarMap", "legendTicksMap", "temp");
      updateLegendRange(minT, maxT, "legendBarTemp", "legendTicksTemp", "temp");
  }
  if (e.layer === windLayerGroup) {
    if (map.hasLayer(tempLayerGroup)) {
        setTimeout(() => map.removeLayer(tempLayerGroup), 0);
      // Uncheck Temp box
      layerControl._layerControlInputs.forEach(input => {
        if (input.nextSibling && input.nextSibling.textContent.trim() === "Temperature") {
          input.checked = false;
        }
      });
     }
     updateLegendRange(minW, maxW, "legendBarWind", "legendTicksWind", "wind");
     updateLegendRange(minW, maxW, "legendBarMapWind", "legendTicksMapWind", "wind");
    }
  });

  updateLegendRange(minT, maxT, "legendBarMap", "legendTicksMap", "temp");
  updateLegendRange(minT, maxT, "legendBarTemp", "legendTicksTemp", "temp");
  updateLegendRange(minW, maxW, "legendBarWind", "legendTicksWind", "wind");
  updateLegendRange(minW, maxW, "legendBarMapWind", "legendTicksMapWind", "wind");

  // Sample markers with icons + popups
  for (const r of results) {
    const isBreak = r.isBreak
    const weatherIcon = getWeatherPictogram(r.tempC, r.precip, r.cloudCover, r.cloudCoverLow, r.isDay, r.windKmH, r.gusts, r.pictocode, pictos);
    const imgSrc = pictos === "meteoblue" ? `images/meteoblue_pictograms/${weatherIcon}.svg` : `images/yr_weather_symbols/${weatherIcon}.svg`;
    const isNight = weatherIcon.endsWith("night");
    const bgColor = pictos === "meteoblue" ? (isNight ? "#003366" : "#90c8fc") : "white";
    const windSVG = windArrowWithBarbs(r.windDeg, r.windKmH);

    const weatherIconDiv = L.divIcon({
       html: `
       <div class="weather-icon">
        <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center ;background:  ${bgColor}; border-radius: 50%;;">
          <img src=${imgSrc} style="width: 80%; height: 80%; object-fit: contain;" />
          </div>
       </div>`,
      className: "",
      iconSize: [42, 42],
      iconAnchor: [22, 26]
    });

    const weatherMarker = L.marker([r.lat, r.lon], { icon: weatherIconDiv, opacity: (!isBreak && weatherLayerVisible) ? 1 : 0 }).addTo(weatherMarkersLayerGroup);
    addWeatherMarker(weatherMarker);

      // Wind barb marker
    const windDiv = L.divIcon({
       html: `<div class="weather-icon" style="margin-top:-6px;">${windSVG}</div>`,
       className: "",
       iconSize: [24, 24],
       iconAnchor: [12, 0]
    });
    const windMarker = L.marker([r.lat, r.lon], { icon: windDiv, opacity: (!isBreak && windLayerVisible) ? 1 : 0 }).addTo(windMarkersLayerGroup);
    addWindMarker(windMarker);

    const windKmh = (r.windKmH).toFixed(1);
    const etaStr = r.eta.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    const etaLabel = isBreak ? `During Break: ${etaStr}` : `ETA: ${etaStr}`;
    // Decide headwind/tailwind
    let windLabel;
    const eff = r.windEffectiveKmH;
    const effRounded = Math.round(eff * 10) / 10;
    if (effRounded > 0) {
      windLabel = `<br/>💨 Tailwind: ${effRounded.toFixed(1)} km/h`;
    } else if (effRounded < 0) {
      windLabel = `<br/>💨 Headwind: ${Math.abs(effRounded).toFixed(1)} km/h`;
    } else {
      windLabel = "<br/>No head/tailwind (pure crosswind)";
    }
    const windLabelBreak = isBreak ? "" : windLabel
    const popupHtml = `
      <div style="min-width:200px">
        <div>${etaLabel}</div>
        <div><strong>Forecast:</strong></div>
        ☀️ Temp: ${r.tempC.toFixed(1)}°C<br/>
        🌧️ Precipitation: ${isNaN(r.precip) ? '0.0' : r.precip.toFixed(1)} mm/h<br/>
        💨 Wind: ${windKmh} km/h from ${Math.round(r.windDeg)}° ${dirArrow8(r.windDeg)}${windLabelBreak}<br/>
      </div>
    `;

    if (isMobile) {
        weatherMarker.bindPopup(popupHtml);
        windMarker.bindPopup(popupHtml);
    }

    // Show popup on hover
   /* weatherMarker.on("mouseover", function () { this.openPopup(); });
    weatherMarker.on("mouseout", function () { this.closePopup(); });
    windMarker.on("mouseover", function () { this.openPopup(); });
    windMarker.on("mouseout", function () { this.closePopup(); });*/

    weatherMarker.bindTooltip(popupHtml, { direction: "top", sticky: true, className: "forecast-tooltip" });
    windMarker.bindTooltip(popupHtml, { direction: "top", sticky: true, className: "forecast-tooltip" });


    const arrowMarker = L.marker([r.lat, r.lon], {
        icon: arrowIcon(r.travelBearing), opacity: (!isBreak) ? 1 : 0
    }).addTo(routeLayerGroup);

    arrowMarker.bindTooltip(popupHtml, {
        direction: "top",
        sticky: true,
        className: "forecast-tooltip"
    });

    if ((r.precip || 0) >= 0.1) wetPts++;
  }

  document.getElementById("statTempRange").textContent = `${minT.toFixed(1)}°C → ${maxT.toFixed(1)}°C`;
  document.getElementById("statWetShare").textContent = Math.round(100 * wetPts / results.length) + "%";

  // Charts
  const chartSeries = results
    .map(r => ({ t: r.eta, tempC: r.tempC, feltTempC: r.feltTempC, gusts: r.gusts,
    precip: r.precip, precipProb: r.precipProb, windKmh: r.windKmH, windDeg: r.windDeg, cloudCover: r.cloudCover,
    cloudCoverLow: r.cloudCoverLow, isDay: r.isDay, pictocode: r.pictocode, isBreak: r.isBreak }))
    .sort((a,b) => +a.t - +b.t);
  buildTempChart(chartSeries, weatherMarkers, pictos, isMobile);
  buildPrecipChart(chartSeries, weatherMarkers, isMobile);
  buildWindChart(chartSeries, windMarkers, isMobile);

  if (errors.length) log(`Completed with ${errors.length} missing points (outside forecast range or fetch errors).`);
  else log("Completed successfully.");
}