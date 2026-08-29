// which StreamFlix provider (StreamingCommunity, AnimeWorld, ...) the user has chosen to browse.
// Stored in a plain (non-httpOnly) cookie so both server components (via next/headers) and
// client components/hooks (via document.cookie) can read the same value without a round trip.
export const PROVIDER_COOKIE = "streamflix_provider";
export const DEFAULT_PROVIDER = "StreamingCommunity";

// server components / route handlers only - dynamic import keeps next/headers out of the client bundle
export async function getSelectedProvider(): Promise<string> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return store.get(PROVIDER_COOKIE)?.value || DEFAULT_PROVIDER;
}

export function getSelectedProviderClient(): string {
  if (typeof document === "undefined") return DEFAULT_PROVIDER;
  const match = document.cookie.match(new RegExp(`(?:^|; )${PROVIDER_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : DEFAULT_PROVIDER;
}

// nome del CustomEvent sparato quando il provider cambia lato client - i componenti persistenti
// tra le navigazioni (es. Navigation, che legge il cookie una sola volta al mount) lo ascoltano
// per aggiornarsi subito, invece di restare bloccati sul valore letto all'avvio
export const PROVIDER_CHANGED_EVENT = "streamflix-provider-changed";

export function setSelectedProviderClient(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${PROVIDER_COOKIE}=${encodeURIComponent(name)}; path=/; max-age=${60 * 60 * 24 * 365}`;
  window.dispatchEvent(new CustomEvent(PROVIDER_CHANGED_EVENT, { detail: name }));
}
