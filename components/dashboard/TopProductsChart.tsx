import DashboardCard from "./DashboardCard";

export default function TopProductsChart() {
  return (
    <DashboardCard title="Top Selling Products (2026)">
      <div className="chart-box dashboard-doughnut" role="img" aria-label="No top selling product data available">
        <div className="dashboard-doughnut-hole"><span>No data</span></div>
      </div>
    </DashboardCard>
  );
}

export function TopProductsTable() {
  return (
    <DashboardCard title="Top Selling Products (May)" contentClassName="dashboard-table-pad">
      <div className="gg-table-wrap">
        <table className="gg-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Quantity</th>
              <th className="dashboard-align-right">Grand Total</th>
            </tr>
          </thead>
          <tbody className="empty-table-body" />
        </table>
      </div>
    </DashboardCard>
  );
}
