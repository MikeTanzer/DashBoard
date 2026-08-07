/** Display formatting. Money lives in cents everywhere upstream of this file. */

export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return trim(n / 1_000_000_000) + "B";
  if (abs >= 1_000_000) return trim(n / 1_000_000) + "M";
  if (abs >= 10_000) return trim(n / 1_000) + "K";
  return n.toLocaleString("en-US");
}

export function fullNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Compact dollars from cents: 428_500 -> "$4.3K" */
export function compactMoney(cents: number): string {
  const d = cents / 100;
  const abs = Math.abs(d);
  if (abs >= 1_000_000) return "$" + trim(d / 1_000_000) + "M";
  if (abs >= 10_000) return "$" + trim(d / 1_000) + "K";
  if (abs >= 1_000) return "$" + Math.round(d).toLocaleString("en-US");
  return "$" + d.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Exact dollars from cents: 428_500 -> "$4,285" */
export function money(cents: number, decimals = 0): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function percent(fraction: number, decimals = 0): string {
  return (fraction * 100).toFixed(decimals) + "%";
}

/** "2026-07" -> "Jul" (and "Jul '25" when the year differs from the latest). */
export function monthLabel(month: string, withYear = false): string {
  const [y, m] = month.split("-");
  const name = MONTHS[Number(m) - 1] ?? month;
  return withYear ? `${name} '${y.slice(2)}` : name;
}

/** "2026-08-06" -> "6 Aug" (long: "6 Aug 2026"). Parsed as UTC parts, never
 *  through `new Date(str)`, so it can't drift a day by local timezone. */
export function dayLabel(date: string, long = false): string {
  const [y, m, d] = date.split("-");
  const name = MONTHS[Number(m) - 1] ?? m;
  return long ? `${Number(d)} ${name} ${y}` : `${Number(d)} ${name}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Absolute UTC stamp: "6 Aug 2026, 17:12 UTC".
 *
 * Deliberately not `toLocaleString()` and not a relative time. Both of those
 * are evaluated on the server AND again during hydration, and differ across
 * the two — `toLocaleString` by the machine's locale and timezone, a relative
 * time by however many seconds elapsed in between. Either one desynchronises
 * hydration. Formatting from UTC parts is identical everywhere.
 */
export function utcStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  );
}

/** Time only: "17:12 UTC". For dense rows where the date is already implied. */
export function utcTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

function trim(v: number): string {
  const r = Math.round(v * 10) / 10;
  return (Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)).toString();
}

/**
 * Nice round axis ticks covering [0, max].
 *
 * The last tick is guaranteed to be >= max, because callers scale the plot to
 * it. Stopping one step short (which a `t <= max` loop does whenever the step
 * doesn't divide max evenly) makes every mark taller than the plot area and
 * pushes the top ones out of the viewBox entirely.
 */
export function axisTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;

  const ticks: number[] = [];
  for (let t = 0; ; t += step) {
    ticks.push(t);
    // Tolerance guards the float accumulation in `t += step`.
    if (t >= max - step * 1e-9) break;
  }
  return ticks;
}
