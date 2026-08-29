import { NextResponse } from "next/server";

const TMDB_BEARER = process.env.TMDB_BEARER_TOKEN || "";
const TMDB_API_KEY =
  process.env.TMDB_API_KEY || "2dca580c2a14b55200e784d157207b4d";
const BASE_URL = "https://api.themoviedb.org/3";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const headers: Record<string, string> = { accept: "application/json" };
    let url = `${BASE_URL}/person/${id}?language=en-US&append_to_response=external_ids`;

    if (TMDB_BEARER) {
      headers.Authorization = `Bearer ${TMDB_BEARER}`;
    } else {
      url += `&api_key=${TMDB_API_KEY}`;
    }

    const res = await fetch(url, { headers, next: { revalidate: 86400 } });
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
