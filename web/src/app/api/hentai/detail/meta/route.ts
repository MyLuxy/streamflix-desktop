import { NextResponse } from "next/server";
import { anilistDetail } from "@/lib/anilist";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  if (!name) {
    return NextResponse.json({ ok: false, error: "missing name" }, { status: 400 });
  }

  try {
    const detail = await anilistDetail(name);
    if (!detail) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, detail });
  } catch (err) {
    console.error("GET /api/hentai/detail/meta error:", err);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
