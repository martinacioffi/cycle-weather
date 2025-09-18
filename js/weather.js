// ---------- Provider fetchers ----------
const forecastCache = new Map();
const cacheKey = (lat, lon, provider) => `${provider}:${lat.toFixed(2)},${lon.toFixed(2)}`;

async function fetchOpenMeteo(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    timezone: "Europe/Rome",
    minutely_15: ["temperature_2m", "apparent_temperature",
    "wind_gusts_10m", "windspeed_10m","winddirection_10m",
    "precipitation", "cloud_cover", "cloud_cover_low", "is_day"].join(","),
    past_days: "0",
    forecast_days: "16"
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open‑Meteo HTTP ${res.status}`);
  const d = await res.json();
  const times15 = d.minutely_15.time; // "YYYY-MM-DDTHH:MM" in Europe/Rome
  const precip15 = (d.minutely_15.precipitation || []).map(v => Number(v));

  const hourlyPrecipMm = [];

  for (let i = 0; i < times15.length; i++) {
    let sum = 0;
    for (let j = 0; j <= 3; j++) {
      const idx = i - j;
      if (idx >= 0 && isFinite(precip15[idx])) {
        sum += precip15[idx];
      }
    }

    hourlyPrecipMm.push(+sum.toFixed(3));
  }

  return {
    times: d.minutely_15.time, // "YYYY-MM-DDTHH:00"
    tempC: d.minutely_15.temperature_2m,
    feltTempC: d.minutely_15.apparent_temperature,
    windGusts: d.minutely_15.wind_gusts_10m,
    windSpeedKmH: d.minutely_15.windspeed_10m,
    windFromDeg: d.minutely_15.winddirection_10m,
    precipMmHr: hourlyPrecipMm,
    cloudCover: d.minutely_15.cloud_cover,
    cloudCoverLow: d.minutely_15.cloud_cover_low,
    isDay: d.minutely_15.is_day
  };
}

// MeteoBlue: requires API key. You may need to adjust variable names based on package.
async function fetchMeteoBlue(lat, lon, apiKey) {
  if (!apiKey) throw new Error("MeteoBlue API key missing.");
  const base = "https://my.meteoblue.com/packages/basic-15min"; // TODO add _cloud-15min and check result
  // TODO this returns the pictocode!! can we use it?
  const params = new URLSearchParams({
    lat: lat, lon: lon, apikey: apiKey, format: "json", timezone: "Europe/Rome"
  });
  const url = `${base}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MeteoBlue HTTP ${res.status}`);
  const d = await res.json();
  const xmin = d?.data_xmin;

  if (!xmin?.time.length) throw new Error("MeteoBlue response missing time series.");
  return {
    times: xmin.time.map(t => t.replace(" ", "T")),
    tempC: xmin.temperature,
    feltTempC: xmin.felttemperature,
    windGusts: [],
    windSpeedKmH: xmin.windspeed,
    windFromDeg: xmin.winddirection,
    precipMmHr: xmin.precipitation,
    cloudCover: [],
    cloudCoverLow: [],
    // return isdaylight if present, else approximate by 06–18h
    isDay: xmin.isdaylight && xmin.isdaylight.length === xmin.time.length
      ? xmin.isdaylight
      : xmin.time.map(t => {
        const hour = parseInt(t.slice(11, 13), 10);
        return hour >= 6 && hour < 18 ? 1 : 0;
      })
  };
}

export async function getForecast(lat, lon, provider, apiKey) {
  const key = cacheKey(lat, lon, provider);
  if (forecastCache.has(key)) return forecastCache.get(key);
  const data = provider === "meteoblue" ? await fetchMeteoBlue(lat, lon, apiKey) : await fetchOpenMeteo(lat, lon);
  forecastCache.set(key, data);
  return data;
}

export function pickHourAt(f, targetISOHour) {
  return f.times.indexOf(targetISOHour);
}