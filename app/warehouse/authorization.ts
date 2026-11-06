import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function getWarehouseAccess() {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "unauthenticated" as const };
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
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

  // This app has no granular permission store yet; its existing admin role grants Manage Warehouses.
  if (user.role !== "admin") {
    return { status: "forbidden" as const };
  }

  return { status: "allowed" as const, userId: session.user.id, user };
}
