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
import { canManageRoleInHierarchy, isAdminRole } from "@/lib/authorization";
import { getRoleViewAccess } from "./authorization";
import RoleDeleteButton from "./RoleDeleteButton";
import AutoSearchForm from "@/components/shared/AutoSearchForm";
import DynamicPageSizeSelect from "@/components/shared/DynamicPageSizeSelect";
import SortableTableHeader from "@/components/shared/SortableTableHeader";
import TableSortFilter from "@/components/shared/TableSortFilter";
import { parseSortBy, parseSortOrder } from "@/lib/table-sorting";
import { PERMISSION } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Roles",
  description: "Manage roles and permissions",
};

const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const sortFields = ["name", "createdAt"] as const;
const sortOptions = [
  { value: "name", label: "Name" },
  { value: "createdAt", label: "Date" },
] as const;

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
  const access = await getRoleViewAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");
  const canManageRoles = access.user.permissions.includes(PERMISSION.manageRoles);

  const rawSearchParams = await searchParams;
  const parsedQuery = searchQuerySchema.safeParse(rawSearchParams.q);
  const parsedPage = pageSchema.safeParse(rawSearchParams.page);
  const parsedPageSize = pageSizeSchema.safeParse(rawSearchParams.pageSize);
  const query = parsedQuery.success ? parsedQuery.data : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;
  const sortBy = parseSortBy(rawSearchParams.sortBy, sortFields, "name");
  const sortOrder = parseSortOrder(rawSearchParams.sortOrder, "asc");

  const where = {
    deletedAt: null,
    ...(query ? { name: { contains: query } } : {}),
  };
  const totalCount = await db.role.count({ where });
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const roles = await db.role.findMany({
    where,
    orderBy: [{ [sortBy]: sortOrder }, { createdAt: sortOrder }],
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      name: true,
      createdAt: true,
      permissions: { select: { permission: true } },
    },
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
          <TableSortFilter sortBy={sortBy} sortOrder={sortOrder} options={sortOptions} />
          <div className="gg-spacer" />
          {canManageRoles && <Link className="gg-btn gg-btn--primary" href="/roles/create">
            <Plus aria-hidden="true" />
            Create Role
          </Link>}
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <SortableTableHeader label="Name" sortKey="name" sortBy={sortBy} sortOrder={sortOrder} pathname="/roles" searchParams={rawSearchParams} />
                  <SortableTableHeader label="Date" sortKey="createdAt" sortBy={sortBy} sortOrder={sortOrder} pathname="/roles" searchParams={rawSearchParams} />
                  {canManageRoles && <th className="roles-actions-heading" scope="col">Action</th>}
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => {
                  const canManageRole = canManageRoles &&
                    canManageRoleInHierarchy(access.user, {
                      name: role.name,
                      permissions: role.permissions.map(({ permission }) => permission),
                    }) &&
                    (isAdminRole(access.user.roleName) || role.id !== access.user.roleId);

                  return (
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
                      {canManageRoles && <td className="roles-actions-cell">
                        {canManageRole ? (
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
                        ) : (
                          <span className="gg-muted">Protected</span>
                        )}
                      </td>}
                    </tr>
                  );
                })}
                {roles.length === 0 && (
                  <tr>
                    <td className="supplier-empty-cell" colSpan={canManageRoles ? 3 : 2}>
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
            <DynamicPageSizeSelect id="role-page-size" pageSize={pageSize} />
            <span className="gg-muted gg-num" aria-live="polite">
              {firstRecord}–{lastRecord} of {totalCount}
            </span>
            <div className="gg-spacer" />
            <PaginationLink page={1} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="First page">
              <ChevronFirst aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={Math.max(1, currentPage - 1)} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="Previous page">
              <ChevronLeft aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={Math.min(totalPages, currentPage + 1)} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="Next page">
              <ChevronRight aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={totalPages} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="Last page">
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
  sortBy,
  sortOrder,
  label,
  children,
}: {
  page: number;
  currentPage: number;
  totalPages: number;
  query: string;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  label: string;
  children: React.ReactNode;
}) {
  const isDisabled = totalPages === 0 || page === currentPage;
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query) params.set("q", query);
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);

  return isDisabled ? (
    <span className="gg-page-btn is-disabled" aria-disabled="true" aria-label={label}>{children}</span>
  ) : (
    <Link className="gg-page-btn" href={`/roles?${params.toString()}`} aria-label={label}>{children}</Link>
  );
}
