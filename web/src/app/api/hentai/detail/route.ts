import { NextResponse } from "next/server";
import { getHentaiDetail } from "@/lib/hentai";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ ok: false, error: "missing slug" }, { status: 400 });
  }

  try {
    const detail = await getHentaiDetail(slug);
    if (!detail) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, detail });
  } catch (err) {
    console.error("GET /api/hentai/detail error:", err);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
