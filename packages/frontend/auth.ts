// Auth.js v5 — Google + GitHub OAuth, JWT sessions (no DB adapter)
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Providers must be called as functions
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  ],

  // Explicitly pass secret as a fallback to ensure assertConfig passes
  secret: process.env.AUTH_SECRET,

  // JWT sessions — no database required. Sessions are signed cookies.
  session: { strategy: "jwt" },

  // Redirect to /login when a protected route is accessed without a session.
  pages: { signIn: "/login" },

  callbacks: {
    // Allow access to /plan and /(app)/** only when a session exists.
    authorized({ auth: session }) {
      return !!session?.user;
    },
  },
});