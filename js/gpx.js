import { haversine, bearing } from './utils.js';

// ---------- GPX Parsing ----------
export function parseGPX(xmlText) {
  const dom = new DOMParser().parseFromString(xmlText, "application/xml");
  const trkpts = Array.from(dom.getElementsByTagName("trkpt"));
  if (!trkpts.length) throw new Error("No <trkpt> points found in GPX.");
  const pts = trkpts.map(pt => ({
    lat: parseFloat(pt.getAttribute("lat")),
    lon: parseFloat(pt.getAttribute("lon"))
  })).filter(p => isFinite(p.lat) && isFinite(p.lon));
  const dedup = [];
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) dedup.push(pts[i]);
    else {
      const prev = dedup[dedup.length - 1];
      if (Math.abs(prev.lat - pts[i].lat) > 1e-7 || Math.abs(prev.lon - pts[i].lon) > 1e-7) {
        dedup.push(pts[i]);
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

export function buildSampleIndices(points, cum, maxCalls, minSpacingMeters) {
  const n = points.length;
  const idx = [0];
  for (let i = 1; i < n - 1; i++) {
    if ((cum[i] - cum[idx[idx.length - 1]]) >= minSpacingMeters) idx.push(i);
    if (idx.length >= maxCalls - 1) break;
  }
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  return idx;
}

// ---------- Breaks ----------
export function getBreaks() {
  const container = document.getElementById("breaksContainer");
  const rows = Array.from(container.children);
  const list = [];
  for (const r of rows) {
    const km = parseFloat(r.querySelector(".break-km").value);
    const min = parseFloat(r.querySelector(".break-min").value);
    if (isFinite(km) && km >= 0 && isFinite(min) && min > 0) {
      list.push({ distMeters: km * 1000, durSec: Math.round(min * 60) });
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
