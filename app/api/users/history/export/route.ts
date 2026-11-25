import { requireAdminRole } from "@/lib/authorization";
import { db } from "@/lib/db";
import { readApplicationSettings } from "@/features/settings/application";
import {
  buildUserHistoryWhere,
} from "@/features/users/history-filters";
import {
  parseUserHistoryFilters,
  userHistoryExportLimit,
} from "@/features/users/history-filter-values";
import { getStoredChangedFields } from "@/features/users/history-fields";

export async function GET(request: Request) {
  const access = await requireAdminRole();
  if (access.status === "unauthenticated") {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }
  if (access.status === "forbidden") {
    return Response.json({ error: "Administrator access is required." }, { status: 403 });
  }

  const settings = await readApplicationSettings();
  if (!settings.userHistoryEnabled) {
    return Response.json({ error: "User history is currently disabled." }, { status: 404 });
  }

  const searchParams = new URL(request.url).searchParams;
  for (const key of ["q", "action", "from", "to"]) {
    if (searchParams.getAll(key).length > 1) {
      return Response.json({ error: `Provide only one ${key} value.` }, { status: 400 });
    }
  }
  const parsedFilters = parseUserHistoryFilters({
    q: searchParams.get("q") ?? undefined,
    action: searchParams.get("action") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });
  if (!parsedFilters.success) {
    return Response.json({ error: "Invalid user history filters." }, { status: 400 });
  }

  const where = await buildUserHistoryWhere(parsedFilters.data);
  const totalCount = await db.userHistoryEntry.count({ where });
  if (totalCount > userHistoryExportLimit) {
    return Response.json(
      { error: `This export contains ${totalCount} records. Narrow your filters to ${userHistoryExportLimit.toLocaleString()} records or fewer.` },
      { status: 413 },
    );
  }

  const entries = await db.userHistoryEntry.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: userHistoryExportLimit,
    select: {
      actorId: true,
      subjectUserId: true,
      action: true,
      changedFields: true,
      roleFrom: true,
      roleTo: true,
      createdAt: true,
    },
  });
  const userIds = [...new Set(entries.flatMap(({ actorId, subjectUserId }) => [
    actorId,
    subjectUserId,
  ]).filter((id): id is string => id !== null))];
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const usersById = new Map(users.map((user) => [user.id, user]));

  const rows = [
    ["Date and time", "Action", "User", "Changed fields", "Role change", "Performed by"],
    ...entries.map((entry) => {
      const subject = usersById.get(entry.subjectUserId);
      const actor = entry.actorId ? usersById.get(entry.actorId) : null;
      const fields = getStoredChangedFields(entry.changedFields);
      const subjectName = subject
        ? `${subject.firstName} ${subject.lastName}`.trim() || "User"
        : "Removed account";
      const actorName = actor
        ? `${actor.firstName} ${actor.lastName}`.trim() || "User"
        : entry.actorId
          ? "Removed account"
          : "System";

      return [
        entry.createdAt.toISOString(),
        formatAction(entry.action),
        subjectName,
        fields.map(formatField).join(", "),
        entry.roleFrom || entry.roleTo
          ? `${entry.roleFrom ?? "None"} -> ${entry.roleTo ?? "None"}`
          : "",
        actorName,
      ];
    }),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="user-history-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function escapeCsvCell(value: string) {
  const safeValue = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

function formatAction(action: string) {
  if (action === "created") return "Created";
  if (action === "updated") return "Updated";
  if (action === "deleted") return "Deactivated";
  return "Changed";
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
