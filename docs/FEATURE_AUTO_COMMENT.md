# FEATURE_AUTO_COMMENT.md — Fitur Tab Auto-Comment (Template-Based, Tanpa KoboiLLM & 3 Chapter per Cron)

## 1. Tujuan & Aturan Bisnis
Menambahkan fitur **Auto-Comment** khusus komentar chapter terbaru secara *stateless* via Cronjob (`GET /api/cron/autocomment?secret=...`) serta tab baru **"Auto-Comment"** di dashboard:
1. **Tanpa KoboiLLM & Tanpa Auto-Like:** Komentar tidak menggunakan AI (hemat kuota KoboiLLM) dan tidak melakukan upvote/like komentar.
2. **3 Chapter per Eksekusi Cronjob (Default):** Setiap kali endpoint `/api/cron/autocomment` dijalankan oleh cronjob, sistem otomatis mencari dan mengirim komentar ke **3 chapter berbeda** yang belum dikomentari oleh akun tersebut (dengan jeda acak `1.5–3 detik` antar komentar agar natural dan aman). Jumlah ini juga dapat diubah lewat input `commentsPerRun` di UI (default `3`).
3. **Sumber Data Live dari API Shinigami (Tanpa Simpan Manga/Chapter/Komen ke Firestore):**
   - Ambil daftar komik update terbaru langsung dari `GET https://api.shinigami.io/v1/manga/list?sort=latest&sort_order=desc&offset=0&limit=20&is_update=true`.
   - Setiap item manga membawa array `chapters[]` (chapter terbaru) dan `taxonomy.Type` (`Project` vs `Mirror`).
4. **Anti-Duplikat Komen per Akun (`username`):**
   - Sebelum mengirim komentar ke suatu chapter, cek komentar yang sudah ada di `GET https://api.shinigami.io/comment/api/v2/comments?page_key=manga:${manga_id}:chapter:${chapter_id}&offset=0&limit=50`.
   - Periksa array `comments[]`: jika sudah ada komentar dengan `comment.username.toLowerCase() === account.username.toLowerCase()`, **skip** chapter tersebut dan lanjut cek chapter berikutnya di manga yang sama atau lanjut ke manga berikutnya sampai terkumpul **3 chapter target** yang belum dikomentari.
5. **Template Komentar Dinamis Berdasarkan `taxonomy.Type`:**
   - Cek apakah `manga.taxonomy?.Type` mengandung `{ slug: "project" }` atau `{ name: "Project" }` (case-insensitive):
     - **Jika `Project`:** Pilih acak dari kumpulan **Template Apresiasi & Semangat Admin/TL** (berterima kasih atas garapan cepat, semangat update terus min, sehat selalu tim TL, dll., boleh menyisipkan nomor chapter `{chapter}` atau judul `{title}` secara natural).
     - **Jika Bukan `Project` (misal `Mirror` / lainnya):** Pilih acak dari kumpulan **Template Komentar Santai / Jejak Baca** khas komunitas Shinigami (`Jejak ch {chapter}`, `GGWP`, `Mantap lanjut terus`, `Gas ch selanjutnya`, `Seru banget ch ini`, dll.).
6. **Update Manajemen Akun (`username` & `role`):**
   - Tambahkan field `username` pada koleksi `accounts` di Firestore (dapat diisi saat tambah akun maupun diedit/update kapan saja di tab **Akun**, default `"mahpudeen"` untuk akun utama).
   - Perbarui pilihan peran (`role`) akun agar mendukung komentar (`"poster" | "voter" | "commenter" | "both" | "all"`).

---

## 2. Spesifikasi Endpoint API Shinigami

### A. Get Latest Manga & Chapters
- **URL:** `GET https://api.shinigami.io/v1/manga/list?sort=latest&sort_order=desc&offset=0&limit=20&is_update=true`
- **Headers:**
  ```typescript
  {
    "accept": "application/json, text/plain, */*",
    "origin": "[https://s1.shinigami.mx](https://s1.shinigami.mx)",
    "referer": "[https://s1.shinigami.mx/](https://s1.shinigami.mx/)",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36"
  }
  ```

### B. Cek Komentar Existing di Chapter
- **URL:** `GET https://api.shinigami.io/comment/api/v2/comments?page_key=manga:${mangaId}:chapter:${chapterId}&offset=0&limit=50`
- **Headers:** Sama dengan header di atas (tanpa perlu `Authorization`).
- **Response:** `{ comments: Array<{ id, username, content, date }>, count: number }`.

### C. Kirim Komentar Baru (`POST /comment/api/v2/comments`)
- **Method & URL:** `POST https://api.shinigami.io/comment/api/v2/comments`
- **Headers wajib:**
  ```typescript
  {
    "Accept": "application/json, text/plain, */*",
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Origin": "[https://s1.shinigami.mx](https://s1.shinigami.mx)",
    "Referer": "[https://s1.shinigami.mx/](https://s1.shinigami.mx/)",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36"
  }
  ```
- **Body JSON:**
  ```json
  {
    "content": "Makasih min udah garap project ini, semangat terus updatenya!",
    "page_key": "manga:943af057-0f0d-4fcc-8d04-aa5988db65a2:chapter:4641ed3e-e67a-4c15-8481-4ae91d3b6018",
    "idempotency_key": "9188fd8f-12a2-4d4c-a67b-d75b047f998a"
  }
  ```
  *(Gunakan `crypto.randomUUID()` untuk setiap `idempotency_key`, dan lakukan auto-refresh token WorkOS jika HTTP `401` lalu retry 1x).*

---

## 3. Bank Template Komentar (`src/lib/comment-templates.ts`)
Buat file **`src/lib/comment-templates.ts`** berisi variasi template yang kaya (minimal 25+ variasi per kategori agar tidak monoton dalam 3 komentar per run) dengan placeholder opsional `{chapter}` (`chapter_number`) dan `{title}`:

1. **`PROJECT_TEMPLATES` (Khusus `taxonomy.Type` = `Project` — Semangat & Terima Kasih Admin/TL):**
   - `"Makasih banyak min udah garap {title} chapter {chapter}, semangat terus updatenya!"`
   - `"Sehat selalu admin dan tim TL, makasih banget udah rutin update project ini 🙏"`
   - `"Gokil cepet banget updatenya min! Makasih banyak garapannya, semangat terus 🔥"`
   - `"Terima kasih min sudah translate chapter {chapter}, ditunggu kelanjutannya!"`
   - `"Mantap min, terjemahannya rapi banget. Semangat terus garap project {title}!"`
   - `"Makasih min udah up ch {chapter}, semoga tim TL lancar terus rezekinya 🙌"`
   - *(Tambahkan 20+ variasi natural lainnya dengan nada apresiasi & penyemangat admin).*

2. **`GENERAL_TEMPLATES` (Untuk Non-Project / `Mirror` — Jejak & Reaksi Singkat):**
   - `"Jejak ch {chapter} 🔥"`
   - `"GGWP ch {chapter}"`
   - `"Mantap lanjut terus!"`
   - `"Gas chapter berikutnya 🚀"`
   - `"Seru banget makin ke sini"`
   - `"Jejak dulu di chapter {chapter}"`
   - `"Keren abis MC-nya di ch {chapter}"`
   - `"Ditunggu next chapternya!"`
   - *(Tambahkan 20+ variasi santai khas komunitas Shinigami lainnya).*

3. **Fungsi Helper `pickCommentContent(manga, chapterNumber, usedTemplates?: Set<string>)`:**
   - Deteksi `isProject = manga.taxonomy?.Type?.some((t) => t.slug?.toLowerCase() === "project" || t.name?.toLowerCase() === "project")`.
   - Pilih acak dari `PROJECT_TEMPLATES` jika `isProject === true`, atau dari `GENERAL_TEMPLATES` jika `false` (hindari memilih template yang sama persis di dalam 1 batch 3 komentar), lalu ganti `{chapter}` dan `{title}`.

---

## 4. Pembaruan Struktur Firestore (`accounts` & `settings/autopost`)
1. **Koleksi `accounts`:**
   - Tambahkan field `username: string` (contoh: `"mahpudeen"`).
   - Pastikan endpoint `PATCH /api/accounts` mendukung pengeditan `username`, `role`, dan `isActive` langsung dari UI tab **Akun**.
   - Perbarui nilai `role` akun agar mendukung `"poster" | "voter" | "commenter" | "both" | "all"` (di mana `"both"` atau `"all"` ikut seluruh aktivitas, sedangkan `"commenter"` khusus untuk Auto-Comment).
2. **Dokumen `settings/autopost`:**
   - Tambahkan field:
     - `isCommentEnabled`: `boolean` (default `false`)
     - `commentsPerRun`: `number` (default **`3`** — jumlah chapter yang dikomentari setiap 1x cronjob jalan)
     - `lastCommentRunAt`: `number`

---

## 5. Endpoint Cronjob Auto-Comment (`src/app/api/cron/autocomment/route.ts`)
Buat endpoint **`GET /api/cron/autocomment`** yang berjalan *stateless*:
1. **Validasi `CRON_SECRET`:** Cek `?secret=...` atau `Authorization: Bearer ...` (kecuali dipanggil dari tombol *"Test Run Comment"* di dashboard).
2. **Cek Saklar:** Baca `settings/autopost`. Jika `isCommentEnabled === false` (dan bukan manual test run), kembalikan `{ skipped: true, reason: "Auto-Comment sedang nonaktif" }`.
3. **Pilih Akun Commenter:** Ambil akun aktif dari Firestore yang memiliki `username` tidak kosong dan `role` termasuk `"commenter"`, `"both"`, atau `"all"`. Pilih 1 akun (atau acak jika lebih dari satu).
4. **Loop Cari & Komentari 3 Chapter Belum Dikomentari (`targetCount = settings.commentsPerRun || 3`):**
   - Fetch `GET https://api.shinigami.io/v1/manga/list?sort=latest&sort_order=desc&offset=0&limit=20&is_update=true`.
   - Siapkan array `results = []` dan `usedTemplates = new Set<string>()`.
   - Loop setiap `manga` di `data[]` -> loop setiap `ch` di `manga.chapters`:
     - Jika `results.length >= targetCount` (sudah terkirim **3 komentar**), hentikan loop (`break`).
     - Cek `GET https://api.shinigami.io/comment/api/v2/comments?page_key=manga:${manga.manga_id}:chapter:${ch.chapter_id}&offset=0&limit=50`.
     - Jika di `comments[]` sudah ada `comment.username?.toLowerCase() === account.username.toLowerCase()`, **skip** chapter ini dan lanjut ke chapter/manga berikutnya.
     - Jika **belum ada**, generate teks komentar via `pickCommentContent(manga, ch.chapter_number, usedTemplates)`, lalu kirim `POST https://api.shinigami.io/comment/api/v2/comments` dengan `{ content, page_key, idempotency_key: crypto.randomUUID() }` (auto-refresh token WorkOS jika `401`).
     - Jika sukses, simpan detailnya ke `results[]`. Jika `results.length < targetCount`, beri jeda acak `1.5–2.5 detik` sebelum mengirim komentar ke chapter berikutnya.
5. Update `settings/autopost.lastCommentRunAt = Date.now()` dan kembalikan JSON ringkasan seluruh **3 komentar** yang baru terkirim (`totalSent`, `accountUsername`, `results[]`).

---

## 6. Pembaruan UI Dashboard (`src/app/page.tsx`)
1. **Tab Baru `"Auto-Comment"` (Menjadi 4 Menu Tab: `List Manga`, `Auto-Post`, `Auto-Comment`, `Akun`):**
   - **Saklar ON/OFF Auto-Comment** & input **Jumlah Chapter per Cron Run** (default **`3`**).
   - **URL Cronjob siap salin:** `https://domain-anda/api/cron/autocomment?secret=...` + rekomendasi jadwal (misal tiap 15–30 menit di Cron-job.org).
   - **Tombol `"Test Run Comment (3 Chapter)"`** dengan tampilan hasil list 3 komentar yang baru terkirim (judul manga, badge `Project` / `Mirror`, chapter ke berapa, dan isi komentarnya).
   - **Preview Daftar Manga Update Terbaru:** Menampilkan daftar manga terbaru dari API `sort=latest` beserta jumlah chapter terbaru dan label tipe (`Project` hijau / `Mirror` abu-abu).
2. **Pembaruan Tab `"Akun"`:**
   - Tambahkan input **`Username Shinigami`** pada form tambah akun maupun form/inline edit akun yang sudah tersimpan agar `username` (seperti `mahpudeen`) bisa diperbarui kapan saja.
   - Tambahkan pilihan role **`Commenter`** dan **`All (Post + Like + Comment)`** pada dropdown role akun.

---

## 7. Checklist Eksekusi Agent
1. Buat `src/lib/comment-templates.ts` dengan template khusus `Project` (apresiasi & semangat admin/TL) dan non-Project (`Jejak`, `GGWP`, dll.) serta pencegahan duplikat template dalam 1 batch.
2. Tambahkan helper `getLatestMangas()`, `getChapterComments()`, dan `postChapterComment()` di `src/lib/shinigami-api.ts` (lengkap dengan auto-refresh token WorkOS saat `401`).
3. Perbarui `src/app/api/accounts/route.ts` dan `src/app/api/settings/route.ts` untuk mendukung field `username` akun, role `commenter`/`all`, serta konfigurasi `isCommentEnabled` & `commentsPerRun` (default `3`).
4. Buat endpoint `src/app/api/cron/autocomment/route.ts` yang otomatis mengomentari **3 chapter** belum dikomentari per eksekusi cronjob, dan pastikan `/api/cron/autocomment` dikecualikan dari Basic Auth di `src/middleware.ts` (dilindungi `CRON_SECRET`).
5. Tambahkan tab **"Auto-Comment"** dan fitur edit `username` di tab **"Akun"** pada `src/app/page.tsx`.
6. Jalankan `npm run build` untuk memastikan seluruh kode TypeScript & Next.js terkompilasi tanpa error.