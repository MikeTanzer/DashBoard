/**
 * US Census regions, for rolling a long list of states into something a
 * stacked chart can actually show.
 *
 * Four regions rather than the nine divisions: a stack is unreadable past
 * roughly half a dozen bands, and the divisions would put us right back where
 * we started. DC sits with the South, as the Census places it.
 */
export const REGION_OF: Record<string, string> = {
  CT: "Northeast", ME: "Northeast", MA: "Northeast", NH: "Northeast",
  RI: "Northeast", VT: "Northeast", NJ: "Northeast", NY: "Northeast",
  PA: "Northeast",

  IL: "Midwest", IN: "Midwest", MI: "Midwest", OH: "Midwest", WI: "Midwest",
  IA: "Midwest", KS: "Midwest", MN: "Midwest", MO: "Midwest", NE: "Midwest",
  ND: "Midwest", SD: "Midwest",

  DE: "South", DC: "South", FL: "South", GA: "South", MD: "South",
  NC: "South", SC: "South", VA: "South", WV: "South", AL: "South",
  KY: "South", MS: "South", TN: "South", AR: "South", LA: "South",
  OK: "South", TX: "South",

  AZ: "West", CO: "West", ID: "West", MT: "West", NV: "West", NM: "West",
  UT: "West", WY: "West", AK: "West", CA: "West", HI: "West", OR: "West",
  WA: "West",
};

/** Largest first, so the biggest band sits at the bottom of a stack. */
export const REGION_ORDER = ["West", "Northeast", "South", "Midwest"];

/** Above this many distinct states, the chart rolls up to regions. */
export const MAX_STATE_BANDS = 7;
