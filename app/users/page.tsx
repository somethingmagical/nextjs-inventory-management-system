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
  Search,
} from "lucide-react";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { getUserManagementAccess } from "./authorization";
import UserDeleteButton from "./UserDeleteButton";
import WarehouseToast from "../warehouse/WarehouseToast";

export const metadata: Metadata = {
  title: "Users | Inventory",
  description: "Manage staff user accounts",
};

const pageSizeOptions = [10, 25, 50] as const;
const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);

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
  const access = await getUserManagementAccess();

  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

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

  const where = {
    deletedAt: null,
    ...(query
      ? {
          OR: [
            { firstName: { contains: query } },
            { lastName: { contains: query } },
            { email: { contains: query } },
            { role: { contains: query } },
          ],
        }
      : {}),
  };

  const totalCount = await db.user.count({ where });
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const users = await db.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      phoneNumber: true,
      image: true,
      createdAt: true,
    },
  });

  const currentUserName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
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
          <form className="warehouse-search-form" action="/users" role="search">
            <label className="sr-only" htmlFor="user-search">Search users</label>
            <div className="gg-input-icon warehouse-search-control">
              <Search aria-hidden="true" />
              <input
                className="gg-input"
                id="user-search"
                name="q"
                type="search"
                placeholder="Search users"
                defaultValue={query}
                maxLength={120}
              />
              <button className="warehouse-search-submit" type="submit" aria-label="Search">
                <Search aria-hidden="true" />
              </button>
            </div>
            <input type="hidden" name="pageSize" value={pageSize} />
          </form>
          <div className="gg-spacer" />
          <Link className="gg-btn gg-btn--primary" href="/users/create">
            <Plus aria-hidden="true" />
            Create User
          </Link>
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Role</th>
                  <th scope="col">Phone Number</th>
                  <th scope="col">Created On</th>
                  <th className="user-actions-heading" scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const name = `${user.firstName} ${user.lastName}`.trim();
                  const initials = `${user.firstName.slice(0, 1)}${user.lastName.slice(0, 1)}`.toUpperCase();

                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="user-list-cell">
                          <span className="gg-avatar user-list-avatar" aria-hidden="true">
                            {user.image ? <img src={user.image} alt="" /> : initials}
                          </span>
                          <span className="ppl-cell">
                            <span className="nm">{name}</span>
                            <span className="em">{user.email}</span>
                          </span>
                        </div>
                      </td>
                      <td><span className="user-role-badge">{user.role}</span></td>
                      <td className="gg-num">{user.phoneNumber || "—"}</td>
                      <td>
                        <time className="gg-chip-time gg-num" dateTime={user.createdAt.toISOString()}>
                          {user.createdAt.toLocaleDateString("en", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </time>
                      </td>
                      <td className="user-actions-cell">
                        <div className="row-acts">
                          <Link
                            className="act-edit"
                            href={`/users/${encodeURIComponent(user.id)}/edit`}
                            aria-label={`Edit ${name}`}
                            title="Edit"
                          >
                            <Pencil aria-hidden="true" />
                          </Link>
                          <UserDeleteButton userId={user.id} userName={name} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td className="user-empty-cell" colSpan={5}>
                      <p className="warehouse-empty-title">
                        {query ? "No users match your search" : "No users yet"}
                      </p>
                      <p className="gg-muted">
                        {query ? "Try another name, email, or role." : "Create a user account to add staff to your inventory system."}
                      </p>
                      {query && (
                        <Link className="gg-btn gg-btn--secondary" href="/users">
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
            <form className="gg-perpage" action="/users">
              <label className="gg-muted" htmlFor="user-page-size">Records per page</label>
              <select className="gg-select" id="user-page-size" name="pageSize" defaultValue={String(pageSize)}>
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

  if (isDisabled) {
    return (
      <span className="gg-page-btn is-disabled" aria-disabled="true" aria-label={label}>
        {children}
      </span>
    );
  }

  return (
    <Link className="gg-page-btn" href={`/users?${params.toString()}`} aria-label={label}>
      {children}
    </Link>
  );
}
