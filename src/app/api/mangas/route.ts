import { NextResponse } from "next/server";
import { getDb, type MangaDoc } from "@/lib/firebase-admin";
import { crawlAndSyncTop300Mangas } from "@/lib/shinigami-api";

export async function GET() {
  try {
    const db = getDb();
    const snap = await db
      .collection("mangas")
      .orderBy("popularityRank", "asc")
      .get();

    const mangas: MangaDoc[] = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        mangaId: String(data.mangaId || doc.id),
        title: String(data.title || "Untitled"),
        coverImageUrl: String(data.coverImageUrl || ""),
        countryId: String(data.countryId || ""),
        viewCount: Number(data.viewCount ?? 0),
        userRate: Number(data.userRate ?? 0),
        latestChapterNumber: Number(data.latestChapterNumber ?? 0),
        genres: Array.isArray(data.genres) ? data.genres.map(String) : [],
        format: String(data.format || ""),
        popularityRank: Number(data.popularityRank ?? 0),
        postCount: Number(data.postCount ?? 0),
        lastPostedAt: Number(data.lastPostedAt ?? 0),
      };
    });

    return NextResponse.json({
      ok: true,
      total: mangas.length,
      mangas,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal memuat daftar manga.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await crawlAndSyncTop300Mangas();
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal sinkronisasi Top 300 manga.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
