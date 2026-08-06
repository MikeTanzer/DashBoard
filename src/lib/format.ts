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

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86_400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86_400)}d ago`;
}

function trim(v: number): string {
  const r = Math.round(v * 10) / 10;
  return (Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)).toString();
}

/** Nice round axis ticks covering [0, max]. */
export function axisTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let t = 0; t <= max + step * 0.001; t += step) ticks.push(t);
  return ticks;
}
