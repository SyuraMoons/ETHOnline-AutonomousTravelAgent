import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session extends DefaultSession {
    /** OAuth provider id used to sign in (e.g. "google", "github"). */
    provider?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** OAuth provider id used to sign in (e.g. "google", "github"). */
    provider?: string;
  }
}
