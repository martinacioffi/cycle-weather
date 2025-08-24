// ---------- Provider fetchers ----------
const forecastCache = new Map();
const cacheKey = (lat, lon, provider) => `${provider}:${lat.toFixed(2)},${lon.toFixed(2)}`;

async function fetchOpenMeteo(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    timezone: "UTC",
    minutely_15: ["temperature_2m", "apparent_temperature", "wind_gusts_10m", "windspeed_10m","winddirection_10m","precipitation", "is_day"].join(","),
    past_days: "0",
    forecast_days: "16"
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open‑Meteo HTTP ${res.status}`);
  const d = await res.json();
  return {
    times: d.minutely_15.time, // "YYYY-MM-DDTHH:00"
    tempC: d.minutely_15.temperature_2m,
    feltTempC: d.minutely_15.apparent_temperature,
    windGusts: d.minutely_15.wind_gusts_10m,
    windSpeedMs: d.minutely_15.windspeed_10m,
    windFromDeg: d.minutely_15.winddirection_10m,
    precipMmHr: d.minutely_15.precipitation,
    isDay: d.minutely_15.is_day
  };
}

// MeteoBlue: requires API key. You may need to adjust variable names based on package.
async function fetchMeteoBlue(lat, lon, apiKey) {
  if (!apiKey) throw new Error("MeteoBlue API key missing.");
  const base = "https://my.meteoblue.com/packages/basic-15min";
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
    windSpeedMs: xmin.windspeed,
    windFromDeg: xmin.winddirection,
    precipMmHr: xmin.precipitation,
    isDay: []
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