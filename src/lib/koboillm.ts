import {
  DEFAULT_KOBOILLM_BASE_URL,
  type MangaDoc,
  type PostCategory,
} from "@/lib/firebase-admin";
import { getRandomTop50Manga } from "@/lib/shinigami-api";

export interface GeneratedPostContent {
  title: string;
  content: string;
  is_spoiler: boolean;
  poll_options?: string[];
  offTopicAngle?: string;
  referencedMangaTitle?: string;
}

export interface OffTopicAngle {
  id: number;
  name: string;
  focus: string;
  inspiration: string;
  useTop50Context?: boolean;
}

export const OFF_TOPIC_ANGLES: readonly OffTopicAngle[] = [
  {
    id: 1,
    name: "Kebiasaan & Ritual Baca Komik",
    focus: "Kebiasaan membaca komik sehari-hari yang dekat dan relatable dengan pembaca.",
    inspiration:
      'Misalnya: "Tim maraton pas chapter udah numpuk 50+, atau tim langsung gas baca tiap minggu walau ngegantung?" atau "Posisi paling enak buat baca komik kalian apa? Rebahan miring sampai HP jatuh ke muka, atau sambil ngopi?"',
  },
  {
    id: 2,
    name: "Curhat Cliffhanger / Chapter Ngegantung",
    focus: "Rasa gemas saat bacaan dipotong tepat di momen klimaks atau pertarungan seru.",
    inspiration:
      'Misalnya: "Lagi seru-serunya mau tebas musuh eh tiba-tiba tulisan Bersambung, rasanya pengen lempar HP gak sih?"',
  },
  {
    id: 3,
    name: "Trope & Klise Favorit / Paling Bikin Kesel",
    focus:
      "Pola cerita umum di manhwa/manga/manhua (regresi, murim, villainess, dungeon, sistem) yang klise tapi tetap bikin nagih atau justru bikin kesal.",
    inspiration:
      'Misalnya: "Klise manhwa murim/regresi apa yang sebenernya udah ketebak banget tapi tetep aja seru buat dibaca?" atau "Lebih suka MC yang OP dari awal tanpa ampun, atau MC yang merangkak dari nol tapi taktiknya licik?"',
  },
  {
    id: 4,
    name: "Rekomendasi Lintas Genre / Cari Bacaan Baru",
    focus:
      "Bertanya atau meminta saran bacaan baru dari pembaca lain saat habis menamatkan serial favorit atau sedang fase kosong.",
    inspiration:
      'Misalnya: "Habis tamatin bacaan utama rasanya hampa banget. Kalian kalau lagi fase kosong gini biasanya ngapain atau baca genre apa?" atau "Ada yang lagi ngikutin manhwa action/fantasi yang underrated tapi art-nya gokil?"',
  },
  {
    id: 5,
    name: "Obrolan Santai Malam / Akhir Pekan Pembaca",
    focus: "Suasana begadang baca komik atau maraton di akhir pekan.",
    inspiration:
      'Misalnya: "Jam segini masih melek gara-gara bilang satu chapter lagi deh dari jam 11 malam, ada temennya?"',
  },
  {
    id: 6,
    name: "Adaptasi Anime / Live Action vs Versi Manhwa/Manga",
    focus: "Perbandingan kualitas adaptasi anime atau drama dengan sumber komiknya.",
    inspiration:
      'Misalnya: "Menurut kalian adaptasi anime dari manhwa belakangan ini udah sesuai ekspektasi belum, atau tetep lebih dapet feel-nya pas baca komiknya?"',
  },
  {
    id: 7,
    name: "Unpopular Opinion / Pendapat Kontroversial",
    focus:
      "Mengajak pembaca berbagi pendapat jujur soal serial populer yang terasa overrated atau serial sepi pembaca yang justru underrated.",
    inspiration:
      'Misalnya: "Coba sebutin satu manhwa/manga populer yang menurut kalian agak overrated, atau sebaliknya yang underrated padahal ceritanya bagus banget."',
  },
  {
    id: 8,
    name: "First Love / Komik Gerbang Pembuka",
    focus:
      "Nostalgia judul komik pertama yang membuat pembaca mulai hobi membaca manga/manhwa/manhua.",
    inspiration:
      'Misalnya: "Judul manhwa/manga pertama yang bikin kalian ketagihan baca komik sampai sekarang judulnya apa?"',
  },
  {
    id: 9,
    name: "Rating & Standar Art Style",
    focus:
      "Prioritas pembaca antara kualitas visual (art style) dengan kekuatan alur cerita (storyline).",
    inspiration:
      'Misalnya: "Kalau cerita bagus tapi art-nya biasa aja vs art dewa tapi cerita standar, kalian tim yang mana?"',
  },
  {
    id: 10,
    name: "Trivia Author / Studio & Bahasan Top 50 Komik Populer",
    focus:
      "Membahas salah satu komik dari Top 50 Populer atau karya author/studio-nya secara santai berdasarkan data fakta nyata yang diberikan.",
    inspiration:
      'Misalnya membahas daya tarik karya author/studio tertentu atau menyinggung judul Top 50 Populer dari data nyata yang disediakan lalu mengajak pembaca diskusi santai.',
    useTop50Context: true,
  },
];

const OFF_TOPIC_SYSTEM_PROMPT = `Kamu adalah pembaca aktif di komunitas komik Shinigami yang suka mengajak pembaca lain ngobrol santai.
TUGAS: Buat 1 postingan forum kategori "off-topic" dalam bahasa Indonesia santai, natural, dan memancing diskusi.
ATURAN KERAS:
- DILARANG bertanya balik kepada user, DILARANG meminta klarifikasi, DILARANG menawarkan format/tabel.
- DILARANG menggunakan tanda kurung siku placeholder seperti [Judul] atau [Nama].
- DILARANG menulis markdown heading (#), bullet list, atau hashtag (#).
- Gunakan maksimal 1-2 emoji saja.
- Panjang judul (title): 20-80 karakter, menarik dan langsung ke inti obrolan.
- Panjang isi (content): 100-280 karakter, terasa seperti ketikan manusia di forum komik.
- Output WAJIB berupa JSON valid tanpa teks tambahan:
  {"title":"...","content":"...","is_spoiler":false}`;

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

function buildOffTopicUserPrompt(
  angle: OffTopicAngle,
  top50Manga?: MangaDoc | null
): string {
  const lines: string[] = [
    `Sub-Topik Obrolan (#${angle.id}): ${angle.name}`,
    `Fokus: ${angle.focus}`,
    `Inspirasi gaya obrolan (buat versi baru yang segar, jangan copy-paste persis): ${angle.inspiration}`,
  ];

  if (angle.useTop50Context && top50Manga) {
    const factLines = [
      "",
      "Data Fakta Nyata Komik Top 50 Populer Shinigami (GUNAKAN fakta ini saja, jangan mengarang rilis baru atau informasi di luar data):",
      `- Judul: ${top50Manga.title}`,
      top50Manga.format ? `- Format: ${top50Manga.format}` : null,
      top50Manga.genres.length > 0
        ? `- Genre: ${top50Manga.genres.join(", ")}`
        : null,
      top50Manga.authors && top50Manga.authors.length > 0
        ? `- Author: ${top50Manga.authors.join(", ")}`
        : null,
      top50Manga.artists && top50Manga.artists.length > 0
        ? `- Artist: ${top50Manga.artists.join(", ")}`
        : null,
      top50Manga.releaseYear ? `- Tahun Rilis: ${top50Manga.releaseYear}` : null,
      top50Manga.description
        ? `- Ringkasan: ${top50Manga.description.slice(0, 260)}`
        : null,
    ].filter((line): line is string => line !== null);

    lines.push(...factLines);
  }

  lines.push(
    "",
    'Langsung tulis 1 post obrolan "off-topic" sekarang dalam format JSON murni {"title":"...","content":"...","is_spoiler":false} tanpa bertanya balik.'
  );

  return lines.join("\n");
}

function buildMangaPostPrompts(
  manga: MangaDoc,
  category: Exclude<PostCategory, "off-topic">
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
    "DILARANG bertanya balik kepada user, DILARANG meminta klarifikasi, DILARANG memakai placeholder [Judul].",
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
  manga?: MangaDoc | null;
  category: PostCategory;
}): Promise<GeneratedPostContent> {
  const key = params.apiKey.trim();
  if (!key) {
    throw new Error("KoboiLLM API Key belum dikonfigurasi.");
  }

  const modelName = params.model.trim() || "gpt-6-luna";
  const endpoint = `${sanitizeBaseUrl(params.baseUrl)}/chat/completions`;

  let systemPrompt: string;
  let userPrompt: string;
  let offTopicAngle: string | undefined;
  let referencedMangaTitle: string | undefined;

  if (params.category === "off-topic") {
    const chosenAngle =
      OFF_TOPIC_ANGLES[Math.floor(Math.random() * OFF_TOPIC_ANGLES.length)];
    offTopicAngle = chosenAngle.name;

    let top50Manga: MangaDoc | null = null;
    if (chosenAngle.useTop50Context) {
      top50Manga = await getRandomTop50Manga();
      if (top50Manga) {
        referencedMangaTitle = top50Manga.title;
      }
    }

    systemPrompt = OFF_TOPIC_SYSTEM_PROMPT;
    userPrompt = buildOffTopicUserPrompt(chosenAngle, top50Manga);
  } else {
    if (!params.manga) {
      throw new Error(
        `Data manga wajib tersedia untuk kategori '${params.category}'.`
      );
    }
    const prompts = buildMangaPostPrompts(params.manga, params.category);
    systemPrompt = prompts.systemPrompt;
    userPrompt = prompts.userPrompt;
  }

  const isReasoning = isReasoningModelName(modelName);
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Bearer ${key}`,
  };

  // Prefer response_format: { type: "json_object" } first (especially for off-topic),
  // with automatic graceful fallback if a reasoning model rejects response_format or temperature != 1.
  const attempts: Array<{
    withResponseFormat: boolean;
    combinePrompt: boolean;
    temperature?: number;
    reasoningEffort?: string;
    omitTemperature?: boolean;
  }> = isReasoning
    ? [
        ...(params.category === "off-topic"
          ? [{ withResponseFormat: true, combinePrompt: false, temperature: 1 }]
          : []),
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

        lastErrorText =
          "KoboiLLM mengembalikan choices[0].message.content kosong.";
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

  const cleanText = (val: unknown) =>
    String(val || "")
      .replace(/#\S+/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const fallbackTitle =
    params.category === "off-topic"
      ? "Obrolan santai pembaca komik hari ini"
      : `Diskusi ${params.manga?.title || "Komik"}`;

  const fallbackContent =
    params.category === "off-topic"
      ? "Lagi pada baca komik apa nih sekarang? Cerita dong judul yang bikin kalian susah berhenti baca belakangan ini!"
      : `Gimana pendapat kalian tentang ${params.manga?.title || "komik ini"}?`;

  const maxTitleLen = params.category === "off-topic" ? 80 : 100;
  const title =
    cleanText(parsed.title).slice(0, maxTitleLen) || fallbackTitle;
  const content = cleanText(parsed.content) || fallbackContent;

  if (params.category === "off-topic") {
    return {
      title,
      content,
      is_spoiler: Boolean(parsed.is_spoiler),
      offTopicAngle,
      referencedMangaTitle,
    };
  }

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
