import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_POSTER_USERNAME,
  getSettingsDoc,
} from "@/lib/firebase-admin";
import { getShinigamiUserPosts } from "@/lib/shinigami-api";

export async function GET(request: NextRequest) {
  try {
    const queryUsername = request.nextUrl.searchParams.get("username")?.trim();
    const limitParam = Number(request.nextUrl.searchParams.get("limit") || 20);
    const limit =
      Number.isFinite(limitParam) && limitParam >= 1
        ? Math.min(50, Math.floor(limitParam))
        : 20;

    let username = queryUsername || "";
    if (!username) {
      try {
        const settings = await getSettingsDoc();
        username = settings.posterUsername || DEFAULT_POSTER_USERNAME;
      } catch {
        username =
          process.env.TARGET_POSTER_USERNAME?.trim() || DEFAULT_POSTER_USERNAME;
      }
    }

    const { posts } = await getShinigamiUserPosts(username, { limit });

    return NextResponse.json({
      ok: true,
      username,
      total: posts.length,
      posts,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal mengambil live feed post Shinigami.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
