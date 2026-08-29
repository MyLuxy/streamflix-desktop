import { NextResponse } from "next/server";

// this used to source hentai hero posters from a TMDB category hub - that whole hub system is
// retired (see streamflix.ts), and the StreamFlix provider catalog has no comparable adult-content
// category to source these from instead. Returns an empty grid rather than erroring; the hero
// component this feeds is expected to just render without the poster wall.
export const revalidate = 86400; // 24h

export async function GET() {
  return NextResponse.json({ ok: true, posters: [] });
}
