import DashboardCard from "./DashboardCard";

const stockAlerts = [
  ["002", "ipl laser hair removal", "Office", "0"],
  ["001", "FACE FAT AND DOUBLE CHIN", "Office", "2"],
];

export default function StockAlertTable() {
  return (
    <DashboardCard title="Stock Alert" contentClassName="dashboard-table-pad">
      <div className="gg-table-wrap">
        <table className="gg-table">
          <thead>
            <tr>
              <th>Code</th><th>Product</th><th>Warehouse</th><th>Quantity</th>
              <th className="dashboard-align-right">Alert Quantity</th>
            </tr>
          </thead>
          <tbody>
            {stockAlerts.map(([code, product, warehouse, quantity]) => (
              <tr key={code}>
                <td className="gg-num">{code}</td>
                <td className="gg-td-strong">{product}</td>
                <td>{warehouse}</td>
                <td><span className="qty-pill gg-num">{quantity}</span> <span className="gg-chip-unit">piece</span></td>
                <td className="dashboard-align-right"><span className="alert-pill gg-num">3</span> <span className="gg-chip-unit">piece</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardCard>
  );
}
