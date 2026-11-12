import "server-only";

import {
  loginAttemptRetentionMs,
  loginRateLimitLockoutMs,
  loginRateLimitWindowMs,
  type LoginAttemptKey,
} from "./login-rate-limit-policy";

export async function isLoginAttemptBlocked(keys: LoginAttemptKey[], now = new Date()) {
  if (keys.length === 0) return false;
  const { db } = await import("@/lib/db");

  await db.loginAttemptBucket.deleteMany({
    where: { updatedAt: { lt: new Date(now.getTime() - loginAttemptRetentionMs) } },
  });

  const buckets = await db.loginAttemptBucket.findMany({
    where: { key: { in: keys.map(({ key }) => key) } },
    select: { lockedUntil: true },
  });

  return buckets.some(({ lockedUntil }) => lockedUntil !== null && lockedUntil > now);
}

export async function recordFailedLoginAttempt(
  keys: LoginAttemptKey[],
  now = new Date(),
) {
  if (keys.length === 0) return;
  const { db } = await import("@/lib/db");

  const windowStartedAt = new Date(now.getTime() - loginRateLimitWindowMs);
  const lockedUntil = new Date(now.getTime() + loginRateLimitLockoutMs);

  await db.$transaction(async (transaction) => {
    for (const { key, limit } of keys) {
      await transaction.$executeRaw`
        INSERT INTO \`LoginAttemptBucket\`
          (\`key\`, \`attempts\`, \`windowStartedAt\`, \`lockedUntil\`, \`updatedAt\`)
        VALUES (${key}, 1, ${now}, NULL, ${now})
        ON DUPLICATE KEY UPDATE
          \`lockedUntil\` = CASE
            WHEN \`windowStartedAt\` <= ${windowStartedAt} THEN NULL
            WHEN \`attempts\` + 1 >= ${limit} THEN ${lockedUntil}
            ELSE \`lockedUntil\`
          END,
          \`attempts\` = CASE
            WHEN \`windowStartedAt\` <= ${windowStartedAt} THEN 1
            ELSE \`attempts\` + 1
          END,
          \`windowStartedAt\` = CASE
            WHEN \`windowStartedAt\` <= ${windowStartedAt} THEN ${now}
            ELSE \`windowStartedAt\`
          END,
          \`updatedAt\` = ${now}
      `;
    }
  });
}

export async function clearSuccessfulLoginAttempt(keys: LoginAttemptKey[]) {
  const accountKeys = keys
    .filter(({ resetOnSuccess }) => resetOnSuccess)
    .map(({ key }) => key);
  if (accountKeys.length === 0) return;

  const { db } = await import("@/lib/db");
  await db.loginAttemptBucket.deleteMany({ where: { key: { in: accountKeys } } });
}
