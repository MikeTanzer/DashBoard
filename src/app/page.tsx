import { cookies } from "next/headers";
import { THEME_COOKIE, readTheme } from "@/lib/theme";
import { readRange, windowPhrase } from "@/lib/range";
import { getSnapshot } from "@/connectors";
import { computeMetrics, platformBreakdown } from "@/lib/metrics";
import {
  compactNumber,
  fullNumber,
  money,
  percent,
  utcStamp,
} from "@/lib/format";
import { StatTile, NotTracked } from "@/components/StatTile";
import { StatesCard } from "@/components/StatesCard";
import { RevenueCard } from "@/components/RevenueCard";
import { SourcesPanel } from "@/components/SourcesPanel";
import { FilterBar } from "@/components/FilterBar";
import { RangePicker } from "@/components/RangePicker";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    platform?: string;
    range?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { platform, range: rangeParam, from, to } = await searchParams;
  const range = readRange(rangeParam, from, to);
  const theme = readTheme((await cookies()).get(THEME_COOKIE)?.value);

  const snapshot = await getSnapshot();
  const selected = platform ? platform.split(",").filter(Boolean) : [];
  const m = computeMetrics(snapshot, selected.length ? selected : null, range);
  const platforms = platformBreakdown(snapshot);

  const scopeLabel =
    selected.length === 0
      ? "the full network"
      : selected
          .map((id) => snapshot.platforms.find((p) => p.id === id)?.name ?? id)
          .join(" + ");

  return (
    <div className="min-h-dvh">
      {/* Navy bar, full bleed — the brand's loudest gesture, straight off
          webjoint.com's nav. Present in both themes, not just dark. --------- */}
      <div className="topbar">
        <div className="shell flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <Logo size={34} />
            <div>
              <h1
                className="text-[15px] font-bold leading-tight"
                style={{ color: "#fff", letterSpacing: "-0.02em" }}
              >
                Pyrotree
              </h1>
              <p className="text-[11px] leading-tight muted">
                Network Dashboard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] muted hidden sm:inline">
              Updated {utcStamp(snapshot.generatedAt)}
            </span>
            <ThemeToggle initial={theme} />
          </div>
        </div>
      </div>

      <main className="shell py-7 sm:py-9">
        {snapshot.demo ? <DemoBanner /> : null}

        {/* One control row, scoping everything below --------------------- */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <FilterBar
            platforms={snapshot.platforms}
            selected={selected}
            range={range.id}
            from={range.from}
            to={range.to}
          />
          <RangePicker
            range={range.id}
            platform={selected}
            from={range.from}
            to={range.to}
          />
        </div>

        {/* Headline figure and the history behind it, in one card --------- */}
        <div className="mb-4">
          {m.monthlyRevenue.available ? (
            <RevenueCard
              bars={m.bars.available ? m.bars.value : []}
              windowTotalCents={m.windowTotal.available ? m.windowTotal.value : 0}
              windowUsageShare={
                m.windowUsageShare.available ? m.windowUsageShare.value : null
              }
              mrrCents={m.monthlyRevenue.value}
              annualRunRateCents={
                m.annualRunRate.available ? m.annualRunRate.value : 0
              }
              range={range}
              scopeLabel={scopeLabel}
              unavailableReason={m.bars.available ? undefined : m.bars.needs}
            />
          ) : (
            <EmptyCard
              title="Monthly recurring revenue"
              needs={m.monthlyRevenue.needs}
            />
          )}
        </div>

        {/* Row 1 — reach: how much of the market we touch ------------------ */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          {/* The count is a live total — without cancellation dates we can't
              rebuild it for a past date, and a rising-only line would be a lie.
              The range drives arrivals, which we CAN compute exactly. */}
          <StatTile
            label="Current customers"
            metric={m.customerCount}
            format={fullNumber}
            hint={
              m.newCustomers.available
                ? `+${fullNumber(m.newCustomers.value)} new ${windowPhrase(range)}`
                : undefined
            }
          />
          <StatTile
            label="States with customers"
            metric={m.stateCount}
            format={(v) => `${v} of 51`}
            hint={
              m.newStates.available
                ? m.newStates.value > 0
                  ? `+${m.newStates.value} entered ${windowPhrase(range)}`
                  : `No new states ${windowPhrase(range)}`
                : undefined
            }
          />
          {/* A single running total with no time dimension in the source. */}
          <StatTile
            label="Consumers tracked"
            metric={m.consumersTracked}
            format={compactNumber}
            hint="All time — the source keeps no history"
          />
          {/* Asks the source for the window this range actually covers. A
              purchaser count isn't derivable from a neighbouring window, so an
              uncomputed one reports itself rather than borrowing another's. */}
          <StatTile
            label={
              m.consumerWindowLabel === "ever"
                ? "Consumers who ever purchased"
                : `Purchased in ${m.consumerWindowLabel}`
            }
            metric={m.consumersPurchased}
            format={compactNumber}
            hint={
              m.consumersPurchased.available && m.consumersTracked.available
                ? `${percent(m.consumersPurchased.value / m.consumersTracked.value, 1)} of tracked consumers`
                : undefined
            }
          />
        </div>

        {/* Row 2 — unit economics: what that reach is worth ---------------- */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <StatTile
            label="Avg gross per customer"
            metric={m.avgGrossPerCustomer}
            format={(v) => `${money(v)}/mo`}
          />
          <StatTile
            label="Avg SaaS per customer"
            metric={m.avgSaasPerCustomer}
            format={(v) => `${money(v)}/mo`}
          />
          <StatTile
            label="Avg usage per customer"
            metric={m.avgUsagePerCustomer}
            format={(v) => `${money(v)}/mo`}
          />
          <StatTile
            label="Revenue change"
            metric={m.revenueChange}
            format={(v) => `${v >= 0 ? "+" : ""}${percent(v, 1)}`}
            hint={`Complete periods only · vs the ${range.window.replace("last ", "")} before`}
          />
        </div>

        {/* The map needs more room than a half column gives, and a nested
            horizontal scrollbar reads as a bug. ---------------------------- */}
        <div className="grid gap-4 mb-4">
          {m.customersByState.available ? (
            <StatesCard
              data={m.customersByState.value}
              customersWithoutState={m.customersWithoutState}
            />
          ) : (
            <EmptyCard
              title="Customers by state"
              needs={m.customersByState.needs}
            />
          )}
        </div>

        {/* Consumer engagement -------------------------------------------- */}
        <section className="card p-6 mb-4">
          <h2 className="text-[15px] font-bold">Consumer engagement</h2>
          <p
            className="text-[12.5px] mt-1 mb-5"
            style={{ color: "var(--text-secondary)" }}
          >
            Shoppers on our customers&apos; storefronts — aggregate counts only,
            no personal data leaves the platforms.
          </p>
          {m.consumersTracked.available ? (
            <ConsumerFunnel
              tracked={m.consumersTracked.value}
              d30={
                m.consumersPurchased30d.available
                  ? m.consumersPurchased30d.value
                  : 0
              }
              d180={
                m.consumersPurchased180d.available
                  ? m.consumersPurchased180d.value
                  : 0
              }
            />
          ) : (
            <NotTracked needs={m.consumersTracked.needs} />
          )}
        </section>

        {/* Platform breakdown ---------------------------------------------- */}
        {platforms.length ? (
          <section className="card p-6 mb-4">
            <h2 className="text-[15px] font-bold mb-4">Platforms</h2>
            <div className="overflow-x-auto">
              <table className="dataview">
                <thead>
                  <tr>
                    <th>Platform</th>
                    <th className="num">Customers</th>
                    <th className="num">States</th>
                    <th className="num">SaaS MRR</th>
                    <th className="num">Usage MRR</th>
                    <th className="num">Total MRR</th>
                    <th className="num">Consumers</th>
                    <th className="num">Bought 30d</th>
                  </tr>
                </thead>
                <tbody>
                  {platforms.map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.name}</td>
                      <td className="num">{fullNumber(p.customers)}</td>
                      <td className="num">{p.states || "—"}</td>
                      <td className="num">{money(p.saasCents)}</td>
                      <td className="num">{money(p.usageCents)}</td>
                      <td className="num font-semibold">{money(p.mrrCents)}</td>
                      <td className="num">
                        {p.consumersTracked == null
                          ? "—"
                          : compactNumber(p.consumersTracked)}
                      </td>
                      <td className="num">
                        {p.consumers30d == null
                          ? "—"
                          : compactNumber(p.consumers30d)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <SourcesPanel sources={snapshot.sources} />

        <footer
          className="text-xs mt-8 text-center"
          style={{ color: "var(--text-muted)" }}
        >
          Pyrotree · generated {utcStamp(snapshot.generatedAt)}
        </footer>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function DemoBanner() {
  return (
    <div
      className="mb-6 rounded-2xl px-5 py-4 flex items-start gap-3"
      style={{
        background: "color-mix(in srgb, var(--status-warning) 12%, var(--surface-1))",
        border: "1px solid color-mix(in srgb, var(--status-warning) 45%, transparent)",
      }}
    >
      <span
        aria-hidden="true"
        className="mt-[2px] shrink-0"
        style={{ color: "var(--status-warning)" }}
      >
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 4.4v4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="8" cy="11.4" r="1" fill="currentColor" />
        </svg>
      </span>
      <div className="text-[13.5px] leading-relaxed">
        <strong>Demo data.</strong>{" "}
        <span style={{ color: "var(--text-secondary)" }}>
          These numbers come from <code className="font-mono text-[12.5px]">data/network.json</code>,
          which has <code className="font-mono text-[12.5px]">&quot;demo&quot;: true</code>. Connect a
          source or replace that file with real records, and this banner disappears.
        </span>
      </div>
    </div>
  );
}

function EmptyCard({ title, needs }: { title: string; needs: string }) {
  return (
    <section className="card p-5">
      <h2 className="text-base font-semibold mb-3">{title}</h2>
      <NotTracked needs={needs} />
    </section>
  );
}

/**
 * Ordered stages, so an ordinal ramp is correct here (not a nominal palette).
 * Values are direct-labeled, so nothing is gated behind hover.
 */
function ConsumerFunnel({
  tracked,
  d30,
  d180,
}: {
  tracked: number;
  d30: number;
  d180: number;
}) {
  const stages = [
    { label: "Tracked", value: tracked, fill: "var(--seq-200)", ink: "#0b0b0b" },
    {
      label: "Purchased in 180 days",
      value: d180,
      fill: "var(--seq-400)",
      ink: "#ffffff",
    },
    {
      label: "Purchased in 30 days",
      value: d30,
      fill: "var(--seq-600)",
      ink: "#ffffff",
    },
  ];
  const max = Math.max(1, tracked);

  return (
    <div className="flex flex-col gap-3">
      {stages.map((s) => (
        <div key={s.label} className="flex items-center gap-3">
          <div
            className="text-xs w-[104px] sm:w-[168px] shrink-0"
            style={{ color: "var(--text-secondary)" }}
          >
            {s.label}
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2.5">
            <div
              style={{
                width: `${Math.max(1.5, (s.value / max) * 100)}%`,
                height: 18,
                background: s.fill,
                borderRadius: "2px 4px 4px 2px",
              }}
            />
            <span className="text-sm font-semibold shrink-0">
              {compactNumber(s.value)}
            </span>
            <span
              className="text-xs shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              {percent(s.value / max, 1)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
