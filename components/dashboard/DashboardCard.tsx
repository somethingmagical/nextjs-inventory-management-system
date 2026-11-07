import type { ReactNode } from "react";
import { Icon } from "@/components/layout/Sidebar";

export default function DashboardCard({
  title,
  children,
  action,
  contentClassName = "",
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  contentClassName?: string;
}) {
  return (
    <section className="gg-card">
      <div className="gg-card-head">
        <h2 className="gg-card-title">{title}</h2>
        {action}
      </div>
      <div className={`gg-card-pad ${contentClassName}`.trim()}>{children}</div>
    </section>
  );
}

export type KpiCardData = {
  valueKey: keyof DashboardKpiValues;
  tone: string;
  icon: string;
  label: string;
};

export type DashboardKpiValues = Record<
  | "sales"
  | "purchases"
  | "salesReturns"
  | "purchaseReturns"
  | "todaySales"
  | "todayReceived"
  | "todayPurchases"
  | "todayExpenses",
  string
>;

const kpis: KpiCardData[] = [
  { valueKey: "sales", tone: "gold", icon: "shoppingCart", label: "Sales" },
  { valueKey: "purchases", tone: "emerald", icon: "shoppingBag", label: "Purchases" },
  { valueKey: "salesReturns", tone: "blue", icon: "arrowRight", label: "Sales Returns" },
  { valueKey: "purchaseReturns", tone: "orange", icon: "arrowLeft", label: "Purchases Returns" },
  { valueKey: "todaySales", tone: "violet", icon: "dollar", label: "Today Total Sales" },
  { valueKey: "todayReceived", tone: "rose", icon: "banknote", label: "Today Total Received (Sales)" },
  { valueKey: "todayPurchases", tone: "cyan", icon: "shoppingCart", label: "Today Total Purchases" },
  { valueKey: "todayExpenses", tone: "red", icon: "minusCircle", label: "Today Total Expense" },
];

export function KpiCard({
  tone,
  icon,
  label,
  value,
}: Omit<KpiCardData, "valueKey"> & { value: string }) {
  return (
    <article className={`gg-kpi gg-kpi--${tone}`}>
      <span className="gg-kpi-ico"><Icon name={icon} size={26} /></span>
      <span className="gg-kpi-body">
        <span className="gg-kpi-value gg-num">{value}</span>
        <span className="gg-kpi-label">{label}</span>
      </span>
    </article>
  );
}

export function KpiGrid({ values }: { values: DashboardKpiValues }) {
  return (
    <section className="gg-kpi-grid" id="kpiGrid" aria-label="Dashboard summary">
      {kpis.map((kpi) => (
        <KpiCard
          key={kpi.label}
          tone={kpi.tone}
          icon={kpi.icon}
          label={kpi.label}
          value={`$ ${values[kpi.valueKey]}`}
        />
      ))}
    </section>
  );
}
