// URL del backend Express (estrazione stream / player).
// In locale usa http://localhost:3001; in produzione imposta NEXT_PUBLIC_BACKEND_URL.
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") || "http://localhost:3001";
