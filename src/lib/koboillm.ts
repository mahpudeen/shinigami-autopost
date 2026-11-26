import {
  DEFAULT_KOBOILLM_BASE_URL,
  type MangaDoc,
  type PostCategory,
} from "@/lib/firebase-admin";

export interface GeneratedPostContent {
  title: string;
  content: string;
  is_spoiler: boolean;
  poll_options?: string[];
}

export function sanitizeBaseUrl(rawUrl?: string): string {
  if (!rawUrl || !rawUrl.trim()) return DEFAULT_KOBOILLM_BASE_URL;
  let cleaned = rawUrl.trim();
  const mdMatch = cleaned.match(/\((https?:\/\/[^\s)]+)\)/);
  if (mdMatch) {
    cleaned = mdMatch[1];
  } else {
    cleaned = cleaned.replace(/^\[+/, "").replace(/\]+$/, "");
  }
  return cleaned.replace(/\/+$/, "");
}

function isReasoningModelName(modelName: string): boolean {
  const lower = modelName.toLowerCase();
  return (
    lower.includes("luna") ||
    lower.includes("sol") ||
    lower.includes("astra") ||
    lower.includes("terra") ||
    lower.includes("gpt-5") ||
    lower.includes("o1") ||
    lower.includes("o3") ||
    lower.includes("reason") ||
    lower.includes("r1")
  );
}

export async function fetchKoboiModels(
  apiKey: string,
  baseUrl?: string
): Promise<string[]> {
  const key = apiKey.trim();
  if (!key) {
    throw new Error("KoboiLLM API Key wajib diisi.");
  }

  const endpoint = `${sanitizeBaseUrl(baseUrl)}/models`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${key}`,
    },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

  const json = (await response.json().catch(() => ({}))) as {
    data?: Array<{ id?: string; mode?: string }>;
    error?: { message?: string };
    message?: string;
  };

  if (!response.ok) {
    const errMsg =
      json?.error?.message ||
      json?.message ||
      `Gagal memuat model KoboiLLM (HTTP ${response.status})`;
    throw new Error(errMsg);
  }

  const models = Array.isArray(json.data)
    ? json.data
        .filter((m) => {
          if (!m?.id) return false;
          if (m.mode && m.mode !== "chat") return false;
          const lower = m.id.toLowerCase();
          if (
            lower.includes("image") ||
            lower.includes("embedding") ||
            lower.includes("whisper") ||
            lower.includes("tts")
          ) {
            return false;
          }
          return true;
        })
        .map((m) => m.id!.trim())
        .sort((a, b) => a.localeCompare(b))
    : [];

  return Array.from(new Set(models));
}

function buildPostPrompts(
  manga: MangaDoc,
  category: PostCategory
): { systemPrompt: string; userPrompt: string } {
  const genreText = manga.genres.length > 0 ? manga.genres.join(", ") : "Komik";
  const formatText = manga.format || "Manga/Manhwa";
  const chapterText =
    manga.latestChapterNumber > 0
      ? `Chapter terbaru saat ini: ${manga.latestChapterNumber}`
      : "Chapter terbaru";

  let categoryInstruction = "";
  if (category === "teori") {
    categoryInstruction = [
      "- Kategori: TEORI / SPEKULASI.",
      `- Buat prediksi atau spekulasi alur cerita seru seputar ${chapterText}, misteri alur, atau kekuatan karakter.`,
      "- is_spoiler WAJIB bernilai true.",
    ].join("\n");
  } else if (category === "tanya") {
    categoryInstruction = [
      "- Kategori: PERTANYAAN / DISKUSI.",
      "- Buat pertanyaan santai terbuka yang memancing komentar pembaca lain (pendapat arc sekarang, pacing cerita, art-nya, atau karakter).",
      "- is_spoiler WAJIB bernilai false.",
    ].join("\n");
  } else if (category === "polling") {
    categoryInstruction = [
      "- Kategori: POLLING / VOTING KOMUNITAS.",
      `- Buat 1 topik polling debat seru relevan dengan "${manga.title}" (${formatText}, ${genreText}).`,
      "- Jika tahu nama karakter ikonik dari komik tersebut gunakan nama aslinya; jika tidak, buat 3-4 opsi peran/skenario cerita yang natural dan spesifik.",
      "- title: Pertanyaan singkat & menarik (maks 60 karakter).",
      "- content: Pengantar 1-2 kalimat mengajak pembaca ikut vote.",
      "- poll_options: WAJIB berisi array 3 sampai 4 string opsi jawaban singkat (maks 80 karakter per opsi).",
      "- is_spoiler WAJIB bernilai false.",
    ].join("\n");
  } else {
    categoryInstruction = [
      "- Kategori: REKOMENDASI / REVIEW SINGKAT.",
      `- Ulas singkat daya tarik komik ini (${formatText}, ${genreText}) untuk mengajak orang lain ikut membaca.`,
      "- is_spoiler WAJIB bernilai false.",
    ].join("\n");
  }

  const systemPrompt = [
    "Kamu adalah pembaca aktif komunitas forum komik/manhwa/manga Indonesia di Shinigami.",
    "Tugasmu membuat 1 postingan forum komunitas yang menarik, hidup, dan natural.",
    'PENTING: WAJIB membalas HANYA dalam format JSON valid murni tanpa markdown code block (```json) dengan skema:',
    '{ "title": "Judul diskusi menarik (maks 100 karakter)", "content": "Isi pembahasan santai (120-350 karakter)", "is_spoiler": false, "poll_options": ["Opsi 1", "Opsi 2", "Opsi 3"] }',
    "Catatan: poll_options hanya diisi jika kategori adalah polling (3-4 opsi singkat).",
  ].join("\n");

  const userPrompt = [
    "Informasi Komik:",
    `- Judul: ${manga.title}`,
    `- Format: ${formatText}`,
    manga.countryId ? `- Negara: ${manga.countryId}` : null,
    `- Genre: ${genreText}`,
    manga.latestChapterNumber > 0
      ? `- Chapter Terbaru: ${manga.latestChapterNumber}`
      : null,
    manga.userRate > 0 ? `- Rating: ${manga.userRate}` : null,
    "",
    "Instruksi Kategori:",
    categoryInstruction,
    "",
    "Aturan Gaya Bahasa & Format:",
    "1. Gunakan Bahasa Indonesia santai khas pembaca komik/manhwa (MC, arc, chapter, art-nya, guys, menurut kalian), tidak kaku seperti robot/AI.",
    "2. DILARANG menggunakan hashtag (#) sama sekali.",
    "3. Maksimal 1-2 emoji saja, atau tanpa emoji.",
    "4. Kembalikan HANYA JSON valid.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { systemPrompt, userPrompt };
}

function stripCodeFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

export async function generatePostWithKoboiLLM(params: {
  apiKey: string;
  baseUrl?: string;
  model: string;
  manga: MangaDoc;
  category: PostCategory;
}): Promise<GeneratedPostContent> {
  const key = params.apiKey.trim();
  if (!key) {
    throw new Error("KoboiLLM API Key belum dikonfigurasi.");
  }

  const modelName = params.model.trim() || "gpt-6-luna";
  const endpoint = `${sanitizeBaseUrl(params.baseUrl)}/chat/completions`;
  const { systemPrompt, userPrompt } = buildPostPrompts(
    params.manga,
    params.category
  );

  const isReasoning = isReasoningModelName(modelName);
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Bearer ${key}`,
  };

  // Multi-tier fallback strategy matching aura-farming-shinigami:
  // Reasoning models (luna, sol, o1, o3, gpt-5, etc.) reject temperature != 1 and response_format.
  // drop_params: true tells LiteLLM proxy on KoboiLLM to silently drop unsupported params.
  const attempts: Array<{
    withResponseFormat: boolean;
    combinePrompt: boolean;
    temperature?: number;
    reasoningEffort?: string;
    omitTemperature?: boolean;
  }> = isReasoning
    ? [
        { withResponseFormat: false, combinePrompt: false, temperature: 1 },
        { withResponseFormat: false, combinePrompt: true, temperature: 1 },
        {
          withResponseFormat: false,
          combinePrompt: true,
          omitTemperature: true,
        },
        {
          withResponseFormat: false,
          combinePrompt: true,
          temperature: 1,
          reasoningEffort: "none",
        },
      ]
    : [
        { withResponseFormat: true, combinePrompt: false, temperature: 0.8 },
        { withResponseFormat: false, combinePrompt: false, temperature: 0.8 },
        { withResponseFormat: false, combinePrompt: true, temperature: 1 },
        {
          withResponseFormat: false,
          combinePrompt: true,
          omitTemperature: true,
        },
      ];

  let lastErrorText = "";
  let rawContent: string | null = null;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    const messages = attempt.combinePrompt
      ? [
          {
            role: "user",
            content: `${systemPrompt}\n\n---\n\n${userPrompt}`,
          },
        ]
      : [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ];

    const bodyPayload: Record<string, unknown> = {
      model: modelName,
      messages,
      drop_params: true,
    };

    if (!attempt.omitTemperature) {
      bodyPayload.temperature = attempt.temperature ?? (isReasoning ? 1 : 0.8);
    }
    if (attempt.reasoningEffort) {
      bodyPayload.reasoning_effort = attempt.reasoningEffort;
    }
    if (attempt.withResponseFormat) {
      bodyPayload.response_format = { type: "json_object" };
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(60_000),
        cache: "no-store",
      });

      const responseText = await response.text();

      if (response.ok) {
        let data: {
          choices?: Array<{ message?: { content?: string | null } }>;
        };
        try {
          data = JSON.parse(responseText);
        } catch {
          lastErrorText = `Respons KoboiLLM bukan JSON valid: ${responseText.slice(0, 150)}`;
          if (i < attempts.length - 1) continue;
          break;
        }

        const content = data.choices?.[0]?.message?.content;
        if (content && content.trim()) {
          rawContent = content;
          break;
        }

        lastErrorText = "KoboiLLM mengembalikan choices[0].message.content kosong.";
        if (i < attempts.length - 1) continue;
        break;
      } else {
        lastErrorText = responseText || `HTTP ${response.status}`;
        if (
          (response.status === 400 || response.status === 422) &&
          i < attempts.length - 1
        ) {
          continue;
        }
        break;
      }
    } catch (netErr) {
      lastErrorText =
        netErr instanceof Error ? netErr.message : String(netErr);
      if (i < attempts.length - 1) {
        continue;
      }
      break;
    }
  }

  if (!rawContent) {
    let errMsg = lastErrorText;
    try {
      const errJson = JSON.parse(lastErrorText) as {
        error?: { message?: string };
        message?: string;
      };
      errMsg = errJson.error?.message || errJson.message || lastErrorText;
    } catch {
      // keep raw error text
    }
    throw new Error(`KoboiLLM API Error (${modelName}): ${errMsg}`);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripCodeFences(rawContent)) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Gagal parse JSON dari KoboiLLM. Output mentah: ${rawContent.slice(0, 200)}`
    );
  }

  const title =
    String(parsed.title || "")
      .replace(/#\S+/g, "")
      .trim()
      .slice(0, 100) || `Diskusi ${params.manga.title}`;
  const content =
    String(parsed.content || "")
      .replace(/#\S+/g, "")
      .trim() || `Gimana pendapat kalian tentang ${params.manga.title}?`;

  const isSpoiler =
    params.category === "polling"
      ? false
      : params.category === "teori"
        ? true
        : Boolean(parsed.is_spoiler);

  if (params.category === "polling") {
    const rawOptions = Array.isArray(parsed.poll_options)
      ? parsed.poll_options
      : [];
    const cleanedOptions = rawOptions
      .map((opt) => String(opt || "").trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 4);

    const finalOptions =
      cleanedOptions.length >= 2
        ? cleanedOptions
        : [
            "Karakter Utama (MC)",
            "Rival / Villain Utama",
            "Karakter Pendukung Favorit",
          ];

    return {
      title,
      content,
      is_spoiler: false,
      poll_options: finalOptions,
    };
  }

  return {
    title,
    content,
    is_spoiler: isSpoiler,
  };
}
