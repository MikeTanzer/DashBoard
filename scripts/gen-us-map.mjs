/**
 * Generates SVG path data for the 50 states + DC, projected with Albers USA
 * (which insets Alaska and Hawaii), fitted to a fixed viewBox.
 *
 * Source geometry: us-atlas (public domain, derived from US Census TIGER).
 *
 * Simplification happens in PIXEL space, after projection, rather than on the
 * topology. us-atlas ships quantized integer coordinates, which blunts
 * topojson-simplify badly — and the question we actually care about is "does
 * this vertex move the outline by more than half a pixel at render size?",
 * which is only answerable once projected. Douglas–Peucker at 0.6px takes the
 * embedded data from ~160KB to ~25KB with no visible change.
 *
 *   node gen.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";

const W = 960;
const H = 590;

/** Max deviation, in viewBox px, that a dropped vertex may introduce. */
const TOLERANCE = Number(process.env.TOLERANCE ?? 0.6);

/**
 * Drop rings whose bounding box is under this many px². Barrier islands, the
 * Florida Keys, most of the Aleutian chain — specks that read as dirt on the
 * screen. The largest ring of each state is always kept, so nothing vanishes.
 */
const MIN_RING_PX = Number(process.env.MIN_RING_PX ?? 8);

const topo = JSON.parse(
  readFileSync("node_modules/us-atlas/states-10m.json", "utf8"),
);
const states = feature(topo, topo.objects.states);

const projection = geoAlbersUsa().fitExtent(
  [
    [8, 8],
    [W - 8, H - 8],
  ],
  states,
);
const path = geoPath(projection);

// FIPS -> USPS. us-atlas keys features by FIPS id.
const FIPS = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
  "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
  "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
  "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
  "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
  "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
  "54": "WV", "55": "WI", "56": "WY",
};

/* -------------------------------------------------------------------------- */

/** Perpendicular distance from p to the segment ab. */
function segDist(p, a, b) {
  let x = a[0], y = a[1];
  let dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Iterative Douglas–Peucker — recursion blows the stack on Alaska. */
function douglasPeucker(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segDist(pts[i], pts[first], pts[last]);
      if (d > maxDist) { maxDist = d; index = i; }
    }
    if (maxDist > tol && index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** "M1,2L3,4Z" -> [[1,2],[3,4]] */
function parseRing(sub) {
  const nums = sub.match(/-?\d+(?:\.\d+)?/g) || [];
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([+nums[i], +nums[i + 1]]);
  return pts;
}

function bboxArea(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return (maxX - minX) * (maxY - minY);
}

const r1 = (n) => Math.round(n * 10) / 10;

function emit(pts) {
  let d = "M" + r1(pts[0][0]) + "," + r1(pts[0][1]);
  for (let i = 1; i < pts.length; i++) d += "L" + r1(pts[i][0]) + "," + r1(pts[i][1]);
  return d + "Z";
}

function processPath(d) {
  const rings = d.split("M").filter(Boolean).map((s) => parseRing("M" + s));
  const areas = rings.map(bboxArea);
  const biggest = Math.max(...areas);
  const mainRing = rings[areas.indexOf(biggest)];

  const out = rings
    .filter((_, i) => areas[i] >= MIN_RING_PX || areas[i] === biggest)
    .map((pts) => douglasPeucker(pts, TOLERANCE))
    .filter((pts) => pts.length >= 3)
    .map(emit)
    .join("");

  return { d: out, mainRing };
}

/** Area-weighted centroid of a polygon ring (not the average of its vertices). */
function ringCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const cross = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    a += cross;
    cx += (pts[j][0] + pts[i][0]) * cross;
    cy += (pts[j][1] + pts[i][1]) * cross;
  }
  if (a === 0) return pts[0];
  return [cx / (3 * a), cy / (3 * a)];
}

function ringBox(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { w: maxX - minX, h: maxY - minY };
}

/* -------------------------------------------------------------------------- */

/** A two-line label (code over count) needs about this much room. */
const LABEL_W = 30;
const LABEL_H = 24;

const paths = {};
const labels = {};
const roomy = [];

for (const f of states.features) {
  const code = FIPS[String(f.id).padStart(2, "0")];
  if (!code) continue;

  const raw = path(f);
  if (!raw) continue;

  const { d, mainRing } = processPath(raw);
  paths[code] = d;

  // Anchor on the largest ring, not the whole feature — otherwise Michigan's
  // label lands in Lake Michigan and Hawaii's lands in the Pacific.
  const c = ringCentroid(mainRing);
  labels[code] = [Math.round(c[0]), Math.round(c[1])];

  const box = ringBox(mainRing);
  if (box.w >= LABEL_W && box.h >= LABEL_H) roomy.push(code);
}

// Anchors that still land badly — a centroid can sit outside a concave shape.
const NUDGE = {
  MI: [6, 14], LA: [-12, -6], FL: [16, -14], ID: [-2, 18],
  MD: [-14, 2], VA: [10, 2], HI: [10, -6], AK: [16, 6],
};
for (const [code, [dx, dy]] of Object.entries(NUDGE)) {
  if (labels[code]) labels[code] = [labels[code][0] + dx, labels[code][1] + dy];
}

/**
 * States too small to hold a label get one in the right-hand margin with a
 * leader line back to the shape. [x, y] is where the label sits.
 */
const OUTSET = {
  VT: [906, 60], NH: [906, 88], RI: [906, 116],
  CT: [906, 144], NJ: [906, 172], DE: [906, 200], DC: [906, 228],
  HI: [432, 552],
};

const missing = Object.values(FIPS).filter((c) => !paths[c]);

writeFileSync(
  "us-states.json",
  JSON.stringify({ width: W, height: H, paths, labels, roomy, outset: OUTSET }),
);

console.log(
  `${Object.keys(paths).length} states · ${JSON.stringify(paths).length} bytes ` +
    `· tolerance ${TOLERANCE}px · min ring ${MIN_RING_PX}px²`,
);
console.log(`${roomy.length} states have room for an inline label`);
console.log("cramped:", Object.values(FIPS).filter((c) => !roomy.includes(c)).join(" "));
if (missing.length) console.log("MISSING:", missing.join(", "));
