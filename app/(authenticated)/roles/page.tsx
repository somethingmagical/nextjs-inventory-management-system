import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
} from "lucide-react";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import WarehouseToast from "@/components/shared/WarehouseToast";
import { db } from "@/lib/db";
import { getRoleManagementAccess } from "./authorization";
import RoleDeleteButton from "./RoleDeleteButton";
import AutoSearchForm from "@/components/shared/AutoSearchForm";

export const metadata: Metadata = {
  title: "Roles",
  description: "Manage roles and permissions",
};

const pageSizeOptions = [10, 25, 50] as const;
const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);

type RolesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function RolesPage({ searchParams }: RolesPageProps) {
  return (
    <Suspense fallback={<main className="gg-content" aria-busy="true"><p className="gg-muted">Loading roles...</p></main>}>
      <RoleList searchParams={searchParams} />
    </Suspense>
  );
}

async function RoleList({ searchParams }: RolesPageProps) {
  await connection();
  const access = await getRoleManagementAccess();
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
  const totalCount = await db.role.count({ where });
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const roles = await db.role.findMany({
    where,
    orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: { id: true, name: true, createdAt: true },
  });

  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);
  const created = rawSearchParams.created === "1";
  const updated = rawSearchParams.updated === "1";
  const deleted = rawSearchParams.deleted === "1";

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Roles">
      <main className="gg-content">
        {(created || updated || deleted) && (
          <WarehouseToast
            message={
              created
                ? "Role created successfully."
                : updated
                  ? "Role updated successfully."
                  : "Role deleted successfully."
            }
          />
        )}
        <div className="gg-table-toolbar">
          <AutoSearchForm
            action="/roles"
            className="warehouse-search-form"
            iconClassName="gg-input-icon warehouse-search-control"
            id="role-search"
            label="Search roles"
            value={query}
          />
          <div className="gg-spacer" />
          <Link className="gg-btn gg-btn--primary" href="/roles/create">
            <Plus aria-hidden="true" />
            Create Role
          </Link>
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Date</th>
                  <th className="roles-actions-heading" scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id}>
                    <td className="gg-td-strong">{role.name}</td>
                    <td>
                      <time className="gg-chip-time gg-num" dateTime={role.createdAt.toISOString()}>
                        {role.createdAt.toLocaleDateString("en", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        })}
                      </time>
                    </td>
                    <td className="roles-actions-cell">
                      <div className="row-acts">
                        <Link
                          className="act-edit"
                          href={`/roles/${encodeURIComponent(role.id)}/edit`}
                          aria-label={`Edit ${role.name}`}
                          title="Edit"
                        >
                          <Pencil aria-hidden="true" />
                        </Link>
                        <RoleDeleteButton roleId={role.id} roleName={role.name} />
                      </div>
                    </td>
                  </tr>
                ))}
                {roles.length === 0 && (
                  <tr>
                    <td className="supplier-empty-cell" colSpan={3}>
                      <p className="warehouse-empty-title">
                        {query ? "No roles match your search" : "No roles yet"}
                      </p>
                      <p className="gg-muted">
                        {query ? "Try another role name." : "Create a role to define user permissions."}
                      </p>
                      {query && (
                        <Link className="gg-btn gg-btn--secondary" href="/roles">
                          Clear search
                        </Link>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="gg-pagination">
            <form className="gg-perpage" action="/roles">
              <label className="gg-muted" htmlFor="role-page-size">Records per page</label>
              <select className="gg-select" id="role-page-size" name="pageSize" defaultValue={String(pageSize)}>
                {pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              {query && <input type="hidden" name="q" value={query} />}
              <button className="gg-page-btn warehouse-page-size-submit" type="submit" aria-label="Apply page size">
                <ChevronRight aria-hidden="true" />
              </button>
            </form>
            <span className="gg-muted gg-num" aria-live="polite">
              {firstRecord}–{lastRecord} of {totalCount}
            </span>
            <div className="gg-spacer" />
            <PaginationLink page={1} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} label="First page">
              <ChevronFirst aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={Math.max(1, currentPage - 1)} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} label="Previous page">
              <ChevronLeft aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={Math.min(totalPages, currentPage + 1)} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} label="Next page">
              <ChevronRight aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={totalPages} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} label="Last page">
              <ChevronLast aria-hidden="true" />
            </PaginationLink>
          </div>
        </div>
      </main>
    </DashboardLayout>
  );
}

function PaginationLink({
  page,
  currentPage,
  totalPages,
  query,
  pageSize,
  label,
  children,
}: {
  page: number;
  currentPage: number;
  totalPages: number;
  query: string;
  pageSize: number;
  label: string;
  children: React.ReactNode;
}) {
  const isDisabled = totalPages === 0 || page === currentPage;
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query) params.set("q", query);

  return isDisabled ? (
    <span className="gg-page-btn is-disabled" aria-disabled="true" aria-label={label}>{children}</span>
  ) : (
    <Link className="gg-page-btn" href={`/roles?${params.toString()}`} aria-label={label}>{children}</Link>
  );
}
