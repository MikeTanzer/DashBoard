"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { computeMetrics, platformBreakdown } from "@/lib/metrics";
import type { TileKey } from "@/lib/metrics";
import {
  priorPhrase,
  readRange,
  resolveView,
  windowPhrase,
} from "@/lib/range";
import type { Snapshot } from "@/lib/types";
import {
  compactMoney,
  compactNumber,
  fullNumber,
  money,
  percent,
  utcStamp,
} from "@/lib/format";
import { StatTile, NotTracked } from "@/components/StatTile";
import { RevenuePerCustomer } from "@/components/RevenuePerCustomer";
import { StatesCard } from "@/components/StatesCard";
import { RevenueCard } from "@/components/RevenueCard";
import { SourcesPanel } from "@/components/SourcesPanel";
import { FilterBar } from "@/components/FilterBar";
import { RangePicker } from "@/components/RangePicker";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";

/**
 * The whole dashboard, running in the browser.
 *
 * Filtering used to happen on the server from searchParams. A static export has
 * no server, so the snapshot is baked at build time and every derived number is
 * computed here instead — computeMetrics is pure, so it runs unchanged. The URL
 * is still the single source of truth for the filters, which keeps views
 * shareable exactly as before.
 */
export function Dashboard({ snapshot }: { snapshot: Snapshot }) {
  const params = useSearchParams();

  const platform = params.get("platform") ?? undefined;
  const { range, bucket } = resolveView(
    readRange(
      params.get("range") ?? undefined,
      params.get("from") ?? undefined,
      params.get("to") ?? undefined,
    ),
    params.get("grain") ?? undefined,
  );

  const selected = platform ? platform.split(",").filter(Boolean) : [];
  const m = computeMetrics(
    snapshot,
    selected.length ? selected : null,
    range,
    bucket,
  );
  const platforms = platformBreakdown(snapshot);

  /**
   * Which stat tile drives the chart. Average revenue per customer by default;
   * clicking the selected tile again returns the chart to the stacked revenue
   * breakdown, which is otherwise unreachable since revenue has no tile of its
   * own.
   */
  const [tile, setTile] = useState<TileKey | null>("arpc");
  const pickTile = (k: TileKey) => setTile((cur) => (cur === k ? null : k));

  /**
   * Selection props for a tile, but ONLY when its series has something to
   * plot. A tile with no history isn't offered as a control at all — no
   * pointer, no hover shading, no click — because a control whose entire
   * effect is to display an error is worse than no control. The tile still
   * shows its current value; it just doesn't pretend to be a chart source.
   */
  const tilePick = (k: TileKey) =>
    m.tileSeries[k].points.available
      ? { selected: tile === k, onSelect: () => pickTile(k) }
      : {};

  // Falls back to the revenue chart if the default selection turns out to be
  // unplottable for this data (no customer start dates, say).
  const activeSeries =
    tile && m.tileSeries[tile].points.available ? m.tileSeries[tile] : null;

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
            <ThemeToggle />
          </div>
        </div>
      </div>

      <main className="shell py-7 sm:py-9">
        {snapshot.demo ? <DemoBanner /> : null}

        {/* One control row, scoping everything below --------------------- */}
        <div className="controls mb-6 flex flex-wrap items-center justify-between gap-3">
          <FilterBar
            platforms={snapshot.platforms}
            selected={selected}
            range={range.id}
            from={range.from}
            to={range.to}
            bucket={bucket}
          />
          <RangePicker
            range={range.id}
            platform={selected}
            from={range.from}
            to={range.to}
            bucket={bucket}
            rangeDays={range.days}
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
              bucket={bucket}
              windowLabel={m.windowLabel}
              scopeLabel={scopeLabel}
              unavailableReason={m.bars.available ? undefined : m.bars.needs}
              series={activeSeries}
            />
          ) : (
            <EmptyCard
              title="Monthly recurring revenue"
              needs={m.monthlyRevenue.needs}
            />
          )}
        </div>

        {/* Row 1 — reach: how much of the market we touch ------------------ */}
        <div className="grid grid-cols-2 gap-4 max-[640px]:gap-2.5 lg:grid-cols-4 mb-4">
          {/* The count is a live total — without cancellation dates we can't
              rebuild it for a past date, and a rising-only line would be a lie.
              The range drives arrivals, which we CAN compute exactly. */}
          <StatTile
            label="Current customers"
            {...tilePick("customers")}
            metric={m.customerCount}
            format={fullNumber}
            hint={
              m.newCustomers.available
                ? `+${fullNumber(m.newCustomers.value)} new ${windowPhrase(range)}`
                : undefined
            }
          />
          {/* The total is a running count with no time dimension, so it can't
              track the range — but the share of it that has gone quiet in the
              selected window can, and that's the half worth acting on. */}
          <StatTile
            label="Consumers tracked"
            {...tilePick("consumers")}
            metric={m.consumersTracked}
            format={compactNumber}
            note="All time"
            hint={
              m.consumersDormant.available && m.consumersTracked.available
                ? m.consumerWindowLabel === "ever"
                  ? `${compactNumber(m.consumersDormant.value)} (${percent(
                      m.consumersDormant.value / m.consumersTracked.value,
                    )}) have never purchased`
                  : `${compactNumber(m.consumersDormant.value)} (${percent(
                      m.consumersDormant.value / m.consumersTracked.value,
                    )}) haven't bought in the ${m.consumerWindowLabel}`
                : undefined
            }
          />
          <StatTile
            label="States with customers"
            {...tilePick("states")}
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
            {...tilePick("purchasers")}
            format={compactNumber}
            hint={
              m.consumersPurchased.available && m.consumersTracked.available
                ? `${percent(m.consumersPurchased.value / m.consumersTracked.value, 1)} of tracked consumers`
                : undefined
            }
          />
        </div>

        {/* Row 2 — economics. Four equal tiles, matching the row above. --- */}
        <div className="grid grid-cols-2 gap-4 max-[640px]:gap-2.5 lg:grid-cols-4 mb-6">
          <RevenuePerCustomer
            m={m}
            {...tilePick("arpc")}
          />

          {/* A balance, not a flow: it doesn't move with the time range, so no
              window is named here. The as-of date is the honest caveat — a
              stale balance looks identical to a current one. */}
          <StatTile
            label="Cash on hand"
            {...tilePick("cash")}
            metric={m.cashOnHand}
            format={(v) => money(v)}
            hint={
              m.cashOnHand.available
                ? m.cashAsOf
                  ? `As of ${m.cashAsOf}`
                  : "As-of date not reported"
                : undefined
            }
          />

          {/* Shopper spend on our customers' storefronts — an order of
              magnitude above our own revenue, so the label and the take-rate
              hint both work to keep the two from being read as the same thing. */}
          <StatTile
            label={`GMV · ${m.windowLabel}`}
            {...tilePick("gmv")}
            metric={m.gmvWindow}
            format={(v) => compactMoney(v)}
            hint={
              m.takeRate.available
                ? `We keep ${percent(m.takeRate.value, 2)} of it`
                : undefined
            }
          />

          <StatTile
            label="Revenue change"
            {...tilePick("change")}
            metric={m.revenueChange}
            format={(v) => `${v >= 0 ? "+" : ""}${percent(v, 1)}`}
            hint={`Complete periods only · vs ${priorPhrase(range)}`}
          />
        </div>

        {/* The map needs more room than a half column gives, and a nested
            horizontal scrollbar reads as a bug. ---------------------------- */}
        <div className="grid gap-4 mb-4">
          {m.customersByState.available ? (
            <StatesCard
              data={m.customersByState.value}
              customersWithoutState={m.customersWithoutState}
              recency={
                m.consumerRecency.available ? m.consumerRecency.value : undefined
              }
              recencyByState={m.consumerRecencyByState}
              stateRecencyUnavailable={m.stateRecencyUnavailable}
              gmvWindowLabel={m.windowLabel}
              gmvUnavailable={m.stateGmvUnavailable}
              windowMonthCount={m.windowMonthCount}
            />
          ) : (
            <EmptyCard
              title="Customers by state"
              needs={m.customersByState.needs}
            />
          )}
        </div>

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
      className="mb-6 rounded-2xl px-5 py-4 flex items-start gap-3 max-[640px]:mb-3 max-[640px]:px-3 max-[640px]:py-2.5 max-[640px]:rounded-xl max-[640px]:gap-2"
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
      <div className="text-[13.5px] leading-relaxed max-[640px]:text-[12.5px] max-[640px]:leading-snug">
        <strong>Demo data.</strong>{" "}
        <span style={{ color: "var(--text-secondary)" }}>
          {/* Four lines of setup instructions push the revenue chart below the
              fold on a phone. The warning is what matters on a small screen;
              the how-to-replace-it detail is desk work, so it waits for a
              desk-sized viewport. */}
          <span className="max-[640px]:hidden">
            These numbers come from <code className="font-mono text-[12.5px]">data/network.json</code>,
            which has <code className="font-mono text-[12.5px]">&quot;demo&quot;: true</code>. Connect a
            source or replace that file with real records, and this banner disappears.
          </span>
          <span className="hidden max-[640px]:inline">Not real figures yet.</span>
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

