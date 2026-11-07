import DashboardCard from "./DashboardCard";
import { ProductSalesChart } from "./DashboardCharts";

type ProductSales = { name: string; quantity: string; revenue: string };

export default function TopProductsChart({
  year,
  products,
}: {
  year: number;
  products: ProductSales[];
}) {
  const labels = products.map(({ name }) => name);
  const amounts = products.map(({ revenue }) => Number(revenue));

  return (
    <DashboardCard title={`Top Selling Products (${year})`}>
      <ProductSalesChart labels={labels} amounts={amounts} />
    </DashboardCard>
  );
}

export function TopProductsTable({ month, products }: { month: string; products: ProductSales[] }) {
  return (
    <DashboardCard title={`Top Selling Products (${month})`} contentClassName="dashboard-table-pad">
      <div className="gg-table-wrap">
        <table className="gg-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Quantity</th>
              <th className="dashboard-align-right">Grand Total</th>
            </tr>
          </thead>
          <tbody className="empty-table-body">
            {products.map((product) => (
              <tr key={product.name}>
                <td className="gg-td-strong">{product.name}</td>
                <td className="gg-num">{product.quantity}</td>
                <td className="gg-num dashboard-align-right">$ {product.revenue}</td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={3} className="gg-muted">No sales recorded in {month}.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </DashboardCard>
  );
}
