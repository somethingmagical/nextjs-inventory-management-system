import Link from "next/link";
import DashboardCard from "./DashboardCard";

export default function BusinessInsights() {
  return (
    <DashboardCard
      title="AI Business Insights"
      action={
        <Link
          className="gg-btn gg-btn--ghost gg-btn--sm"
          href="/business-insights"
        >
          Open insights
        </Link>
      }
    >
      <p className="gg-muted">
        Review on-demand recommendations based on recent sales, expenses,
        receivables, and stock levels.
      </p>
    </DashboardCard>
  );
}
