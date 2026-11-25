export type UserHistorySnapshot = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  image: string | null;
  roleId: string;
  role: string;
};

const trackedFields = [
  "firstName",
  "lastName",
  "email",
  "phoneNumber",
  "image",
] as const;

export function getChangedUserFields(
  before: UserHistorySnapshot,
  after: UserHistorySnapshot,
  credentialsChanged = false,
): string[] {
  const changed: string[] = trackedFields.filter((field) => before[field] !== after[field]);
  if (before.roleId !== after.roleId || before.role !== after.role) {
    changed.push("role");
  }
  if (credentialsChanged) changed.push("credentials");
  return changed;
}

export function getStoredChangedFields(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((field): field is string => typeof field === "string")
    : [];
}

export function getUserHistoryRetentionCutoff(now = new Date()): Date {
  const year = now.getUTCFullYear() - 1;
  const month = now.getUTCMonth();
  const lastDayOfCutoffMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(now.getUTCDate(), lastDayOfCutoffMonth);
  return new Date(Date.UTC(
    year,
    month,
    day,
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds(),
  ));
}
