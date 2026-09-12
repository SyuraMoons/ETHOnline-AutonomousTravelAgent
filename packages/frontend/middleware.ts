// Next.js middleware — protects the app-group pages (plan/chat/activity/audit/itinerary).
// Unauthenticated visitors are redirected to /login by Auth.js.
export { auth as middleware } from "~~/auth";

export const config = {
  matcher: [
    // These live under app/(app)/ — a route group, which is not part of the real URL, so each
    // page's actual path must be listed explicitly rather than matched as "/(app)/:path*".
    "/plan/:path*",
    "/chat/:path*",
    "/activity/:path*",
    "/audit/:path*",
    "/itinerary/:path*",
  ],
};
