import Link from "next/link";
import DashboardCard from "./DashboardCard";

type StockAlert = {
  id: string;
  code: string;
  product: string;
  warehouse: string;
  quantity: string;
  alertQuantity: string;
  unit: string;
};

export default function StockAlertTable({
  stockAlerts,
  stockHref,
}: {
  stockAlerts: StockAlert[];
  stockHref?: string;
}) {
  return (
    <DashboardCard
      title="Stock Alert"
      action={stockHref ? <Link className="gg-btn gg-btn--ghost gg-btn--sm" href={stockHref}>View all</Link> : undefined}
      contentClassName="dashboard-table-pad"
    >
      <div className="gg-table-wrap">
        <table className="gg-table">
          <thead>
            <tr>
              <th>Code</th><th>Product</th><th>Warehouse</th><th>Quantity</th>
              <th className="dashboard-align-right">Alert Quantity</th>
            </tr>
          </thead>
          <tbody>
            {stockAlerts.map((stock) => (
              <tr key={stock.id}>
                <td className="gg-num">{stock.code}</td>
                <td className="gg-td-strong">{stock.product}</td>
                <td>{stock.warehouse}</td>
                <td><span className="qty-pill gg-num">{stock.quantity}</span> <span className="gg-chip-unit">{stock.unit}</span></td>
                <td className="dashboard-align-right">
                  <span className="alert-pill gg-num">{stock.alertQuantity}</span> <span className="gg-chip-unit">{stock.unit}</span>
                </td>
              </tr>
            ))}
            {stockAlerts.length === 0 && (
              <tr><td colSpan={5} className="gg-muted">No low-stock products.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </DashboardCard>
  );
}
