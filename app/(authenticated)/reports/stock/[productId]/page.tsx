import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import ReportPageSuspense from "../../ReportPageSuspense";

export const metadata: Metadata = {
  title: "Stock History",
  description: "Review stock information for a product.",
};

const productIdSchema = z.string().min(1).max(100);

export default function StockHistoryPlaceholder({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  return (
    <ReportPageSuspense>
      <StockHistoryContent params={params} />
    </ReportPageSuspense>
  );
}

async function StockHistoryContent({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  await connection();
  const parsedId = productIdSchema.safeParse((await params).productId);
  if (!parsedId.success) notFound();

  const product = await db.product.findFirst({
    where: { id: parsedId.data, deletedAt: null, categoryRecord: { is: { deletedAt: null } } },
    select: { name: true, code: true },
  });
  if (!product) notFound();

  return (
    <main className="gg-content reports-content">
      <div className="page-head">
        <div>
          <h1 className="gg-page-title">Stock History</h1>
          <p className="gg-muted">{product.name} · {product.code}</p>
        </div>
        <Link className="gg-btn gg-btn--secondary" href="/reports/stock">Back to Stock Reports</Link>
      </div>
      <section className="gg-card gg-card-pad stock-history-placeholder">
        <h2 className="gg-card-title">Stock history is not available yet</h2>
        <p className="gg-muted">
          The current inventory data stores each product&apos;s quantity by warehouse, but does not keep a stock movement history.
        </p>
      </section>
    </main>
  );
}
