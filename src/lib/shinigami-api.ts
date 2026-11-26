import crypto from "node:crypto";
import { isProjectManga } from "@/lib/comment-templates";
import {
  getDb,
  type AccountDoc,
  type MangaDoc,
  type PostCategory,
} from "@/lib/firebase-admin";
import { refreshAndSyncAccount } from "@/lib/workos";

const SHINIGAMI_API_BASE = "https://api.shinigami.io/v1";
const SHINIGAMI_COMMENT_API_BASE = "https://api.shinigami.io/comment/api/v2";

const SHINIGAMI_HEADERS: Record<string, string> = {
  accept: "application/json, text/plain, */*",
  origin: "https://s1.shinigami.mx",
  referer: "https://s1.shinigami.mx/",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36",
};

interface RawTaxonomyItem {
  name?: string;
}

interface RawMangaItem {
  manga_id?: string;
  id?: string;
  title?: string;
  cover_image_url?: string;
  cover_portrait_url?: string;
  country_id?: string;
  view_count?: number | string;
  user_rate?: number | string;
  rating?: number | string;
  latest_chapter_number?: number | string;
  genres?: Array<string | RawTaxonomyItem>;
  format?: string;
  release_year?: string | number | null;
  description?: string | null;
  taxonomy?: {
    Genre?: RawTaxonomyItem[];
    Format?: RawTaxonomyItem[];
    Author?: RawTaxonomyItem[];
    Artist?: RawTaxonomyItem[];
  };
}

export interface ShinigamiPostItem {
  id: string;
  post_id?: string;
  category?: string;
  manga_id?: string;
  manga_title?: string;
  manga?: {
    manga_id?: string;
    title?: string;
    cover_image_url?: string;
  } | null;
  title: string;
  content: string;
  is_spoiler?: boolean;
  liked?: boolean;
  like_count?: number;
  likes_count?: number;
  comment_count?: number;
  comments_count?: number;
  created_at?: string;
  poll?: {
    id?: string;
    options?: Array<{
      id?: string;
      text?: string;
      option?: string;
      vote_count?: number;
      votes_count?: number;
    }>;
  } | null;
  [key: string]: unknown;
}

export interface CreatePostPayload {
  manga_id?: string;
  title: string;
  content: string;
  category: PostCategory;
  attachments: unknown[];
  is_spoiler: boolean;
  poll?: {
    options: string[];
    closes_at: string;
  };
}

function extractTaxonomyNames(items?: RawTaxonomyItem[]): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((entry) => entry?.name?.trim())
    .filter((name): name is string => Boolean(name));
}

function extractGenres(item: RawMangaItem): string[] {
  if (Array.isArray(item.taxonomy?.Genre)) {
    return item.taxonomy.Genre.map((g) => g?.name?.trim())
      .filter((name): name is string => Boolean(name));
  }
  if (Array.isArray(item.genres)) {
    return item.genres
      .map((g) => (typeof g === "string" ? g.trim() : g?.name?.trim()))
      .filter((name): name is string => Boolean(name));
  }
  return [];
}

function extractFormat(item: RawMangaItem): string {
  if (item.taxonomy?.Format && item.taxonomy.Format.length > 0) {
    return item.taxonomy.Format[0]?.name?.trim() || "";
  }
  return item.format?.trim() || "";
}

function parseMangaListPayload(json: unknown): RawMangaItem[] {
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj.data)) return obj.data as RawMangaItem[];
  if (obj.data && typeof obj.data === "object") {
    const inner = obj.data as Record<string, unknown>;
    if (Array.isArray(inner.data)) return inner.data as RawMangaItem[];
    if (Array.isArray(inner.list)) return inner.list as RawMangaItem[];
    if (Array.isArray(inner.items)) return inner.items as RawMangaItem[];
  }
  return [];
}

/**
 * Crawls Top 300 unique popular mangas using Shinigami's limit/offset pagination,
 * merges metadata into Firestore preserving existing lastPostedAt & postCount,
 * and deletes stale documents outside Top 300.
 */
export async function crawlAndSyncTop300Mangas(): Promise<{
  syncedCount: number;
  deletedCount: number;
  pagesFetched: number;
}> {
  const TARGET_COUNT = 300;
  const PAGE_LIMIT = 100;
  const MAX_REQUESTS = 15;
  const collected: RawMangaItem[] = [];
  const seenIds = new Set<string>();
  let pagesFetched = 0;
  let offset = 0;

  while (collected.length < TARGET_COUNT && pagesFetched < MAX_REQUESTS) {
    const remaining = TARGET_COUNT - collected.length;
    const limit = Math.min(PAGE_LIMIT, remaining);
    const url = `${SHINIGAMI_API_BASE}/manga/list?limit=${limit}&offset=${offset}&sort=popularity&sort_order=desc`;
    const res = await fetch(url, {
      method: "GET",
      headers: SHINIGAMI_HEADERS,
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(
        `Gagal fetch offset ${offset} dari Shinigami API (HTTP ${res.status})`
      );
    }

    const json = (await res.json()) as {
      meta?: { has_next?: boolean; limit?: number; offset?: number };
    };
    const items = parseMangaListPayload(json);
    pagesFetched++;

    if (items.length === 0) {
      break;
    }

    let newlyAdded = 0;
    for (const item of items) {
      const id = (item.manga_id || item.id || "").trim();
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      collected.push(item);
      newlyAdded++;
      if (collected.length >= TARGET_COUNT) break;
    }

    offset += items.length;

    if (json.meta?.has_next === false || newlyAdded === 0) {
      break;
    }
  }

  const top300 = collected.slice(0, 300);
  const top300Ids = new Set<string>();

  const db = getDb();
  const mangasCol = db.collection("mangas");
  const existingSnap = await mangasCol.get();
  const existingMap = new Map<string, { postCount: number; lastPostedAt: number }>();

  for (const doc of existingSnap.docs) {
    const data = doc.data();
    existingMap.set(doc.id, {
      postCount: typeof data.postCount === "number" ? data.postCount : 0,
      lastPostedAt: typeof data.lastPostedAt === "number" ? data.lastPostedAt : 0,
    });
  }

  type BatchOp =
    | { type: "set"; id: string; data: Partial<MangaDoc> }
    | { type: "delete"; id: string };

  const ops: BatchOp[] = [];

  top300.forEach((item, idx) => {
    const mangaId = (item.manga_id || item.id || "").trim();
    if (!mangaId) return;
    top300Ids.add(mangaId);

    const existing = existingMap.get(mangaId);
    const baseData: Partial<MangaDoc> = {
      mangaId,
      title: item.title?.trim() || "Untitled Manga",
      coverImageUrl: (
        item.cover_image_url ||
        item.cover_portrait_url ||
        ""
      ).trim(),
      countryId: item.country_id?.trim() || "",
      viewCount: Number(item.view_count ?? 0) || 0,
      userRate: Number(item.user_rate ?? item.rating ?? 0) || 0,
      latestChapterNumber: Number(item.latest_chapter_number ?? 0) || 0,
      genres: extractGenres(item),
      format: extractFormat(item),
      authors: extractTaxonomyNames(item.taxonomy?.Author),
      artists: extractTaxonomyNames(item.taxonomy?.Artist),
      releaseYear:
        item.release_year !== undefined && item.release_year !== null
          ? String(item.release_year).trim()
          : "",
      description:
        typeof item.description === "string"
          ? item.description.trim().slice(0, 400)
          : "",
      popularityRank: idx + 1,
    };

    if (!existing) {
      baseData.postCount = 0;
      baseData.lastPostedAt = 0;
    }

    ops.push({ type: "set", id: mangaId, data: baseData });
  });

  let deletedCount = 0;
  for (const existingId of existingMap.keys()) {
    if (!top300Ids.has(existingId)) {
      ops.push({ type: "delete", id: existingId });
      deletedCount++;
    }
  }

  // Commit in chunks of 450 to stay safely below Firestore's 500 ops/batch limit
  const CHUNK_SIZE = 450;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const chunk = ops.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();
    for (const op of chunk) {
      const ref = mangasCol.doc(op.id);
      if (op.type === "set") {
        batch.set(ref, op.data, { merge: true });
      } else {
        batch.delete(ref);
      }
    }
    await batch.commit();
  }

  return {
    syncedCount: top300.length,
    deletedCount,
    pagesFetched,
  };
}

/**
 * Picks 1 random manga from Top 50 Popular mangas in Firestore (popularityRank <= 50),
 * falling back to Shinigami API (limit=50&offset=0&sort=popularity&sort_order=desc) if Firestore is empty.
 */
export async function getRandomTop50Manga(): Promise<MangaDoc | null> {
  try {
    const db = getDb();
    const snap = await db
      .collection("mangas")
      .orderBy("popularityRank", "asc")
      .limit(50)
      .get();

    if (!snap.empty) {
      const chosenDoc =
        snap.docs[Math.floor(Math.random() * snap.docs.length)];
      const data = chosenDoc.data();
      return {
        mangaId: String(data.mangaId || chosenDoc.id),
        title: String(data.title || "Untitled"),
        coverImageUrl: String(data.coverImageUrl || ""),
        countryId: String(data.countryId || ""),
        viewCount: Number(data.viewCount ?? 0),
        userRate: Number(data.userRate ?? 0),
        latestChapterNumber: Number(data.latestChapterNumber ?? 0),
        genres: Array.isArray(data.genres) ? data.genres.map(String) : [],
        format: String(data.format || ""),
        authors: Array.isArray(data.authors) ? data.authors.map(String) : [],
        artists: Array.isArray(data.artists) ? data.artists.map(String) : [],
        releaseYear:
          typeof data.releaseYear === "string" ? data.releaseYear : "",
        description:
          typeof data.description === "string" ? data.description : "",
        popularityRank: Number(data.popularityRank ?? 0),
        postCount: Number(data.postCount ?? 0),
        lastPostedAt: Number(data.lastPostedAt ?? 0),
      };
    }
  } catch {
    // Fall through to live Shinigami API fallback
  }

  const url = `${SHINIGAMI_API_BASE}/manga/list?limit=50&offset=0&sort=popularity&sort_order=desc`;
  const res = await fetch(url, {
    method: "GET",
    headers: SHINIGAMI_HEADERS,
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }

  const json = await res.json().catch(() => null);
  const items = parseMangaListPayload(json);
  if (items.length === 0) {
    return null;
  }

  const idx = Math.floor(Math.random() * items.length);
  const item = items[idx];
  return {
    mangaId: String(item.manga_id || item.id || "").trim(),
    title: item.title?.trim() || "Untitled Manga",
    coverImageUrl: (
      item.cover_image_url ||
      item.cover_portrait_url ||
      ""
    ).trim(),
    countryId: item.country_id?.trim() || "",
    viewCount: Number(item.view_count ?? 0) || 0,
    userRate: Number(item.user_rate ?? item.rating ?? 0) || 0,
    latestChapterNumber: Number(item.latest_chapter_number ?? 0) || 0,
    genres: extractGenres(item),
    format: extractFormat(item),
    authors: extractTaxonomyNames(item.taxonomy?.Author),
    artists: extractTaxonomyNames(item.taxonomy?.Artist),
    releaseYear:
      item.release_year !== undefined && item.release_year !== null
        ? String(item.release_year).trim()
        : "",
    description:
      typeof item.description === "string"
        ? item.description.trim().slice(0, 400)
        : "",
    popularityRank: idx + 1,
    postCount: 0,
    lastPostedAt: 0,
  };
}

function isAuthErrorStatus(status: number, bodyText?: string): boolean {
  if (status === 401 || status === 403) return true;
  if (status >= 200 && status < 300) return false;
  if (!bodyText) return false;
  const lower = bodyText.toLowerCase();
  return (
    lower.includes("login required") ||
    lower.includes("unauthorized") ||
    lower.includes("token expired") ||
    lower.includes("jwt expired")
  );
}

/**
 * Executes an authenticated Shinigami API request with automatic 1x WorkOS refresh & retry on 401/403.
 */
async function fetchWithAutoRefresh(
  account: AccountDoc,
  buildRequest: (accessToken: string) => Promise<Response>
): Promise<{ response: Response; account: AccountDoc; refreshed: boolean }> {
  let currentAccount = account;
  let response = await buildRequest(currentAccount.accessToken);
  let refreshed = false;

  if (
    (response.status === 401 || response.status === 403) &&
    currentAccount.refreshToken
  ) {
    const cloneText = await response.clone().text().catch(() => "");
    if (isAuthErrorStatus(response.status, cloneText)) {
      currentAccount = await refreshAndSyncAccount(currentAccount);
      refreshed = true;
      response = await buildRequest(currentAccount.accessToken);
    }
  }

  return { response, account: currentAccount, refreshed };
}

export async function createShinigamiPost(
  account: AccountDoc,
  payload: CreatePostPayload
): Promise<{
  data: unknown;
  account: AccountDoc;
  refreshed: boolean;
}> {
  const requestBody: Record<string, unknown> =
    payload.category === "off-topic"
      ? {
          title: payload.title,
          content: payload.content,
          category: "off-topic",
          attachments: [],
          is_spoiler: Boolean(payload.is_spoiler),
        }
      : {
          title: payload.title,
          content: payload.content,
          category: payload.category,
          attachments: payload.attachments ?? [],
          is_spoiler: Boolean(payload.is_spoiler),
          ...(payload.manga_id ? { manga_id: payload.manga_id } : {}),
          ...(payload.category === "polling" && payload.poll
            ? { poll: payload.poll }
            : {}),
        };

  const { response, account: updatedAccount, refreshed } =
    await fetchWithAutoRefresh(account, (token) =>
      fetch(`${SHINIGAMI_API_BASE}/posts`, {
        method: "POST",
        headers: {
          ...SHINIGAMI_HEADERS,
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
        cache: "no-store",
      })
    );

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errDetail =
      typeof json === "object" && json && "message" in json
        ? String((json as { message?: unknown }).message)
        : JSON.stringify(json);
    throw new Error(
      `Gagal create post Shinigami (HTTP ${response.status}): ${errDetail}`
    );
  }

  return { data: json, account: updatedAccount, refreshed };
}

function normalizePostItem(raw: Record<string, unknown>): ShinigamiPostItem {
  const id = String(raw.id || raw.post_id || "");
  const mangaObj =
    raw.manga && typeof raw.manga === "object"
      ? (raw.manga as Record<string, unknown>)
      : undefined;

  return {
    ...raw,
    id,
    post_id: id,
    category:
      typeof raw.category === "string"
        ? raw.category
        : typeof raw.kind === "string"
          ? raw.kind
          : undefined,
    manga: mangaObj
      ? {
          manga_id:
            typeof mangaObj.manga_id === "string"
              ? mangaObj.manga_id
              : undefined,
          title:
            typeof mangaObj.title === "string" ? mangaObj.title : undefined,
          cover_image_url:
            typeof mangaObj.cover_image_url === "string"
              ? mangaObj.cover_image_url
              : undefined,
        }
      : null,
    manga_id:
      typeof raw.manga_id === "string"
        ? raw.manga_id
        : typeof mangaObj?.manga_id === "string"
          ? mangaObj.manga_id
          : undefined,
    manga_title:
      typeof raw.manga_title === "string"
        ? raw.manga_title
        : typeof mangaObj?.title === "string"
          ? mangaObj.title
          : undefined,
    title: typeof raw.title === "string" ? raw.title : "",
    content: typeof raw.content === "string" ? raw.content : "",
    is_spoiler: Boolean(raw.is_spoiler),
    liked: typeof raw.liked === "boolean" ? raw.liked : false,
    like_count: Number(raw.like_count ?? raw.likes_count ?? 0) || 0,
    comment_count: Number(raw.comment_count ?? raw.comments_count ?? 0) || 0,
    created_at:
      typeof raw.created_at === "string" ? raw.created_at : undefined,
    poll: (raw.poll as ShinigamiPostItem["poll"]) ?? null,
  };
}

function extractPostsArray(json: unknown): ShinigamiPostItem[] {
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  let rawList: unknown[] = [];

  if (Array.isArray(obj.data)) {
    rawList = obj.data;
  } else if (obj.data && typeof obj.data === "object") {
    const inner = obj.data as Record<string, unknown>;
    if (Array.isArray(inner.data)) rawList = inner.data;
    else if (Array.isArray(inner.posts)) rawList = inner.posts;
    else if (Array.isArray(inner.list)) rawList = inner.list;
  }

  return rawList
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object")
    )
    .map(normalizePostItem)
    .filter((item) => Boolean(item.id));
}

export async function getShinigamiUserPosts(
  username: string,
  options?: {
    limit?: number;
    account?: AccountDoc;
  }
): Promise<{
  posts: ShinigamiPostItem[];
  account?: AccountDoc;
  refreshed: boolean;
}> {
  const limit = options?.limit ?? 20;
  const url = `${SHINIGAMI_API_BASE}/user/${encodeURIComponent(username)}/posts?limit=${limit}`;

  if (options?.account) {
    const { response, account: updatedAccount, refreshed } =
      await fetchWithAutoRefresh(options.account, (token) =>
        fetch(url, {
          method: "GET",
          headers: {
            ...SHINIGAMI_HEADERS,
            authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        })
      );

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `Gagal fetch posts user ${username} (HTTP ${response.status})`
      );
    }

    return {
      posts: extractPostsArray(json),
      account: updatedAccount,
      refreshed,
    };
  }

  const response = await fetch(url, {
    method: "GET",
    headers: SHINIGAMI_HEADERS,
    cache: "no-store",
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Gagal fetch posts user ${username} (HTTP ${response.status})`
    );
  }

  return {
    posts: extractPostsArray(json),
    refreshed: false,
  };
}

export async function likeShinigamiPost(
  postId: string,
  account: AccountDoc
): Promise<{
  ok: boolean;
  status: number;
  account: AccountDoc;
  refreshed: boolean;
}> {
  const url = `${SHINIGAMI_API_BASE}/posts/${encodeURIComponent(postId)}/like`;

  const doPut = (token: string) =>
    fetch(url, {
      method: "PUT",
      headers: {
        ...SHINIGAMI_HEADERS,
        "content-length": "0",
        authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });

  const { response, account: updatedAccount, refreshed } =
    await fetchWithAutoRefresh(account, doPut);

  if (response.ok) {
    const json = (await response.json().catch(() => null)) as {
      data?: { liked?: boolean };
    } | null;

    // Anti-unlike safeguard: if Shinigami toggled liked to false, send 1x PUT again
    if (json?.data?.liked === false) {
      const retryRes = await doPut(updatedAccount.accessToken);
      return {
        ok: retryRes.ok,
        status: retryRes.status,
        account: updatedAccount,
        refreshed,
      };
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    account: updatedAccount,
    refreshed,
  };
}

export interface LatestChapterItem {
  chapter_id: string;
  chapter_number: number;
  created_at?: string;
}

export interface LatestMangaItem {
  manga_id: string;
  title: string;
  cover_image_url: string;
  country_id: string;
  format: string;
  isProject: boolean;
  typeLabel: string;
  taxonomy?: {
    Type?: Array<{ name?: string; slug?: string }>;
  };
  chapters: LatestChapterItem[];
}

export interface ChapterCommentItem {
  id?: number;
  username: string;
  content: string;
  date?: string;
}

/**
 * Fetches latest updated mangas with their recent chapters & taxonomy.Type directly from Shinigami API.
 */
export async function getLatestMangas(
  limit = 20,
  offset = 0
): Promise<LatestMangaItem[]> {
  const url = `${SHINIGAMI_API_BASE}/manga/list?sort=latest&sort_order=desc&offset=${offset}&limit=${limit}&is_update=true`;
  const response = await fetch(url, {
    method: "GET",
    headers: SHINIGAMI_HEADERS,
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Gagal fetch daftar manga terbaru Shinigami (HTTP ${response.status})`
    );
  }

  const json = (await response.json()) as { data?: unknown };
  const rawList = Array.isArray(json.data) ? json.data : [];

  return rawList
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object")
    )
    .map((item) => {
      const mangaId = String(item.manga_id || item.id || "").trim();
      const taxonomy =
        item.taxonomy && typeof item.taxonomy === "object"
          ? (item.taxonomy as {
              Type?: Array<{ name?: string; slug?: string }>;
              Format?: Array<{ name?: string }>;
            })
          : undefined;
      const rawChapters = Array.isArray(item.chapters) ? item.chapters : [];
      const chapters: LatestChapterItem[] = rawChapters
        .filter((ch): ch is Record<string, unknown> =>
          Boolean(ch && typeof ch === "object")
        )
        .map((ch) => ({
          chapter_id: String(ch.chapter_id || ch.id || "").trim(),
          chapter_number: Number(ch.chapter_number ?? 0) || 0,
          created_at:
            typeof ch.created_at === "string" ? ch.created_at : undefined,
        }))
        .filter((ch) => Boolean(ch.chapter_id));

      const title = String(item.title || "Untitled").trim();
      const isProject = isProjectManga({ title, taxonomy });
      const typeLabel =
        taxonomy?.Type?.[0]?.name?.trim() || (isProject ? "Project" : "Mirror");

      return {
        manga_id: mangaId,
        title,
        cover_image_url: String(
          item.cover_image_url || item.cover_portrait_url || ""
        ).trim(),
        country_id: String(item.country_id || "").trim(),
        format: String(
          taxonomy?.Format?.[0]?.name || item.format || ""
        ).trim(),
        isProject,
        typeLabel,
        taxonomy: taxonomy?.Type ? { Type: taxonomy.Type } : undefined,
        chapters,
      };
    })
    .filter((m) => Boolean(m.manga_id));
}

/**
 * Fetches existing comments on a specific manga chapter to prevent duplicate comments per account.
 */
export async function getChapterComments(
  mangaId: string,
  chapterId: string,
  limit = 50
): Promise<{ comments: ChapterCommentItem[]; count: number }> {
  const pageKey = `manga:${mangaId}:chapter:${chapterId}`;
  const url = `${SHINIGAMI_COMMENT_API_BASE}/comments?page_key=${encodeURIComponent(pageKey)}&offset=0&limit=${limit}`;

  const response = await fetch(url, {
    method: "GET",
    headers: SHINIGAMI_HEADERS,
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Gagal cek komentar chapter ${chapterId} (HTTP ${response.status})`
    );
  }

  const json = (await response.json().catch(() => ({}))) as {
    comments?: Array<Record<string, unknown>>;
    count?: number;
  };

  const rawComments = Array.isArray(json.comments) ? json.comments : [];
  const comments: ChapterCommentItem[] = rawComments.map((c) => ({
    id: typeof c.id === "number" ? c.id : undefined,
    username: String(c.username || c.nick || c.user_name || "").trim(),
    content: String(c.content || ""),
    date: typeof c.date === "string" ? c.date : undefined,
  }));

  return {
    comments,
    count: typeof json.count === "number" ? json.count : comments.length,
  };
}

/**
 * Sends a new chapter comment to Shinigami with automatic WorkOS token refresh & 1x retry on 401/403.
 */
export async function postChapterComment(
  account: AccountDoc,
  mangaId: string,
  chapterId: string,
  content: string
): Promise<{
  ok: boolean;
  status: number;
  commentId?: number;
  error?: string;
  account: AccountDoc;
  refreshed: boolean;
}> {
  const pageKey = `manga:${mangaId}:chapter:${chapterId}`;
  const idempotencyKey = crypto.randomUUID();
  const url = `${SHINIGAMI_COMMENT_API_BASE}/comments`;

  const { response, account: updatedAccount, refreshed } =
    await fetchWithAutoRefresh(account, (token) =>
      fetch(url, {
        method: "POST",
        headers: {
          ...SHINIGAMI_HEADERS,
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content,
          page_key: pageKey,
          idempotency_key: idempotencyKey,
        }),
        signal: AbortSignal.timeout(25_000),
        cache: "no-store",
      })
    );

  const json = (await response.json().catch(() => ({}))) as {
    id?: number;
    comment_id?: number;
    message?: string;
    data?: { id?: number; comment_id?: number };
  };

  if (response.ok || response.status === 201) {
    const rawId =
      json?.data?.id ?? json?.data?.comment_id ?? json?.comment_id ?? json?.id;
    return {
      ok: true,
      status: response.status,
      commentId: rawId !== undefined ? Number(rawId) : undefined,
      account: updatedAccount,
      refreshed,
    };
  }

  return {
    ok: false,
    status: response.status,
    error: json?.message || `HTTP ${response.status}`,
    account: updatedAccount,
    refreshed,
  };
}
