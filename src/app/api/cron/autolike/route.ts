import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAccess } from "@/lib/auth";
import {
  DEFAULT_CLIENT_ID,
  DEFAULT_POSTER_USERNAME,
  getDb,
  getSettingsDoc,
  type AccountDoc,
} from "@/lib/firebase-admin";
import {
  getShinigamiUserPosts,
  likeShinigamiPost,
} from "@/lib/shinigami-api";

function fisherYatesShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(): number {
  return 1000 + Math.floor(Math.random() * 501); // 1000ms - 1500ms
}

async function handleAutoLike(request: NextRequest) {
  const auth = verifyCronAccess(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized: CRON_SECRET tidak valid." },
      { status: 401 }
    );
  }

  try {
    const settings = await getSettingsDoc();

    if (!settings.isLikeEnabled && !auth.isManualTest) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Auto-Like nonaktif",
      });
    }

    const db = getDb();
    const accountsSnap = await db
      .collection("accounts")
      .where("isActive", "==", true)
      .get();

    const voterAccounts: AccountDoc[] = accountsSnap.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          name: String(d.name || "Shinigami User"),
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
      .filter((acc) => acc.role === "voter" || acc.role === "both");

    if (voterAccounts.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Tidak ada akun aktif dengan role 'voter' atau 'both' di Firestore.",
        },
        { status: 400 }
      );
    }

    const targetUsername = settings.posterUsername || DEFAULT_POSTER_USERNAME;
    const maxLikesPerAccount = settings.likesPerAccountPerRun || 7;

    const results: Array<{
      accountId: string;
      accountName: string;
      unlikedFound: number;
      attempted: number;
      likedCount: number;
      failedCount: number;
      likedPostIds: string[];
      tokenRefreshed: boolean;
      error?: string;
    }> = [];

    let totalLikesGiven = 0;

    for (const voter of voterAccounts) {
      let currentAccount = voter;
      let tokenRefreshed = false;

      try {
        const feedRes = await getShinigamiUserPosts(targetUsername, {
          limit: 20,
          account: currentAccount,
        });

        if (feedRes.account) {
          currentAccount = feedRes.account;
        }
        if (feedRes.refreshed) {
          tokenRefreshed = true;
        }

        const unlikedPosts = feedRes.posts.filter(
          (post) => post.liked === false
        );
        const shuffled = fisherYatesShuffle(unlikedPosts);
        const selectedPosts = shuffled.slice(0, maxLikesPerAccount);

        const likedPostIds: string[] = [];
        let failedCount = 0;

        for (let idx = 0; idx < selectedPosts.length; idx++) {
          const post = selectedPosts[idx];
          const likeRes = await likeShinigamiPost(post.id, currentAccount);
          currentAccount = likeRes.account;
          if (likeRes.refreshed) {
            tokenRefreshed = true;
          }

          if (likeRes.ok) {
            likedPostIds.push(post.id);
            totalLikesGiven++;
          } else {
            failedCount++;
          }

          if (idx < selectedPosts.length - 1) {
            await sleep(randomDelayMs());
          }
        }

        results.push({
          accountId: currentAccount.id,
          accountName: currentAccount.name,
          unlikedFound: unlikedPosts.length,
          attempted: selectedPosts.length,
          likedCount: likedPostIds.length,
          failedCount,
          likedPostIds,
          tokenRefreshed,
        });
      } catch (err) {
        results.push({
          accountId: currentAccount.id,
          accountName: currentAccount.name,
          unlikedFound: 0,
          attempted: 0,
          likedCount: 0,
          failedCount: 0,
          likedPostIds: [],
          tokenRefreshed,
          error: err instanceof Error ? err.message : "Gagal memproses voter.",
        });
      }
    }

    const now = Date.now();
    await db
      .collection("settings")
      .doc("autopost")
      .set({ lastLikeRunAt: now }, { merge: true });

    return NextResponse.json({
      ok: true,
      skipped: false,
      manual: auth.isManualTest,
      targetUsername,
      likesPerAccountPerRun: maxLikesPerAccount,
      totalVoters: voterAccounts.length,
      totalLikesGiven,
      summary: results,
      executedAt: now,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Auto-Like gagal dieksekusi.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleAutoLike(request);
}

export async function POST(request: NextRequest) {
  return handleAutoLike(request);
}
