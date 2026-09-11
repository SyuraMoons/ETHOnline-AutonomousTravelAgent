// Next.js middleware — protects /plan and all /(app)/** routes.
// Unauthenticated visitors are redirected to /login by Auth.js.
export { auth as middleware } from "~~/auth";

export const config = {
  matcher: [
    // Protect the main plan/app pages; skip _next static, images, favicon, API auth.
    "/plan/:path*",
    "/(app)/:path*",
  ],
};
