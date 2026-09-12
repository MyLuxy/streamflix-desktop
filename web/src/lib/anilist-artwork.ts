import "server-only";

const ANILIST_URL = "https://graphql.anilist.co";

// anime lands on anilist before tmdb catalogs it, and anilist only searches type: ANIME so a live-action match never wins
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
