/**
 * US state reference plus a grid cartogram layout.
 *
 * The cartogram (one equal-size tile per state, arranged in roughly geographic
 * position) is used instead of a true choropleth on purpose: with a network of
 * this size, RI and DE having the same footprint as TX is the honest read, and
 * it costs ~2KB instead of ~200KB of path data.
 */

export interface StateCell {
  code: string;
  name: string;
  row: number;
  col: number;
}

// prettier-ignore
const LAYOUT: [string, string, number, number][] = [
  ["AK", "Alaska", 0, 0],  ["ME", "Maine", 0, 11],
  ["VT", "Vermont", 1, 10], ["NH", "New Hampshire", 1, 11],
  ["WA", "Washington", 1, 1], ["ID", "Idaho", 1, 2], ["MT", "Montana", 1, 3], ["ND", "North Dakota", 1, 4], ["MN", "Minnesota", 1, 5], ["IL", "Illinois", 1, 6], ["WI", "Wisconsin", 1, 7], ["MI", "Michigan", 1, 8], ["NY", "New York", 1, 9],
  ["OR", "Oregon", 2, 1], ["NV", "Nevada", 2, 2], ["WY", "Wyoming", 2, 3], ["SD", "South Dakota", 2, 4], ["IA", "Iowa", 2, 5], ["IN", "Indiana", 2, 6], ["OH", "Ohio", 2, 7], ["PA", "Pennsylvania", 2, 8], ["NJ", "New Jersey", 2, 9], ["CT", "Connecticut", 2, 10], ["RI", "Rhode Island", 2, 11],
  ["CA", "California", 3, 1], ["UT", "Utah", 3, 2], ["CO", "Colorado", 3, 3], ["NE", "Nebraska", 3, 4], ["MO", "Missouri", 3, 5], ["KY", "Kentucky", 3, 6], ["WV", "West Virginia", 3, 7], ["VA", "Virginia", 3, 8], ["MD", "Maryland", 3, 9], ["DE", "Delaware", 3, 10], ["MA", "Massachusetts", 3, 11],
  ["AZ", "Arizona", 4, 2], ["NM", "New Mexico", 4, 3], ["KS", "Kansas", 4, 4], ["AR", "Arkansas", 4, 5], ["TN", "Tennessee", 4, 6], ["NC", "North Carolina", 4, 7], ["SC", "South Carolina", 4, 8], ["DC", "District of Columbia", 4, 9],
  ["OK", "Oklahoma", 5, 4], ["LA", "Louisiana", 5, 5], ["MS", "Mississippi", 5, 6], ["AL", "Alabama", 5, 7], ["GA", "Georgia", 5, 8],
  ["HI", "Hawaii", 6, 0], ["TX", "Texas", 6, 4], ["FL", "Florida", 6, 8],
];

export const STATE_GRID: StateCell[] = LAYOUT.map(([code, name, row, col]) => ({
  code,
  name,
  row,
  col,
}));

export const GRID_ROWS = 7;
export const GRID_COLS = 12;

export const STATE_NAMES: Record<string, string> = Object.fromEntries(
  STATE_GRID.map((s) => [s.code, s.name]),
);

const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  STATE_GRID.map((s) => [s.name.toLowerCase(), s.code]),
);

/**
 * Coerce whatever a source hands us ("CA", "california", "Calif.") into a USPS
 * code, or null. Connectors call this so bad state data never reaches the UI.
 */
export function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  const upper = t.toUpperCase();
  if (upper.length === 2 && STATE_NAMES[upper]) return upper;
  const byName = NAME_TO_CODE[t.toLowerCase().replace(/\.$/, "")];
  return byName ?? null;
}
