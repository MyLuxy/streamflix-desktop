// defaults to localhost:3001, set NEXT_PUBLIC_BACKEND_URL in prod
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") || "http://localhost:3001";
