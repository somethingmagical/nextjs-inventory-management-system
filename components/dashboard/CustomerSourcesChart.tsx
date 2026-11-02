import DashboardCard from "./DashboardCard";

export default function CustomerSourcesChart() {
  return (
    <DashboardCard title="Top 5 Customers (May)">
      <div className="chart-box customer-chart">
        <div className="customer-chart-legend">
          <span className="customer-chart-swatch" />
          direct-customer
        </div>
        <div className="customer-pie" role="img" aria-label="All customers are direct customers" />
      </div>
    </DashboardCard>
  );
}
