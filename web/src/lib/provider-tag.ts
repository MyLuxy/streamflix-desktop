// Every Movie/TVShow/MediaItem object built from the StreamFlix backend (see streamflix.ts)
// carries two extra, TMDB-shape-invisible properties: which provider it came from, and its real
// (opaque, provider-scoped) string id. `links.ts` reads these to build a URL that carries
// provider+id directly instead of relying on an unrecoverable numeric hash - see slug.ts for why.
// A plain property assignment survives the `as MediaItem` cast fine since TS structural typing
// doesn't strip extra fields off the underlying object, just off the *type* used to view it.
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
