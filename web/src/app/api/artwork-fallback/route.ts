import { NextResponse } from "next/server";
import { searchTmdbArtwork, cleanTitle } from "@/lib/tmdb";
import { searchAniList } from "@/lib/anilist-artwork";

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
  const title = cleanTitle(rawTitle);

  try {
    let result = anime ? await searchAniList(title) : await searchTmdbArtwork(title, year, type);
    // anilist has had outages where its api 403s outright, tmdb as a second try beats a blank card
    if (anime && !result.poster && !result.backdrop) {
      result = await searchTmdbArtwork(title, year, type);
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ poster: null, backdrop: null });
  }
}
