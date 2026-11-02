import type { Metadata } from "next";
import CustomerSourcesChart from "@/components/dashboard/CustomerSourcesChart";
import DashboardCard, { KpiGrid, SalesChart } from "@/components/dashboard/DashboardCard";
import RecentSalesTable from "@/components/dashboard/RecentSalesTable";
import StockAlertTable from "@/components/dashboard/StockAlertTable";
import TopProductsChart, { TopProductsTable } from "@/components/dashboard/TopProductsChart";
import { Icon } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "Dashboard | Inventory",
  description: "Inventory Dashboard",
};

export default function DashboardPage() {
  return (
    <main className="gg-content">
      <div className="dash-section-gap">
        <KpiGrid />

        <section className="dash-2col" aria-label="Sales and customer reports">
          <div className="dash-col">
            <DashboardCard
              title="This Week Sales & Purchases"
              action={
                <button className="gg-icon-btn dashboard-more-button" type="button" aria-label="More chart options">
                  <Icon name="menu" size={16} />
                </button>
              }
            >
              <SalesChart />
            </DashboardCard>
            <TopProductsTable />
          </div>

          <div className="dash-col">
            <TopProductsChart />
            <CustomerSourcesChart />
          </div>
        </section>

        <RecentSalesTable />
        <StockAlertTable />
      </div>
    </main>
  );
}
