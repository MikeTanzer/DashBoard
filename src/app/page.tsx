import { cookies } from "next/headers";
import { THEME_COOKIE, readTheme } from "@/lib/theme";
import { getSnapshot } from "@/connectors";
import { computeMetrics, platformBreakdown } from "@/lib/metrics";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
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
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string }>;
}) {
  const { platform } = await searchParams;
  const jar = await cookies();
  const role = await verifySession(jar.get(SESSION_COOKIE)?.value);
  const theme = readTheme(jar.get(THEME_COOKIE)?.value);
  const isAdmin = role === "admin";

  const snapshot = await getSnapshot();
  const selected = platform ? platform.split(",").filter(Boolean) : [];
  const m = computeMetrics(snapshot, selected.length ? selected : null);
  const platforms = platformBreakdown(snapshot);

  const scopeLabel =
    selected.length === 0
      ? "the full network"
      : selected
          .map((id) => snapshot.platforms.find((p) => p.id === id)?.name ?? id)
          .join(" + ");

  return (
    <main className="min-h-dvh">
      <div className="mx-auto max-w-[1180px] px-5 py-6 sm:px-8 sm:py-8">
        {/* Header ------------------------------------------------------- */}
        <header className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-2.5">
            <Logo size={30} />
            <div>
              <h1 className="font-semibold leading-tight">Pyrotree</h1>
              <p
                className="text-xs leading-tight"
                style={{ color: "var(--text-muted)" }}
              >
                Network Dashboard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="text-xs px-2.5 py-1 rounded-full"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-secondary)",
              }}
            >
              {isAdmin ? "Admin" : "Investor"}
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Updated {utcStamp(snapshot.generatedAt)}
            </span>
            <ThemeToggle initial={theme} />
            <form action="/api/logout" method="POST">
              <button
                type="submit"
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                }}
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        {snapshot.demo ? <DemoBanner /> : null}

        {/* Filters — one row, scoping everything below -------------------- */}
        <div className="mb-6">
          <FilterBar platforms={snapshot.platforms} selected={selected} />
        </div>

        {/* Headline figure and the history behind it, in one card --------- */}
        <div className="mb-4">
          {m.monthlyRevenue.available && m.revenueByMonth.available ? (
            <RevenueCard
              data={m.revenueByMonth.value}
              mrrCents={m.monthlyRevenue.value}
              annualRunRateCents={
                m.annualRunRate.available ? m.annualRunRate.value : 0
              }
              usageShare={m.usageShare.available ? m.usageShare.value : null}
              scopeLabel={scopeLabel}
            />
          ) : (
            <EmptyCard
              title="Monthly recurring revenue"
              // Whichever half is missing is the one worth reporting; MRR is
              // the more fundamental of the two, so it wins when both are out.
              needs={
                !m.monthlyRevenue.available
                  ? m.monthlyRevenue.needs
                  : !m.revenueByMonth.available
                    ? m.revenueByMonth.needs
                    : ""
              }
            />
          )}
        </div>

        {/* Customer + revenue tiles --------------------------------------- */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <StatTile
            label="Current customers"
            metric={m.customerCount}
            format={fullNumber}
          />
          <StatTile
            label="States with customers"
            metric={m.stateCount}
            format={(v) => `${v} of 51`}
          />
          <StatTile
            label="Avg gross per customer"
            metric={m.avgGrossPerCustomer}
            format={(v) => `${money(v)}/mo`}
          />
          <StatTile
            label="Revenue change"
            metric={
              m.revenueMoMChange.available
                ? { available: true, value: m.revenueMoMChange.value }
                : m.revenueMoMChange
            }
            format={(v) => `${v >= 0 ? "+" : ""}${percent(v, 1)}`}
            hint="Latest full month vs the one before"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
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
            label="Consumers tracked"
            metric={m.consumersTracked}
            format={compactNumber}
          />
          <StatTile
            label="Purchased in last 30 days"
            metric={m.consumersPurchased30d}
            format={compactNumber}
            hint={
              m.consumerActivation30d.available
                ? `${percent(m.consumerActivation30d.value, 1)} of tracked consumers`
                : undefined
            }
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
        <section className="card p-5 mb-4">
          <h2 className="text-base font-semibold">Consumer engagement</h2>
          <p
            className="text-xs mt-0.5 mb-4"
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
          <section className="card p-5 mb-4">
            <h2 className="text-base font-semibold mb-3">Platforms</h2>
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

        {isAdmin ? <SourcesPanel sources={snapshot.sources} /> : null}

        <footer
          className="text-xs mt-6 text-center"
          style={{ color: "var(--text-muted)" }}
        >
          Pyrotree · generated {utcStamp(snapshot.generatedAt)}
          {isAdmin ? " · admin view" : ""}
        </footer>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */

function DemoBanner() {
  return (
    <div
      className="mb-5 rounded-lg px-4 py-3 flex items-start gap-2.5"
      style={{
        background: "color-mix(in srgb, var(--status-warning) 14%, transparent)",
        border: "1px solid var(--status-warning)",
      }}
    >
      <span
        aria-hidden="true"
        style={{ color: "var(--status-warning)" }}
        className="text-sm mt-[1px]"
      >
        ▲
      </span>
      <div className="text-sm">
        <strong>Demo data.</strong>{" "}
        <span style={{ color: "var(--text-secondary)" }}>
          These numbers come from <code>data/network.json</code>, which has{" "}
          <code>&quot;demo&quot;: true</code>. Connect a source or replace that
          file with real records, and this banner disappears.
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
