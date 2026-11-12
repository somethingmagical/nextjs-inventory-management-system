import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import {
  clearSuccessfulLoginAttempt,
  isLoginAttemptBlocked,
  recordFailedLoginAttempt,
} from "@/features/authentication/login-rate-limit";
import {
  createLoginAttemptKeys,
  getTrustedClientIp,
} from "@/features/authentication/login-rate-limit-policy";

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
const timingEqualizationPasswordHash =
  "$2b$10$YIyJyBvmARfhBmIuFQZ10e.GDWSbagbyzgNXPeFA5yq/SSQTkuOLW";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
        if (!authSecret) {
          throw new Error("AUTH_SECRET must be configured to protect login rate-limit keys.");
        }

        const emailCandidate =
          typeof credentials.email === "string" && credentials.email.length <= 254
            ? credentials.email.trim()
            : null;
        const clientIp = getTrustedClientIp(
          request.headers.get("x-forwarded-for"),
          process.env.AUTH_TRUST_PROXY_IP === "true",
        );
        const attemptKeys = createLoginAttemptKeys(emailCandidate, clientIp, authSecret);
        if (await isLoginAttemptBlocked(attemptKeys)) return null;

        const parsedCredentials = credentialsSchema.safeParse(credentials);
        if (!parsedCredentials.success) {
          await recordFailedLoginAttempt(attemptKeys);
          return null;
        }

        const { db } = await import("@/lib/db");
        const user = await db.user.findFirst({
          where: {
            email: parsedCredentials.data.email,
            deletedAt: null,
            roleRecord: { deletedAt: null },
          },
        });

        const passwordMatches = await compare(
          parsedCredentials.data.password,
          user?.password ?? timingEqualizationPasswordHash,
        );
        if (!user || !passwordMatches) {
          await recordFailedLoginAttempt(attemptKeys);
          return null;
        }

        try {
          await clearSuccessfulLoginAttempt(attemptKeys);
        } catch (error) {
          console.error("Could not clear account-specific login attempt counters.", error);
        }

        return {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role;
        return token;
      }

      if (!token.sub) return null;

      const { db } = await import("@/lib/db");
      const activeUser = await db.user.findFirst({
        where: {
          id: token.sub,
          deletedAt: null,
          roleRecord: { deletedAt: null },
        },
        select: { id: true },
      });

      if (!activeUser) return null;
      return token;
    },
    session({ session, token }) {
      if (!token.sub || typeof token.role !== "string") {
        throw new Error("Authentication token is missing the user ID or role.");
      }

      session.user.id = token.sub;
      session.user.role = token.role;
      return session;
    },
  },
});
