import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { getProductAccess } from "../products/authorization";
import MasterDataManager from "../master-data/MasterDataManager";
import MasterDataPagination from "../master-data/MasterDataPagination";
import type { MasterDataItem } from "../master-data/action-state";
import { createBrand, deleteBrand, updateBrand } from "./actions";

export const metadata: Metadata = {
  title: "Brands | Inventory",
  description: "Manage product brands",
};

const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);

type BrandsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function BrandsPage({ searchParams }: BrandsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading brands...</p>
        </main>
      }
    >
      <BrandList searchParams={searchParams} />
    </Suspense>
  );
}

async function BrandList({ searchParams }: BrandsPageProps) {
  await connection();
  const access = await getProductAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const rawSearchParams = await searchParams;
  const parsedQuery = searchQuerySchema.safeParse(rawSearchParams.q);
  const parsedPage = pageSchema.safeParse(rawSearchParams.page);
  const parsedPageSize = pageSizeSchema.safeParse(rawSearchParams.pageSize);
  const query = parsedQuery.success ? parsedQuery.data : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;

  const where = {
    deletedAt: null,
    ...(query ? { name: { contains: query } } : {}),
  };
  const totalCount = await db.brand.count({ where });
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const brands = await db.brand.findMany({
    where,
    orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: { id: true, name: true, logo: true },
  });
  const items: MasterDataItem[] = brands;

  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const pagination = (
    <MasterDataPagination
      listPath="/brands"
      pageSize={pageSize}
      query={query}
      currentPage={currentPage}
      totalPages={totalPages}
      totalCount={totalCount}
    />
  );

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Brands">
      <main className="gg-content">
        <MasterDataManager
          entity="Brand"
          listPath="/brands"
          query={query}
          pageSize={pageSize}
          items={items}
          pagination={pagination}
          createAction={createBrand}
          updateAction={updateBrand}
          deleteAction={deleteBrand}
        />
      </main>
    </DashboardLayout>
  );
}
