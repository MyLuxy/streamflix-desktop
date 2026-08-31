import { NextResponse } from "next/server";

const TMDB_BEARER = process.env.TMDB_BEARER_TOKEN || "";
const TMDB_API_KEY =
  process.env.TMDB_API_KEY || "2dca580c2a14b55200e784d157207b4d";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const ANILIST_URL = "https://graphql.anilist.co";

async function searchTmdb(title: string, year: string | null, type: "movie" | "tv") {
  const headers: Record<string, string> = { accept: "application/json" };
  let url = `${TMDB_BASE_URL}/search/${type}?query=${encodeURIComponent(title)}&language=en-US`;
  if (year) {
    url += `&${type === "movie" ? "year" : "first_air_date_year"}=${encodeURIComponent(year)}`;
  }
  if (TMDB_BEARER) {
    headers.Authorization = `Bearer ${TMDB_BEARER}`;
  } else {
    url += `&api_key=${TMDB_API_KEY}`;
  }

  const res = await fetch(url, { headers, next: { revalidate: 86400 } });
  if (!res.ok) return { poster: null, backdrop: null };
  const data = await res.json();
  const match = data.results?.[0];
  return { poster: match?.poster_path ?? null, backdrop: match?.backdrop_path ?? null };
}

// anime tends to land on anilist before tmdb even catalogs it, no key needed either
async function searchAniList(title: string) {
  const query = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        coverImage { extraLarge large }
        bannerImage
      }
    }
  `;
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query, variables: { search: title } }),
    next: { revalidate: 86400 },
  });
  if (!res.ok) return { poster: null, backdrop: null };
  const data = await res.json();
  const media = data.data?.Media;
  // already full urls, unlike tmdb's relative paths
  return {
    poster: media?.coverImage?.extraLarge ?? media?.coverImage?.large ?? null,
    backdrop: media?.bannerImage ?? null,
  };
}

// last resort when a provider's own poster/backdrop 404s, tries to find the same
// title elsewhere instead of leaving the card blank
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawTitle = searchParams.get("title");
  const year = searchParams.get("year");
  const type = searchParams.get("type") === "movie" ? "movie" : "tv";
  const anime = searchParams.get("anime") === "1";

  if (!rawTitle) {
    return NextResponse.json({ poster: null, backdrop: null });
  }
  // a trailing (2026) throws off the match more often than it helps, year is passed separately
  const title = rawTitle.replace(/\s*\(\d{4}\)\s*$/, "").trim();

  try {
    const result = anime ? await searchAniList(title) : await searchTmdb(title, year, type);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ poster: null, backdrop: null });
  }
}
