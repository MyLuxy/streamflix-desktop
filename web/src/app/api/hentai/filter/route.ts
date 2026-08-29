import { NextResponse } from "next/server";
import { hentaimamaList, type HentaiItem, type HentaiQuery } from "@/lib/hentai";

// ─────────────────────────────────────────────────────────────
// Filtro combinato su più tassonomie.
//   • AND tra categorie diverse (un genere E uno studio E …)
//   • AND tra più generi (il titolo deve averli tutti)
//   • OR dentro studio e anno (un titolo ha un solo studio/anno, quindi
//     selezionarne più d'uno allarga: studio X O Y, anno 2023 O 2024)
// Gli archivi del sito host gestiscono una sola faccetta per volta
// (/genre/{slug}/, /studio/{slug}/, /release/{anno}/, /?s=…): qui le
// scarichiamo e le combiniamo per slug.
// ─────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

// Pagine massime scaricate per faccetta (ogni pagina ≈ 24 item).
const MAX_PAGES = 4;

interface FilterBody {
  genres?: string[];
  studios?: string[];
  years?: string[];
  search?: string;
}

const arr = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]).filter(Boolean) : [];

// Scarica tutte le pagine (fino a MAX_PAGES) di una faccetta → mappa slug→item.
async function facetItems(q: HentaiQuery): Promise<Map<string, HentaiItem>> {
  const map = new Map<string, HentaiItem>();
  for (let p = 1; p <= MAX_PAGES; p++) {
    const res = await hentaimamaList({ ...q, page: p });
    for (const it of res.items) if (!map.has(it.slug)) map.set(it.slug, it);
    if (!res.hasMore) break;
  }
  return map;
}

// Unione (OR) di più mappe slug→item.
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

    // Se ci sono faccette "AND" (generi/studio/ricerca), l'anno filtra sui
    // metadati e non serve scaricare l'archivio /release/.
    const hasAnd = genres.length > 0 || studios.length > 0 || search !== "";

    const [genreMaps, studioMaps, searchMap, yearBaseMaps] = await Promise.all([
      Promise.all(genres.map((g) => facetItems({ genre: g }))),
      Promise.all(studios.map((s) => facetItems({ studio: s }))),
      search ? facetItems({ search }) : Promise.resolve(null),
      hasAnd
        ? Promise.resolve([] as Map<string, HentaiItem>[])
        : Promise.all(years.map((y) => facetItems({ year: y }))),
    ]);

    // Faccette da intersecare (AND): ogni genere, l'unione studi, la ricerca.
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
