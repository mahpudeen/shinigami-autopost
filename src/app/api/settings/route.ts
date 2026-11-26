import { NextResponse, type NextRequest } from "next/server";
import {
  ALL_POST_CATEGORIES,
  DEFAULT_KOBOILLM_BASE_URL,
  DEFAULT_POSTER_USERNAME,
  getDb,
  getSettingsDoc,
  type PostCategory,
  type SettingsDoc,
} from "@/lib/firebase-admin";

export async function GET() {
  try {
    const settings = await getSettingsDoc();
    return NextResponse.json({
      ok: true,
      settings,
      cronSecret: process.env.CRON_SECRET || "",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal memuat pengaturan.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<SettingsDoc>;
    const current = await getSettingsDoc();

    const enabledCategories = Array.isArray(body.enabledCategories)
      ? body.enabledCategories.filter((c): c is PostCategory =>
          ALL_POST_CATEGORIES.includes(c as PostCategory)
        )
      : current.enabledCategories;

    const likesPerRunRaw =
      typeof body.likesPerAccountPerRun === "number"
        ? body.likesPerAccountPerRun
        : Number(body.likesPerAccountPerRun ?? current.likesPerAccountPerRun);
    const likesPerAccountPerRun =
      Number.isFinite(likesPerRunRaw) && likesPerRunRaw >= 1
        ? Math.min(20, Math.floor(likesPerRunRaw))
        : current.likesPerAccountPerRun;

    const updated: Partial<SettingsDoc> = {
      isPostEnabled:
        typeof body.isPostEnabled === "boolean"
          ? body.isPostEnabled
          : current.isPostEnabled,
      isLikeEnabled:
        typeof body.isLikeEnabled === "boolean"
          ? body.isLikeEnabled
          : current.isLikeEnabled,
      posterUsername:
        typeof body.posterUsername === "string" && body.posterUsername.trim()
          ? body.posterUsername.trim()
          : current.posterUsername || DEFAULT_POSTER_USERNAME,
      likesPerAccountPerRun,
      koboillmApiKey:
        typeof body.koboillmApiKey === "string"
          ? body.koboillmApiKey.trim()
          : current.koboillmApiKey,
      koboillmBaseUrl:
        typeof body.koboillmBaseUrl === "string" && body.koboillmBaseUrl.trim()
          ? body.koboillmBaseUrl.trim().replace(/\/+$/, "")
          : current.koboillmBaseUrl || DEFAULT_KOBOILLM_BASE_URL,
      selectedModel:
        typeof body.selectedModel === "string" && body.selectedModel.trim()
          ? body.selectedModel.trim()
          : current.selectedModel,
      enabledCategories:
        enabledCategories.length > 0
          ? enabledCategories
          : [...ALL_POST_CATEGORIES],
    };

    const db = getDb();
    await db
      .collection("settings")
      .doc("autopost")
      .set(updated, { merge: true });

    const merged = await getSettingsDoc();
    return NextResponse.json({
      ok: true,
      settings: merged,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal menyimpan pengaturan.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
