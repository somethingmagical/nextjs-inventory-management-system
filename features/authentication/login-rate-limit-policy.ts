import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export const loginRateLimitWindowMs = 15 * 60 * 1000;
export const loginRateLimitLockoutMs = 15 * 60 * 1000;
export const loginAttemptRetentionMs = 30 * 24 * 60 * 60 * 1000;

export const loginAttemptLimits = {
  ip: 20,
  emailAndIp: 5,
  emailWithoutIp: 30,
} as const;

export type LoginAttemptKey = {
  key: string;
  limit: number;
  resetOnSuccess: boolean;
};

export function getTrustedClientIp(
  forwardedFor: string | null,
  trustProxy: boolean,
): string | null {
  if (!trustProxy || !forwardedFor) return null;

  const addresses = forwardedFor.split(",").map((address) => address.trim());
  for (const address of addresses.reverse()) {
    if (isIP(address)) return address;
  }
  return null;
}

export function createLoginAttemptKeys(
  email: string | null,
  clientIp: string | null,
  secret: string,
): LoginAttemptKey[] {
  const keys: LoginAttemptKey[] = [];
  if (clientIp) {
    keys.push({
      key: hashKey(secret, `ip:${clientIp}`),
      limit: loginAttemptLimits.ip,
      resetOnSuccess: false,
    });
  }

  if (email) {
    const normalizedEmail = email.trim().toLocaleLowerCase("en-US");
    keys.push({
      key: hashKey(
        secret,
        clientIp ? `email-ip:${normalizedEmail}:${clientIp}` : `email:${normalizedEmail}`,
      ),
      limit: clientIp ? loginAttemptLimits.emailAndIp : loginAttemptLimits.emailWithoutIp,
      resetOnSuccess: true,
    });
  }

  return keys;
}

function hashKey(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}
