
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

export function ensureMap() {
      if (map) return;
      map = L.map("map", { zoomControl: true, fullscreenControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap"
      }).addTo(map);
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
      const openTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)'
    });
    const openCycle = L.tileLayer('https://{s}.tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=70a9b978ca5f485d82d655fbacc0eee0', {
      maxZoom: 18,
      attribution: 'Maps © Thunderforest, Data © OpenStreetMap contributors'
    });

    // Add OpenTopoMap as default
    openTopo.addTo(map);

    // Layer control
    const baseLayers = {
      "OpenTopoMap": openTopo,
      "OpenCycleMap": openCycle
    };
    L.control.layers(baseLayers).addTo(map);
      tempLegendControl.addTo(map);
      return map;
    }