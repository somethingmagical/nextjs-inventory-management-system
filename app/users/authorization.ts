import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function getUserManagementAccess() {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "unauthenticated" as const };
  }

  const user = await db.user.findFirst({
    where: { id: session.user.id, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      image: true,
      role: true,
    },
  });

  if (!user) {
    return { status: "unauthenticated" as const };
  }

  // Until role permissions are modeled in the database, admin is the Manage Users permission.
  if (user.role !== "admin") {
    return { status: "forbidden" as const };
  }

  return { status: "allowed" as const, user };
}
