"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Heart,
  KeyRound,
  Loader2,
  LogOut,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  ThumbsUp,
  Trash2,
  Users,
} from "lucide-react";

type TabKey = "mangas" | "autopost" | "autocomment" | "accounts";
type PostCategory = "teori" | "tanya" | "rekomendasi" | "polling" | "off-topic";
type AccountRole = "poster" | "voter" | "commenter" | "both" | "all";

interface MangaItem {
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

interface SettingsState {
  isPostEnabled: boolean;
  isLikeEnabled: boolean;
  isCommentEnabled: boolean;
  isReactionEnabled: boolean;
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

interface SafeAccount {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarUrl: string;
  role: AccountRole;
  isActive: boolean;
  clientId: string;
  updatedAt: number;
  accessTokenPreview: string;
  refreshTokenPreview: string;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
}

interface LatestMangaPreview {
  manga_id: string;
  title: string;
  cover_image_url: string;
  country_id: string;
  format: string;
  isProject: boolean;
  typeLabel: string;
  chapters: Array<{
    chapter_id: string;
    chapter_number: number;
    created_at?: string;
  }>;
}

interface CommentRunResultItem {
  mangaId: string;
  mangaTitle: string;
  isProject: boolean;
  chapterId: string;
  chapterNumber: number;
  content: string;
  pageKey: string;
  commentId?: number;
  reactionSent?: boolean;
  reactionId?: number;
  myReaction?: number;
  auraGranted?: number;
  auraRemainingToday?: number;
  reactionError?: string;
}

interface CommentTestResponse {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  isReactionEnabled?: boolean;
  totalSent: number;
  targetCount: number;
  totalAuraGranted?: number;
  auraRemainingToday?: number | null;
  skippedAlreadyCommented?: number;
  failedAttempts?: number;
  accountName?: string;
  accountUsername?: string;
  tokenRefreshed?: boolean;
  results: CommentRunResultItem[];
}

interface LivePost {
  id: string;
  title: string;
  content: string;
  category?: string;
  manga_title?: string;
  manga?: {
    manga_id?: string;
    title?: string;
    cover_image_url?: string;
  } | null;
  is_spoiler?: boolean;
  like_count?: number;
  comment_count?: number;
  created_at?: string;
  poll?: {
    options?: Array<{
      id?: string;
      text?: string;
      option?: string;
      vote_count?: number;
      votes_count?: number;
    }>;
  } | null;
}

interface ToastMessage {
  type: "success" | "error";
  text: string;
}

const DEFAULT_CLIENT_ID = "client_01KJWQWJ8M8WAKN8ZDWVVJ4BG1";

const CATEGORY_OPTIONS: Array<{
  key: PostCategory;
  label: string;
  desc: string;
}> = [
  {
    key: "teori",
    label: "Teori",
    desc: "Misteri alur, kekuatan karakter & prediksi chapter",
  },
  {
    key: "tanya",
    label: "Tanya",
    desc: "Pertanyaan diskusi terbuka untuk pembaca lain",
  },
  {
    key: "rekomendasi",
    label: "Rekomendasi",
    desc: "Ulasan daya tarik komik untuk mengajak baca",
  },
  {
    key: "polling",
    label: "Polling",
    desc: "Debat seru disertai 3–4 opsi voting",
  },
  {
    key: "off-topic",
    label: "Off-Topic",
    desc: "Obrolan santai komunitas (10 sub-topik & trivia Top 50, tanpa manga_id)",
  },
];

function formatDateTime(ts?: number | string | null): string {
  if (!ts) return "Belum pernah";
  const date = typeof ts === "number" ? new Date(ts) : new Date(ts);
  if (Number.isNaN(date.getTime())) return "Belum pernah";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatNumber(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const emptySubscribe = () => () => {};

function useClientOrigin(): string {
  return useSyncExternalStore(
    emptySubscribe,
    () => window.location.origin,
    () => ""
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("mangas");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const origin = useClientOrigin();

  // Tab 1: Mangas
  const [mangas, setMangas] = useState<MangaItem[]>([]);
  const [loadingMangas, setLoadingMangas] = useState(false);
  const [syncingMangas, setSyncingMangas] = useState(false);
  const [mangaSearch, setMangaSearch] = useState("");

  // Tab 2: Settings + KoboiLLM + Cron + Live Feed
  const [settings, setSettings] = useState<SettingsState>({
    isPostEnabled: false,
    isLikeEnabled: false,
    isCommentEnabled: false,
    isReactionEnabled: true,
    posterUsername: "mahpudeen",
    likesPerAccountPerRun: 7,
    commentsPerRun: 3,
    koboillmApiKey: "",
    koboillmBaseUrl: "https://api.koboillm.com/v1",
    selectedModel: "gpt-6-luna",
    enabledCategories: [
      "teori",
      "tanya",
      "rekomendasi",
      "polling",
      "off-topic",
    ],
    lastPostRunAt: 0,
    lastLikeRunAt: 0,
    lastCommentRunAt: 0,
  });
  const [cronSecret, setCronSecret] = useState("");
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [testingPost, setTestingPost] = useState(false);
  const [testingLike, setTestingLike] = useState(false);
  const [testResult, setTestResult] = useState<{
    kind: "post" | "like";
    payload: Record<string, unknown>;
  } | null>(null);

  // Tab 3: Auto-Comment
  const [testingComment, setTestingComment] = useState(false);
  const [commentTestResult, setCommentTestResult] =
    useState<CommentTestResponse | null>(null);
  const [latestMangas, setLatestMangas] = useState<LatestMangaPreview[]>([]);
  const [loadingLatest, setLoadingLatest] = useState(false);

  const [livePosts, setLivePosts] = useState<LivePost[]>([]);
  const [liveFeedUser, setLiveFeedUser] = useState("mahpudeen");
  const [loadingFeed, setLoadingFeed] = useState(false);

  // Tab 4: Accounts
  const [accounts, setAccounts] = useState<SafeAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [refreshingAccountId, setRefreshingAccountId] = useState<string | null>(
    null
  );
  const [updatingAccountId, setUpdatingAccountId] = useState<string | null>(
    null
  );
  const [usernameDrafts, setUsernameDrafts] = useState<Record<string, string>>(
    {}
  );
  const [newAccountForm, setNewAccountForm] = useState({
    username: "",
    refreshToken: "",
    accessToken: "",
    clientId: DEFAULT_CLIENT_ID,
    role: "all" as AccountRole,
  });

  const notify = useCallback((type: "success" | "error", text: string) => {
    setToast({ type, text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadMangas = useCallback(async () => {
    setLoadingMangas(true);
    try {
      const res = await fetch("/api/mangas", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal memuat manga.");
      }
      setMangas(data.mangas || []);
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Gagal memuat daftar manga."
      );
    } finally {
      setLoadingMangas(false);
    }
  }, [notify]);

  const loadSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal memuat pengaturan.");
      }
      if (data.settings) {
        setSettings(data.settings);
      }
      setCronSecret(data.cronSecret || "");
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Gagal memuat pengaturan."
      );
    } finally {
      setLoadingSettings(false);
    }
  }, [notify]);

  const loadLiveFeed = useCallback(
    async (usernameOverride?: string) => {
      setLoadingFeed(true);
      try {
        const qs = usernameOverride
          ? `?username=${encodeURIComponent(usernameOverride)}&limit=20`
          : "?limit=20";
        const res = await fetch(`/api/posts${qs}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Gagal memuat live feed post.");
        }
        setLivePosts(data.posts || []);
        setLiveFeedUser(data.username || "mahpudeen");
      } catch (err) {
        notify(
          "error",
          err instanceof Error ? err.message : "Gagal memuat live feed post."
        );
      } finally {
        setLoadingFeed(false);
      }
    },
    [notify]
  );

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const res = await fetch("/api/accounts", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal memuat akun.");
      }
      setAccounts(data.accounts || []);
      const drafts: Record<string, string> = {};
      for (const acc of (data.accounts || []) as SafeAccount[]) {
        drafts[acc.id] = acc.username || "";
      }
      setUsernameDrafts(drafts);
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Gagal memuat daftar akun."
      );
    } finally {
      setLoadingAccounts(false);
    }
  }, [notify]);

  const loadLatestMangas = useCallback(async () => {
    setLoadingLatest(true);
    try {
      const res = await fetch("/api/mangas/latest?limit=20", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal memuat manga update terbaru.");
      }
      setLatestMangas(data.mangas || []);
    } catch (err) {
      notify(
        "error",
        err instanceof Error
          ? err.message
          : "Gagal memuat daftar manga terbaru."
      );
    } finally {
      setLoadingLatest(false);
    }
  }, [notify]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateInitialData() {
      const [mangasRes, settingsRes, accountsRes, feedRes, latestRes] =
        await Promise.allSettled([
          fetch("/api/mangas", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/accounts", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/posts?limit=20", { cache: "no-store" }).then((r) =>
            r.json()
          ),
          fetch("/api/mangas/latest?limit=20", { cache: "no-store" }).then(
            (r) => r.json()
          ),
        ]);

      if (cancelled) return;

      if (mangasRes.status === "fulfilled" && mangasRes.value?.ok) {
        setMangas(mangasRes.value.mangas || []);
      }
      if (settingsRes.status === "fulfilled" && settingsRes.value?.ok) {
        if (settingsRes.value.settings) {
          setSettings(settingsRes.value.settings);
        }
        setCronSecret(settingsRes.value.cronSecret || "");
      }
      if (accountsRes.status === "fulfilled" && accountsRes.value?.ok) {
        const list = (accountsRes.value.accounts || []) as SafeAccount[];
        setAccounts(list);
        const drafts: Record<string, string> = {};
        for (const acc of list) {
          drafts[acc.id] = acc.username || "";
        }
        setUsernameDrafts(drafts);
      }
      if (feedRes.status === "fulfilled" && feedRes.value?.ok) {
        setLivePosts(feedRes.value.posts || []);
        setLiveFeedUser(feedRes.value.username || "mahpudeen");
      }
      if (latestRes.status === "fulfilled" && latestRes.value?.ok) {
        setLatestMangas(latestRes.value.mangas || []);
      }
    }

    void hydrateInitialData();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSyncTop300 = async () => {
    setSyncingMangas(true);
    try {
      const res = await fetch("/api/mangas", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal sinkronisasi Top 300 manga.");
      }
      notify(
        "success",
        `Berhasil sync ${data.syncedCount} manga terpopuler (${data.pagesFetched} halaman, ${data.deletedCount} data lama dibersihkan).`
      );
      await loadMangas();
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Sinkronisasi manga gagal."
      );
    } finally {
      setSyncingMangas(false);
    }
  };

  const handleSaveSettings = async (override?: Partial<SettingsState>) => {
    const nextSettings = override ? { ...settings, ...override } : settings;
    if (override) {
      setSettings(nextSettings);
    }
    setSavingSettings(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextSettings),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal menyimpan pengaturan.");
      }
      setSettings(data.settings);
      notify("success", "Pengaturan Auto-Post & Auto-Like berhasil disimpan.");
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Gagal menyimpan pengaturan."
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const handleFetchModels = async () => {
    setLoadingModels(true);
    try {
      const res = await fetch("/api/koboillm/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKey: settings.koboillmApiKey,
          baseUrl: settings.koboillmBaseUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal memuat model KoboiLLM.");
      }
      const list: string[] = data.models || [];
      setModels(list);
      if (list.length > 0 && !list.includes(settings.selectedModel)) {
        setSettings((prev) => ({ ...prev, selectedModel: list[0] }));
      }
      notify("success", `Berhasil memuat ${list.length} model dari KoboiLLM.`);
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Gagal memuat daftar model."
      );
    } finally {
      setLoadingModels(false);
    }
  };

  const toggleCategory = (cat: PostCategory) => {
    setSettings((prev) => {
      const exists = prev.enabledCategories.includes(cat);
      if (exists && prev.enabledCategories.length === 1) {
        notify("error", "Minimal harus ada 1 kategori post yang aktif.");
        return prev;
      }
      return {
        ...prev,
        enabledCategories: exists
          ? prev.enabledCategories.filter((c) => c !== cat)
          : [...prev.enabledCategories, cat],
      };
    });
  };

  const handleCopyUrl = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      notify("success", "URL Cronjob disalin ke clipboard.");
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      notify("error", "Gagal menyalin URL ke clipboard.");
    }
  };

  const handleTestRunPost = async () => {
    setTestingPost(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/cron/autopost?manual=true", {
        method: "GET",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Test Run Post gagal.");
      }
      setTestResult({ kind: "post", payload: data });
      notify(
        "success",
        `Berhasil membuat post untuk "${data.mangaTitle || data.manga?.title || "Off-Topic (Komunitas)"}" (${data.category}).`
      );
      await Promise.all([
        loadMangas(),
        loadSettings(),
        loadLiveFeed(settings.posterUsername),
      ]);
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Test Run Post gagal."
      );
    } finally {
      setTestingPost(false);
    }
  };

  const handleTestRunLike = async () => {
    setTestingLike(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/cron/autolike?manual=true", {
        method: "GET",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Test Run Like gagal.");
      }
      setTestResult({ kind: "like", payload: data });
      notify(
        "success",
        `Auto-Like selesai: total ${data.totalLikesGiven ?? 0} like diberikan dari ${data.totalVoters ?? 0} akun voter.`
      );
      await Promise.all([
        loadSettings(),
        loadLiveFeed(settings.posterUsername),
      ]);
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Test Run Like gagal."
      );
    } finally {
      setTestingLike(false);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountForm.refreshToken.trim()) {
      notify("error", "refresh_token wajib diisi.");
      return;
    }
    setAddingAccount(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(newAccountForm),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal menambahkan akun.");
      }
      notify(
        "success",
        `Akun ${data.account?.name || ""} berhasil diverifikasi via WorkOS dan disimpan.`
      );
      setNewAccountForm({
        username: "",
        refreshToken: "",
        accessToken: "",
        clientId: DEFAULT_CLIENT_ID,
        role: "all",
      });
      await loadAccounts();
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Gagal menambahkan akun."
      );
    } finally {
      setAddingAccount(false);
    }
  };

  const handleTestRunComment = async () => {
    setTestingComment(true);
    setCommentTestResult(null);
    try {
      const res = await fetch("/api/cron/autocomment?manual=true", {
        method: "GET",
        cache: "no-store",
      });
      const data = (await res.json()) as CommentTestResponse & {
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Test Run Comment gagal.");
      }
      setCommentTestResult(data);
      const auraSummary =
        typeof data.totalAuraGranted === "number" && data.totalAuraGranted > 0
          ? ` • +${data.totalAuraGranted} Aura`
          : "";
      notify(
        "success",
        `Auto-Comment selesai: ${data.totalSent} komentar terkirim via @${data.accountUsername || "-"}${auraSummary} (${data.skippedAlreadyCommented ?? 0} chapter dilewati karena sudah dikomentari).`
      );
      await Promise.all([loadSettings(), loadLatestMangas()]);
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Test Run Comment gagal."
      );
    } finally {
      setTestingComment(false);
    }
  };

  const handleSaveAccountUsername = async (account: SafeAccount) => {
    const nextUsername = (usernameDrafts[account.id] ?? "").trim();
    setUpdatingAccountId(account.id);
    try {
      const res = await fetch("/api/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: account.id, username: nextUsername }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal menyimpan username akun.");
      }
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? data.account : a))
      );
      setUsernameDrafts((prev) => ({
        ...prev,
        [account.id]: data.account?.username || "",
      }));
      notify(
        "success",
        `Username akun ${account.name} disimpan sebagai ${
          data.account?.username ? `@${data.account.username}` : "(kosong)"
        }.`
      );
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Gagal menyimpan username akun."
      );
    } finally {
      setUpdatingAccountId(null);
    }
  };

  const handleRefreshAccount = async (id: string) => {
    setRefreshingAccountId(id);
    try {
      const res = await fetch("/api/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action: "refresh" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal refresh token WorkOS.");
      }
      notify("success", data.message || "Token WorkOS berhasil di-refresh.");
      await loadAccounts();
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Refresh token gagal."
      );
    } finally {
      setRefreshingAccountId(null);
    }
  };

  const handleToggleAccountActive = async (account: SafeAccount) => {
    setUpdatingAccountId(account.id);
    try {
      const res = await fetch("/api/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: account.id, isActive: !account.isActive }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal mengubah status akun.");
      }
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? data.account : a))
      );
      notify(
        "success",
        `Akun ${account.name} ${!account.isActive ? "diaktifkan" : "dinonaktifkan"}.`
      );
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Gagal mengubah status akun."
      );
    } finally {
      setUpdatingAccountId(null);
    }
  };

  const handleChangeAccountRole = async (
    account: SafeAccount,
    role: AccountRole
  ) => {
    setUpdatingAccountId(account.id);
    try {
      const res = await fetch("/api/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: account.id, role }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal mengubah role akun.");
      }
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? data.account : a))
      );
      notify("success", `Role akun ${account.name} diubah menjadi ${role}.`);
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Gagal mengubah role akun."
      );
    } finally {
      setUpdatingAccountId(null);
    }
  };

  const handleDeleteAccount = async (account: SafeAccount) => {
    if (!window.confirm(`Hapus akun "${account.name}" dari Firestore?`)) {
      return;
    }
    setUpdatingAccountId(account.id);
    try {
      const res = await fetch(
        `/api/accounts?id=${encodeURIComponent(account.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal menghapus akun.");
      }
      setAccounts((prev) => prev.filter((a) => a.id !== account.id));
      notify("success", `Akun ${account.name} berhasil dihapus.`);
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Gagal menghapus akun."
      );
    } finally {
      setUpdatingAccountId(null);
    }
  };

  const filteredMangas = useMemo(() => {
    const q = mangaSearch.trim().toLowerCase();
    if (!q) return mangas;
    return mangas.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.countryId.toLowerCase().includes(q) ||
        m.format.toLowerCase().includes(q) ||
        m.genres.some((g) => g.toLowerCase().includes(q)) ||
        String(m.popularityRank) === q
    );
  }, [mangas, mangaSearch]);

  const mangaStats = useMemo(() => {
    const posted = mangas.filter((m) => m.lastPostedAt > 0).length;
    return {
      total: mangas.length,
      posted,
      unposted: mangas.length - posted,
    };
  }, [mangas]);

  const secretQuery = cronSecret
    ? `?secret=${encodeURIComponent(cronSecret)}`
    : "?secret=ISI_CRON_SECRET_ANDA";
  const cronPostUrl = `${origin || "https://domain-anda.vercel.app"}/api/cron/autopost${secretQuery}`;
  const cronLikeUrl = `${origin || "https://domain-anda.vercel.app"}/api/cron/autolike${secretQuery}`;
  const cronCommentUrl = `${origin || "https://domain-anda.vercel.app"}/api/cron/autocomment${secretQuery}`;

  const modelChoices = useMemo(() => {
    const set = new Set<string>(models);
    if (settings.selectedModel) {
      set.add(settings.selectedModel);
    }
    return Array.from(set);
  }, [models, settings.selectedModel]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
      notify("error", "Gagal keluar dari sesi.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 ring-1 ring-indigo-500/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">
                Shinigami Auto-Post & Auto-Like
              </h1>
              <p className="text-xs text-slate-400">
                Serverless Dashboard • Firestore Spark Plan + KoboiLLM
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ring-1 ${
                settings.isPostEnabled
                  ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                  : "bg-slate-800 text-slate-400 ring-slate-700"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  settings.isPostEnabled ? "bg-emerald-400" : "bg-slate-500"
                }`}
              />
              Auto-Post: {settings.isPostEnabled ? "ON" : "OFF"}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ring-1 ${
                settings.isLikeEnabled
                  ? "bg-pink-500/10 text-pink-300 ring-pink-500/30"
                  : "bg-slate-800 text-slate-400 ring-slate-700"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  settings.isLikeEnabled ? "bg-pink-400" : "bg-slate-500"
                }`}
              />
              Auto-Like: {settings.isLikeEnabled ? "ON" : "OFF"}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ring-1 ${
                settings.isCommentEnabled
                  ? "bg-cyan-500/10 text-cyan-300 ring-cyan-500/30"
                  : "bg-slate-800 text-slate-400 ring-slate-700"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  settings.isCommentEnabled ? "bg-cyan-400" : "bg-slate-500"
                }`}
              />
              Auto-Comment: {settings.isCommentEnabled ? "ON" : "OFF"}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/90 bg-slate-900 px-3 py-1 font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white disabled:opacity-50"
              title="Keluar dari Dashboard"
            >
              {loggingOut ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
              Keluar
            </button>
          </div>
        </div>

        {/* 3-Tab Navigation */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <nav className="flex gap-1 overflow-x-auto" aria-label="Menu Utama">
            <button
              type="button"
              onClick={() => setActiveTab("mangas")}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === "mangas"
                  ? "border-indigo-500 text-white"
                  : "border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              List Manga
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                {mangas.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("autopost")}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === "autopost"
                  ? "border-indigo-500 text-white"
                  : "border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200"
              }`}
            >
              <Bot className="h-4 w-4" />
              Auto-Post
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("autocomment")}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === "autocomment"
                  ? "border-indigo-500 text-white"
                  : "border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200"
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              Auto-Comment
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("accounts")}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === "accounts"
                  ? "border-indigo-500 text-white"
                  : "border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200"
              }`}
            >
              <Users className="h-4 w-4" />
              Akun
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                {accounts.length}
              </span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Toast Notification */}
        {toast && (
          <div
            className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
              toast.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-rose-500/30 bg-rose-500/10 text-rose-200"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            )}
            <span className="flex-1">{toast.text}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-xs opacity-70 hover:opacity-100"
            >
              Tutup
            </button>
          </div>
        )}

        {/* ==================== TAB 1: LIST MANGA ==================== */}
        {activeTab === "mangas" && (
          <section className="space-y-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Top 300 Manga Terpopuler Shinigami
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Urutan posting menggunakan antrian adil berdasarkan{" "}
                  <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">
                    lastPostedAt ASC
                  </code>{" "}
                  (hanya 1 Firestore Read per cron post).
                </p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-300">
                  <span className="rounded-lg bg-slate-800/80 px-2.5 py-1">
                    Tersimpan: <strong>{mangaStats.total}</strong> / 300
                  </span>
                  <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
                    Sudah Diposting: <strong>{mangaStats.posted}</strong>
                  </span>
                  <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-amber-300">
                    Antrian Berikutnya: <strong>{mangaStats.unposted}</strong>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadMangas()}
                  disabled={loadingMangas || syncingMangas}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loadingMangas ? "animate-spin" : ""}`}
                  />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={handleSyncTop300}
                  disabled={syncingMangas}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {syncingMangas ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {syncingMangas
                    ? "Menyinkronkan 300 Manga..."
                    : "Sync Top 300 Manga Terpopuler"}
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={mangaSearch}
                onChange={(e) => setMangaSearch(e.target.value)}
                placeholder="Cari judul manga, genre, negara (KR/JP/CN), format, atau rank #..."
                className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2.5 pr-4 pl-10 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* Manga Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-800 bg-slate-900/90 text-xs tracking-wide text-slate-400 uppercase">
                    <tr>
                      <th className="px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Judul & Genre</th>
                      <th className="px-4 py-3">Chapter</th>
                      <th className="px-4 py-3">Views / Rating</th>
                      <th className="px-4 py-3">Post Count</th>
                      <th className="px-4 py-3">Terakhir Diposting</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {loadingMangas && mangas.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-12 text-center text-slate-400"
                        >
                          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-indigo-400" />
                          Memuat daftar manga dari Firestore...
                        </td>
                      </tr>
                    ) : filteredMangas.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-12 text-center text-slate-400"
                        >
                          {mangas.length === 0
                            ? 'Belum ada data manga. Klik tombol "Sync Top 300 Manga Terpopuler" di atas.'
                            : "Tidak ada manga yang cocok dengan pencarian."}
                        </td>
                      </tr>
                    ) : (
                      filteredMangas.map((manga) => (
                        <tr
                          key={manga.mangaId}
                          className="transition hover:bg-slate-800/40"
                        >
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-indigo-300">
                            #{manga.popularityRank}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {manga.coverImageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={manga.coverImageUrl}
                                  alt={manga.title}
                                  loading="lazy"
                                  className="h-12 w-9 shrink-0 rounded-md border border-slate-700 object-cover bg-slate-800"
                                />
                              ) : (
                                <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md bg-slate-800 text-xs text-slate-500">
                                  ?
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="truncate font-medium text-white max-w-xs sm:max-w-md">
                                  {manga.title}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                                  {manga.countryId && (
                                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-semibold text-slate-300">
                                      {manga.countryId}
                                    </span>
                                  )}
                                  {manga.format && (
                                    <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-indigo-300">
                                      {manga.format}
                                    </span>
                                  )}
                                  {manga.genres.slice(0, 3).map((g) => (
                                    <span
                                      key={g}
                                      className="rounded bg-slate-800/70 px-1.5 py-0.5"
                                    >
                                      {g}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-200">
                            Ch. {manga.latestChapterNumber || "-"}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-300">
                            <div>{formatNumber(manga.viewCount)} views</div>
                            <div className="text-amber-300">
                              ★ {manga.userRate ? manga.userRate.toFixed(1) : "-"}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                manga.postCount > 0
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {manga.postCount}x
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                            {formatDateTime(manga.lastPostedAt)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ==================== TAB 2: AUTO-POST & AUTO-LIKE ==================== */}
        {activeTab === "autopost" && (
          <section className="space-y-6">
            {/* Saklar ON/OFF Cron */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-400" />
                    <h3 className="text-sm font-semibold text-white">
                      Cron Auto-Post (Tiap 15 Menit)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400">
                    Generate 1 diskusi komik via KoboiLLM & posting otomatis ke
                    Shinigami.
                  </p>
                  <p className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-400">
                    <Clock className="h-3.5 w-3.5" />
                    Terakhir jalan: {formatDateTime(settings.lastPostRunAt)}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.isPostEnabled}
                  disabled={savingSettings || loadingSettings}
                  onClick={() =>
                    void handleSaveSettings({
                      isPostEnabled: !settings.isPostEnabled,
                    })
                  }
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    settings.isPostEnabled ? "bg-emerald-500" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                      settings.isPostEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Heart className="h-4 w-4 text-pink-400" />
                    <h3 className="text-sm font-semibold text-white">
                      Cron Auto-Like (Tiap 2–3 Jam)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400">
                    Acak hingga {settings.likesPerAccountPerRun} post belum
                    di-like dari{" "}
                    <span className="font-mono text-slate-200">
                      @{settings.posterUsername}
                    </span>{" "}
                    per akun voter.
                  </p>
                  <p className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-400">
                    <Clock className="h-3.5 w-3.5" />
                    Terakhir jalan: {formatDateTime(settings.lastLikeRunAt)}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.isLikeEnabled}
                  disabled={savingSettings || loadingSettings}
                  onClick={() =>
                    void handleSaveSettings({
                      isLikeEnabled: !settings.isLikeEnabled,
                    })
                  }
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    settings.isLikeEnabled ? "bg-pink-500" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                      settings.isLikeEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Pengaturan KoboiLLM & Kategori */}
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    Konfigurasi KoboiLLM & Kategori Post
                  </h3>
                  <button
                    type="button"
                    onClick={() => void handleSaveSettings()}
                    disabled={savingSettings}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {savingSettings ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Simpan Pengaturan
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-300">
                      KoboiLLM Base URL
                    </label>
                    <input
                      type="url"
                      value={settings.koboillmBaseUrl}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          koboillmBaseUrl: e.target.value,
                        }))
                      }
                      placeholder="https://api.koboillm.com/v1"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-300">
                      KoboiLLM API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? "text" : "password"}
                        value={settings.koboillmApiKey}
                        onChange={(e) =>
                          setSettings((p) => ({
                            ...p,
                            koboillmApiKey: e.target.value,
                          }))
                        }
                        placeholder="sk-xxxxxx"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pr-9 pl-3 text-xs text-white focus:border-indigo-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey((v) => !v)}
                        className="absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                        aria-label="Toggle API Key visibility"
                      >
                        {showApiKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Model Dropdown + Muat Model */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-300">
                    Model KoboiLLM
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      value={settings.selectedModel}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          selectedModel: e.target.value,
                        }))
                      }
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    >
                      {modelChoices.map((modelId) => (
                        <option key={modelId} value={modelId}>
                          {modelId}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleFetchModels}
                      disabled={loadingModels}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                    >
                      {loadingModels ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Muat Model
                    </button>
                  </div>
                </div>

                {/* Target Username & Likes Per Account */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-300">
                      Target Poster Username (Auto-Like & Feed)
                    </label>
                    <input
                      type="text"
                      value={settings.posterUsername}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          posterUsername: e.target.value,
                        }))
                      }
                      placeholder="mahpudeen"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-300">
                      Maksimal Like / Akun / Run
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={settings.likesPerAccountPerRun}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          likesPerAccountPerRun: Math.max(
                            1,
                            Math.min(20, Number(e.target.value) || 7)
                          ),
                        }))
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Checkbox Kategori */}
                <div>
                  <label className="mb-2 block text-xs font-medium text-slate-300">
                    Kategori Post Aktif
                  </label>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {CATEGORY_OPTIONS.map((cat) => {
                      const checked = settings.enabledCategories.includes(
                        cat.key
                      );
                      return (
                        <label
                          key={cat.key}
                          className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition ${
                            checked
                              ? "border-indigo-500/50 bg-indigo-500/10"
                              : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCategory(cat.key)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 accent-indigo-500"
                          />
                          <div>
                            <div className="text-xs font-semibold text-white">
                              {cat.label}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {cat.desc}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* URL Cronjob & Test Run */}
              <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2">
                <h3 className="text-sm font-semibold text-white">
                  Endpoint Cronjob & Test Run
                </h3>
                <p className="text-xs text-slate-400">
                  Salin kedua URL di bawah ke{" "}
                  <span className="text-slate-200">Cron-job.org</span> atau{" "}
                  <span className="text-slate-200">Vercel Cron</span>. Test Run
                  mengabaikan saklar OFF agar bisa diuji langsung.
                </p>

                {/* Cron 1: Auto-Post */}
                <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-indigo-300">
                      1. Auto-Post (Tiap 15 Menit)
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyUrl("post", cronPostUrl)}
                      className="inline-flex items-center gap-1 text-slate-300 hover:text-white"
                    >
                      {copiedKey === "post" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Salin
                    </button>
                  </div>
                  <code className="block break-all rounded-lg bg-slate-900 p-2 font-mono text-[11px] text-slate-300">
                    {cronPostUrl}
                  </code>
                  <button
                    type="button"
                    onClick={handleTestRunPost}
                    disabled={testingPost}
                    className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600/90 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {testingPost ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {testingPost ? "Menjalankan Auto-Post..." : "Test Run Post"}
                  </button>
                </div>

                {/* Cron 2: Auto-Like */}
                <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-pink-300">
                      2. Auto-Like (Tiap 2–3 Jam)
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyUrl("like", cronLikeUrl)}
                      className="inline-flex items-center gap-1 text-slate-300 hover:text-white"
                    >
                      {copiedKey === "like" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Salin
                    </button>
                  </div>
                  <code className="block break-all rounded-lg bg-slate-900 p-2 font-mono text-[11px] text-slate-300">
                    {cronLikeUrl}
                  </code>
                  <button
                    type="button"
                    onClick={handleTestRunLike}
                    disabled={testingLike}
                    className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-pink-600/90 px-3 py-2 text-xs font-semibold text-white transition hover:bg-pink-500 disabled:opacity-50"
                  >
                    {testingLike ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ThumbsUp className="h-3.5 w-3.5" />
                    )}
                    {testingLike ? "Menjalankan Auto-Like..." : "Test Run Like"}
                  </button>
                </div>

                {/* Output Test Run */}
                {testResult && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
                    <div className="mb-1.5 font-semibold text-emerald-300">
                      Hasil Test Run{" "}
                      {testResult.kind === "post" ? "Auto-Post" : "Auto-Like"}
                    </div>
                    <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950/90 p-2.5 font-mono text-[11px] text-slate-300">
                      {JSON.stringify(testResult.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            {/* Live Feed Post Shinigami */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Live Feed Post (@{liveFeedUser})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Ditarik langsung dari{" "}
                    <code className="text-slate-300">
                      GET /v1/user/{liveFeedUser}/posts?limit=20
                    </code>{" "}
                    tanpa menyimpan log ke Firestore.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadLiveFeed(settings.posterUsername)}
                  disabled={loadingFeed}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${loadingFeed ? "animate-spin" : ""}`}
                  />
                  Refresh Feed
                </button>
              </div>

              {loadingFeed && livePosts.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-indigo-400" />
                  Mengambil live feed dari Shinigami...
                </div>
              ) : livePosts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 py-10 text-center text-xs text-slate-400">
                  Belum ada postingan ditemukan untuk @{liveFeedUser}.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {livePosts.map((post) => {
                    const resolvedMangaTitle =
                      post.manga_title || post.manga?.title || "";
                    const isOffTopic =
                      post.category === "off-topic" || !resolvedMangaTitle;

                    return (
                      <article
                        key={post.id}
                        className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/70 p-4"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                            {isOffTopic ? (
                              <span className="rounded bg-purple-500/15 px-2 py-0.5 font-medium text-purple-300 ring-1 ring-purple-500/30">
                                Off-Topic
                              </span>
                            ) : (
                              <span className="rounded bg-indigo-500/15 px-2 py-0.5 font-medium text-indigo-300">
                                {resolvedMangaTitle}
                              </span>
                            )}
                            {post.is_spoiler && (
                              <span className="rounded bg-rose-500/15 px-2 py-0.5 font-medium text-rose-300">
                                Spoiler
                              </span>
                            )}
                            {post.poll?.options &&
                              post.poll.options.length > 0 && (
                                <span className="rounded bg-amber-500/15 px-2 py-0.5 font-medium text-amber-300">
                                  Polling
                                </span>
                              )}
                          </div>
                          <h4 className="mt-2 text-sm font-semibold text-white">
                            {post.title || "(Tanpa Judul)"}
                          </h4>
                          <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-slate-300">
                            {post.content}
                          </p>

                          {post.poll?.options && post.poll.options.length > 0 && (
                            <ul className="mt-3 space-y-1.5">
                              {post.poll.options.map((opt, idx) => (
                                <li
                                  key={opt.id || idx}
                                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-[11px] text-slate-300"
                                >
                                  <span>
                                    {opt.text || opt.option || `Opsi ${idx + 1}`}
                                  </span>
                                  <span className="font-mono text-slate-400">
                                    {opt.vote_count ?? opt.votes_count ?? 0}{" "}
                                    suara
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2.5 text-[11px] text-slate-400">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex items-center gap-1 text-pink-300">
                              <Heart className="h-3.5 w-3.5" />
                              {post.like_count ?? 0}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MessageSquare className="h-3.5 w-3.5" />
                              {post.comment_count ?? 0}
                            </span>
                          </div>
                          <span>{formatDateTime(post.created_at)}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ==================== TAB 3: AUTO-COMMENT ==================== */}
        {activeTab === "autocomment" && (
          <section className="space-y-6">
            {/* Saklar ON/OFF + Konfigurasi + URL Cronjob */}
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-cyan-400" />
                      <h2 className="text-sm font-semibold text-white">
                        Cron Auto-Comment Chapter Terbaru (Template-Based)
                      </h2>
                    </div>
                    <p className="text-xs text-slate-400">
                      Tanpa KoboiLLM & tanpa Auto-Like. Otomatis mengirim
                      komentar ke chapter terbaru yang belum dikomentari oleh
                      akun commenter (template apresiasi admin untuk{" "}
                      <span className="text-emerald-300 font-medium">
                        Project
                      </span>{" "}
                      dan komentar santai untuk{" "}
                      <span className="text-slate-300 font-medium">Mirror</span>
                      ).
                    </p>
                    <p className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-400">
                      <Clock className="h-3.5 w-3.5" />
                      Terakhir jalan: {formatDateTime(settings.lastCommentRunAt)}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.isCommentEnabled}
                    disabled={savingSettings || loadingSettings}
                    onClick={() =>
                      void handleSaveSettings({
                        isCommentEnabled: !settings.isCommentEnabled,
                      })
                    }
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      settings.isCommentEnabled ? "bg-cyan-500" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                        settings.isCommentEnabled
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="grid gap-4 border-t border-slate-800/80 pt-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-300">
                      Jumlah Chapter per Cron Run (1–10)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={settings.commentsPerRun}
                        onChange={(e) =>
                          setSettings((p) => ({
                            ...p,
                            commentsPerRun: Math.max(
                              1,
                              Math.min(10, Number(e.target.value) || 3)
                            ),
                          }))
                        }
                        className="w-28 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void handleSaveSettings({
                            commentsPerRun: settings.commentsPerRun,
                          })
                        }
                        disabled={savingSettings}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
                      >
                        {savingSettings ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        Simpan
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
                    <div className="font-medium text-slate-200">
                      Akun Commenter Aktif
                    </div>
                    <p className="mt-1 text-[11px]">
                      {
                        accounts.filter(
                          (a) =>
                            a.isActive &&
                            Boolean(a.username) &&
                            (a.role === "commenter" ||
                              a.role === "both" ||
                              a.role === "all")
                        ).length
                      }{" "}
                      akun siap jalan (punya{" "}
                      <code className="text-slate-200">username</code> & role{" "}
                      <code className="text-slate-200">
                        commenter / both / all
                      </code>
                      ). Atur username di tab <strong>Akun</strong>.
                    </p>
                  </div>
                </div>

                {/* Toggle Auto-Reaction Chapter (+10 Aura) */}
                <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
                      <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                      Auto-Reaction Chapter (+10 Aura/hari)
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Otomatis kirim page reaction setelah komentar sukses
                      (weighted random: 70% Reaction #1, 30% #2–#4). Non-blocking
                      jika kuota aura harian sudah habis.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.isReactionEnabled}
                    disabled={savingSettings || loadingSettings}
                    onClick={() =>
                      void handleSaveSettings({
                        isReactionEnabled: !settings.isReactionEnabled,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      settings.isReactionEnabled
                        ? "bg-amber-500"
                        : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                        settings.isReactionEnabled
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Output Test Run Comment */}
                {commentTestResult && (
                  <div className="space-y-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-cyan-300">
                        Hasil Test Run Auto-Comment ({commentTestResult.totalSent}
                        /{commentTestResult.targetCount} terkirim)
                      </span>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        {typeof commentTestResult.totalAuraGranted ===
                          "number" && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-300 ring-1 ring-amber-500/30">
                            +{commentTestResult.totalAuraGranted} Aura
                            {typeof commentTestResult.auraRemainingToday ===
                            "number"
                              ? ` (Sisa hari ini: ${commentTestResult.auraRemainingToday})`
                              : ""}
                          </span>
                        )}
                        <span>
                          Akun: @{commentTestResult.accountUsername || "-"} • Skip
                          duplikat:{" "}
                          {commentTestResult.skippedAlreadyCommented ?? 0}
                        </span>
                      </div>
                    </div>

                    {commentTestResult.results.length === 0 ? (
                      <p className="text-xs text-slate-400">
                        Semua chapter terbaru sudah dikomentari oleh akun ini.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {commentTestResult.results.map((item, idx) => (
                          <div
                            key={`${item.chapterId}-${idx}`}
                            className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-white">
                                {item.mangaTitle}
                              </span>
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
                                Ch. {item.chapterNumber}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                  item.isProject
                                    ? "bg-emerald-500/15 text-emerald-300"
                                    : "bg-slate-800 text-slate-400"
                                }`}
                              >
                                {item.isProject ? "Project" : "Mirror"}
                              </span>
                              {item.reactionSent && (
                                <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-amber-500/30">
                                  Reaction #{item.myReaction ?? item.reactionId ?? 1}
                                  {typeof item.auraGranted === "number"
                                    ? ` • +${item.auraGranted} Aura`
                                    : ""}
                                  {typeof item.auraRemainingToday === "number"
                                    ? ` (Sisa kuota hari ini: ${item.auraRemainingToday})`
                                    : ""}
                                </span>
                              )}
                              {!item.reactionSent && item.reactionError && (
                                <span className="rounded bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-300">
                                  Reaction gagal: {item.reactionError}
                                </span>
                              )}
                            </div>
                            <p className="mt-1.5 text-slate-300">
                              &ldquo;{item.content}&rdquo;
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* URL Cronjob & Tombol Test Run */}
              <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2 h-fit">
                <h3 className="text-sm font-semibold text-white">
                  Endpoint Cronjob Auto-Comment
                </h3>
                <p className="text-xs text-slate-400">
                  Jadwalkan di <span className="text-slate-200">Cron-job.org</span>{" "}
                  setiap <strong>15–30 menit</strong>. Jeda acak 1.5–2.5 detik
                  diterapkan antar komentar.
                </p>

                <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-cyan-300">
                      Auto-Comment ({settings.commentsPerRun} Chapter/Run)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopyUrl("comment", cronCommentUrl)
                      }
                      className="inline-flex items-center gap-1 text-slate-300 hover:text-white"
                    >
                      {copiedKey === "comment" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Salin
                    </button>
                  </div>
                  <code className="block break-all rounded-lg bg-slate-900 p-2 font-mono text-[11px] text-slate-300">
                    {cronCommentUrl}
                  </code>
                  <button
                    type="button"
                    onClick={handleTestRunComment}
                    disabled={testingComment}
                    className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600/90 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
                  >
                    {testingComment ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {testingComment
                      ? `Mengirim ${settings.commentsPerRun} Komentar...`
                      : `Test Run Comment (${settings.commentsPerRun} Chapter)`}
                  </button>
                </div>
              </div>
            </div>

            {/* Preview Daftar Manga Update Terbaru */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Preview Manga Update Terbaru (Live API Shinigami)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Ditarik langsung dari{" "}
                    <code className="text-slate-300">
                      GET /v1/manga/list?sort=latest&amp;is_update=true
                    </code>{" "}
                    (tanpa disimpan ke Firestore).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadLatestMangas()}
                  disabled={loadingLatest}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      loadingLatest ? "animate-spin" : ""
                    }`}
                  />
                  Refresh Terbaru
                </button>
              </div>

              {loadingLatest && latestMangas.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-cyan-400" />
                  Mengambil daftar update terbaru dari Shinigami...
                </div>
              ) : latestMangas.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 py-10 text-center text-xs text-slate-400">
                  Belum ada data manga terbaru.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {latestMangas.map((m) => (
                    <div
                      key={m.manga_id}
                      className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5"
                    >
                      {m.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.cover_image_url}
                          alt={m.title}
                          loading="lazy"
                          className="h-14 w-10 shrink-0 rounded-md border border-slate-700 object-cover bg-slate-800"
                        />
                      ) : (
                        <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md bg-slate-800 text-xs text-slate-500">
                          ?
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate text-sm font-semibold text-white max-w-[230px] sm:max-w-xs">
                            {m.title}
                          </h4>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              m.isProject
                                ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                                : "bg-slate-800 text-slate-400 ring-1 ring-slate-700"
                            }`}
                          >
                            {m.isProject ? "Project" : m.typeLabel || "Mirror"}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {m.chapters.length} chapter terbaru
                          {m.format ? ` • ${m.format}` : ""}
                          {m.country_id ? ` • ${m.country_id}` : ""}
                        </p>
                        {m.chapters.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {m.chapters.slice(0, 4).map((ch) => (
                              <span
                                key={ch.chapter_id}
                                className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-300 ring-1 ring-slate-800"
                              >
                                Ch. {ch.chapter_number}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ==================== TAB 4: AKUN ==================== */}
        {activeTab === "accounts" && (
          <section className="grid gap-6 lg:grid-cols-5">
            {/* Form Tambah Akun */}
            <form
              onSubmit={handleAddAccount}
              className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2 h-fit"
            >
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-indigo-400" />
                <h2 className="text-sm font-semibold text-white">
                  Tambah Akun Shinigami (WorkOS)
                </h2>
              </div>
              <p className="text-xs text-slate-400">
                Masukkan <code className="text-slate-200">refresh_token</code>{" "}
                dari sesi WorkOS. Nama, email, dan avatar akan otomatis ditarik
                dari WorkOS serta token langsung dirotasi & disimpan ke
                Firestore.
              </p>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-300">
                  Username Shinigami (untuk Anti-Duplikat Auto-Comment)
                </label>
                <input
                  type="text"
                  value={newAccountForm.username}
                  onChange={(e) =>
                    setNewAccountForm((p) => ({
                      ...p,
                      username: e.target.value,
                    }))
                  }
                  placeholder="contoh: mahpudeen"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-300">
                  Refresh Token <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={newAccountForm.refreshToken}
                  onChange={(e) =>
                    setNewAccountForm((p) => ({
                      ...p,
                      refreshToken: e.target.value,
                    }))
                  }
                  placeholder="Tempel refresh_token WorkOS..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 font-mono text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-300">
                  Access Token (Opsional — akan diperbarui otomatis)
                </label>
                <textarea
                  rows={2}
                  value={newAccountForm.accessToken}
                  onChange={(e) =>
                    setNewAccountForm((p) => ({
                      ...p,
                      accessToken: e.target.value,
                    }))
                  }
                  placeholder="eyJhbGciOi..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 font-mono text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-300">
                    Peran (Role)
                  </label>
                  <select
                    value={newAccountForm.role}
                    onChange={(e) =>
                      setNewAccountForm((p) => ({
                        ...p,
                        role: e.target.value as AccountRole,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="all">All (Post + Like + Comment)</option>
                    <option value="both">Both (Post + Like + Comment)</option>
                    <option value="poster">Poster saja</option>
                    <option value="voter">Voter saja (Auto-Like)</option>
                    <option value="commenter">Commenter saja (Auto-Comment)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-300">
                    WorkOS Client ID
                  </label>
                  <input
                    type="text"
                    value={newAccountForm.clientId}
                    onChange={(e) =>
                      setNewAccountForm((p) => ({
                        ...p,
                        clientId: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={addingAccount}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {addingAccount ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {addingAccount
                  ? "Memverifikasi ke WorkOS..."
                  : "Tambah Akun & Ekstrak Profil"}
              </button>
            </form>

            {/* Daftar Akun */}
            <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Daftar Multi-Akun ({accounts.length})
                  </h2>
                  <p className="text-xs text-slate-400">
                    Token refresh WorkOS bersifat single-use dan otomatis
                    disimpan ulang tiap kali refresh berhasil.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadAccounts()}
                  disabled={loadingAccounts}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      loadingAccounts ? "animate-spin" : ""
                    }`}
                  />
                  Refresh
                </button>
              </div>

              {loadingAccounts && accounts.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-indigo-400" />
                  Memuat daftar akun...
                </div>
              ) : accounts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 py-12 text-center text-xs text-slate-400">
                  Belum ada akun terdaftar. Tambahkan akun poster/voter di form
                  sebelah kiri.
                </div>
              ) : (
                <div className="space-y-3">
                  {accounts.map((acc) => (
                    <div
                      key={acc.id}
                      className={`rounded-xl border p-4 transition ${
                        acc.isActive
                          ? "border-slate-800 bg-slate-950/70"
                          : "border-slate-800/60 bg-slate-950/30 opacity-65"
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          {acc.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={acc.avatarUrl}
                              alt={acc.name}
                              className="h-10 w-10 shrink-0 rounded-full border border-slate-700 object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-bold text-indigo-300">
                              {acc.name.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold text-white">
                                {acc.name}
                              </p>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                  acc.isActive
                                    ? "bg-emerald-500/15 text-emerald-300"
                                    : "bg-slate-800 text-slate-400"
                                }`}
                              >
                                {acc.isActive ? "Aktif" : "Nonaktif"}
                              </span>
                            </div>
                            <p className="truncate text-xs text-slate-400">
                              {acc.email || "-"}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={acc.role}
                            disabled={updatingAccountId === acc.id}
                            onChange={(e) =>
                              void handleChangeAccountRole(
                                acc,
                                e.target.value as AccountRole
                              )
                            }
                            className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="all">all</option>
                            <option value="both">both</option>
                            <option value="poster">poster</option>
                            <option value="voter">voter</option>
                            <option value="commenter">commenter</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => void handleRefreshAccount(acc.id)}
                            disabled={refreshingAccountId === acc.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1.5 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/20 disabled:opacity-50"
                          >
                            {refreshingAccountId === acc.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Test Refresh Token
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleToggleAccountActive(acc)}
                            disabled={updatingAccountId === acc.id}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                              acc.isActive
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                            }`}
                          >
                            {acc.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDeleteAccount(acc)}
                            disabled={updatingAccountId === acc.id}
                            aria-label={`Hapus akun ${acc.name}`}
                            className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-1.5 text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Inline Edit Username Shinigami */}
                      <div className="mt-3 flex flex-col gap-2 border-t border-slate-800/70 pt-3 sm:flex-row sm:items-center">
                        <label className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
                          Username Shinigami:
                        </label>
                        <div className="flex flex-1 items-center gap-2">
                          <input
                            type="text"
                            value={usernameDrafts[acc.id] ?? acc.username ?? ""}
                            onChange={(e) =>
                              setUsernameDrafts((prev) => ({
                                ...prev,
                                [acc.id]: e.target.value,
                              }))
                            }
                            placeholder="contoh: mahpudeen"
                            className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={
                              updatingAccountId === acc.id ||
                              (usernameDrafts[acc.id] ?? acc.username ?? "").trim() ===
                                (acc.username || "")
                            }
                            onClick={() => void handleSaveAccountUsername(acc)}
                            className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-40"
                          >
                            <Save className="h-3 w-3" />
                            Simpan Username
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/70 pt-2.5 text-[11px] text-slate-400">
                        <div className="flex flex-wrap gap-3 font-mono">
                          <span>AT: {acc.accessTokenPreview || "-"}</span>
                          <span>RT: {acc.refreshTokenPreview || "-"}</span>
                        </div>
                        <span>Update: {formatDateTime(acc.updatedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
