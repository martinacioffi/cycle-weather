export function getWeatherPictogram(tempC, precip, cloudCover, cloudCoverLow, isDay, windKmH = 0, gusts = 0, pictocode = -1, pictos="yr") {

  // --- Use pictocode if provided and selected pictogram provider is MeteoBlue ---
  if (pictos === "meteoblue" && pictocode !== -1 && Number.isFinite(pictocode)) {
    const suffix = isDay ? "day" : "night";
    const padded = pictocode < 10 ? `0${pictocode}` : `${pictocode}`;
    return `${padded}_${suffix}`;
  }

  if (pictocode !== -1 && Number.isFinite(pictocode)) {
    const suffix = isDay ? "d" : "n";
    const padded = pictocode < 10 ? `0${pictocode}` : `${pictocode}`;
    return `${padded}${suffix}`;
  }
  }

  /*const suffix = isDay ? "d" : "n";
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
}*/

export function dirArrow8(deg) {
  // Normalize degrees to 0–360
  const angle = ((deg % 360) + 360) % 360;
  // Return a span with inline rotation
  return `<span class="wind-arrow" style="display:inline-block; transform: rotate(${angle + 180}deg)">↑</span>`;
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

export function arrowIcon(bearingDeg, { scale = 1, opacity = 0.45 } = {}) {
  const size = 8 * scale;
  const half = size / 2;

  return L.divIcon({
    html: `<div class="route-arrow" style="
              width: 0; height: 0;
              border-left: ${half}px solid transparent;
              border-right: ${half}px solid transparent;
              border-bottom: ${size}px solid rgba(0,0,0,${opacity});
              transform: rotate(${bearingDeg}deg);
            "></div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [half, half]
  });
}

export function flagIcon(flagEmoji) {
  return L.divIcon({
    html: `<div class="flag-icon">
             <span style="font-size:22px;">
               ${flagEmoji}
             </span>
           </div>`,
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 22]
  });
}

export function breakIcon() {
  return L.divIcon({
      html:
      `<div class="break-icon" style="display:flex; flex-direction:column; align-items:center; line-height:1; justify-content: right;">
            <span style="font-size:20px; vertical-align: top;">📌</span>
            </div>`,
      className: "",
      iconSize: [25, 25],
      iconAnchor: [5, 20]
    });
}

export function createWeatherIcon(imgSrc, bgColor) {
  return L.divIcon({
       html: `
       <div class="weather-icon">
        <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: ${bgColor}; border-radius: 50%;">
          <img src=${imgSrc} style="width: 80%; height: 80%; object-fit: contain;" />
          </div>
       </div>`,
      className: "",
      iconSize: [42, 42],
      iconAnchor: [22, 26]
    });
}

export function createWindIcon(windSVG) {
  return L.divIcon({
       html: `<div class="weather-icon" style="margin-top:-6px;">${windSVG}</div>`,
       className: "",
       iconSize: [24, 24],
       iconAnchor: [12, 0]
    });
}

