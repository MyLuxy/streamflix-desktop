import { NextResponse } from "next/server";
import { anilistMeta } from "@/lib/anilist";

// Dato un elenco di titoli, ritorna cover art ufficiale + studio da AniList.
// { names: string[] } → { meta: { [name]: { cover, studio } } }
export async function POST(request: Request) {
  try {
    const { names } = (await request.json()) as { names?: string[] };
    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ meta: {} });
    }
    const map = await anilistMeta(names.slice(0, 120));
    return NextResponse.json({ meta: Object.fromEntries(map) });
  } catch {
    return NextResponse.json({ meta: {} });
  }
}
