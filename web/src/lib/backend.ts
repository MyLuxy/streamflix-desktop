// defaults to localhost:3001, set NEXT_PUBLIC_BACKEND_URL in prod.
// NEXT_PUBLIC_ vars get inlined as a literal string at build time, in the server bundle
// too, not just the browser one - so it cant react to the desktop app picking a fallback
// backend port at launch. BACKEND_URL_RUNTIME isnt prefixed, so next never inlines it and
// server-only code (streamflix.ts) reads it live from frontend-manager.js at each start
export const BACKEND_URL =
  process.env.BACKEND_URL_RUNTIME ||
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ||
  "http://localhost:3001";
