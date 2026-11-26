import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAccess } from "@/lib/auth";
import { pickCommentContent } from "@/lib/comment-templates";
import {
  DEFAULT_CLIENT_ID,
  getDb,
  getSettingsDoc,
  type AccountDoc,
} from "@/lib/firebase-admin";
import {
  getChapterComments,
  getLatestMangas,
  postChapterComment,
} from "@/lib/shinigami-api";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomCommentDelayMs(): number {
  return 1500 + Math.floor(Math.random() * 1001); // 1.5s - 2.5s
}

async function handleAutoComment(request: NextRequest) {
  const auth = verifyCronAccess(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized: CRON_SECRET tidak valid." },
      { status: 401 }
    );
  }

  try {
    const settings = await getSettingsDoc();

    if (!settings.isCommentEnabled && !auth.isManualTest) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Auto-Comment sedang nonaktif",
      });
    }

    const db = getDb();
    const accountsSnap = await db
      .collection("accounts")
      .where("isActive", "==", true)
      .get();

    const commenterAccounts: AccountDoc[] = accountsSnap.docs
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
          Boolean(acc.username) &&
          (acc.role === "commenter" ||
            acc.role === "both" ||
            acc.role === "all")
      );

    if (commenterAccounts.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Tidak ada akun aktif dengan username terisi dan role 'commenter', 'both', atau 'all'. Silakan isi Username Shinigami di tab Akun terlebih dahulu.",
        },
        { status: 400 }
      );
    }

    let currentAccount =
      commenterAccounts[Math.floor(Math.random() * commenterAccounts.length)];
    const targetUsernameLower = currentAccount.username.toLowerCase();
    const targetCount = settings.commentsPerRun || 3;

    const latestMangas = await getLatestMangas(20, 0);
    const usedTemplates = new Set<string>();
    const results: Array<{
      mangaId: string;
      mangaTitle: string;
      isProject: boolean;
      chapterId: string;
      chapterNumber: number;
      content: string;
      pageKey: string;
      commentId?: number;
    }> = [];

    let skippedAlreadyCommented = 0;
    let failedAttempts = 0;
    let tokenRefreshed = false;

    outerLoop: for (const manga of latestMangas) {
      if (!Array.isArray(manga.chapters) || manga.chapters.length === 0) {
        continue;
      }

      for (const ch of manga.chapters) {
        if (results.length >= targetCount) {
          break outerLoop;
        }
        if (!ch.chapter_id) continue;

        const { comments } = await getChapterComments(
          manga.manga_id,
          ch.chapter_id,
          50
        );

        const alreadyCommented = comments.some(
          (c) => c.username?.trim().toLowerCase() === targetUsernameLower
        );

        if (alreadyCommented) {
          skippedAlreadyCommented++;
          continue;
        }

        const picked = pickCommentContent(
          manga,
          ch.chapter_number,
          usedTemplates
        );

        const postRes = await postChapterComment(
          currentAccount,
          manga.manga_id,
          ch.chapter_id,
          picked.content
        );

        currentAccount = postRes.account;
        if (postRes.refreshed) {
          tokenRefreshed = true;
        }

        if (postRes.ok) {
          results.push({
            mangaId: manga.manga_id,
            mangaTitle: manga.title,
            isProject: picked.isProject,
            chapterId: ch.chapter_id,
            chapterNumber: ch.chapter_number,
            content: picked.content,
            pageKey: `manga:${manga.manga_id}:chapter:${ch.chapter_id}`,
            commentId: postRes.commentId,
          });

          if (results.length < targetCount) {
            await sleep(randomCommentDelayMs());
          }
        } else {
          failedAttempts++;
        }
      }
    }

    const now = Date.now();
    await db
      .collection("settings")
      .doc("autopost")
      .set({ lastCommentRunAt: now }, { merge: true });

    return NextResponse.json({
      ok: true,
      skipped: false,
      manual: auth.isManualTest,
      targetCount,
      totalSent: results.length,
      skippedAlreadyCommented,
      failedAttempts,
      accountId: currentAccount.id,
      accountName: currentAccount.name,
      accountUsername: currentAccount.username,
      tokenRefreshed,
      results,
      executedAt: now,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Auto-Comment gagal dieksekusi.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleAutoComment(request);
}

export async function POST(request: NextRequest) {
  return handleAutoComment(request);
}
