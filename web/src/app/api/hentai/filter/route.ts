import { NextResponse } from "next/server";
import { hentaimamaList, type HentaiItem, type HentaiQuery } from "@/lib/hentai";

// AND across categories, OR within one (multiple genres = must match all, multiple studios = any)
export const dynamic = "force-dynamic";

const MAX_PAGES = 4;

interface FilterBody {
  genres?: string[];
  studios?: string[];
  years?: string[];
  search?: string;
}

const arr = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]).filter(Boolean) : [];

async function facetItems(q: HentaiQuery): Promise<Map<string, HentaiItem>> {
  const map = new Map<string, HentaiItem>();
  for (let p = 1; p <= MAX_PAGES; p++) {
    const res = await hentaimamaList({ ...q, page: p });
    for (const it of res.items) if (!map.has(it.slug)) map.set(it.slug, it);
    if (!res.hasMore) break;
  }
  return map;
}

function unionMaps(maps: Map<string, HentaiItem>[]): Map<string, HentaiItem> {
  const u = new Map<string, HentaiItem>();
  for (const m of maps) for (const [k, v] of m) if (!u.has(k)) u.set(k, v);
  return u;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FilterBody;
    const genres = arr(body.genres);
    const studios = arr(body.studios);
    const years = arr(body.years);
    const search = (body.search || "").trim();

    // year filters on already-fetched items when other facets exist, skip /release/ then
    const hasAnd = genres.length > 0 || studios.length > 0 || search !== "";

    const [genreMaps, studioMaps, searchMap, yearBaseMaps] = await Promise.all([
      Promise.all(genres.map((g) => facetItems({ genre: g }))),
      Promise.all(studios.map((s) => facetItems({ studio: s }))),
      search ? facetItems({ search }) : Promise.resolve(null),
      hasAnd
        ? Promise.resolve([] as Map<string, HentaiItem>[])
        : Promise.all(years.map((y) => facetItems({ year: y }))),
    ]);

    const andFacets: Map<string, HentaiItem>[] = [...genreMaps];
    if (studioMaps.length) andFacets.push(unionMaps(studioMaps));
    if (searchMap) andFacets.push(searchMap);

    let items: HentaiItem[];

    if (andFacets.length) {
      andFacets.sort((a, b) => a.size - b.size);
      const [base, ...rest] = andFacets;
      items = [];
      for (const [slug, it] of base) {
        if (rest.every((m) => m.has(slug))) items.push(it);
      }
      if (years.length) items = items.filter((it) => years.includes(String(it.year)));
    } else if (years.length) {
      items = [...unionMaps(yearBaseMaps).values()];
    } else {
      return NextResponse.json({ items: [] });
    }

    items.sort((a, b) => (b.year || 0) - (a.year || 0) || a.name.localeCompare(b.name));

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] }, { status: 502 });
  }
}
