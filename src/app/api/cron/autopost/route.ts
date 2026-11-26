import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyCronAccess } from "@/lib/auth";
import {
  ALL_POST_CATEGORIES,
  DEFAULT_CLIENT_ID,
  getDb,
  getSettingsDoc,
  type AccountDoc,
  type MangaDoc,
  type PostCategory,
} from "@/lib/firebase-admin";
import { generatePostWithKoboiLLM } from "@/lib/koboillm";
import { createShinigamiPost, type CreatePostPayload } from "@/lib/shinigami-api";

async function handleAutoPost(request: NextRequest) {
  const auth = verifyCronAccess(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized: CRON_SECRET tidak valid." },
      { status: 401 }
    );
  }

  try {
    const settings = await getSettingsDoc();

    if (!settings.isPostEnabled && !auth.isManualTest) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Auto-Post nonaktif",
      });
    }

    const db = getDb();

    // Fetch active poster accounts ("poster" or "both")
    const accountsSnap = await db
      .collection("accounts")
      .where("isActive", "==", true)
      .get();

    const posterAccounts: AccountDoc[] = accountsSnap.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          name: String(d.name || "Shinigami User"),
          username: typeof d.username === "string" ? d.username.trim() : "",
          email: String(d.email || ""),
          avatarUrl: String(d.avatarUrl || ""),
          role: (d.role as AccountDoc["role"]) || "both",
          isActive: Boolean(d.isActive),
          accessToken: String(d.accessToken || ""),
          refreshToken: String(d.refreshToken || ""),
          clientId: String(d.clientId || DEFAULT_CLIENT_ID),
          updatedAt: Number(d.updatedAt ?? 0),
        };
      })
      .filter(
        (acc) =>
          acc.role === "poster" || acc.role === "both" || acc.role === "all"
      );

    if (posterAccounts.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Tidak ada akun aktif dengan role 'poster', 'both', atau 'all' di Firestore.",
        },
        { status: 400 }
      );
    }

    const chosenAccount =
      posterAccounts[Math.floor(Math.random() * posterAccounts.length)];

    // Fetch exactly 1 manga with the oldest lastPostedAt (only 1 Firestore Read)
    const mangaSnap = await db
      .collection("mangas")
      .orderBy("lastPostedAt", "asc")
      .limit(1)
      .get();

    if (mangaSnap.empty) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Koleksi 'mangas' masih kosong. Silakan jalankan Sync Top 300 Manga terlebih dahulu.",
        },
        { status: 400 }
      );
    }

    const mangaDocSnap = mangaSnap.docs[0];
    const m = mangaDocSnap.data();
    const manga: MangaDoc = {
      mangaId: String(m.mangaId || mangaDocSnap.id),
      title: String(m.title || "Untitled"),
      coverImageUrl: String(m.coverImageUrl || ""),
      countryId: String(m.countryId || ""),
      viewCount: Number(m.viewCount ?? 0),
      userRate: Number(m.userRate ?? 0),
      latestChapterNumber: Number(m.latestChapterNumber ?? 0),
      genres: Array.isArray(m.genres) ? m.genres.map(String) : [],
      format: String(m.format || ""),
      popularityRank: Number(m.popularityRank ?? 0),
      postCount: Number(m.postCount ?? 0),
      lastPostedAt: Number(m.lastPostedAt ?? 0),
    };

    const categories: PostCategory[] =
      settings.enabledCategories.length > 0
        ? settings.enabledCategories
        : [...ALL_POST_CATEGORIES];
    const chosenCategory =
      categories[Math.floor(Math.random() * categories.length)];

    const generated = await generatePostWithKoboiLLM({
      apiKey: settings.koboillmApiKey,
      baseUrl: settings.koboillmBaseUrl,
      model: settings.selectedModel,
      manga,
      category: chosenCategory,
    });

    const payload: CreatePostPayload = {
      manga_id: manga.mangaId,
      title: generated.title,
      content: generated.content,
      category: chosenCategory,
      attachments: [],
      is_spoiler: generated.is_spoiler,
    };

    if (
      chosenCategory === "polling" &&
      generated.poll_options &&
      generated.poll_options.length >= 2
    ) {
      payload.poll = {
        options: generated.poll_options.slice(0, 4),
        closes_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      };
    }

    const postResult = await createShinigamiPost(chosenAccount, payload);

    const now = Date.now();
    await Promise.all([
      db
        .collection("mangas")
        .doc(mangaDocSnap.id)
        .set(
          {
            lastPostedAt: now,
            postCount: FieldValue.increment(1),
          },
          { merge: true }
        ),
      db
        .collection("settings")
        .doc("autopost")
        .set({ lastPostRunAt: now }, { merge: true }),
    ]);

    return NextResponse.json({
      ok: true,
      skipped: false,
      manual: auth.isManualTest,
      account: {
        id: postResult.account.id,
        name: postResult.account.name,
        email: postResult.account.email,
        tokenRefreshed: postResult.refreshed,
      },
      manga: {
        mangaId: manga.mangaId,
        title: manga.title,
        popularityRank: manga.popularityRank,
      },
      category: chosenCategory,
      model: settings.selectedModel,
      post: {
        title: generated.title,
        content: generated.content,
        is_spoiler: generated.is_spoiler,
        poll_options: generated.poll_options || null,
      },
      shinigamiResponse: postResult.data,
      executedAt: now,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Auto-Post gagal dieksekusi.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleAutoPost(request);
}

export async function POST(request: NextRequest) {
  return handleAutoPost(request);
}
