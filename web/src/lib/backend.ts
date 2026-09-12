// NEXT_PUBLIC_ vars get inlined at build time so they cant react to a fallback port at launch, BACKEND_URL_RUNTIME isnt prefixed so it stays live
export const BACKEND_URL =
  process.env.BACKEND_URL_RUNTIME ||
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ||
  "http://localhost:3001";
