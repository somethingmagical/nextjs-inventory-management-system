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
  tone: string;
  icon: string;
  label: string;
  value?: string;
};

const kpis: KpiCardData[] = [
  { tone: "gold", icon: "shoppingCart", label: "Sales" },
  { tone: "emerald", icon: "shoppingBag", label: "Purchases" },
  { tone: "blue", icon: "arrowRight", label: "Sales Returns" },
  { tone: "orange", icon: "arrowLeft", label: "Purchases Returns" },
  { tone: "violet", icon: "dollar", label: "Today Total Sales" },
  { tone: "rose", icon: "banknote", label: "Today Total Received (Sales)" },
  { tone: "cyan", icon: "shoppingCart", label: "Today Total Purchases" },
  { tone: "red", icon: "minusCircle", label: "Today Total Expense" },
];

export function KpiCard({ tone, icon, label, value = "$ 0.00" }: KpiCardData) {
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

export function KpiGrid() {
  return (
    <section className="gg-kpi-grid" aria-label="Dashboard summary">
      {kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
    </section>
  );
}

const salesChartDays = ["May 20", "May 21", "May 22", "May 23", "May 24", "May 25", "May 26"];

export function SalesChart() {
  return (
    <div className="chart-box dashboard-line-wrap">
      <svg className="dashboard-line-chart" viewBox="0 0 700 300" role="img" aria-label="Sales and purchases by day, both currently zero">
        <text x="0" y="29">$ 1.0</text>
        <text x="0" y="91">$ 0.7</text>
        <text x="0" y="153">$ 0.3</text>
        <text x="0" y="215">$ 0.0</text>
        {[27, 89, 151, 213].map((y) => <line key={y} x1="52" x2="690" y1={y} y2={y} className="chart-grid-line" />)}
        <line x1="52" x2="690" y1="213" y2="213" className="chart-zero-line" />
        {salesChartDays.map((day, index) => {
          const x = 70 + index * 100;
          return (
            <g key={day}>
              <circle cx={x} cy="213" r="3.5" className="chart-dot-sales" />
              <circle cx={x} cy="213" r="3.5" className="chart-dot-purchases" />
              <text x={x} y="246" textAnchor="middle">{day}</text>
            </g>
          );
        })}
        <g className="chart-legend">
          <circle cx="286" cy="278" r="4" className="chart-dot-sales" /><text x="298" y="282">Sales</text>
          <circle cx="365" cy="278" r="4" className="chart-dot-purchases" /><text x="377" y="282">Purchases</text>
        </g>
      </svg>
    </div>
  );
}
