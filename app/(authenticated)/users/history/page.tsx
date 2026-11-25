import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Search,
  ShieldCheck,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getApplicationSettings } from "@/features/settings/application";
import { buildUserHistoryWhere } from "@/features/users/history-filters";
import {
  hasUserHistoryFilters,
  parseUserHistoryFilters,
  toUserHistorySearchParams,
  userHistoryExportLimit,
} from "@/features/users/history-filter-values";
import { getUserHistoryRetentionCutoff } from "@/features/users/history-fields";
import { requireAdminRole } from "@/lib/authorization";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "User History",
  description: "Review user account changes",
};

const pageSize = 25;

type UserHistoryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function UserHistoryPage({ searchParams }: UserHistoryPageProps) {
  return (
    <Suspense fallback={<main className="gg-content" aria-busy="true"><p className="gg-muted">Loading user history...</p></main>}>
      <AuthorizedUserHistory searchParams={searchParams} />
    </Suspense>
  );
}

async function AuthorizedUserHistory({ searchParams }: UserHistoryPageProps) {
  await connection();
  const access = await requireAdminRole();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const settings = await getApplicationSettings();
  if (!settings.userHistoryEnabled) redirect("/users");

  const params = await searchParams;
  const parsedFilters = parseUserHistoryFilters(params);
  if (!parsedFilters.success) redirect("/users/history");
  const filters = parsedFilters.data;
  const requestedPage = typeof params.page === "string" && /^\d+$/.test(params.page)
    ? Math.max(1, Number(params.page))
    : 1;
  const cutoff = getUserHistoryRetentionCutoff();
  const where = await buildUserHistoryWhere(filters);

  await db.userHistoryEntry.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  const totalCount = await db.userHistoryEntry.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const entries = await db.userHistoryEntry.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      actorId: true,
      subjectUserId: true,
      action: true,
      changedFields: true,
      roleFrom: true,
      roleTo: true,
      createdAt: true,
    },
  });

  const userIds = [...new Set(entries.flatMap((entry) => [
    entry.actorId,
    entry.subjectUserId,
  ]).filter((id): id is string => id !== null))];
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const usersById = new Map(users.map((user) => [user.id, user]));

  const name = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);
  const hasFilters = hasUserHistoryFilters(filters);
  const downloadParams = toUserHistorySearchParams(filters);
  const previousParams = toUserHistorySearchParams(filters, Math.max(1, currentPage - 1));
  const nextParams = toUserHistorySearchParams(filters, Math.min(totalPages, currentPage + 1));
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <DashboardLayout user={{ name, image: access.user.image }} pageTitle="Users">
      <main className="gg-content">
        <div className="user-history-page-head">
          <div className="user-history-title-group">
            <span className="user-history-eyebrow">Audit log</span>
            <h1 className="gg-page-title">User History</h1>
            <p className="user-history-subtitle">
              Review account changes and see who made them.
            </p>
          </div>
          <Link className="gg-btn gg-btn--secondary" href="/users">
            <ArrowLeft aria-hidden="true" />
            Back to Users
          </Link>
        </div>

        <div className="user-history-policy" role="note">
          <span className="user-history-policy-icon"><ShieldCheck aria-hidden="true" /></span>
          <p>
            <strong>Privacy-first audit log</strong>
            <span>Only changed field names are recorded, not personal values. Entries are kept for 12 months.</span>
          </p>
        </div>

        <section className="gg-card user-history-card" aria-labelledby="user-history-activity-title">
          <div className="user-history-card-head">
            <div>
              <h2 className="gg-card-title" id="user-history-activity-title">Activity</h2>
              <p className="gg-caption">User account events from the last 12 months</p>
            </div>
            {totalCount > 0 && (
              <span className="user-history-count">
                {totalCount} {totalCount === 1 ? "event" : "events"}
              </span>
            )}
          </div>

          <div className="user-history-tools">
            <form className="user-history-filter-form" action="/users/history" method="get">
              <label className="user-history-search gg-input-icon" htmlFor="history-search">
                <Search aria-hidden="true" />
                <input
                  className="gg-input"
                  id="history-search"
                  name="q"
                  type="search"
                  maxLength={120}
                  placeholder="Search users, roles, actions..."
                  defaultValue={filters.q}
                />
              </label>
              <label className="user-history-filter">
                <span>Action</span>
                <select className="gg-select" name="action" defaultValue={filters.action}>
                  <option value="all">All actions</option>
                  <option value="created">Created</option>
                  <option value="updated">Updated</option>
                  <option value="deleted">Deactivated</option>
                </select>
              </label>
              <label className="user-history-filter">
                <span>From</span>
                <input className="gg-input" type="date" name="from" defaultValue={filters.from} />
              </label>
              <label className="user-history-filter">
                <span>To</span>
                <input className="gg-input" type="date" name="to" defaultValue={filters.to} />
              </label>
              <button className="gg-btn gg-btn--primary user-history-apply" type="submit">
                <Search aria-hidden="true" />
                Apply
              </button>
              {hasFilters && (
                <Link className="user-history-clear" href="/users/history">Clear</Link>
              )}
            </form>
            <a
              className="gg-btn gg-btn--secondary user-history-download"
              href={`/api/users/history/export${downloadParams.size ? `?${downloadParams.toString()}` : ""}`}
              download
            >
              <Download aria-hidden="true" />
              Download CSV
            </a>
          </div>
          {totalCount > userHistoryExportLimit && (
            <p className="user-history-export-note" role="status">
              CSV exports are limited to {userHistoryExportLimit.toLocaleString()} records. Add filters to narrow this result.
            </p>
          )}

          {entries.length === 0 ? (
            <div className="user-history-empty">
              <span className="user-history-empty-icon"><ClipboardList aria-hidden="true" /></span>
              <h3>{hasFilters ? "No matching activity" : "No activity yet"}</h3>
              <p>{hasFilters
                ? "No user history matches these search and filter criteria. Try broadening your filters."
                : "New user account changes will appear here. History starts when the module is enabled; existing accounts are not backfilled."}
              </p>
              {hasFilters
                ? <Link className="gg-btn gg-btn--secondary" href="/users/history">Clear filters</Link>
                : <Link className="gg-btn gg-btn--secondary" href="/users">Manage users</Link>}
            </div>
          ) : (
            <>
              <div className="user-history-table-wrap">
                <table className="gg-table user-history-table">
                  <thead>
                    <tr>
                      <th scope="col">Date &amp; time</th>
                      <th scope="col">Action</th>
                      <th scope="col">User</th>
                      <th scope="col">Changed fields</th>
                      <th scope="col">Role change</th>
                      <th scope="col">Performed by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => {
                      const subject = usersById.get(entry.subjectUserId);
                      const actor = entry.actorId ? usersById.get(entry.actorId) : null;
                      const fields = getChangedFields(entry.changedFields);
                      const subjectName = subject
                        ? `${subject.firstName} ${subject.lastName}`.trim() || subject.email
                        : "Removed account";
                      const actorName = actor
                        ? `${actor.firstName} ${actor.lastName}`.trim() || actor.email
                        : entry.actorId
                          ? "Removed account"
                          : "System";

                      return (
                        <tr key={entry.id}>
                          <td>
                            <time className="user-history-date" dateTime={entry.createdAt.toISOString()}>
                              {dateFormatter.format(entry.createdAt)}
                            </time>
                          </td>
                          <td><ActionBadge action={entry.action} /></td>
                          <td className="user-history-person">{subjectName}</td>
                          <td><ChangedFields fields={fields} /></td>
                          <td>
                            {entry.roleFrom || entry.roleTo
                              ? <span className="user-history-role-change">{entry.roleFrom ?? "None"} <span aria-hidden="true">→</span> {entry.roleTo ?? "None"}</span>
                              : <span className="user-history-secondary">—</span>}
                          </td>
                          <td className="user-history-person">{actorName}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ol className="user-history-mobile-list" aria-label="Recent user account activity">
                {entries.map((entry) => {
                  const subject = usersById.get(entry.subjectUserId);
                  const actor = entry.actorId ? usersById.get(entry.actorId) : null;
                  const fields = getChangedFields(entry.changedFields);
                  const subjectName = subject
                    ? `${subject.firstName} ${subject.lastName}`.trim() || subject.email
                    : "Removed account";
                  const actorName = actor
                    ? `${actor.firstName} ${actor.lastName}`.trim() || actor.email
                    : entry.actorId
                      ? "Removed account"
                      : "System";

                  return (
                    <li className="user-history-mobile-item" key={entry.id}>
                      <div className="user-history-mobile-top">
                        <ActionBadge action={entry.action} />
                        <time className="user-history-secondary" dateTime={entry.createdAt.toISOString()}>
                          {dateFormatter.format(entry.createdAt)}
                        </time>
                      </div>
                      <p className="user-history-mobile-subject">{subjectName}</p>
                      <div className="user-history-mobile-detail">
                        <span className="user-history-detail-label">Changed</span>
                        <ChangedFields fields={fields} />
                      </div>
                      {(entry.roleFrom || entry.roleTo) && (
                        <div className="user-history-mobile-detail">
                          <span className="user-history-detail-label">Role</span>
                          <span className="user-history-role-change">{entry.roleFrom ?? "None"} → {entry.roleTo ?? "None"}</span>
                        </div>
                      )}
                      <div className="user-history-mobile-actor">
                        <span className="user-history-detail-label">Performed by</span>
                        <span>{actorName}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div className="user-history-pagination">
                <span className="gg-caption">Showing {firstRecord}–{lastRecord} of {totalCount}</span>
                {totalPages > 1 && (
                  <nav className="user-history-pagination-actions" aria-label="User history pages">
                    <Link
                      className="gg-btn gg-btn--secondary"
                      href={`/users/history${previousParams.size ? `?${previousParams.toString()}` : ""}`}
                      aria-disabled={currentPage <= 1}
                      tabIndex={currentPage <= 1 ? -1 : undefined}
                    >
                      <ChevronLeft aria-hidden="true" />
                      Previous
                    </Link>
                    <span className="user-history-page-number">Page {currentPage} of {totalPages}</span>
                    <Link
                      className="gg-btn gg-btn--secondary"
                      href={`/users/history${nextParams.size ? `?${nextParams.toString()}` : ""}`}
                      aria-disabled={currentPage >= totalPages}
                      tabIndex={currentPage >= totalPages ? -1 : undefined}
                    >
                      Next
                      <ChevronRight aria-hidden="true" />
                    </Link>
                  </nav>
                )}
              </div>
            </>
          )}
        </section>
      </main>
    </DashboardLayout>
  );
}

function getChangedFields(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((field): field is string => typeof field === "string")
    : [];
}

function ActionBadge({ action }: { action: string }) {
  const actionDetails: Record<string, { label: string; tone: string }> = {
    created: { label: "Created", tone: "success" },
    updated: { label: "Updated", tone: "info" },
    deleted: { label: "Deactivated", tone: "warning" },
  };
  const details = actionDetails[action] ?? { label: "Changed", tone: "neutral" };
  return <span className={`gg-badge gg-badge--${details.tone}`}>{details.label}</span>;
}

function ChangedFields({ fields }: { fields: string[] }) {
  if (fields.length === 0) return <span className="user-history-secondary">—</span>;
  return (
    <span className="user-history-field-list">
      {fields.map((field) => (
        <span className="user-history-field-chip" key={field}>{formatField(field)}</span>
      ))}
    </span>
  );
}

function formatField(field: string) {
  const labels: Record<string, string> = {
    firstName: "First name",
    lastName: "Last name",
    email: "Email",
    phoneNumber: "Phone",
    image: "Profile image",
    role: "Role",
    credentials: "Credentials",
    deletedAt: "Account status",
  };
  return labels[field] ?? "Other";
}
