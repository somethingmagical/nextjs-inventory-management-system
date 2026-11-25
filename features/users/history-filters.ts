import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUserHistoryRetentionCutoff } from "./history-fields";
import type { UserHistoryFilters } from "./history-filter-values";

export async function buildUserHistoryWhere(
  filters: UserHistoryFilters,
): Promise<Prisma.UserHistoryEntryWhereInput> {
  const cutoff = getUserHistoryRetentionCutoff();
  const createdAt: Prisma.DateTimeFilter<"UserHistoryEntry"> = { gte: cutoff };
  if (filters.from) {
    const from = new Date(`${filters.from}T00:00:00.000Z`);
    createdAt.gte = from > cutoff ? from : cutoff;
  }
  if (filters.to) {
    const endExclusive = new Date(`${filters.to}T00:00:00.000Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    createdAt.lt = endExclusive;
  }

  const where: Prisma.UserHistoryEntryWhereInput = { createdAt };
  if (filters.action !== "all") where.action = filters.action;

  if (filters.q) {
    const matchingUsers = await db.user.findMany({
      where: {
        OR: [
          { firstName: { contains: filters.q } },
          { lastName: { contains: filters.q } },
          { email: { contains: filters.q } },
        ],
      },
      select: { id: true },
    });
    const userIds = matchingUsers.map(({ id }) => id);
    where.OR = [
      { action: { contains: filters.q } },
      { roleFrom: { contains: filters.q } },
      { roleTo: { contains: filters.q } },
      ...(userIds.length > 0
        ? [{ actorId: { in: userIds } }, { subjectUserId: { in: userIds } }]
        : []),
    ];
  }

  return where;
}
