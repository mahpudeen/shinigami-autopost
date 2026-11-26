import { NextResponse, type NextRequest } from "next/server";
import { getLatestMangas } from "@/lib/shinigami-api";

export async function GET(request: NextRequest) {
  try {
    const limitParam = Number(request.nextUrl.searchParams.get("limit") || 20);
    const limit =
      Number.isFinite(limitParam) && limitParam >= 1
        ? Math.min(30, Math.floor(limitParam))
        : 20;

    const mangas = await getLatestMangas(limit, 0);
    return NextResponse.json({
      ok: true,
      total: mangas.length,
      mangas,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal mengambil daftar manga terbaru dari Shinigami.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
