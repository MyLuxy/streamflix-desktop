import { NextResponse } from "next/server";

const TMDB_BEARER = process.env.TMDB_BEARER_TOKEN || "";
const TMDB_API_KEY =
  process.env.TMDB_API_KEY || "2dca580c2a14b55200e784d157207b4d";
const BASE_URL = "https://api.themoviedb.org/3";

// last resort when a provider's own poster/backdrop 404s, tries to find the same
// title on tmdb instead of leaving the card blank
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawTitle = searchParams.get("title");
  const year = searchParams.get("year");
  const type = searchParams.get("type") === "movie" ? "movie" : "tv";

  if (!rawTitle) {
    return NextResponse.json({ poster: null, backdrop: null });
  }
  // a trailing (2026) throws off the match more often than it helps, year is passed separately
  const title = rawTitle.replace(/\s*\(\d{4}\)\s*$/, "").trim();

  try {
    const headers: Record<string, string> = { accept: "application/json" };
    let url = `${BASE_URL}/search/${type}?query=${encodeURIComponent(title)}&language=en-US`;
    if (year) {
      url += `&${type === "movie" ? "year" : "first_air_date_year"}=${encodeURIComponent(year)}`;
    }
    if (TMDB_BEARER) {
      headers.Authorization = `Bearer ${TMDB_BEARER}`;
    } else {
      url += `&api_key=${TMDB_API_KEY}`;
    }

    const res = await fetch(url, { headers, next: { revalidate: 86400 } });
    if (!res.ok) {
      return NextResponse.json({ poster: null, backdrop: null });
    }
    const data = await res.json();
    const match = data.results?.[0];
    return NextResponse.json({
      poster: match?.poster_path ?? null,
      backdrop: match?.backdrop_path ?? null,
    });
  } catch {
    return NextResponse.json({ poster: null, backdrop: null });
  }
}
