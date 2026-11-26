# PROJECT_BLUEPRINT.md — Shinigami Auto-Post & Auto-Like Serverless (Next.js + Firebase Firestore + KoboiLLM)

## 1. Gambaran Arsitektur
Aplikasi web ringan dan *stateless* (tanpa *in-memory background worker*) berbasis **Next.js (App Router + TypeScript + Tailwind CSS)**, **Firebase Firestore** (Spark Plan — Gratis), dan **KoboiLLM (`https://api.koboillm.com/v1`)** yang dijalankan secara terjadwal via **Cronjob** (Cron-job.org / Vercel Cron).

### Fitur Utama (3 Menu Dashboard):
1. **Menu 1 — List Manga (Top 300 Terpopuler):** Crawl dan simpan maksimal **300 manga terpopuler** (`sort=popularity&sort_order=desc`) dari API Shinigami ke Firestore, dilengkapi tracking `lastPostedAt` agar seluruh 300 judul diposting bergiliran secara adil tanpa mengulang manga yang sama.
2. **Menu 2 — Auto-Post & Auto-Like (KoboiLLM + Cronjob):**
   - Saklar ON/OFF untuk **Cron Auto-Post** dan **Cron Auto-Like**.
   - Pengaturan API Key, Base URL, & Dropdown Model dinamis dari **KoboiLLM (`https://api.koboillm.com/v1`)**.
   - Pilihan kategori post aktif (`teori`, `tanya`, `rekomendasi`, `polling`).
   - Target `posterUsername` (default hardcoded **`mahpudeen`**).
   - Salin 2 URL Cronjob siap pakai (`/api/cron/autopost` & `/api/cron/autolike`), tombol **Test Run Post** & **Test Run Like**, serta **Live Feed Post** yang ditarik langsung dari `GET https://api.shinigami.io/v1/user/mahpudeen/posts?limit=20` (tanpa menyimpan log post ke Firestore agar hemat kuota Write/Read).
3. **Menu 3 — Akun:** Manajemen multi-akun Shinigami (`access_token`, `refresh_token`, `client_id`) dengan peran (`poster`, `voter`, `both`), auto-ekstrak profil (`first_name`, `last_name`, `email`) dari respons WorkOS, serta rotasi *single-use refresh token* WorkOS yang tersimpan persisten di Firestore.

---

## 2. Struktur Koleksi Firebase Firestore (Hemat Kuota Spark Plan)

Gunakan `firebase-admin` di sisi server (`src/lib/firebase-admin.ts`):

1. **`accounts` (Koleksi Multi-Akun):**
   - Document ID: auto-id
   - Fields:
     - `name`: `string` (gabungan `first_name` + `last_name` dari WorkOS, misal `"Dindin Mahpudin"`)
     - `email`: `string`
     - `avatarUrl`: `string` (`profile_picture_url`)
     - `role`: `"poster" | "voter" | "both"`
     - `isActive`: `boolean`
     - `accessToken`: `string`
     - `refreshToken`: `string` (wajib langsung di-update di Firestore setiap kali WorkOS refresh sukses karena bersifat *single-use*)
     - `clientId`: `string` (default `"client_01KJWQWJ8M8WAKN8ZDWVVJ4BG1"`)
     - `updatedAt`: `number`

2. **`mangas` (Maksimal 300 Dokumen Terpopuler):**
   - Document ID: `manga_id` (UUID dari Shinigami)
   - Fields:
     - `mangaId`: `string`
     - `title`: `string`
     - `coverImageUrl`: `string`
     - `countryId`: `string` (`KR`, `JP`, `CN`)
     - `viewCount`: `number`
     - `userRate`: `number`
     - `latestChapterNumber`: `number`
     - `genres`: `string[]`
     - `format`: `string`
     - `popularityRank`: `number` (`1` – `300`)
     - `postCount`: `number` (default `0`)
     - `lastPostedAt`: `number` (default `0` — dipakai untuk query `orderBy("lastPostedAt", "asc").limit(1)` sehingga tiap cron post hanya memakan **1 Read**)

3. **`settings` (Dokumen Tunggal `settings/autopost`):**
   - Fields:
     - `isPostEnabled`: `boolean` (default `false`)
     - `isLikeEnabled`: `boolean` (default `false`)
     - `posterUsername`: `string` (default `"mahpudeen"`)
     - `likesPerAccountPerRun`: `number` (default `7`)
     - `koboillmApiKey`: `string`
     - `koboillmBaseUrl`: `string` (default `"https://api.koboillm.com/v1"`)
     - `selectedModel`: `string` (contoh: `"openai/gpt-4o-mini"`)
     - `enabledCategories`: `string[]` (default `["teori", "tanya", "rekomendasi", "polling"]`)
     - `lastPostRunAt`: `number`
     - `lastLikeRunAt`: `number`

---

## 3. Environment Variables (`.env.local` & Vercel/Cloud)
```env
# Proteksi Dashboard & Cronjob
ADMIN_PASSWORD="password_dashboard_anda"
CRON_SECRET="token_rahasia_cronjob_12345"

# Firebase Admin SDK (dari Service Account JSON Firebase)
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Default KoboiLLM & Target Username (opsional, bisa diatur juga di UI)
KOBOILLM_API_KEY="sk-xxxxxx"
TARGET_POSTER_USERNAME="mahpudeen"
```

---

## 4. Spesifikasi Endpoint API External

### A. Crawl Top 300 Manga Populer (`Shinigami`)
- **URL:** `GET https://api.shinigami.io/v1/manga/list?page=${page}&page_size=24&sort=popularity&sort_order=desc`
- **Headers:**
  ```typescript
  {
    "accept": "application/json, text/plain, */*",
    "origin": "[https://s1.shinigami.mx](https://s1.shinigami.mx)",
    "referer": "[https://s1.shinigami.mx/](https://s1.shinigami.mx/)",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36"
  }
  ```
- **Logika Crawl:** Tarik halaman 1 sampai 13 (`13 x 24 = 312` item), potong tepat **300 item teratas** (`slice(0, 300)`), simpan ke koleksi `mangas` menggunakan Firestore `WriteBatch` dengan `{ merge: true }` agar nilai `lastPostedAt` dan `postCount` manga yang sudah ada tetap terjaga. Hapus dokumen lama di luar Top 300 agar koleksi tetap bersih maksimal 300 dokumen.

### B. WorkOS Refresh Token (`src/lib/workos.ts`)
- **URL:** `POST https://auth.shinigami.io/user_management/authenticate`
- **Body JSON:**
  ```json
  {
    "client_id": "client_01KJWQWJ8M8WAKN8ZDWVVJ4BG1",
    "grant_type": "refresh_token",
    "refresh_token": "<account.refreshToken>"
  }
  ```
- **Response WorkOS:** Mengembalikan `{ user: { first_name, last_name, email, profile_picture_url }, access_token, refresh_token }`.
- **Aturan Wajib:** Setiap kali refresh berhasil (baik saat tombol *Tambah Akun* diklik maupun saat *auto-refresh* `401`), langsung simpan `access_token`, `refresh_token`, `name`, `email`, dan `avatarUrl` terbaru ke dokumen akun di Firestore.

### C. Generate Konten via KoboiLLM (`src/lib/koboillm.ts`)
- **Fetch Daftar Model:** `GET https://api.koboillm.com/v1/models` (`Authorization: Bearer ${apiKey}`) -> mengembalikan array `data[].id` untuk dropdown UI.
- **Generate Post / Polling:** `POST https://api.koboillm.com/v1/chat/completions`
  - **Kategori:**
    - `teori`: Membahas misteri alur cerita, kekuatan karakter, atau prediksi chapter berikutnya.
    - `tanya`: Pertanyaan diskusi terbuka untuk pembaca lain.
    - `rekomendasi`: Mengulas daya tarik komik untuk mengajak orang lain ikut membaca.
    - `polling`: Topik debat seru disertai **`poll_options` berisi 3–4 pilihan singkat** (maksimal 80 karakter per opsi).
  - **Gaya Bahasa:** Bahasa Indonesia santai khas pembaca komik/manhwa, tidak kaku, tanpa hashtag, maksimal 1–2 emoji.
  - **Output JSON Strict:**
    ```json
    {
      "title": "Judul diskusi menarik (maks 100 karakter)",
      "content": "Isi pembahasan diskusi (120-350 karakter)",
      "is_spoiler": false,
      "poll_options": ["Opsi 1", "Opsi 2", "Opsi 3"]
    }
    ```

### D. Create Post, List User Posts, & Like Post (`Shinigami`)
1. **Create Post:** `POST https://api.shinigami.io/v1/posts`
   - Body (non-polling): `{ "manga_id": "...", "title": "...", "content": "...", "is_spoiler": false }`
   - Body (`polling`): `{ "manga_id": "...", "title": "...", "content": "...", "is_spoiler": false, "poll": { "options": ["...", "...", "..."] } }`
2. **Get Live List Posts (`mahpudeen`):** `GET https://api.shinigami.io/v1/user/mahpudeen/posts?limit=20`
   - Jika dikirim dengan header `Authorization: Bearer ${voterAccount.accessToken}`, setiap item di `data[]` akan membawa field boolean **`"liked": false | true`** yang akurat untuk akun voter tersebut.
3. **Like Post:** `PUT https://api.shinigami.io/v1/posts/${postId}/like` (tanpa body, `content-length: 0`).

---

## 5. Spesifikasi Dua Endpoint Cronjob Stateless

### A. Cron 1: `GET /api/cron/autopost?secret=...` (Jadwal Cron-job.org: Tiap 15 Menit)
1. Validasi `secret` dengan `process.env.CRON_SECRET` (bypass jika dipanggil dari UI dashboard terautentikasi).
2. Cek `settings/autopost`. Jika `isPostEnabled === false` (dan bukan manual test run), kembalikan `{ skipped: true, reason: "Auto-Post nonaktif" }`.
3. Ambil akun aktif dengan `role` `"poster"` atau `"both"` dari Firestore.
4. Ambil **1 manga** dari koleksi `mangas` dengan `orderBy("lastPostedAt", "asc").limit(1)`.
5. Pilih 1 kategori acak dari `enabledCategories` -> generate konten via KoboiLLM -> kirim ke `POST /v1/posts` (otomatis refresh token WorkOS jika `401` lalu *retry* 1x).
6. Update dokumen manga: `lastPostedAt: Date.now()`, `postCount: FieldValue.increment(1)`, dan update `settings/autopost.lastPostRunAt`.

### B. Cron 2: `GET /api/cron/autolike?secret=...` (Jadwal Cron-job.org: Tiap 2–3 Jam)
1. Validasi `secret` dengan `process.env.CRON_SECRET` (bypass jika dipanggil dari UI dashboard terautentikasi).
2. Cek `settings/autopost`. Jika `isLikeEnabled === false` (dan bukan manual test run), kembalikan `{ skipped: true, reason: "Auto-Like nonaktif" }`.
3. Ambil semua akun aktif dengan `role` `"voter"` atau `"both"` dari Firestore.
4. Target username: `settings.posterUsername || "mahpudeen"`.
5. **Loop untuk setiap akun voter:**
   - Panggil `GET https://api.shinigami.io/v1/user/${posterUsername}/posts?limit=20` memakai `accessToken` milik akun voter tersebut (otomatis refresh token jika `401`).
   - Filter hanya post dengan **`liked === false`**.
   - **Acak urutan array post tersebut (*Fisher-Yates Shuffle*)**, lalu ambil maksimal **`7` post** (`likesPerAccountPerRun`, default `7`) agar tiap post mendapatkan jumlah like yang bervariasi secara organik.
   - Kirim `PUT https://api.shinigami.io/v1/posts/${postId}/like` untuk masing-masing dari maksimal 7 post tersebut dengan jeda singkat `1–1.5 detik` antar request.
6. Update `settings/autopost.lastLikeRunAt` dan kembalikan ringkasan jumlah like yang diberikan per akun.

---

## 6. Proteksi Keamanan Dashboard (`src/middleware.ts`)
- Terapkan HTTP Basic Auth di `src/middleware.ts` untuk seluruh halaman UI (`/`) dan internal API (`/api/mangas`, `/api/accounts`, `/api/settings`, `/api/posts`), mengecualikan `/api/cron/autopost` dan `/api/cron/autolike` (yang diproteksi oleh `CRON_SECRET`).

---

## 7. Struktur File Proyek Baru
```text
src/
├── middleware.ts                     # Basic Auth pelindung dashboard (ADMIN_PASSWORD)
├── lib/
│   ├── firebase-admin.ts             # Inisialisasi Firestore Admin SDK
│   ├── workos.ts                     # Refresh token & auto-sync profil WorkOS ke Firestore
│   ├── shinigami-api.ts              # Crawl Top 300 manga, create post, get user posts, like post
│   └── koboillm.ts                   # Fetch /v1/models & generate konten JSON via KoboiLLM
├── app/
│   ├── page.tsx                      # Dashboard tunggal dengan 3 Tab: List Manga, Auto-Post, Akun
│   └── api/
│       ├── mangas/route.ts           # GET list Top 300 manga & POST trigger crawl Top 300
│       ├── accounts/route.ts         # GET, POST (tambah akun via refresh_token/access_token), PATCH, DELETE
│       ├── settings/route.ts         # GET & POST konfigurasi KoboiLLM + saklar Auto-Post & Auto-Like
│       ├── posts/route.ts            # GET live feed dari [https://api.shinigami.io/v1/user/mahpudeen/posts?limit=20](https://api.shinigami.io/v1/user/mahpudeen/posts?limit=20)
│       ├── koboillm/models/route.ts  # POST fetch daftar model dinamis dari KoboiLLM
│       └── cron/
│           ├── autopost/route.ts     # Endpoint cronjob Auto-Post (tiap 15 menit)
│           └── autolike/route.ts     # Endpoint cronjob Auto-Like acak 7 post/akun (tiap 2–3 jam)
```

---

## 8. Checklist Pembuatan Proyek
1. Inisialisasi proyek Next.js App Router + TypeScript + Tailwind CSS dan install `firebase-admin` serta `lucide-react`.
2. Buat `src/lib/firebase-admin.ts`, `src/lib/workos.ts`, `src/lib/shinigami-api.ts`, dan `src/lib/koboillm.ts`.
3. Buat seluruh API routes di `src/app/api/*` dan `src/middleware.ts`.
4. Bangun UI Dashboard bersih & responsif di `src/app/page.tsx` dengan tepat **3 menu tab**:
   - **List Manga:** Tombol *"Sync Top 300 Manga Terpopuler"*, search filter, rank popularitas `#1–#300`, jumlah chapter, dan waktu terakhir diposting.
   - **Auto-Post:** Saklar ON/OFF Auto-Post & Auto-Like, pengaturan API Key & dropdown model KoboiLLM (tombol *"Muat Model"*), checkbox kategori (`teori`, `tanya`, `rekomendasi`, `polling`), salin 2 URL Cronjob (`/api/cron/autopost` & `/api/cron/autolike`), tombol *"Test Run Post"* & *"Test Run Like"*, serta **Live Feed Post (`mahpudeen`)** langsung dari API Shinigami.
   - **Akun:** Form tambah akun (cukup masukkan `refresh_token` + `access_token` dan pilih `role`: `poster` / `voter` / `both`, nama & email otomatis terisi dari WorkOS), tombol *"Test Refresh Token"*, dan toggle aktif/nonaktif akun.
5. Verifikasi `npm run build` berjalan bersih tanpa error TypeScript.