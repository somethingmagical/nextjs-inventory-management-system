import "server-only";

import type { Prisma } from "@prisma/client";

export type UserHistoryAction = "created" | "updated" | "deleted";

export async function recordUserHistory(
  transaction: Prisma.TransactionClient,
  entry: {
    actorId: string;
    subjectUserId: string;
    action: UserHistoryAction;
    changedFields: readonly string[];
    roleFrom?: string | null;
    roleTo?: string | null;
  },
) {
  const settings = await transaction.applicationSetting.findUnique({
    where: { id: "application" },
    select: { userHistoryEnabled: true },
  });
  if (!(settings?.userHistoryEnabled ?? true)) return;

  await transaction.userHistoryEntry.create({
    data: {
      actorId: entry.actorId,
      subjectUserId: entry.subjectUserId,
      action: entry.action,
      changedFields: [...entry.changedFields],
      roleFrom: entry.roleFrom ?? null,
      roleTo: entry.roleTo ?? null,
    },
  });
}
