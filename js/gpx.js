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

export function insertBreaksIntoPoints(points, breaks, minTimeSpacing = 15) {
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
      const numBreakSamples = Math.max(1, Math.ceil(b.durSec / spacingSec));
      console.log(`Inserting ${numBreakSamples} break samples at idx ${i} for breakIdx ${breakIdx} (dist ${b.distMeters} m, dur ${b.durSec} sec)`);
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
  console.log('New points after inserting breaks:', newPoints);
  return newPoints;
}

function normalizeBreaks(breaks) {
  if (Array.isArray(breaks)) return breaks;
  if (!breaks) return [];
  // If it's array-like (numeric keys + length), convert it
  if (Number.isInteger(breaks.length)) {
    try {
      return Array.from({ length: breaks.length }, (_, i) => breaks[i]).filter(Boolean);
    } catch {
      // fall through
    }
  }
  // If it's a single break object, wrap it
  if (typeof breaks === 'object' && ('durSec' in breaks || 'distMeters' in breaks)) {
    return [breaks];
  }
  // As a last resort, take enumerable values
  return Object.values(breaks);
}

export function buildSampleIndices(points, cum, maxCalls, minSpacingMeters, minSpacingMinutes, avgSpeedMps, avgSpeedMpsUp, avgSpeedMpsDown, startDate, breaksRaw = []) {
  const n = points.length;
  if (!avgSpeedMpsUp) avgSpeedMpsUp = avgSpeedMps;
  if (!avgSpeedMpsDown) avgSpeedMpsDown = avgSpeedMps;

  const breaks = normalizeBreaks(breaksRaw);
  const accumDist = [0];
  const accumTime = [0];
  let inBreak = false;
  let breakStartTime = 0;
  let breakStartAccumTime = 0;
  let breakDurSec = 0;


  // --- Phase A: Precompute ---
for (let i = 1; i < n; i++) {
  const prevDist = cum[i - 1];
  const curDist = cum[i];
  const dist = curDist - prevDist;

  let segTime = 0;

  if (points[i].isBreak) {
    console.log('Found break point at idx', i, 'dist', curDist.toFixed(1), 'm');
    // If this is the first break point, record break start
    if (!inBreak) {
      console.log('This is the first break point with idx', i);
      console.log('points[i]:', points[i]);
      console.log('points[i-1]:', points[i-1]);
      inBreak = true;
      breakStartTime = accumTime[i - 1];
      console.log('Break start time:', breakStartTime);
      // Find the break object for this location
      const br = breaks.find(b => Math.abs(b.distMeters - curDist) < 1);
      breakDurSec = br ? br.durSec : 0;
      console.log('Break duration (sec):', breakDurSec);
      // breakStartAccumTime = breakStartTime;
    }
    // During break: space points by minTimeSpacing
    segTime = minSpacingMinutes * 60;
    console.log('During break, adding segTime:', segTime);
  } else {
    if (inBreak) {
      console.log('Exiting break at idx', i);
      // This is the first real point after the break
      inBreak = false;
      // Force the time jump to match the full break duration
      const alreadyAdded = accumTime[i - 1] - breakStartTime;
      const remaining = breakDurSec - alreadyAdded;
      if (remaining > 0) segTime += remaining;
      console.log('Exiting break, adding remaining segTime:', remaining);
      console.log('alreadyAdded:', alreadyAdded, 'total breakDurSec:', breakDurSec);
    }
    // Add normal travel time
    const elev1 = points[i - 1].ele ?? 0;
    const elev2 = points[i].ele ?? 0;
    const slope = dist > 0 ? (elev2 - elev1) / dist : 0;
    let speed = avgSpeedMps;
    if (slope > 0.05) speed = avgSpeedMpsUp;
    else if (slope < -0.04) speed = avgSpeedMpsDown;
    segTime += speed > 0 ? dist / speed : 0;
  }

  accumDist[i] = accumDist[i - 1] + dist;
  accumTime[i] = accumTime[i - 1] + segTime;
}
  // print accumDist and accumTime for debugging between idx 1965 and 1980
    console.log('Accumulated Distances and Times (idx 1965 to 1980):');
    for (let i = 1965; i <= 1980 && i < n; i++) {
      console.log(`Idx ${i}: Dist = ${accumDist[i].toFixed(2)} m, Time = ${accumTime[i].toFixed(2)} s`);
      console.log('Point:', points[i]);
    }

  // --- Phase B: Filter ---
  const filteredIdx = [0];
  for (let i = 1; i < n - 1; i++) {
    const lastIdx = filteredIdx[filteredIdx.length - 1];
    const distSinceLast = accumDist[i] - accumDist[lastIdx];
    const timeSinceLast = accumTime[i] - accumTime[lastIdx];

    if (distSinceLast >= minSpacingMeters || timeSinceLast >= minSpacingMinutes * 60) {
      filteredIdx.push(i);
    }
  }
  if (filteredIdx[filteredIdx.length - 1] !== n - 1) {
    filteredIdx.push(n - 1);
  }


  // --- Phase C: Resample evenly in time ---
  if (filteredIdx.length > maxCalls) {
    const resampled = [filteredIdx[0]];
    const totalTime = accumTime[filteredIdx[filteredIdx.length - 1]] - accumTime[filteredIdx[0]];
    const step = totalTime / (maxCalls - 1);
    let targetTime = accumTime[filteredIdx[0]] + step;

    let j = 1;
    for (let k = 1; k < maxCalls - 1; k++) {
      while (j < filteredIdx.length && accumTime[filteredIdx[j]] < targetTime) j++;
      if (j >= filteredIdx.length) break;

      if (j > 0 && Math.abs(accumTime[filteredIdx[j - 1]] - targetTime) < Math.abs(accumTime[filteredIdx[j]] - targetTime)) {
        resampled.push(filteredIdx[j - 1]);
      } else {
        resampled.push(filteredIdx[j]);
      }
      targetTime += step;
    }
    if (resampled[resampled.length - 1] !== filteredIdx[filteredIdx.length - 1]) {
      resampled.push(filteredIdx[filteredIdx.length - 1]);
    }
    return resampled;
  }

  return filteredIdx;
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
