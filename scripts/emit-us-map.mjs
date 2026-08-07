import { readFileSync, writeFileSync } from "node:fs";

const d = JSON.parse(readFileSync("us-states.json", "utf8"));

const lines = [
  "/**",
  " * US state geometry, projected with Albers USA (Alaska and Hawaii inset at the",
  ` * lower left) and fitted to a ${d.width}x${d.height} viewBox.`,
  " *",
  " * GENERATED FILE - do not hand-edit. Run: npm run map",
  " *",
  " * Source geometry is us-atlas (public domain, from US Census TIGER). The",
  " * generator (scripts/gen-us-map.mjs) simplifies in pixel space at a 0.6px",
  " * tolerance, which is invisible at render size and keeps this file near 45KB",
  " * instead of 160KB.",
  " */",
  "",
  `export const MAP_WIDTH = ${d.width};`,
  `export const MAP_HEIGHT = ${d.height};`,
  "",
  "/** USPS code -> SVG path data. */",
  `export const STATE_PATHS: Record<string, string> = ${JSON.stringify(d.paths)};`,
  "",
  "/** Label anchor: largest-ring centroid, hand-nudged where it landed badly. */",
  `export const STATE_LABEL_POS: Record<string, [number, number]> = ${JSON.stringify(d.labels)};`,
  "",
  "/** States with enough room for a two-line label inside the shape. */",
  `export const ROOMY: ReadonlySet<string> = new Set(${JSON.stringify(d.roomy)});`,
  "",
  "/** Small states: label sits in the margin with a leader line back to the shape. */",
  `export const OUTSET_LABEL_POS: Record<string, [number, number]> = ${JSON.stringify(d.outset)};`,
  "",
];

writeFileSync(process.argv[2], lines.join("\n"));
console.log("wrote", process.argv[2]);
