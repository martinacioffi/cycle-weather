import {
  haversine, formatKm, formatDuration, speedToMps, log, interpolateValues,
  makeColorer, effectiveWind, pickForecastAtETAs, filterCandidates,
  updateLegendRange, getPercentInput, roundToNearestQuarter, updateLabels
} from './utils.js';

import {
  parseGPX, cumulDistance, segmentBearings, buildSampleIndices, setupBreakValidation,
  getBreaks, breakOffsetSeconds, nearestByIdx, insertBreaksIntoPoints
} from './gpx.js';

import { getForecast, pickHourAt } from './weather.js';

import {
  ensureMap, routeLayerGroup, updateMapAttribution, weatherMarkersLayerGroup,
  windMarkersLayerGroup, breakMarkersLayerGroup, resetAllArrows,
  weatherLayerVisible, windLayerVisible, breakLayerVisible, flagIconPoints
} from './map.js';

import {
  getWeatherPictogram, dirArrow8, windArrowWithBarbs, arrowIcon, flagIcon,
  breakIcon, createWeatherIcon, createWindIcon
} from './icons.js'

import {
  buildTempChart, buildPrecipChart, buildWindChart, resetChart, destroyChartById
} from './charts.js';

import { applyUserDefaults } from './user.js';

// ---------- Global ----------
let gpxText = null;
let map;
let layerControl;
let baseLayers;
let overlays, tempLayerGroup, windLayerGroup;
let weatherMarkers = [];
let visibleWeatherMarkers = [];
let windMarkers = [];
let breakMarkers = [];
let mapClickBreakHandler = null;
let currentMinT = 0;
let currentMaxT = 20;
let currentMinW = -15;
let currentMaxW = 15;
let latestResults = null;
let latestTimeSteps = null;
let initialMetrics;

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
const sampleMetersSelectDense = document.getElementById("sampleMetersDense");
const sampleMinutesSelectDense = document.getElementById("sampleMinutesDense");
const breaksContainer = document.getElementById("breaksContainer");
const addBreakBtn = document.getElementById("addBreakBtn");
const slider = document.getElementById("timeSlider");
const timeSliderLabel = document.getElementById("timeSliderLabel");
const minusStep = document.getElementById("minusStep");
const plusStep  = document.getElementById("plusStep");
const minus10 = document.getElementById("minus10");
const plus10  = document.getElementById("plus10");
const minus60 = document.getElementById("minus60");
const plus60  = document.getElementById("plus60");
const minus1440 = document.getElementById("minus1440");
const plus1440  = document.getElementById("plus1440");
const optimizeMinutes = document.getElementById("granularityMinutes");
const optimizeCheckbox = document.getElementById("optimizeStart");
const modal = document.getElementById("optimizeModal");
const closeBtn = modal.querySelector(".close");
const optStartDateMin = document.getElementById("optStartDateMin");
const optStartDateMax = document.getElementById("optStartDateMax");
const optStartTimeMin = document.getElementById("optStartTimeMin");
const optStartTimeMax = document.getElementById("optStartTimeMax");
const maxAcceptableTemp = document.getElementById("maxAcceptableTemp");
const minAcceptableTemp = document.getElementById("minAcceptableTemp");
const optimizeBtn = document.getElementById("optimizeButton");
const errorMsg = document.getElementById("rangeError");
const errorMsgTemp = document.getElementById("tempRangeError");
const sliders = [
  { id: "rainSlider", valueId: "rainSliderValue" },
  { id: "windMaxSlider", valueId: "windMaxSliderValue" },
  { id: "windAvgSlider", valueId: "windAvgSliderValue" },
  { id: "tempSliderHot", valueId: "tempSliderHotValue" },
  { id: "tempSliderCold", valueId: "tempSliderColdValue" }
];
const isMobile = window.innerWidth <= 768;

// ---------- Init ----------
document.getElementById("timeSliderContainer").classList.add("disabled");

window.addEventListener("DOMContentLoaded", () => {
  // Set default start time to tomorrow at 07:00 (LOCAL string for datetime-local)
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 7, 0, 0, 0);
  const pad = n => n.toString().padStart(2, "0");
  const formatDateTimeLocal = d =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const formatDateLocal = d =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  startTimeInput.value = formatDateTimeLocal(tomorrow);
  /*timeSliderLabel.textContent = tomorrow.toLocaleString([], {
      dateStyle: "short",
      timeStyle: "short"
    });*/
  slider.value = 186

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const maxDate = new Date(todayMidnight.getTime() + 7 * 16 * 60 * 60 * 1000);
  optStartDateMin.min = optStartDateMax.min = formatDateLocal(todayMidnight);
  optStartDateMin.max = optStartDateMax.max = formatDateLocal(maxDate);
  optStartDateMin.value = formatDateLocal(todayMidnight);
  optStartDateMax.value = formatDateLocal(maxDate);
  optStartTimeMin.value = "07:00";
  optStartTimeMax.value = "09:00";

  // Initialize map
  const pictos = providerSel.value === "meteoblue" && pictogramsProvider.value === "meteoblue" ? "meteoblue" : "yr";
  ({ map, layerControl, baseLayers, overlays } = ensureMap(providerSel.value, pictos));
  tempLayerGroup = overlays["Temperature"];
  windLayerGroup = overlays["Wind"];
  // Initial attribution sync
  map.on("moveend zoomend", () => {
  const view = {
    center: map.getCenter(), // {lat, lng}
    zoom: map.getZoom()
  };
  sessionStorage.setItem("mapView", JSON.stringify(view));
  });
  map.on('baselayerchange', function() {
    const currentProvider = providerSel.value;
    const currentPictos = currentProvider === "meteoblue" && pictogramsProvider.value === "meteoblue" ? "meteoblue" : "yr";
    updateMapAttribution(currentProvider, currentPictos);
  });
  map.on("click", () => {
      // Reset all arrow markers
      visibleWeatherMarkers.forEach(m => {
        if (m._arrowBearing !== undefined) {
          m.setIcon(arrowIcon(m._arrowBearing, { scale: 1, opacity: 0.45 }));
        }
      });
  });
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
      updateLegendRange(currentMinT, currentMaxT, "legendBarMap", "legendTicksMap", "temp");
      updateLegendRange(currentMinT, currentMaxT, "legendBarTemp", "legendTicksTemp", "temp");
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
     updateLegendRange(currentMinW, currentMaxW, "legendBarWind", "legendTicksWind", "wind");
     updateLegendRange(currentMinW, currentMaxW, "legendBarMapWind", "legendTicksMapWind", "wind");
    }
  });

  map.whenReady(() => {
  const ctrl = document.querySelector('.leaflet-control-layers');
  if (ctrl) {
    ctrl.style.pointerEvents = 'auto';
    ctrl.style.opacity = '1';
  }
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

  document.querySelectorAll(".weather-icon, .break-icon, .flag-icon").forEach(el => {
    el.style.transform = `scale(${scale})`;
    el.style.transformOrigin = "center center";
  });
});
  validateReady();
  restoreFromSession();
});
  // ---------- Restore GPX from sessionStorage ----------
function restoreFromSession() {
    console.log("Restoring settings from sessionStorage...");
    [
    startTimeInput, speedInput, speedUp, speedDown, speedUnit,
    maxCallsInput, sampleMetersSelect, sampleMinutesSelect,
    sampleMetersSelectDense, sampleMinutesSelectDense,
    meteoblueKeyInput, providerSel, pictogramsProvider
  ].forEach(el => {
    const val = sessionStorage.getItem(el.id);
    if (val !== null) el.value = val;
  });

    const breaks = JSON.parse(sessionStorage.getItem('breaks') || '[]');
    breaksContainer.innerHTML = '';
    breaks.forEach(b => {
      const row = document.createElement('div');
      row.className = 'break-row';
      row.innerHTML = `
        <input type="number" class="break-km" min="0" step="0.1" value="${(b.distMeters / 1000).toFixed(2)}" />
        <input type="number" class="break-min" min="1" step="1" value="${Math.round(b.durSec / 60)}" />
        <button type="button" title="Remove break">✕</button>
      `;
      row.querySelector("button").addEventListener("click", () => {
        row.remove();
      });
      breaksContainer.appendChild(row);
    });

  const name = sessionStorage.getItem("gpxFileName");
  const content = sessionStorage.getItem("gpxFileContent");
  const gpxInput = document.getElementById("gpxFile");

  if (name && content) {
  const blob = new Blob([content], { type: "application/gpx+xml" });
  const file = new File([blob], name, { type: "application/gpx+xml" });

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  gpxInput.files = dataTransfer.files;

  // Trigger change event if needed
  gpxInput.dispatchEvent(new Event("change"));
  }
  const results = sessionStorage.getItem("gpxResults");
  const timeSteps = sessionStorage.getItem("gpxTimeSteps");
  const sampledPoints = JSON.parse(sessionStorage.getItem("gpxSampleIndices"));
  const points = JSON.parse(sessionStorage.getItem("gpxPoints"));

  const savedView = sessionStorage.getItem("mapView");
    if (savedView) {
      const { center, zoom } = JSON.parse(savedView);
      map.setView([center.lat, center.lng], zoom);
    }
  if (name && content && results && timeSteps) {
    gpxText = content;
    latestResults = JSON.parse(results);
    latestTimeSteps = JSON.parse(timeSteps);

    log(`Restored file from session: ${name} (${Math.round(content.length / 1024)} kB)`);

    // Re-enable UI
    validateReady();
    document.getElementById("timeSliderContainer").classList.remove("disabled");
    optimizeCheckbox.disabled = false;

    // Re-render map and charts
    const startDate = sessionStorage.getItem("startDate") ? new Date(sessionStorage.getItem("startDate")) : new Date(startTimeInput.value);
    const speedVal = parseFloat(speedInput.value);
    const mps = speedToMps(speedVal, speedUnit.value);
    const mpsUp = speedToMps(speedVal * (1 - getPercentInput("speedUp") ?? 0), speedUnit.value);
    const mpsDown = speedToMps(speedVal * (1 + getPercentInput("speedDown") ?? 0), speedUnit.value);

    const minSpacing = parseInt(sampleMetersSelect.value, 10);
    const minTimeSpacing = parseInt(sampleMinutesSelect.value, 10);
    const minSpacingDense = parseInt(sampleMetersSelectDense.value, 10);
    const minTimeSpacingDense = parseInt(sampleMinutesSelectDense.value, 10);

    const provider = providerSel.value;
    const pictos = provider === "meteoblue" && pictogramsProvider.value === "meteoblue" ? "meteoblue" : "yr";
    const aligned = JSON.parse(sessionStorage.getItem("gpxAlignedResults"));
    // Re-render everything
    updateMapAndCharts(
      points,
      aligned,
      breaks,
      minSpacing,
      minTimeSpacing,
      minSpacingDense,
      minTimeSpacingDense,
      pictos
    );
  }
}

// ---------- Helpers ----------
function adjustSlider(steps) {
  const newVal = Math.max(0, Math.min(slider.max,
    parseInt(slider.value, 10) + Math.round(steps)
  ));
  slider.value = newVal;
  slider.dispatchEvent(new Event("input")); // trigger existing handler
  updateStepButtons(); // refresh button states
}

function validateTempRanges() {
    let valid = true;
    let messages = [];
    const maxTemp = parseFloat(maxAcceptableTemp.value);
    const minTemp = parseFloat(minAcceptableTemp.value);
    if (minTemp >= maxTemp) {
        valid = false;
        messages.push("Min acceptable temp must be less than max acceptable temp.");
    }
    if (valid) {
        optimizeBtn.disabled = false;
        errorMsgTemp.style.display = "none";
    } else {
        optimizeBtn.disabled = true;
        errorMsgTemp.textContent = messages.join(" ");
        errorMsgTemp.style.display = "block";
    }
}

function validateRanges() {
  let valid = true;
  let messages = [];

  // Date check
  if (optStartDateMin.value && optStartDateMax.value) {
    const dMin = new Date(optStartDateMin.value);
    const dMax = new Date(optStartDateMax.value);
    if (dMin > dMax) {
      valid = false;
      messages.push("Earliest date must be before latest date.");
    }
  }

  // Time check
  if (optStartTimeMin.value && optStartTimeMax.value) {
    const [h1, m1] = optStartTimeMin.value.split(":").map(Number);
    const [h2, m2] = optStartTimeMax.value.split(":").map(Number);
    const minMinutes = h1 * 60 + m1;
    const maxMinutes = h2 * 60 + m2;
    if (minMinutes > maxMinutes) {
      valid = false;
      messages.push("Earliest time must be before latest time.");
    }
  }

  if (valid) {
    optimizeBtn.disabled = false;
    errorMsg.style.display = "none";
  } else {
    optimizeBtn.disabled = true;
    errorMsg.textContent = messages.join(" ");
    errorMsg.style.display = "block";
  }
}

function updateStepButtons() {
  const val = parseInt(slider.value, 10);
  const min = parseInt(slider.min, 10);
  const max = parseInt(slider.max, 10);

  const steps10 = Math.round(10 / stepMinutes);
  const steps60 = Math.round(60 / stepMinutes);
  const steps1440 = Math.round(1440 / stepMinutes);

  minusStep.disabled = (val <= min);
  plusStep.disabled  = (val >= max);

  minus10.disabled = (val - steps10 < min);
  plus10.disabled  = (val + steps10 > max);

  minus60.disabled = (val - steps60 < min);
  plus60.disabled  = (val + steps60 > max);

  minus1440.disabled = (val - steps1440 < min);
  plus1440.disabled  = (val + steps1440 > max);
}

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

function clearVisibleWeatherMarkers() {
  visibleWeatherMarkers = [];
}

function addVisibleWeatherMarker(marker) {
  visibleWeatherMarkers.push(marker);
}

function clearWindMarkers() {
  windMarkers.forEach(m => windMarkersLayerGroup.removeLayer(m));
  windMarkers = [];
}

function addWindMarker(marker) {
  windMarkers.push(marker);
}

function clearBreakMarkers() {
  breakMarkers.forEach(m => breakMarkersLayerGroup.removeLayer(m));
  breakMarkers = [];
}

function addBreakMarker(marker) {
  breakMarkers.push(marker);
}

function parseDateInput(value) {
  // value is "YYYY-MM-DD"
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d); // local midnight
}

function parseTimeInput(value) {
  // value is "HH:MM"
  const [h, min] = value.split(":").map(Number);
  return { hours: h, minutes: min };
}

function computeMetrics(weights, results, start) {
  const aligned = pickForecastAtETAs(results, start);

  let minRain = 0;
  const maxRain = Number(document.getElementById("maxAcceptableRain").value);
    if (maxRain === minRain) minRain = maxRain - 1;
  let minWind = 0;
  const maxWind = Number(document.getElementById("maxAcceptableWindAvg").value);
    if (maxWind === minWind) minWind = maxWind - 1;
  let minHeadWind = 0;
  const maxHeadWind = Number(document.getElementById("maxAcceptableWindMax").value);
    if (maxHeadWind === minHeadWind) minHeadWind = maxHeadWind - 1;
  const maxHotTemp = Number(document.getElementById("maxAcceptableTemp").value);
  const minColdTemp = Number(document.getElementById("minAcceptableTemp").value);
  const minHotTemp = (maxHotTemp + minColdTemp) / 2;
  const maxColdTemp = (maxHotTemp + minColdTemp) / 2;

  const rainNorm = aligned.map(p => (p.precip - minRain) / (maxRain - minRain));
  const windMaxNorm = aligned.map(p => (Math.max(-p.windEffectiveKmH, 0) - minHeadWind) / (maxHeadWind - minHeadWind));
  const windAvgNorm = aligned.map(p => (p.windKmH - minWind) / (maxWind - minWind));
  const tempHotNorm = aligned.map(p => (Math.max(p.tempC, minHotTemp) - minHotTemp) / (maxHotTemp - minHotTemp));
  const tempColdNorm = aligned.map(p => (Math.min(p.tempC, maxColdTemp) - maxColdTemp) / (minColdTemp - maxColdTemp));

  const rainAvg = rainNorm.reduce((sum, p) => sum + (p ?? 0), 0) / rainNorm.length;
  const headWindAvg = windMaxNorm.reduce((sum, p) => sum + (p ?? 0), 0) / windMaxNorm.length;
  const effWindAvg = windAvgNorm.reduce((sum, p) => sum + (p ?? 0), 0) / windAvgNorm.length;
  const tempHotAvg = tempHotNorm.reduce((sum, p) => sum + (p ?? 0), 0) / tempHotNorm.length;
  const tempColdAvg = tempColdNorm.reduce((sum, p) => sum + (p ?? 0), 0) / tempColdNorm.length;

  const score = rainAvg * (weights.rain || 0) +
                headWindAvg * (weights.windMax || 0) +
                effWindAvg * (weights.windAvg || 0) +
                tempHotAvg * (weights.temperatureHot || 0) +
                tempColdAvg * (weights.temperatureCold || 0);

  const res = {
    start,
    score,
    rainAvg: aligned.reduce((sum, p) => sum + (p.precip ?? 0), 0) / aligned.length,
    rainMax: Math.max(...aligned.map(p => p.precip ?? 0)),
    rainAboveMax: aligned.filter(p => (p.precip ?? 0) > maxRain).length,
    headWindMax: Math.max(...aligned.map(p => - p.windEffectiveKmH ?? 0)),
    headWindAvg: aligned.reduce((sum, p) => sum + (Math.max(-p.windEffectiveKmH ?? 0, 0)), 0) / aligned.length,
    headWindAboveMax: aligned.filter(p => (- p.windEffectiveKmH ?? 0) > maxHeadWind).length,
    windAvg: aligned.reduce((sum, p) => sum + (p.windKmH ?? 0), 0) / aligned.length,
    windMax: Math.max(...aligned.map(p => p.windKmH ?? 0)),
    windAboveMax: aligned.filter(p => (p.windKmH ?? 0) > maxWind).length,
    tempMin: Math.min(...aligned.map(p => p.tempC ?? 0)),
    tempMax: Math.max(...aligned.map(p => p.tempC ?? 0)),
    tempBelowMin: aligned.filter(p => (p.tempC ?? 0) < minColdTemp).length,
    tempAboveMax: aligned.filter(p => (p.tempC ?? 0) > maxHotTemp).length,
    tempAvg: aligned.reduce((sum, p) => sum + (p.tempC ?? 0), 0) / aligned.length
  };

  return res;
}

function optimizeStartTime(results, timeSteps, rangeDateMin, rangeDateMax, timeMinParts, timeMaxParts, weights) {
  const optimizeSteps = timeSteps.filter((t, idx) => {
    // idx * stepMinutes = minutes offset from globalMinTime
    const minutesFromStart = idx * stepMinutes;
    return minutesFromStart % optimizeMinutes.value === 0;
  });

  // Filter candidate times within allowed range
  const candidates = filterCandidates(optimizeSteps, rangeDateMin, rangeDateMax, timeMinParts, timeMaxParts);
  if (candidates.length === 0) return null;
  // Helper: normalize array to 0–1
  const normalizeFixed = (value, min, max) => {
    return (value - min) / (max - min);
  };
  const scores = candidates.map(start => computeMetrics(weights, results, start));

  // Pick best
  scores.sort((a, b) => a.score - b.score);
  return scores.slice(0, 5); // best 5 candidates
}

function updateMapAndCharts(points, aligned, breaks, minSpacing, minTimeSpacing,
minSpacingDense, minTimeSpacingDense, pictos) {
  if (!aligned.length) {
    log("No forecast results to render.");
    return;
  }
  // Clear old layers
  overlays["Temperature"].clearLayers();
  overlays["Wind"].clearLayers();
  clearWeatherMarkers();
  clearVisibleWeatherMarkers();
  clearWindMarkers();
  clearBreakMarkers();
  routeLayerGroup.clearLayers();

  // Outline
  const fullRoute = points.map(p => [p.lat, p.lon]);
  const outline = L.polyline(fullRoute, { color: "black", weight: 8, opacity: 0.85 });
  routeLayerGroup.addLayer(outline);

  // Temperature
  const temps = aligned.map(r => r.tempC).filter(t => isFinite(t));
  let minT = Math.min(...temps);
  let maxT = Math.max(...temps);
  if (!isFinite(minT) || !isFinite(maxT)) { minT = 0; maxT = 1; }
  if (maxT - minT < 0.1) { maxT = minT + 0.1; }

  const tempColor = makeColorer(minT, maxT, "temp");
  const interpolatedTemps = interpolateValues(points, aligned, "tempC");

  for (let s = 0; s < points.length - 1; s++) {
    const t = interpolatedTemps[s];
    const color = (t == null) ? "#cccccc" : tempColor(t);
    const seg = L.polyline(
      [[points[s].lat, points[s].lon], [points[s+1].lat, points[s+1].lon]],
      { color, weight: 5, opacity: 0.95 }
    );
    tempLayerGroup.addLayer(seg);
  }

  // Wind
  const winds = aligned.map(r => r.windEffectiveKmH).filter(w => isFinite(w));
  let minW = Math.min(...winds);
  let maxW = Math.max(...winds);
  if (!isFinite(minW) || !isFinite(maxW)) { minW = -1; maxW = 1; }
  if (maxW - minW < 0.1) { maxW = minW + 0.1; }

  const windColor = makeColorer(minW, maxW, "wind");
  const interpolatedWinds = interpolateValues(points, aligned, "windEffectiveKmH");
  for (let s = 0; s < points.length - 1; s++) {
    const eff = interpolatedWinds[s];
    const color = (eff == null) ? "#cccccc" : windColor(eff);
    const seg = L.polyline(
      [[points[s].lat, points[s].lon], [points[s+1].lat, points[s+1].lon]],
      { color, weight: 5, opacity: 0.95 }
    );
    windLayerGroup.addLayer(seg);
  }

  // Legends
  updateLegendRange(minT, maxT, "legendBarMap", "legendTicksMap", "temp");
  updateLegendRange(minT, maxT, "legendBarTemp", "legendTicksTemp", "temp");
  updateLegendRange(minW, maxW, "legendBarWind", "legendTicksWind", "wind");
  updateLegendRange(minW, maxW, "legendBarMapWind", "legendTicksMapWind", "wind");

  currentMinT = minT;
  currentMaxT = maxT;
  currentMinW = minW;
  currentMaxW = maxW;

  // Start/end/break markers
  const startFlag = flagIcon("🚩");
  const startMarker = L.marker([aligned[0].lat, aligned[0].lon], { icon: startFlag, title: "Start" })
    .addTo(breakMarkersLayerGroup);
  startMarker._baseVisible = true;
  addBreakMarker(startMarker);

  const endFlag = flagIcon("🏁");
  const endMarker = L.marker([aligned[aligned.length - 1].lat, aligned[aligned.length - 1].lon],
    { icon: endFlag, title: "End" })
    .addTo(breakMarkersLayerGroup);
  endMarker._baseVisible = true;
  addBreakMarker(endMarker);

  for (const b of breaks) {
    const breakFlag = breakIcon();
    const breakMarker = L.marker([b.lat, b.lon], { icon: breakFlag, opacity: breakLayerVisible ? 1 : 0 })
      .addTo(breakMarkersLayerGroup)
      .bindTooltip(`<strong>Break</strong><br>Distance: ${(b.distMeters/1000).toFixed(1)} km<br>Duration: ${Math.round(b.durSec/60)} min`);
    breakMarker._baseVisible = true;
    addBreakMarker(breakMarker);
  }

  // Weather/wind markers + popups
  const resultsWithFlags = flagIconPoints(aligned, minSpacing, minTimeSpacing);
  let wetPts = 0;
  for (const r of resultsWithFlags) {
        const isBreak = r.isBreak
    const weatherIcon = getWeatherPictogram(r.tempC, r.precip, r.cloudCover, r.cloudCoverLow, r.isDay, r.windKmH, r.gusts, r.pictocode, pictos);
    const imgSrc = pictos === "meteoblue" ? `images/meteoblue_pictograms/${weatherIcon}.svg` : `images/yr_weather_symbols/${weatherIcon}.svg`;
    const isNight = weatherIcon.endsWith("night");
    const bgColor = pictos === "meteoblue" ? (isNight ? "#003366" : "#90c8fc") : "white";
    const windSVG = windArrowWithBarbs(r.windDeg, r.windKmH);

    const weatherIconDiv = createWeatherIcon(imgSrc, bgColor);
    const weatherMarker = L.marker([r.lat, r.lon], { icon: weatherIconDiv, opacity: (!isBreak && weatherLayerVisible && r.showIcon) ? 1 : 0 }).addTo(weatherMarkersLayerGroup);
    weatherMarker._baseVisible = (!isBreak && r.showIcon);
    addWeatherMarker(weatherMarker);

      // Wind barb marker
    const windDiv = createWindIcon(windSVG);
    const windMarker = L.marker([r.lat, r.lon], { icon: windDiv, opacity: (!isBreak && windLayerVisible && r.showIcon) ? 1 : 0 }).addTo(windMarkersLayerGroup);
    windMarker._baseVisible = (!isBreak && r.showIcon);
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
        <div>Km from start: ${formatKm(r.accumDist)}</div>
        <div>Altitude: ${r.ele} m a.s.l.</div><br>
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

    weatherMarker.bindTooltip(popupHtml, { direction: "top", sticky: true, className: "forecast-tooltip" });
    windMarker.bindTooltip(popupHtml, { direction: "top", sticky: true, className: "forecast-tooltip" });

    const arrowMarker = L.marker([r.lat, r.lon], {
        icon: arrowIcon(r.travelBearing), opacity: (!isBreak && r.showIcon) ? 1 : 0
    }).addTo(routeLayerGroup);
    arrowMarker._arrowBearing = r.travelBearing;
    if (r.showIcon) visibleWeatherMarkers.push(arrowMarker);

    arrowMarker.bindTooltip(popupHtml, {
        direction: "top",
        sticky: true,
        className: "forecast-tooltip"
    });
    if ((r.precip || 0) >= 0.1) wetPts++;
  }

  const durationSec = aligned[aligned.length - 1].accumTime;
  const durationMeter = aligned[aligned.length - 1].accumDist;
  document.getElementById("statDistance").textContent = formatKm(durationMeter);
  document.getElementById("statDuration").textContent = formatDuration(durationSec);
  document.getElementById("statTempRange").textContent = `${minT.toFixed(1)}°C → ${maxT.toFixed(1)}°C`;
  document.getElementById("statWetShare").textContent = Math.round(100 * wetPts / aligned.length) + "%";

  // Charts
  let chartSeries = resultsWithFlags
    .map(r => ({
      t: r.eta, tempC: r.tempC, feltTempC: r.feltTempC, gusts: r.gusts,
      precip: r.precip, precipProb: r.precipProb, windKmh: r.windKmH, windDeg: r.windDeg,
      cloudCover: r.cloudCover, cloudCoverLow: r.cloudCoverLow, isDay: r.isDay,
      pictocode: r.pictocode, isBreak: r.isBreak, showIcon: r.showIcon
    }))
    .filter(r => r.showIcon)
    .sort((a, b) => +a.t - +b.t);
  chartSeries = chartSeries.map(s => ({ ...s, t: new Date(s.t) }));
  buildTempChart(chartSeries, visibleWeatherMarkers, pictos, isMobile);
  buildPrecipChart(chartSeries, visibleWeatherMarkers, isMobile);
  buildWindChart(chartSeries, visibleWeatherMarkers, isMobile);
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

const stepMinutes = parseInt(sampleMinutesSelectDense.value, 10);
minusStep.addEventListener("click", () => adjustSlider(-1));
plusStep.addEventListener("click", () => adjustSlider(1));
minus10.addEventListener("click", () => adjustSlider(-10 / stepMinutes));
plus10.addEventListener("click", () => adjustSlider(10 / stepMinutes));
minus60.addEventListener("click", () => adjustSlider(-60 / stepMinutes));
plus60.addEventListener("click", () => adjustSlider(60 / stepMinutes));
minus1440.addEventListener("click", () => adjustSlider(-1440 / stepMinutes));
plus1440.addEventListener("click", () => adjustSlider(1440 / stepMinutes));
slider.addEventListener("input", updateStepButtons);

sliders.forEach(s => {
  document.getElementById(s.id).addEventListener("input", updateLabels);
});
updateLabels();

[optStartDateMin, optStartDateMax, optStartTimeMin, optStartTimeMax].forEach(el => {
  el.addEventListener("input", validateRanges);
});

[maxAcceptableTemp, minAcceptableTemp].forEach(el => {
    el.addEventListener("input", validateTempRanges);
});

document.querySelector("#optimizeResultsModal .close").addEventListener("click", () => {
  document.getElementById("optimizeResultsModal").style.display = "none";
});

optimizeCheckbox.addEventListener("change", e => {
  if (e.target.checked) {
    modal.style.display = "flex";
  } else {
    modal.style.display = "none";
  }
});

closeBtn.addEventListener("click", () => {
  modal.style.display = "none";
  optimizeCheckbox.checked = false; // reset checkbox
});

window.addEventListener("click", e => {
  if (e.target === modal) {
    modal.style.display = "none";
    optimizeCheckbox.checked = false;
  }
});

document.getElementById("optimizeForm").addEventListener("submit", e => {
  e.preventDefault();
  const values = sliders.map(s => parseInt(document.getElementById(s.id).value, 10));
  const total = values.reduce((a, b) => a + b, 0) || 1;

  // Normalize to sum = 100
  const normalized = values.map(v => Math.round((v / total) * 100));

  // Apply back to sliders + labels
  sliders.forEach((s, i) => {
    document.getElementById(s.id).value = normalized[i];
    document.getElementById(s.valueId).textContent = normalized[i] + "%";
  });

  const rangeDateMin = parseDateInput(optStartDateMin.value);
  const rangeDateMax = parseDateInput(optStartDateMax.value);
  const timeMinParts = parseTimeInput(optStartTimeMin.value);
  const timeMaxParts = parseTimeInput(optStartTimeMax.value);

  const weights = {
    rain: parseInt(document.getElementById("rainSlider").value, 10),
    windMax: parseInt(document.getElementById("windMaxSlider").value, 10),
    windAvg: parseInt(document.getElementById("windAvgSlider").value, 10),
    temperatureHot: parseInt(document.getElementById("tempSliderHot").value, 10),
    temperatureCold: parseInt(document.getElementById("tempSliderCold").value, 10)
  };
  const bestCandidates = optimizeStartTime(latestResults, latestTimeSteps, rangeDateMin, rangeDateMax, timeMinParts, timeMaxParts, weights);
  if (bestCandidates.length) {
  const list = document.getElementById("optimizeResultsList");
  list.innerHTML = "";

  bestCandidates.forEach((c, idx) => {
  const card = document.createElement("div");
  card.className = "result-card";

  // summary row
  const summary = document.createElement("div");
  summary.className = "result-summary";
  summary.textContent = `${c.start.toLocaleString([], { dateStyle: "short", timeStyle: "short" })}`;
  card.appendChild(summary);

  // details section
  const details = document.createElement("div");
  details.className = "result-details";

  details.innerHTML = `
    <div>Score: ${(100 - c.score).toFixed(1)}%</div>
    <br>
    <div><strong>🌧️ Precipitation</strong> avg: ${c.rainAvg.toFixed(1)} mm/h, max: ${c.rainMax.toFixed(1)} mm/h</div>
    <div><strong>💨 Headwind</strong> avg: ${c.headWindAvg.toFixed(1)} km/h, max: ${c.headWindMax.toFixed(1)} km/h</div>
    <div><strong>💨 Wind</strong> avg: ${c.windAvg.toFixed(1)} km/h, max: ${c.windMax.toFixed(1)} km/h</div>
    <div><strong>🌡️ Temperature</strong> avg: ${c.tempAvg.toFixed(1)}°C, min: ${c.tempMin.toFixed(1)}°C, max: ${c.tempMax.toFixed(1)}°C</div>
  `;

  if (c.rainAboveMax === 0 && c.headWindAboveMax === 0 && c.windAboveMax === 0 && c.tempBelowMin === 0 && c.tempAboveMax === 0) {
    const note = document.createElement("div");
    note.style.marginBottom = "8px";
    note.innerHTML = `<br>✅ All conditions within acceptable limits`;
    details.appendChild(note);
  }
    else {
        const note = document.createElement("div");
        note.style.marginBottom = "8px";
        let issues = [];
        if (c.rainAboveMax > 0) issues.push(`precipitation`);
        if (c.headWindAboveMax > 0) issues.push(`headwind`);
        if (c.windAboveMax > 0) issues.push(`wind`);
        if (c.tempBelowMin > 0) issues.push(`low temperature`);
        if (c.tempAboveMax > 0) issues.push(`high temperature`);
        note.innerHTML = `<br>⚠️ Some conditions exceed acceptable limits: ${issues.join(", ")}`;
        details.appendChild(note);
    }

  const applyBtn = document.createElement("button");
  applyBtn.textContent = "Apply this start time";
  applyBtn.addEventListener("click", () => {
    const i = latestTimeSteps.findIndex(t => +t === +c.start);
    slider.value = i;
    timeSliderLabel.textContent = c.start.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    slider.dispatchEvent(new Event("input"));
    document.getElementById("optimizeResultsModal").style.display = "none";
  });
  details.appendChild(applyBtn);

  card.appendChild(details);

  // toggle expand/collapse, but only one at a time
  summary.addEventListener("click", () => {
    // collapse all other cards
    document.querySelectorAll(".result-card.expanded").forEach(el => {
      if (el !== card) el.classList.remove("expanded");
    });
    // toggle this one
    card.classList.toggle("expanded");
  });

  list.appendChild(card);
});

  document.getElementById("optimizeResultsModal").style.display = "flex";
}
  /*if (best) {
    console.log("Best start:", best.start, "score:", best.score);
    // Update slider + label
    const idx = latestTimeSteps.findIndex(t => +t === +best.start);
    slider.value = idx;
    timeSliderLabel.textContent = best.start.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
  }
  */
  modal.style.display = "none";
  optimizeCheckbox.checked = false;
});

fileInput.addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    gpxText = await f.text();
    log(`Loaded file: ${f.name} (${Math.round(f.size / 1024)} kB)`);
    // 🔥 Save to sessionStorage
    sessionStorage.setItem("gpxFileName", f.name);
    sessionStorage.setItem("gpxFileContent", gpxText);
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
  maxCallsInput, sampleMetersSelect, sampleMinutesSelect,
  sampleMetersSelectDense, sampleMinutesSelectDense,
  meteoblueKeyInput, providerSel, pictogramsProvider
].forEach(el => {
  el.addEventListener("input", () => {
    sessionStorage.setItem(el.id, el.value);
    validateReady();
  });
  el.addEventListener("change", () => {
    sessionStorage.setItem(el.id, el.value);
    validateReady();
  });
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

    const maxCalls = Math.max(5, Math.min(1000, parseInt(maxCallsInput.value || "60", 10)));
    const minSpacing = parseInt(sampleMetersSelect.value, 10);
    const minTimeSpacing = parseInt(sampleMinutesSelect.value, 10);
    const minSpacingDense = parseInt(sampleMetersSelectDense.value, 10);
    const minTimeSpacingDense = parseInt(sampleMinutesSelectDense.value, 10);
    const provider = providerSel.value;
    const pictos = provider === "meteoblue" && pictogramsProvider.value === "meteoblue" ? "meteoblue" : "yr";
    const mbKey = meteoblueKeyInput.value.trim();

    processBtn.disabled = true;
    await processRoute(gpxText, startDate, mps, mpsUp, mpsDown, maxCalls, minSpacing, minTimeSpacing, provider, pictos, mbKey,
    minSpacingDense, minTimeSpacingDense);
    document.getElementById("timeSliderContainer").classList.remove("disabled");
    optimizeCheckbox.disabled = false;
  } catch (e) {
    log("Failed: " + e.message);
  } finally {
    validateReady();
  }
});

// ---------- Core: processRoute ----------
async function processRoute(gpxText, startDate, avgSpeedMps, avgSpeedMpsUp, avgSpeedMpsDown, maxCalls,
minSpacing, minTimeSpacing, provider, pictos, mbKey, minSpacingDense, minTimeSpacingDense) {
  // Reset UI
  clearWeatherMarkers();
  clearVisibleWeatherMarkers();
  clearWindMarkers();
  clearBreakMarkers();
  routeLayerGroup.clearLayers();
  document.getElementById("statDistance").textContent = "–";
  document.getElementById("statDuration").textContent = "–";
  document.getElementById("statTempRange").textContent = "–";
  document.getElementById("statWetShare").textContent = "–";
  document.getElementById("log").textContent = "";
  resetChart();

  log("Parsing GPX...");

  const pointsRaw = parseGPX(gpxText);
  setupBreakValidation(pointsRaw);
  const breaks = getBreaks(pointsRaw);
  sessionStorage.setItem("breaks", JSON.stringify(breaks));
  const points = insertBreaksIntoPoints(pointsRaw, breaks, minTimeSpacingDense);
  sessionStorage.setItem("gpxPoints", JSON.stringify(points));
  const { cum, total } = cumulDistance(points);
  const brngs = segmentBearings(points);
  const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon]));
  map.fitBounds(bounds.pad(0.1));
  map.invalidateSize();
  const view = {
  center: map.getCenter(), // {lat, lng}
  zoom: map.getZoom()
  };
  sessionStorage.setItem("mapView", JSON.stringify(view));

  // Grey base line
  const baseLine = L.polyline(points.map(p => [p.lat, p.lon]), { color: "#777", weight: 3, opacity: 0.35 });
  routeLayerGroup.addLayer(baseLine);

  // Sampling
  const sampleIdx = buildSampleIndices(points, brngs, cum, maxCalls, minSpacingDense, minTimeSpacingDense, avgSpeedMps,
  avgSpeedMpsUp, avgSpeedMpsDown, startDate, breaks);
  sessionStorage.setItem("gpxSampleIndices", JSON.stringify(sampleIdx));
  log(`Sampling ${sampleIdx.length} points (limit ${maxCalls}, spacing ≥ ${minSpacingDense} meters and ≥ ${minTimeSpacingDense} minutes).`);
  const durationSecLog = sampleIdx[sampleIdx.length - 1].accumTime;
  log(`Route has ${pointsRaw.length} points, ${formatKm(cumulDistance(points).total)} total.`);
  log(`Expected travel time (no breaks): ${formatDuration(durationSecLog - breakOffsetSeconds(cumulDistance(points).total, breaks))} at an average speed of ${(avgSpeedMps*3.6).toFixed(1)} km/h.`);
    if (breaks.length) {
        log(`Expected travel time (with breaks): ${formatDuration(durationSecLog)}.`);
    }

  // Fetch forecasts
  const results = [];
  const errors = [];
  const CONCURRENCY = 8;
  let i = 0;
    let completed = 0;
    const totalProgress = sampleIdx.length;
    const modal = document.getElementById("progressOverlay");
    const bar = document.getElementById("progressBar");
    const text = document.getElementById("progressText");

    // Show modal before starting
    modal.style.display = "flex";

    function updateProgress() {
      completed++;
      const pct = Math.round((completed / totalProgress) * 100);
      bar.style.width = pct + "%";
      text.textContent = pct + "%";

      if (completed === totalProgress) {
        text.textContent = "Done ✔";
        setTimeout(() => {
          modal.style.display = "none";
        }, 1500);
      }
    }

async function worker() {

  while (i < sampleIdx.length) {
    const my = i++;
    const p = sampleIdx[my];

    try {
      const fc = await getForecast(p.lat, p.lon, provider, mbKey);

      results.push({
        ...p,
        times: fc.times.map(t => new Date(t)),   // keep the full time array
        tempC: fc.tempC.map(Number),
        feltTempC: fc.feltTempC.map(Number),
        gusts: fc.windGusts.map(Number),
        windKmH: fc.windSpeedKmH.map(Number),
        windDeg: fc.windFromDeg.map(Number),
        windEffectiveKmH: fc.windSpeedKmH.map((spd, i) =>
          effectiveWind(p.travelBearing, fc.windFromDeg[i], spd)
        ),
        precip: fc.precipMmHr.map(Number),
        precipProb: fc.precipProb.map(Number),
        cloudCover: fc.cloudCover.map(Number),
        cloudCoverLow: fc.cloudCoverLow.map(Number),
        isDay: fc.isDay.map(Number),
        pictocode: fc.pictocode.map(v => Number(v ?? -1)),
      });
    } catch (e) {
      errors.push({ my, reason: e.message });
      log(`Forecast error @${my}: ${e.message}`);
    } finally {
      updateProgress();
    }
  }
}
  const workers = Array.from({ length: Math.min(CONCURRENCY, sampleIdx.length) }, () => worker());
  await Promise.all(workers);
  latestResults = results;
  sessionStorage.setItem("gpxResults", JSON.stringify(results));
  // Now compute global time range across all results
  const allTimes = results.flatMap(r => r.times);
  const allAccumTime = results.flatMap(r => r.accumTime);
  const globalMinTime = new Date(allTimes.reduce((min, d) => Math.min(min, d), Infinity));
  // const globalMinTime = new Date();
  const globalMaxTime = new Date(allTimes.reduce((max, d) => Math.max(max, d), -Infinity));
  const tripDurationMs = Math.max(...allAccumTime) * 1000;
  const latestStartTime = new Date(globalMaxTime.getTime() - tripDurationMs);

  // Build time steps
  const timeSteps = [];
  // const stepMinutes = 1;
  for (let t = new Date(globalMinTime); t <= latestStartTime; t.setMinutes(t.getMinutes() + stepMinutes)) {
    timeSteps.push(new Date(t));
  }
  latestTimeSteps = timeSteps;
  sessionStorage.setItem("gpxTimeSteps", JSON.stringify(timeSteps));

  // Setup slider once
  slider.max = timeSteps.length - 1;
  // Find index of startDate in timeSteps (nearest)
  let startIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < timeSteps.length; i++) {
    const diff = Math.abs(timeSteps[i] - startDate);
    if (diff < minDiff) {
    minDiff = diff;
    startIdx = i;
    }
  }

  // Set slider thumb to startDate position
  slider.value = startIdx;

  timeSliderLabel.textContent = latestTimeSteps[startIdx].toLocaleString([], {
    dateStyle: "short",
    timeStyle: "short"
  });

  slider.addEventListener("input", () => {
    const newStart = latestTimeSteps[slider.value];
    sessionStorage.setItem("startDate", newStart);
    timeSliderLabel.textContent = newStart.toLocaleString([], {
      dateStyle: "short",
      timeStyle: "short"
    });

    const aligned = pickForecastAtETAs(results, newStart);
    sessionStorage.setItem("gpxAlignedResults", JSON.stringify(aligned));
    const pad = n => n.toString().padStart(2, "0");
    startTimeInput.value =
    `${newStart.getFullYear()}-${pad(newStart.getMonth() + 1)}-${pad(newStart.getDate())}T${pad(newStart.getHours())}:${pad(newStart.getMinutes())}`;
    updateMapAndCharts(points, aligned, breaks, minSpacing, minTimeSpacing, minSpacingDense, minTimeSpacingDense, pictos);
  });

  const resultsInitialStartDate = pickForecastAtETAs(results, startDate);
  sessionStorage.setItem("startDate", startDate)
  console.log('Results with initial start date:', resultsInitialStartDate);
  sessionStorage.setItem("gpxAlignedResults", JSON.stringify(resultsInitialStartDate));
  updateMapAndCharts(points, resultsInitialStartDate, breaks, minSpacing, minTimeSpacing, minSpacingDense, minTimeSpacingDense, pictos);

  if (errors.length) log(`Completed with ${errors.length} missing points (outside forecast range or fetch errors).`);
  else log("Completed successfully.");
}