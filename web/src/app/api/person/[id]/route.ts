import { NextResponse } from "next/server";
import { tmdbFetch } from "@/lib/tmdb";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const res = await tmdbFetch(`/person/${id}?language=en-US&append_to_response=external_ids`);
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: "TMDB error" },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch person" },
      { status: 500 }
    );
  }
}
