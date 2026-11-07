import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "More Reports",
  description: "Browse additional inventory reports.",
};

const reportLinks = [
  {
    title: "Top Selling Products",
    description: "Breakdown of product sales by month.",
    href: "/reports/top-selling-products",
  },
  {
    title: "Warehouse Overview",
    description: "Operational totals by warehouse, including sales and returns.",
    href: "/reports/warehouse",
  },
  {
    title: "Stock History",
    description: "Per-product stock overview and inventory signals.",
    href: "/reports/stock",
  },
];

export default function MoreReportsPage() {
  return (
    <main className="gg-content reports-content">
      <div className="more-reports">
        <h1 className="more-reports-title">More Reports</h1>
        <div className="more-reports-grid">
          {reportLinks.map((report) => (
            <Link
              key={report.href}
              href={report.href}
              className="more-report-card"
            >
              <span className="more-report-card-title">{report.title}</span>
              <span className="more-report-card-description">{report.description}</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
