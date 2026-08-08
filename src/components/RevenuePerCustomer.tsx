import type { DashboardMetrics } from "@/lib/metrics";
import { fullNumber, money, percent } from "@/lib/format";
import { NotTracked } from "./StatTile";

/**
 * Average revenue per customer, with its SaaS / usage split underneath.
 *
 * The split is computed over ALL customers, not over the customers paying for
 * each stream — so the two lines actually sum to the headline. The
 * per-paying-customer figures answer a different question ("what does a usage
 * customer spend?") and would overstate the total by ~12% if stacked here,
 * because only 73 of 99 customers are billed for usage at all. That figure is
 * kept, but as a footnote where it can't be mistaken for a component.
 *
 * Dots reuse the chart's series colors so the split reads as the same SaaS /
 * usage encoding used everywhere else.
 */
export function RevenuePerCustomer({
  m,
  selected,
  onSelect,
}: {
  m: DashboardMetrics;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const pickProps = {
    className: `card p-5 max-[640px]:p-3.5 flex flex-col gap-2 ${onSelect ? "tile-pick" : ""}`,
    role: onSelect ? ("button" as const) : undefined,
    tabIndex: onSelect ? 0 : undefined,
    "aria-pressed": onSelect ? !!selected : undefined,
    "data-selected": selected ? "" : undefined,
    onClick: onSelect,
    onKeyDown: onSelect
      ? (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }
      : undefined,
  };

  if (!m.avgGrossPerCustomer.available) {
    return (
      <div {...pickProps}>
        <div className="eyebrow">Avg revenue per customer</div>
        <NotTracked needs={m.avgGrossPerCustomer.needs} />
      </div>
    );
  }

  const gross = m.avgGrossPerCustomer.value;
  const saas = m.avgSaasShareCents.available ? m.avgSaasShareCents.value : null;
  const usage = m.avgUsageShareCents.available
    ? m.avgUsageShareCents.value
    : null;

  return (
    <div {...pickProps}>
      <div className="eyebrow">Avg revenue per customer</div>
      <div className="display text-[30px]">{money(gross)}/mo</div>

      {saas !== null && usage !== null && gross > 0 ? (
        <>
          <div
            className="mt-2 pt-3 flex flex-col gap-2"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <SplitRow
              color="var(--series-1)"
              label="SaaS"
              amount={saas}
              share={saas / gross}
            />
            <SplitRow
              color="var(--series-2)"
              label="Usage"
              amount={usage}
              share={usage / gross}
            />
          </div>

          {m.avgUsagePerCustomer.available ? (
            <p
              className="text-[11px] mt-1 leading-snug"
              style={{ color: "var(--text-muted)" }}
            >
              {fullNumber(m.usageBillingCustomers)} of{" "}
              {m.customerCount.available ? fullNumber(m.customerCount.value) : "—"}{" "}
              customers are billed for usage — among those it averages{" "}
              {money(m.avgUsagePerCustomer.value)}/mo.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SplitRow({
  color,
  label,
  amount,
  share,
}: {
  color: string;
  label: string;
  amount: number;
  share: number;
}) {
  return (
    <div className="split-row flex items-center gap-2.5 text-[13px]">
      <span
        aria-hidden="true"
        style={{
          background: color,
          width: 10,
          height: 10,
          borderRadius: 3,
          flexShrink: 0,
        }}
      />
      <span
        className="split-label flex-1"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </span>
      <span
        className="font-semibold whitespace-nowrap"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {money(amount)}/mo
      </span>
      <span
        className="split-pct w-[40px] text-right whitespace-nowrap"
        style={{
          color: "var(--text-muted)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {percent(share)}
      </span>
    </div>
  );
}
