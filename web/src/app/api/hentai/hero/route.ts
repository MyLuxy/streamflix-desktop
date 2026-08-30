import { NextResponse } from "next/server";

// no source for these posters anymore, just returns empty and the hero handles it
export const revalidate = 86400; // 24h

export async function GET() {
  return NextResponse.json({ ok: true, posters: [] });
}
