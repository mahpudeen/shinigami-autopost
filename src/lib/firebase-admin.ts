import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export const DEFAULT_CLIENT_ID = "client_01KJWQWJ8M8WAKN8ZDWVVJ4BG1";
export const DEFAULT_POSTER_USERNAME = "mahpudeen";
export const DEFAULT_KOBOILLM_BASE_URL = "https://api.koboillm.com/v1";
export const ALL_POST_CATEGORIES = [
  "teori",
  "tanya",
  "rekomendasi",
  "polling",
] as const;

export type PostCategory = (typeof ALL_POST_CATEGORIES)[number];
export type AccountRole = "poster" | "voter" | "commenter" | "both" | "all";

export interface AccountDoc {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarUrl: string;
  role: AccountRole;
  isActive: boolean;
  accessToken: string;
  refreshToken: string;
  clientId: string;
  updatedAt: number;
}

export interface MangaDoc {
  mangaId: string;
  title: string;
  coverImageUrl: string;
  countryId: string;
  viewCount: number;
  userRate: number;
  latestChapterNumber: number;
  genres: string[];
  format: string;
  popularityRank: number;
  postCount: number;
  lastPostedAt: number;
}

export interface SettingsDoc {
  isPostEnabled: boolean;
  isLikeEnabled: boolean;
  isCommentEnabled: boolean;
  posterUsername: string;
  likesPerAccountPerRun: number;
  commentsPerRun: number;
  koboillmApiKey: string;
  koboillmBaseUrl: string;
  selectedModel: string;
  enabledCategories: PostCategory[];
  lastPostRunAt: number;
  lastLikeRunAt: number;
  lastCommentRunAt: number;
}

function normalizePrivateKey(rawKey?: string): string {
  if (!rawKey) return "";
  let key = rawKey.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, "\n");
}

function getFirebaseApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin credentials belum lengkap. Pastikan FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, dan FIREBASE_PRIVATE_KEY tersedia di environment variables."
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

let cachedDb: Firestore | null = null;

export function getDb(): Firestore {
  if (!cachedDb) {
    cachedDb = getFirestore(getFirebaseApp());
  }
  return cachedDb;
}

export function getDefaultSettings(): SettingsDoc {
  return {
    isPostEnabled: false,
    isLikeEnabled: false,
    isCommentEnabled: false,
    posterUsername:
      process.env.TARGET_POSTER_USERNAME?.trim() || DEFAULT_POSTER_USERNAME,
    likesPerAccountPerRun: 7,
    commentsPerRun: 3,
    koboillmApiKey: process.env.KOBOILLM_API_KEY?.trim() || "",
    koboillmBaseUrl: DEFAULT_KOBOILLM_BASE_URL,
    selectedModel: "gpt-6-luna",
    enabledCategories: [...ALL_POST_CATEGORIES],
    lastPostRunAt: 0,
    lastLikeRunAt: 0,
    lastCommentRunAt: 0,
  };
}

export async function getSettingsDoc(): Promise<SettingsDoc> {
  const db = getDb();
  const snap = await db.collection("settings").doc("autopost").get();
  const defaults = getDefaultSettings();

  if (!snap.exists) {
    return defaults;
  }

  const data = snap.data() || {};
  const validCategories = Array.isArray(data.enabledCategories)
    ? (data.enabledCategories.filter((c: unknown): c is PostCategory =>
        ALL_POST_CATEGORIES.includes(c as PostCategory)
      ) as PostCategory[])
    : defaults.enabledCategories;

  return {
    isPostEnabled:
      typeof data.isPostEnabled === "boolean"
        ? data.isPostEnabled
        : defaults.isPostEnabled,
    isLikeEnabled:
      typeof data.isLikeEnabled === "boolean"
        ? data.isLikeEnabled
        : defaults.isLikeEnabled,
    isCommentEnabled:
      typeof data.isCommentEnabled === "boolean"
        ? data.isCommentEnabled
        : defaults.isCommentEnabled,
    posterUsername:
      typeof data.posterUsername === "string" && data.posterUsername.trim()
        ? data.posterUsername.trim()
        : defaults.posterUsername,
    likesPerAccountPerRun:
      typeof data.likesPerAccountPerRun === "number" &&
      data.likesPerAccountPerRun > 0
        ? Math.min(20, Math.floor(data.likesPerAccountPerRun))
        : defaults.likesPerAccountPerRun,
    commentsPerRun:
      typeof data.commentsPerRun === "number" && data.commentsPerRun > 0
        ? Math.min(10, Math.floor(data.commentsPerRun))
        : defaults.commentsPerRun,
    koboillmApiKey:
      typeof data.koboillmApiKey === "string" && data.koboillmApiKey.trim()
        ? data.koboillmApiKey.trim()
        : defaults.koboillmApiKey,
    koboillmBaseUrl:
      typeof data.koboillmBaseUrl === "string" && data.koboillmBaseUrl.trim()
        ? data.koboillmBaseUrl.trim().replace(/\/+$/, "")
        : defaults.koboillmBaseUrl,
    selectedModel:
      typeof data.selectedModel === "string" && data.selectedModel.trim()
        ? data.selectedModel.trim()
        : defaults.selectedModel,
    enabledCategories:
      validCategories.length > 0 ? validCategories : defaults.enabledCategories,
    lastPostRunAt:
      typeof data.lastPostRunAt === "number" ? data.lastPostRunAt : 0,
    lastLikeRunAt:
      typeof data.lastLikeRunAt === "number" ? data.lastLikeRunAt : 0,
    lastCommentRunAt:
      typeof data.lastCommentRunAt === "number" ? data.lastCommentRunAt : 0,
  };
}
