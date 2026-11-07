import DashboardCard from "./DashboardCard";
import { CustomerSalesChart } from "./DashboardCharts";

export default function CustomerSourcesChart({
  month,
  customers,
}: {
  month: string;
  customers: { name: string; amount: string }[];
}) {
  const labels = customers.map(({ name }) => name);
  const amounts = customers.map(({ amount }) => Number(amount));

  return (
    <DashboardCard title={`Top 5 Customers (${month})`}>
      <CustomerSalesChart labels={labels} amounts={amounts} />
    </DashboardCard>
  );
}
