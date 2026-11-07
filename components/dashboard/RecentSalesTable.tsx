import DashboardCard from "./DashboardCard";

type RecentSale = {
  id: string;
  reference: string;
  customer: string;
  status: string;
  grandTotal: string;
  paid: string;
  due: string;
  paymentStatus: string;
};

export default function RecentSalesTable({ sales }: { sales: RecentSale[] }) {
  return (
    <DashboardCard title="Recent Sales" contentClassName="dashboard-table-pad">
      <div className="gg-table-wrap">
        <table className="gg-table">
          <thead>
            <tr>
              <th>Reference</th><th>Customer</th><th>Status</th><th>Grand Total</th>
              <th>Paid</th><th>Due</th><th>Payment Status</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id}>
                <td><span className="gg-chip-code">{sale.reference}</span></td>
                <td>{sale.customer}</td>
                <td>
                  <span className={`gg-badge ${sale.status === "Received" ? "gg-badge--success" : "gg-badge--warning"}`}>
                    {sale.status}
                  </span>
                </td>
                <td className="gg-num gg-td-strong">$ {sale.grandTotal}</td>
                <td className="gg-num">$ {sale.paid}</td>
                <td className="gg-num">$ {sale.due}</td>
                <td>
                  <span className={`gg-badge ${sale.paymentStatus === "Paid" ? "gg-badge--success" : "gg-badge--warning"}`}>
                    {sale.paymentStatus}
                  </span>
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr><td colSpan={7} className="gg-muted">No sales to display.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </DashboardCard>
  );
}
