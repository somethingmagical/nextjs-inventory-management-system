import DashboardCard from "./DashboardCard";

const sales = [
  ["SA_11149", "direct-customer", "71,800.00", "71,800.00", "0.00"],
  ["SA_11148", "direct-customer", "31,920.00", "31,920.00", "0.00"],
  ["SA_11147", "direct-customer", "7,980.00", "7,980.00", "0.00"],
  ["SA_11146", "direct-customer", "11,970.00", "11,970.00", "0.00"],
  ["SA_11145", "direct-customer", "7,980.00", "7,980.00", "0.00"],
];

export default function RecentSalesTable() {
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
            {sales.map(([reference, customer, total, paid, due]) => (
              <tr key={reference}>
                <td><span className="gg-chip-code">{reference}</span></td>
                <td>{customer}</td>
                <td><span className="gg-badge gg-badge--success">Received</span></td>
                <td className="gg-num gg-td-strong">$ {total}</td>
                <td className="gg-num">$ {paid}</td>
                <td className="gg-num">$ {due}</td>
                <td><span className="gg-badge gg-badge--success">Paid</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardCard>
  );
}
