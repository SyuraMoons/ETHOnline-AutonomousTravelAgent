// Auth.js v5 — Google + GitHub OAuth, JWT sessions (no DB adapter)
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google, GitHub],

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
