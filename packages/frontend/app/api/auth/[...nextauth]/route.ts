// Auth.js v5 — catch-all route handler
// Handles: GET/POST /api/auth/callback/google, /api/auth/callback/github,
//          /api/auth/session, /api/auth/csrf, /api/auth/signin, /api/auth/signout
import { handlers } from "~~/auth";

export const { GET, POST } = handlers;
