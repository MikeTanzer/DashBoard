"use client";

import { useState } from "react";
import type { DashboardMetrics } from "@/lib/metrics";
import { compactMoney, money, percent } from "@/lib/format";
import { ConsumerPie } from "./ConsumerPie";
import { NotTracked } from "./StatTile";

type View = "bars" | "table";

/**
 * Where the money goes, for the selected window.
 *
 * Bars rather than a pie: expense categories are read by comparing sizes
 * ("is payroll bigger than everything else put together?"), and a bar chart
 * answers that at a glance where a ring makes you estimate angles. The ring in
 * the states card earns its shape because those slices are parts of one
 * audience; these are a ranked list.
 */
export function ExpensesCard({
  m,
  windowLabel,
}: {
  m: DashboardMetrics;
  windowLabel: string;
}) {
  const [view, setView] = useState<View>("bars");

  if (!m.expenseByCategory.available) {
    return (
      <section className="card p-6">
        <h2 className="text-[15px] font-bold mb-3">Expense breakdown</h2>
        <NotTracked needs={m.expenseByCategory.needs} />
      </section>
    );
  }

  const rows = m.expenseByCategory.value;
  const total = rows.reduce((a, r) => a + r.value, 0);
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <section className="card p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[15px] font-bold">Expense breakdown</h2>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--text-secondary)" }}
          >
            {money(total)} across {rows.length} categor
            {rows.length === 1 ? "y" : "ies"} · {windowLabel}
            {m.sharedExcludedCents > 0
              ? ` · ${compactMoney(m.sharedExcludedCents)} shared overhead excluded by the platform filter`
              : ""}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Which hue means what. Without this the two ramps are just colour. */}
          <div
            className="flex items-center gap-3 text-[11px] max-[640px]:hidden"
            style={{ color: "var(--text-secondary)" }}
          >
            <span className="flex items-center gap-1.5">
              <span className="cat-swatch" style={{ background: "var(--warm-400)" }} />
              COGS
            </span>
            <span className="flex items-center gap-1.5">
              <span className="cat-swatch" style={{ background: "var(--seq-500)" }} />
              Operations
            </span>
          </div>

          <div className="seg" role="tablist" aria-label="Expense view">
          {(
            [
              ["bars", "Bars"],
              ["table", "Table"],
            ] as [View, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
          </div>
        </div>
      </header>

      {/* Two encodings of one set of numbers, side by side. The ranked bars
          answer "what is the biggest line", the donut answers "how much of the
          whole is that" — the second question is genuinely hard to read off
          bars, and the pair costs one extra column rather than a second card.
          They were separate sections; merging them puts the comparison in one
          place instead of asking the reader to hold it across a gap. */}
      <div className="expense-split">
        <div className="expense-split-main">
      {view === "bars" ? (
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.key} className="expense-row">
              <span className="expense-label">{r.label}</span>
              <span className="expense-track">
                <span
                  className="expense-fill"
                  style={{
                    width: `${(r.value / max) * 100}%`,
                    background: `var(--${r.tone === "warm" ? "warm" : "seq"}-${r.step ?? 300})`,
                  }}
                />
              </span>
              <span className="expense-value">{compactMoney(r.value)}</span>
              <span className="expense-share">{percent(r.share, 1)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="dataview">
            <thead>
              <tr>
                <th>Category</th>
                <th>Group</th>
                <th className="num">Spend</th>
                <th className="num">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td style={{ color: "var(--text-secondary)" }}>
                    {r.tone === "warm" ? "COGS" : "Operations"}
                  </td>
                  <td className="num">{money(r.value)}</td>
                  <td className="num">{percent(r.share, 1)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td />
                <td className="num">{money(total)}</td>
                <td className="num">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
        </div>

        {/* No legend on the donut: the bars to its left already direct-label
            every slice with the same colour, amount and share, so a legend
            here repeated all seven rows verbatim. The donut carries the shape
            of the split and the total; the list carries the detail. */}
        <aside className="expense-split-side">
          <ConsumerPie
            bands={rows}
            inset
            totalLabel="Total spend"
            format="money"
            showLegend={false}
          />

          {m.grossMargin.available ? (
            <div className="expense-margin">
              <div className="eyebrow">Gross margin</div>
              <div className="expense-margin-figure">
                {percent(m.grossMargin.value, 1)}
              </div>
              <p>Revenue less the lines marked cost of revenue.</p>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
