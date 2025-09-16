import { haversine, bearing } from './utils.js';

// ---------- GPX Parsing ----------
export function parseGPX(xmlText) {
  const dom = new DOMParser().parseFromString(xmlText, "application/xml");
  const trkpts = Array.from(dom.getElementsByTagName("trkpt"));
  if (!trkpts.length) throw new Error("No <trkpt> points found in GPX.");
  const pts = trkpts.map(pt => {
    const lat = parseFloat(pt.getAttribute("lat"));
    const lon = parseFloat(pt.getAttribute("lon"));
    const eleTag = pt.getElementsByTagName("ele")[0];
    const ele = eleTag ? parseFloat(eleTag.textContent) : null;

    return { lat, lon, ele };
  }).filter(p => isFinite(p.lat) && isFinite(p.lon));

  const dedup = [];
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) {
      dedup.push({ ...pts[i], distMeters: 0 });
    } else {
      const prev = dedup[dedup.length - 1];
      const curr = pts[i];
      if (Math.abs(prev.lat - curr.lat) > 1e-7 || Math.abs(prev.lon - curr.lon) > 1e-7) {
        const dist = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
        dedup.push({ ...curr, distMeters: prev.distMeters + dist });
      }
    }
  }
  if (dedup.length < 2) throw new Error("Not enough distinct points in GPX.");
  return dedup;
}

export function cumulDistance(points) {
  const cum = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    cum.push(total);
  }
  return { cum, total };
}

export function segmentBearings(points) {
  const br = [];
  for (let i = 0; i < points.length - 1; i++) {
    br.push(bearing(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon));
  }
  br.push(br[br.length - 1]);
  return br;
}

export function insertBreaksIntoPoints(points, breaks, minTimeSpacing = 5) {
  const spacingSec = minTimeSpacing * 60;
  let newPoints = [];
  let breakIdx = 0;
  let i = 0;

  while (i < points.length) {
    newPoints.push({ ...points[i], isBreak: false });

    // Insert break if it falls after this segment
    while (
      breakIdx < breaks.length &&
      i < points.length - 1 &&
      points[i].distMeters <= breaks[breakIdx].distMeters &&
      points[i + 1].distMeters > breaks[breakIdx].distMeters
    ) {
      const b = breaks[breakIdx];
      // Interpolate break location
      const p1 = points[i];
      const p2 = points[i + 1];
      const frac = (b.distMeters - p1.distMeters) / (p2.distMeters - p1.distMeters);
      const lat = p1.lat + frac * (p2.lat - p1.lat);
      const lon = p1.lon + frac * (p2.lon - p1.lon);
      const ele = p1.ele != null && p2.ele != null ? p1.ele + frac * (p2.ele - p1.ele) : null;

      // Insert all break samples at this location
      const numBreakSamples = Math.max(1, Math.floor(b.durSec / spacingSec));
      for (let j = 0; j < numBreakSamples; j++) {
        newPoints.push({
          lat, lon, ele,
          distMeters: b.distMeters,
          isBreak: true,
          breakIdx: breakIdx,
          breakSample: j
        });
      }
      breakIdx++;
    }
    i++;
  }
  // Reindex
  newPoints = newPoints.map((p, idx) => ({ ...p, idx }));
  return newPoints;
}

export function buildSampleIndices(points, cum, maxCalls, minSpacingMeters, minSpacingMinutes, avgSpeedMps, startDate, breaks = []) {
  const n = points.length;
  const idx = [0];
  let lastDist = 0;
  let lastEtaSec = 0;
  const etaSecs = [0];

  for (let i = 1; i < n - 1; i++) {
    const curDist = cum[i];
    const distSinceLast = curDist - lastDist;
    const etaSec = curDist / avgSpeedMps + breakOffsetSeconds(curDist, breaks);
    const timeSinceLast = etaSec - lastEtaSec;

    if (
      points[i].isBreak ||
      (minSpacingMeters > 0 && distSinceLast >= minSpacingMeters) ||
      (minSpacingMinutes > 0 && timeSinceLast >= minSpacingMinutes * 60)
    ) {
      idx.push(i);
      etaSecs.push(etaSec);
      lastDist = curDist;
      lastEtaSec = etaSec;
    }
  }
  if (idx[idx.length - 1] !== n - 1) {
    idx.push(n - 1);
    const etaSec = cum[n - 1] / avgSpeedMps + breakOffsetSeconds(cum[n - 1], breaks);
    etaSecs.push(etaSec);
  }

  if (idx.length <= maxCalls) {
    return idx;
  }

  // Resample: pick maxCalls indices evenly over time
  const totalTime = etaSecs[etaSecs.length - 1] - etaSecs[0];
  const step = totalTime / (maxCalls - 1);
  const resampled = [idx[0]];
  let targetTime = etaSecs[0] + step;
  let j = 1;
  for (let k = 1; k < maxCalls - 1; k++) {
    while (j < etaSecs.length && etaSecs[j] < targetTime) j++;
    if (j >= etaSecs.length) break;
    // Pick the closer of etaSecs[j-1] and etaSecs[j]
    if (j > 0 && Math.abs(etaSecs[j - 1] - targetTime) < Math.abs(etaSecs[j] - targetTime)) {
      resampled.push(idx[j - 1]);
    } else {
      resampled.push(idx[j]);
    }
    targetTime += step;
  }
  if (resampled[resampled.length - 1] !== idx[idx.length - 1]) {
    resampled.push(idx[idx.length - 1]);
  }
  return resampled.slice(0, maxCalls);
}

// ---------- Breaks ----------
export function getBreaks(trackPoints) {
  const container = document.getElementById("breaksContainer");
  const rows = Array.from(container.children);
  const brngs = segmentBearings(trackPoints);
  const list = [];
  for (const r of rows) {
    const km = parseFloat(r.querySelector(".break-km").value);
    const min = parseFloat(r.querySelector(".break-min").value);
    if (isFinite(km) && km >= 0 && isFinite(min) && min > 0) {
      const distMeters = km * 1000;
      const durSec = Math.round(min * 60);

      // Find closest point by distance
      const closest = trackPoints.reduce((prev, curr) =>
        Math.abs(curr.distMeters - distMeters) < Math.abs(prev.distMeters - distMeters) ? curr : prev
      );
      const bearing = brngs[closest];

      list.push({
        distMeters,
        durSec,
        lat: closest.lat,
        lon: closest.lon,
        bearing
      });
    }
  }
  list.sort((a, b) => a.distMeters - b.distMeters);
  return list;
}

export function breakOffsetSeconds(distanceMeters, breaks) {
  let sum = 0;
  for (const b of breaks) {
    if (distanceMeters >= b.distMeters) sum += b.durSec;
  }
  return sum;
}

export function getBreakTimeWindows(breaks, getTimeForDistance) {
  return breaks.map(b => {
    const startTime = getTimeForDistance(b.distMeters);
    const endTime = startTime + b.durSec;
    return { startTime, endTime };
  });
}

// ---------- Utility ----------
export function nearestByIdx(results, idx) {
  if (!results.length) return null;
  let lo = 0, hi = results.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (results[mid].idx === idx) return results[mid];
    if (results[mid].idx < idx) lo = mid + 1;
    else hi = mid - 1;
  }
  const cand = [];
  if (lo < results.length) cand.push(results[lo]);
  if (hi >= 0) cand.push(results[hi]);
  cand.sort((a, b) => Math.abs(a.idx - idx) - Math.abs(b.idx - idx));
  return cand[0] || null;
}
