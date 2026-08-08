"use client";

import { useState } from "react";
import type { DashboardMetrics } from "@/lib/metrics";
import { compactMoney, money, percent } from "@/lib/format";
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
        <h2 className="text-[15px] font-bold mb-3">Where the money goes</h2>
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
          <h2 className="text-[15px] font-bold">Where the money goes</h2>
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
      </header>

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
                    background: `var(--seq-${r.step ?? 300})`,
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
                <th className="num">Spend</th>
                <th className="num">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td className="num">{money(r.value)}</td>
                  <td className="num">{percent(r.share, 1)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{money(total)}</td>
                <td className="num">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
