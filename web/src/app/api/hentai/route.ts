import { NextResponse } from "next/server";
import { hentaimamaList, type HentaiQuery } from "@/lib/hentai";

// Catalogo della sezione hentai dal sito host (scraping, same-origin).
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HentaiQuery;
    const result = await hentaimamaList({
      search: body.search,
      genre: body.genre,
      studio: body.studio,
      year: body.year,
      page: body.page,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { items: [], page: 1, hasMore: false },
      { status: 502 }
    );
  }
}
