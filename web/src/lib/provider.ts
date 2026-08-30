// non-httpOnly cookie so both server components and client hooks can read the same value
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

export const PROVIDER_CHANGED_EVENT = "streamflix-provider-changed";

export function setSelectedProviderClient(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${PROVIDER_COOKIE}=${encodeURIComponent(name)}; path=/; max-age=${60 * 60 * 24 * 365}`;
  window.dispatchEvent(new CustomEvent(PROVIDER_CHANGED_EVENT, { detail: name }));
}

const PROVIDER_LANG_FILTER_COOKIE = "streamflix_provider_lang_filter";

export function getSavedProviderLangFilter(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${PROVIDER_LANG_FILTER_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setSavedProviderLangFilter(code: string | null) {
  if (typeof document === "undefined") return;
  if (code) {
    document.cookie = `${PROVIDER_LANG_FILTER_COOKIE}=${encodeURIComponent(code)}; path=/; max-age=${60 * 60 * 24 * 365}`;
  } else {
    document.cookie = `${PROVIDER_LANG_FILTER_COOKIE}=; path=/; max-age=0`;
  }
}
