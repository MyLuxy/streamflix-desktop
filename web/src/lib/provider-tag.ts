// stashed on every item so links.ts can build a url with provider+realId, not just a numeric hash
export interface ProviderTag {
  __provider?: string;
  __realId?: string;
}

export function tagProvider<T extends object>(item: T, provider: string, realId: string): T {
  return Object.assign(item, { __provider: provider, __realId: realId } satisfies ProviderTag);
}

export function providerTagOf(item: unknown): { provider: string; realId: string } | null {
  const tag = item as ProviderTag;
  if (!tag.__provider || !tag.__realId) return null;
  return { provider: tag.__provider, realId: tag.__realId };
}
