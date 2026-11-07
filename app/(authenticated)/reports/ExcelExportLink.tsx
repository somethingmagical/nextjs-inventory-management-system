import { Download } from "lucide-react";
import type { WarehouseReportTab } from "@/lib/reports/filters";

type ReportType = "warehouse" | "sale" | "purchase" | "stock";

export default function ExcelExportLink({
  report,
  query,
  date,
  warehouseId,
  tab,
}: {
  report: ReportType;
  query?: string;
  date?: string;
  warehouseId?: string;
  tab?: WarehouseReportTab;
}) {
  const searchParams = new URLSearchParams({ report });
  if (query) searchParams.set("q", query);
  if (date) searchParams.set("date", date);
  if (warehouseId) searchParams.set("warehouseId", warehouseId);
  if (tab) searchParams.set("tab", tab);

  return (
    <a
      className="btn-excel report-excel-link"
      href={`/api/reports/export?${searchParams.toString()}`}
      download
    >
      <Download aria-hidden="true" />
      EXCEL
    </a>
  );
}
