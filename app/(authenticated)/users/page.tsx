import type { Metadata } from "next";
import Image from "next/image";
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
import { Prisma } from "@prisma/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { canManageRoleInHierarchy } from "@/lib/authorization";
import { getUserViewAccess } from "./authorization";
import UserDeleteButton from "./UserDeleteButton";
import WarehouseToast from "@/components/shared/WarehouseToast";
import AutoSearchForm from "@/components/shared/AutoSearchForm";
import DynamicPageSizeSelect from "@/components/shared/DynamicPageSizeSelect";
import SortableTableHeader from "@/components/shared/SortableTableHeader";
import TableSortFilter from "@/components/shared/TableSortFilter";
import { parseSortBy, parseSortOrder } from "@/lib/table-sorting";
import { PERMISSION } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Users",
  description: "Manage staff user accounts",
};

const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const sortFields = ["lastName", "role", "phoneNumber", "createdAt"] as const;
const sortOptions = [
  { value: "lastName", label: "User" },
  { value: "role", label: "Role" },
  { value: "phoneNumber", label: "Phone Number" },
  { value: "createdAt", label: "Created On" },
] as const;

type UsersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function UsersPage({ searchParams }: UsersPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading users...</p>
        </main>
      }
    >
      <UserList searchParams={searchParams} />
    </Suspense>
  );
}

async function UserList({ searchParams }: UsersPageProps) {
  await connection();
  const access = await getUserViewAccess();

  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");
  const canManageUsers = access.user.permissions.includes(
    PERMISSION.manageUsers,
  );

  const rawSearchParams = await searchParams;
  const parsedQuery = searchQuerySchema.safeParse(rawSearchParams.q);
  const parsedPage = pageSchema.safeParse(rawSearchParams.page);
  const parsedPageSize = pageSizeSchema.safeParse(rawSearchParams.pageSize);
  const created = rawSearchParams.created === "1";
  const updated = rawSearchParams.updated === "1";
  const deleted = rawSearchParams.deleted === "1";
  const query = parsedQuery.success ? parsedQuery.data : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;
  const sortBy = parseSortBy(rawSearchParams.sortBy, sortFields, "createdAt");
  const sortOrder = parseSortOrder(rawSearchParams.sortOrder);

  const where = {
    deletedAt: null,
    ...(query
      ? {
          OR: [
            { firstName: { contains: query } },
            { lastName: { contains: query } },
            { email: { contains: query } },
            { roleRecord: { is: { name: { contains: query } } } },
          ],
        }
      : {}),
  };

  const totalCount = await db.user.count({ where });
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage =
    totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const orderBy: Prisma.UserOrderByWithRelationInput[] =
    sortBy === "role"
      ? [
          { roleRecord: { name: sortOrder } },
          { lastName: sortOrder },
          { firstName: sortOrder },
        ]
      : [{ [sortBy]: sortOrder }, { id: sortOrder }];
  const users = await db.user.findMany({
    where,
    orderBy,
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      roleRecord: {
        select: {
          name: true,
          permissions: { select: { permission: true } },
        },
      },
      phoneNumber: true,
      image: true,
      createdAt: true,
    },
  });

  const currentUserName =
    `${access.user.firstName} ${access.user.lastName}`.trim() ||
    access.user.email;
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);

  return (
    <DashboardLayout
      user={{ name: currentUserName, image: access.user.image }}
      pageTitle="Users"
    >
      <main className="gg-content">
        {(created || updated || deleted) && (
          <WarehouseToast
            message={
              created
                ? "User created successfully."
                : updated
                  ? "User updated successfully."
                  : "User deleted successfully."
            }
          />
        )}
        <div className="gg-table-toolbar">
          <div
            className="table-search-filter-group"
            role="group"
            aria-label="Search and filters"
          >
            <AutoSearchForm
              action="/users"
              className="warehouse-search-form"
              iconClassName="gg-input-icon warehouse-search-control"
              id="user-search"
              label="Search users"
              placeholder="Search users"
              value={query}
            />
            <TableSortFilter
              sortBy={sortBy}
              sortOrder={sortOrder}
              options={sortOptions}
            />
          </div>
          <div className="gg-spacer" />
          {canManageUsers && (
            <Link className="gg-btn gg-btn--primary" href="/users/create">
              <Plus aria-hidden="true" />
              Create User
            </Link>
          )}
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <SortableTableHeader
                    label="User"
                    sortKey="lastName"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    pathname="/users"
                    searchParams={rawSearchParams}
                  />
                  <SortableTableHeader
                    label="Role"
                    sortKey="role"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    pathname="/users"
                    searchParams={rawSearchParams}
                  />
                  <SortableTableHeader
                    label="Phone Number"
                    sortKey="phoneNumber"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    pathname="/users"
                    searchParams={rawSearchParams}
                  />
                  <SortableTableHeader
                    label="Created On"
                    sortKey="createdAt"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    pathname="/users"
                    searchParams={rawSearchParams}
                  />
                  {canManageUsers && (
                    <th className="user-actions-heading" scope="col">
                      Action
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const name = `${user.firstName} ${user.lastName}`.trim();
                  const initials =
                    `${user.firstName.slice(0, 1)}${user.lastName.slice(0, 1)}`.toUpperCase();
                  const canManageUser =
                    canManageUsers &&
                    canManageRoleInHierarchy(access.user, {
                      name: user.roleRecord.name,
                      permissions: user.roleRecord.permissions.map(
                        ({ permission }) => permission,
                      ),
                    });

                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="user-list-cell">
                          <span
                            className="gg-avatar user-list-avatar"
                            aria-hidden="true"
                          >
                            {user.image ? (
                              <Image
                                src={user.image}
                                alt=""
                                width={32}
                                height={32}
                                unoptimized
                              />
                            ) : (
                              initials
                            )}
                          </span>
                          <span className="ppl-cell">
                            <span className="nm">{name}</span>
                            <span className="em">{user.email}</span>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="user-role-badge">
                          {user.roleRecord.name}
                        </span>
                      </td>
                      <td className="gg-num">{user.phoneNumber || "—"}</td>
                      <td>
                        <time
                          className="gg-chip-time gg-num"
                          dateTime={user.createdAt.toISOString()}
                        >
                          {user.createdAt.toLocaleDateString("en", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </time>
                      </td>
                      {canManageUsers && (
                        <td className="user-actions-cell">
                          {canManageUser ? (
                            <div className="row-acts">
                              <Link
                                className="act-edit"
                                href={`/users/${encodeURIComponent(user.id)}/edit`}
                                aria-label={`Edit ${name}`}
                                title="Edit"
                              >
                                <Pencil aria-hidden="true" />
                              </Link>
                              <UserDeleteButton
                                userId={user.id}
                                userName={name}
                              />
                            </div>
                          ) : (
                            <span className="gg-muted">Protected</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td
                      className="user-empty-cell"
                      colSpan={canManageUsers ? 5 : 4}
                    >
                      <p className="warehouse-empty-title">
                        {query ? "No users match your search" : "No users yet"}
                      </p>
                      <p className="gg-muted">
                        {query
                          ? "Try another name, email, or role."
                          : "Create a user account to add staff to your inventory system."}
                      </p>
                      {query && (
                        <Link
                          className="gg-btn gg-btn--secondary"
                          href="/users"
                        >
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
            <DynamicPageSizeSelect id="user-page-size" pageSize={pageSize} />
            <span className="gg-muted gg-num" aria-live="polite">
              {firstRecord}–{lastRecord} of {totalCount}
            </span>
            <div className="gg-spacer" />
            <PaginationLink
              page={1}
              currentPage={currentPage}
              totalPages={totalPages}
              query={query}
              pageSize={pageSize}
              sortBy={sortBy}
              sortOrder={sortOrder}
              label="First page"
            >
              <ChevronFirst aria-hidden="true" />
            </PaginationLink>
            <PaginationLink
              page={Math.max(1, currentPage - 1)}
              currentPage={currentPage}
              totalPages={totalPages}
              query={query}
              pageSize={pageSize}
              sortBy={sortBy}
              sortOrder={sortOrder}
              label="Previous page"
            >
              <ChevronLeft aria-hidden="true" />
            </PaginationLink>
            <PaginationLink
              page={Math.min(totalPages, currentPage + 1)}
              currentPage={currentPage}
              totalPages={totalPages}
              query={query}
              pageSize={pageSize}
              sortBy={sortBy}
              sortOrder={sortOrder}
              label="Next page"
            >
              <ChevronRight aria-hidden="true" />
            </PaginationLink>
            <PaginationLink
              page={totalPages}
              currentPage={currentPage}
              totalPages={totalPages}
              query={query}
              pageSize={pageSize}
              sortBy={sortBy}
              sortOrder={sortOrder}
              label="Last page"
            >
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
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (query) params.set("q", query);
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);

  if (isDisabled) {
    return (
      <span
        className="gg-page-btn is-disabled"
        aria-disabled="true"
        aria-label={label}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      className="gg-page-btn"
      href={`/users?${params.toString()}`}
      aria-label={label}
    >
      {children}
    </Link>
  );
}
