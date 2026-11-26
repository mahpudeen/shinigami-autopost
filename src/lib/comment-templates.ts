export interface CommentTemplateManga {
  title: string;
  taxonomy?: {
    Type?: Array<{ name?: string; slug?: string }>;
  };
}

export const PROJECT_TEMPLATES: readonly string[] = [
  "Makasih banyak min udah garap {title} chapter {chapter}, semangat terus updatenya!",
  "Sehat selalu admin dan tim TL, makasih banget udah rutin update project ini 🙏",
  "Gokil cepet banget updatenya min! Makasih banyak garapannya, semangat terus 🔥",
  "Terima kasih min sudah translate chapter {chapter}, ditunggu kelanjutannya!",
  "Mantap min, terjemahannya rapi banget. Semangat terus garap project {title}!",
  "Makasih min udah up ch {chapter}, semoga tim TL lancar terus rezekinya 🙌",
  "Thanks berat buat min sama tim TL yang udah garap {title} ch {chapter}!",
  "Apresiasi tinggi buat tim TL Shinigami, garapan ch {chapter} enak banget dibacanya!",
  "Semangat terus min garap project ini, tiap update selalu bikin semangat baca 🔥",
  "Makasih min udah ngebut TL chapter {chapter}, sehat-sehat terus ya tim!",
  "Keren banget kerja keras admin & tim TL, makasih udah rilis {title} ch {chapter} 🙏",
  "Terjemahan project ini selalu mulus dan natural. Makasih banyak min!",
  "Makasih banyak min udah update lagi! Semangat terus buat seluruh tim TL 🙌",
  "Respect buat tim TL yang konsisten garap {title}, ditunggu next chapternya min!",
  "Mantap jiwa min, ch {chapter} udah langsung up aja. Makasih banyak ya!",
  "Terima kasih atas kerja kerasnya min, garapan {title} emang gak pernah mengecewakan 🔥",
  "Makasih min udah nemenin baca hari ini lewat ch {chapter}, sehat selalu!",
  "Gaskeun terus min project ini, makasih banget udah diterjemahin dengan rapi!",
  "Salute buat tim TL Shinigami! Makasih banyak ch {chapter}-nya, semangat terus 🙏",
  "Asik udah update ch {chapter}! Makasih banyak admin & tim TL, lancar terus urusannya!",
  "Makasih min garapannya selalu clean dan nyaman dibaca, semangat terus update {title}!",
  "Big thanks buat tim TL yang udah kerja keras buat ch {chapter} ini 🙌",
  "Terima kasih banyak min, selalu nungguin update project {title} di sini!",
  "Mantap banget kualitas translate-nya min, makasih udah up ch {chapter} 🔥",
  "Sehat selalu buat min dan semua kru TL, makasih udah konsisten update project ini!",
  "Makasih min udah rilis chapter {chapter}, semangat terus jangan sampai drop ya 🙏",
  "Luar biasa cepat updatenya min! Makasih banget udah garap {title} ch {chapter}!",
  "Terima kasih tim TL atas garapan ch {chapter}-nya, semoga makin jaya terus!",
  "Enak banget baca terjemahan project ini, makasih banyak min dan tim TL 🙌",
  "Makasih banyak min udah nyempetin update ch {chapter}, semangat terus ya 🔥",
];

export const GENERAL_TEMPLATES: readonly string[] = [
  "Jejak ch {chapter} 🔥",
  "GGWP ch {chapter}",
  "Mantap lanjut terus!",
  "Gas chapter berikutnya 🚀",
  "Seru banget makin ke sini",
  "Jejak dulu di chapter {chapter}",
  "Keren abis MC-nya di ch {chapter}",
  "Ditunggu next chapternya!",
  "Gokil ch {chapter} makin panas ceritanya 🔥",
  "Hadir di chapter {chapter}!",
  "Absen dulu di ch {chapter}, seru banget!",
  "Waduh nanggung banget ending ch {chapter}-nya 😭",
  "Lanjut terus, gak sabar baca kelanjutannya!",
  "Mantap banget alurnya makin asik di ch {chapter}",
  "Jejak pembaca setia ch {chapter} 🙌",
  "Pecah banget chapter {chapter} ini!",
  "Auto bookmark, ch {chapter} bikin nagih terus",
  "Makin seru aja ceritanya, gas terus ch selanjutnya!",
  "Nice chapter {chapter}, ditunggu update berikutnya!",
  "Keren parah art sama aksinya di ch {chapter} 🔥",
  "Numpang jejak di ch {chapter} dulu guys",
  "Baru kelar baca ch {chapter}, langsung pengin lanjut!",
  "Gak pernah bosen ngikutin komik ini, mantap!",
  "GG banget perkembangan ceritanya di ch {chapter}",
  "Hadir absen ch {chapter}, semangat baca terus!",
  "Wih makin menarik aja nih di chapter {chapter} 🚀",
  "Mantul ch {chapter}, ditunggu next updatenya!",
  "Jejak dulu sebelum lupa, seru banget ch {chapter}!",
  "Sikat terus, ch {chapter} pecah abis!",
  "Oke banget chapter {chapter}-nya, lanjut gas!",
];

export function isProjectManga(manga: CommentTemplateManga): boolean {
  const types = manga.taxonomy?.Type;
  if (!Array.isArray(types)) return false;
  return types.some(
    (t) =>
      t?.slug?.toLowerCase() === "project" ||
      t?.name?.toLowerCase() === "project"
  );
}

export function pickCommentContent(
  manga: CommentTemplateManga,
  chapterNumber: number | string,
  usedTemplates?: Set<string>
): { content: string; isProject: boolean; template: string } {
  const isProject = isProjectManga(manga);
  const pool = isProject ? PROJECT_TEMPLATES : GENERAL_TEMPLATES;

  const available = usedTemplates
    ? pool.filter((tpl) => !usedTemplates.has(tpl))
    : [...pool];
  const candidates = available.length > 0 ? available : pool;

  const chosenTemplate =
    candidates[Math.floor(Math.random() * candidates.length)];

  if (usedTemplates) {
    usedTemplates.add(chosenTemplate);
  }

  const chapterStr = String(chapterNumber ?? "").trim() || "terbaru";
  const titleStr = (manga.title || "komik ini").trim();

  const content = chosenTemplate
    .replace(/\{chapter\}/g, chapterStr)
    .replace(/\{title\}/g, titleStr);

  return {
    content,
    isProject,
    template: chosenTemplate,
  };
}
