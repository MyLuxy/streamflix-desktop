import "server-only";

const ANILIST_URL = "https://graphql.anilist.co";

// anime tends to land on anilist before tmdb even catalogs it, no key needed either. also
// keeps a live-action adaptation (e.g. tmdb's "One Piece" live action) from ever winning a
// search meant for the anime, since anilist only ever searches type: ANIME
export async function searchAniList(title: string) {
  const query = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        coverImage { extraLarge large }
        bannerImage
      }
    }
  `;
  try {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query, variables: { search: title } }),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return { poster: null as string | null, backdrop: null as string | null };
    const data = await res.json();
    const media = data.data?.Media;
    // already full urls, unlike tmdb's relative paths
    return {
      poster: media?.coverImage?.extraLarge ?? media?.coverImage?.large ?? null,
      backdrop: media?.bannerImage ?? null,
    };
  } catch {
    return { poster: null as string | null, backdrop: null as string | null };
  }
}
