
export let map = null;
export let routeLayerGroup = null;
export let tempLegendControl = null;

// Returns a weather icon based on temperature and precipitation and day light
export function getWeatherIcon(tempC, precip, isDay) {
  if (precip >= 4) return "⛈️"; // heavy rain
  if (precip >= 1) return "🌧️"; // rain
  if (precip >= 0.1) return isDay ? "🌦️" : "🌧️"; // light rain

  if (tempC >= 28) return isDay ? "☀️" : "🌙"; // hot/sunny or clear night
  if (tempC >= 18) return isDay ? "🌤️" : "🌙"; // warm/partly sunny or clear night
  if (tempC >= 8) return isDay ? "⛅": "☁️"; // mild/cloudy (same for day/night)
  if (tempC >= 0) return "☁️"; // cool/cloudy
  return "❄️"; // cold/snowy
}

export function getWeatherIconCombo(tempC, precip, isDay) {
  // Define base icons for day
  let icon = "";
  if (precip >= 4) {
    icon = "⛈️"; // heavy rain
  } else if (precip >= 1) {
    icon = "🌧️"; // rain
  } else if (precip >= 0.1) {
    icon = "🌦️"; // light rain
  } else if (tempC >= 28) {
    icon = "☀️"; // hot/sunny
  } else if (tempC >= 18) {
    icon = "🌤️"; // warm/partly sunny
  } else if (tempC >= 8) {
    icon = "⛅"; // mild/cloudy
  } else if (tempC >= 0) {
    icon = "☁️"; // cool/cloudy
  } else {
    icon = "❄️"; // cold/snowy
  }

  // Adjust for night
  if (!isDay) {
    switch (icon) {
      case "☀️": icon = "🌙"; break;             // clear night
      case "🌤️": icon = "🌙☁️"; break;          // partly cloudy night
      case "⛅": icon = "🌙☁️☁️"; break;         // cloudy night
      case "☁️": icon = "🌙☁️"; break;          // overcast night
      case "🌦️": icon = "🌙🌧️"; break;         // light rain at night
      case "🌧️": icon = "🌙🌧️"; break;         // rain at night
      case "⛈️": icon = "🌙⛈️"; break;         // thunderstorm at night
      case "❄️": icon = "🌙❄️"; break;         // snow at night
    }
  }

  return icon;
}

/**
 * Return a Meteoblue pictogram code (e.g., "01_day", "23_night")
 * based on temp, precip, cloud cover, fog indicator, wind, and time of day.
 */
export function getWeatherPictogramMeteoBlue(tempC, precip, cloudCover, cloudCoverLow, isDay, windKmH = 0, gusts = 0) {
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

export function getWeatherPictogram(tempC, precip, cloudCover, cloudCoverLow, isDay, windKmH = 0, gusts = 0) {
  const suffix = isDay ? "d" : "n";
  const windMax = Math.max(windKmH, gusts);

  // --- Fog ---
  if (precip < 0.1 && cloudCoverLow >= 80 && windKmH < 10) {
    return "15"; // Fog
  }

  // --- Helper: precip type ---
  const precipType = (() => {
    if (tempC <= 1) return "snow";
    if (tempC < 3) return "sleet";
    return "rain";
  })();

  // --- Helper: intensity ---
  const intensity = (() => {
    if (precip >= 8) return "heavy";
    if (precip >= 2) return "normal";
    if (precip >= 0.5) return "light";
    if (precip >= 0.1) return "verylight";
    return "none";
  })();

  // --- Thunder detection (simple heuristic) ---
  const thunder = precip >= 4 && windMax >= 15;

  // --- Precipitation handling ---
  if (precip >= 0.1) {
    const showers = precip < 2; // heuristic: drizzle/light → showers

    // Thunder cases
    if (thunder) {
      if (showers) {
        if (precipType === "snow") return "28" + suffix; // light snow showers + thunder
        if (precipType === "sleet") return "26" + suffix; // light sleet showers + thunder
        return "24" + suffix; // light rain showers + thunder
      } else {
        if (precipType === "snow") return intensity === "heavy" ? "34" : "33"; // snow + thunder
        if (precipType === "sleet") return intensity === "heavy" ? "32" : "31"; // sleet + thunder
        return intensity === "heavy" ? "11" : "30"; // rain + thunder
      }
    }

    // Non-thunder cases
    if (showers) {
      if (precipType === "snow") {
        if (intensity === "light" || intensity === "verylight") return "44" + suffix;
        if (intensity === "heavy") return "45" + suffix;
        return "08" + suffix;
      }
      if (precipType === "sleet") {
        if (intensity === "light" || intensity === "verylight") return "42" + suffix;
        if (intensity === "heavy") return "43" + suffix;
        return "07" + suffix;
      }
      if (precipType === "rain") {
        if (intensity === "light" || intensity === "verylight") return "40" + suffix;
        if (intensity === "heavy") return "41" + suffix;
        return "05" + suffix;
      }
    } else {
      if (precipType === "snow") {
        if (intensity === "light") return "49";
        if (intensity === "heavy") return "50";
        return "13";
      }
      if (precipType === "sleet") {
        if (intensity === "light") return "47";
        if (intensity === "heavy") return "48";
        return "12";
      }
      if (precipType === "rain") {
        if (intensity === "light") return "46";
        if (intensity === "heavy") return "10";
        return "09";
      }
    }
  }

  // --- Dry sky logic ---
  if (cloudCover <= 10) return "01" + suffix;
  if (cloudCover <= 30) return "02" + suffix;
  if (cloudCover <= 70) return "03" + suffix;
  return "04"; // heavily clouded
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

export function windArrowWithBarbs(deg, windKmh) {
  const rotation = (deg + 180) % 360; // meteorological "from" direction
  // Geometry
  const arrowStroke = 3;
  const barbStroke = 2;
  const fullBarbLength = 8;
  const barbSpacing = 4;
  const circleRadius = 6;

  // Shaft coordinates in centered system
  const shaftY1 = -16; // arrowhead end
  const shaftY2 =  16; // tail end
  const shaftX  =  0;

  // Determine number of barbs
  let full = 0, half = 0, pennant = false;
  if (windKmh > 50) {
    pennant = true;
  }
  else if (windKmh <= 10) { full = 1; }
  else if (windKmh <= 20) { full = 2; }
  else if (windKmh <= 30) { full = 3; }

  // Build horizontal barbs (always to the right of shaft)
  let barbElements = "";
  if (pennant) {
    barbElements += `<polygon points="${shaftX + 2},${shaftY2} ${shaftX + 2 + fullBarbLength},${shaftY2 - fullBarbLength} ${shaftX + 2},${shaftY2 - barbSpacing}"
      fill="black" />`;
  } else {
    let yPos = shaftY2;
    for (let i = 0; i < full; i++) {
      barbElements += `<line x1="${shaftX + 2}" y1="${yPos}" x2="${shaftX + 2 + fullBarbLength}" y2="${yPos}"
        stroke="black" stroke-width="${barbStroke}" stroke-linecap="round" />`;
      yPos -= barbSpacing;
    }
    if (half) {
      barbElements += `<line x1="${shaftX + 2}" y1="${yPos}" x2="${shaftX + 2 + halfBarbLength}" y2="${yPos}"
        stroke="black" stroke-width="${barbStroke}" stroke-linecap="round" />`;
    }
  }
  const speedStr = Math.round(windKmh).toString();
  const digitCount = speedStr.length;
  let fontSize;
    if (digitCount === 1) {
      fontSize = 9;
    } else if (digitCount === 2) {
      fontSize = 8;
    } else {
      fontSize = 7;
    }

  // Tail circle + upright text (inside rotating group)
  const speedCircle = `
    <circle cx="${shaftX}" cy="${shaftY2}" r="${circleRadius}" fill="black" />
    <g transform="rotate(${-rotation}, ${shaftX}, ${shaftY2})">
      <text x="${shaftX}" y="${shaftY2 + 2}" text-anchor="middle" font-size="${fontSize}" font-weight="bold" fill="white">
        ${Math.round(windKmh)}
      </text>
    </g>
  `;

  return `
    <svg width="40" height="40" viewBox="-22 -22 44 44">
      <!-- Rotating group: arrow + circle -->
      <g transform="rotate(${rotation})">
        <line x1="${shaftX}" y1="${shaftY1}" x2="${shaftX}" y2="${shaftY2}"
              stroke="black" stroke-width="${arrowStroke}" stroke-linecap="round" />
        <polygon points="${shaftX - 6},${shaftY1 + 4} ${shaftX},${shaftY1 - 4} ${shaftX + 6},${shaftY1 + 4}"
                 fill="black" />
        ${speedCircle}
      </g>
      <!-- Static horizontal barbs to the right -->
       <!-- ${barbElements} -->
    </svg>
  `;
}

export function windBarbs(windKmh) {
  if (windKmh >= 40) return "≡"; // 3 barbs
  if (windKmh >= 20) return "="; // 2 barbs
  if (windKmh >= 5)  return "-"; // 1 barb
  return ""; // calm
}

export function ensureMap(provider) {
      if (map) return;
      map = L.map("map", { zoomControl: true, fullscreenControl: true });
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

      let weatherAttr = provider === "meteoblue" ? ' | Weather data © <a href="https://www.meteoblue.com/" target="_blank">Meteoblue</a>' : ' | Weather data © <a href="https://open-meteo.com/" target="_blank">Open-Meteo</a>';
      weatherAttr += ' | Weather symbols © <a href="https://nrkno.github.io/yr-weather-symbols/" target="_blank">MET Norway</a>';
      const openTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)' + weatherAttr
    });
    const openCycle = L.tileLayer('https://{s}.tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=70a9b978ca5f485d82d655fbacc0eee0', {
      maxZoom: 18,
      attribution: 'Maps © Thunderforest, Data © OpenStreetMap contributors' + weatherAttr
    });
    const openStreet = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap" + weatherAttr
      })

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
  attribution += ' | Weather symbols © <a href="https://nrkno.github.io/yr-weather-symbols/" target="_blank">MET Norway</a>';

  activeBaseLayer.setAttribution(attribution);
}