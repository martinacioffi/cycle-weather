
export let map = null;
export let routeLayerGroup = null;
export let tempLegendControl = null;

// Returns a weather icon based on temperature and precipitation
export function getWeatherIcon(tempC, precip) {
  if (precip >= 4) return "⛈️"; // heavy rain
  if (precip >= 1) return "🌧️"; // rain
  if (precip >= 0.1) return "🌦️"; // light rain
  if (tempC >= 28) return "☀️"; // hot/sunny
  if (tempC >= 18) return "🌤️"; // warm/partly sunny
  if (tempC >= 8) return "⛅"; // mild/cloudy
  if (tempC >= 0) return "☁️"; // cool/cloudy
  return "❄️"; // cold/snowy
}

/**
 * Return a Meteoblue pictogram code (e.g., "01_day", "23_night")
 * based on temp, precip, cloud cover, fog indicator, wind, and time of day.
 */
export function getWeatherPictogram(tempC, precip, cloudCover, cloudCoverLow, isDay, windKmH = 0, gusts = 0) {
  const suffix = isDay ? "_day" : "_night";

  // Thresholds
  const windy = Math.max(windKmH, gusts) >= 40;  // strong wind/gust threshold (km/h)
  const stormy = Math.max(windKmH, gusts) >= 60; // very strong winds

  // Fog/low stratus
  if (cloudCoverLow >= 80 && precip < 0.1 && windKmH < 10) {
    return "16" + suffix; // Fog
  }

  // Thunderstorms
  if (precip >= 8) return "30" + suffix;
  if (precip >= 4) return "27" + suffix;

  // Snow / mixed / rain
  if (precip >= 2 && tempC <= 1) return "29" + suffix; // Heavy snowstorm
  if (precip >= 2) return "25" + suffix; // Heavy rain
  if (precip >= 1 && tempC <= 1) return "26" + suffix; // Snow
  if (precip >= 1 && tempC > 0 && tempC < 3) return "35" + suffix; // Mix
  if (precip >= 1) return "23" + suffix; // Rain
  if (precip >= 0.5 && tempC <= 1) return "24" + suffix; // Light snow
  if (precip >= 0.5) return "33" + suffix; // Light rain
  if (precip >= 0.1 && tempC <= 1) return "34" + suffix; // Very light snow

  // At this point: negligible precip — decide by wind + clouds

  // **Windy variants** — based on Meteoblue's windy pictos
  if (windy) {
    if (cloudCover <= 30) return "05" + suffix; // Mostly sunny, windy
    if (cloudCover <= 60) return "08" + suffix; // Partly cloudy, windy
    if (cloudCover <= 80) return "20" + suffix; // Mostly cloudy, windy
    return "21" + suffix; // Overcast, windy
  }

  // Normal (non-windy) cloud logic
  if (cloudCover <= 10) return "01" + suffix; // Clear
  // Clear with cirrus variants
  if (cloudCover <= 30 && cloudCoverLow <= 10 && cloudCover > 0) return "02" + suffix;
  if (cloudCover <= 60 && cloudCoverLow <= 10) return "03" + suffix;
  if (cloudCover <= 30) return "04" + suffix; // Few clouds
  if (cloudCover <= 60) return "07" + suffix; // Partly cloudy
  if (cloudCover <= 80) return "19" + suffix; // Mostly cloudy
  return "22" + suffix; // Overcast
}

// Returns a directional arrow based on wind degrees (8-point compass)
export function dirArrow8(deg) {
      const dirs = [
        { a: 0, ch: "↓" },   // from N
        { a: 45, ch: "↙" },  // from NE
        { a: 90, ch: "←" },  // from E
        { a: 135, ch: "↖" }, // from SE
        { a: 180, ch: "↑" }, // from S
        { a: 225, ch: "↗" }, // from SW
        { a: 270, ch: "→" }, // from W
        { a: 315, ch: "↘" }  // from NW
      ];
      let nearest = dirs[0], best = 999;
      for (const d of dirs) {
        const diff = Math.abs(((deg - d.a + 540) % 360) - 180);
        if (diff < best) { best = diff; nearest = d; }
      }
      return nearest.ch;
    }

export function windBarbs(windKmh) {
  if (windKmh >= 40) return "≡"; // 3 barbs
  if (windKmh >= 20) return "≡".slice(0,2); // 2 barbs
  if (windKmh >= 5)  return "≡".slice(0,1); // 1 barb
  return ""; // calm
}

export function ensureMap(provider) {
      if (map) return;
      map = L.map("map", { zoomControl: true, fullscreenControl: true });
      const openStreet = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap"
      })
      routeLayerGroup = L.layerGroup().addTo(map);

      // Also add floating legend on map
      tempLegendControl = L.control({ position: "bottomright" });
      tempLegendControl.onAdd = function() {
        const div = L.DomUtil.create("div", "legend-temp");
        div.innerHTML = `
          <div><strong>Temperature (°C)</strong></div>
          <div class="legend-bar" id="legendBarMap"></div>
          <div class="legend-ticks" id="legendTicksMap">
            <span>-</span><span>-</span><span>-</span><span>-</span><span>-</span>
          </div>
        `;
        return div;
      };

      const weatherAttr = provider === "meteoblue" ? ' | Weather data © <a href="https://www.meteoblue.com/" target="_blank">Meteoblue</a>' : ' | Weather data © <a href="https://open-meteo.com/" target="_blank">Open-Meteo</a>';

      const openTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)' + weatherAttr
    });
    const openCycle = L.tileLayer('https://{s}.tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=70a9b978ca5f485d82d655fbacc0eee0', {
      maxZoom: 18,
      attribution: 'Maps © Thunderforest, Data © OpenStreetMap contributors' + weatherAttr
    });

    // Add OpenTopoMap as default
    openTopo.addTo(map);

    // Layer control
    const baseLayers = {
      "OpenTopoMap": openTopo,
      "OpenCycleMap": openCycle,
      "OpenStreetMap": openStreet
    };
    L.control.layers(baseLayers).addTo(map);
      tempLegendControl.addTo(map);
      return map;
    }

function updateMapAttribution(provider) {
  let attribution = "&copy; OpenStreetMap";

  if (provider === "meteoblue") {
    attribution += ' | Weather data © <a href="https://www.meteoblue.com/" target="_blank">Meteoblue</a>';
  } else if (provider === "openmeteo") {
    attribution += ' | Weather data © <a href="https://open-meteo.com/" target="_blank">Open-Meteo</a>';
  }

  activeBaseLayer.setAttribution(attribution);
}