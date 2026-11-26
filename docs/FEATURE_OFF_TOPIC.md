# FEATURE_OFF_TOPIC.md — Penambahan Kategori `off-topic` pada Auto-Post (KoboiLLM + Top 50 Manga/Author)

## 1. Tujuan & Spesifikasi Kategori `off-topic`
Menambahkan kategori ke-5 yaitu **`off-topic`** pada fitur **Auto-Post** (`teori`, `tanya`, `rekomendasi`, `polling`, **`off-topic`**):
1. **Payload API Shinigami (`POST https://api.shinigami.io/v1/posts`):**
   - Berbeda dengan 4 kategori lainnya, kategori `off-topic` **tidak menyertakan `manga_id`** (global community feed) dan menyertakan `"category": "off-topic"` serta `"attachments": []`:
   ```json
   {
     "title": "Tim maraton atau tim nunggu update mingguan?",
     "content": "Jujur paling gak kuat kalau lagi seru-serunya terus kena cliffhanger. Kalian tipe yang sabar nabung chapter sampai numpuk banyak, atau langsung sikat tiap kali rilis?",
     "category": "off-topic",
     "attachments": [],
     "is_spoiler": false
   }
   ```
2. **10 Sub-Topik / Angle Obrolan Acak:**
   Setiap kali cronjob atau *Test Run* memilih kategori `off-topic`, sistem memilih secara acak 1 dari **10 sub-topik** berikut untuk disuapkan ke prompt KoboiLLM.
3. **Sumber Konteks Fakta Nyata (Untuk Angle ke-10 — Top 50 Manga / Author):**
   - Khusus saat angle ke-10 terpilih, sistem **tidak mengarang info rilis baru**, melainkan mengambil **1 manga acak dari Top 50 Populer** (`popularityRank <= 50` di koleksi `mangas` Firestore, atau fallback dari API `GET /v1/manga/list?page=1&page_size=50&sort=popularity&sort_order=desc`) lengkap dengan detail `title`, `format`, `genres`, `author`, `artist`, `releaseYear`, dan `description` sebagai bahan fakta nyata agar AI tidak halusinasi maupun bertanya balik.
4. **Anti-Klarifikasi System Prompt (Khusus Model ChatGPT/GPT di KoboiLLM):**
   - Wajib menyertakan aturan ketat di system prompt bahwa model berperan sebagai **pembaca komik biasa di forum Shinigami** (bukan asisten AI), **dilarang keras bertanya balik, dilarang meminta klarifikasi, dilarang memakai placeholder `[Judul]`, dilarang membuat tabel/markdown**, dan **wajib langsung menghasilkan JSON murni** (`title`, `content`, `is_spoiler`).

---

## 2. Daftar 10 Sub-Topik `off-topic` (`src/lib/koboillm.ts`)

Definisikan array `OFF_TOPIC_ANGLES` berisi 10 angle berikut:

1. **Kebiasaan & Ritual Baca Komik (*Relatable*):**
   - *Fokus:* Kebiasaan membaca komik sehari-hari yang dekat dengan pembaca.
   - *Contoh inspirasi:* `"Tim maraton pas chapter udah numpuk 50+, atau tim langsung gas baca tiap minggu walau ngegantung?"` atau `"Posisi paling enak buat baca komik kalian apa? Rebahan miring sampai HP jatuh ke muka, atau sambil ngopi?"`
2. **Curhat *Cliffhanger* / Chapter Ngegantung:**
   - *Fokus:* Rasa gemas saat bacaan dipotong tepat di momen klimaks/pertarungan.
   - *Contoh inspirasi:* `"Lagi seru-serunya mau tebas musuh eh tiba-tiba tulisan 'Bersambung', rasanya pengen lempar HP gak sih?"`
3. **Trope & Klise Favorit / Paling Bikin Kesel:**
   - *Fokus:* Pola cerita umum di manhwa/manga/manhua (regresi, murim, villainess, dungeon, sistem) yang klise tapi tetap bikin nagih atau justru bikin kesal.
   - *Contoh inspirasi:* `"Klise manhwa murim/regresi apa yang sebenernya udah ketebak banget tapi tetep aja seru buat dibaca?"` atau `"Lebih suka MC yang OP dari awal tanpa ampun, atau MC yang merangkak dari nol tapi taktiknya licik?"`
4. **Rekomendasi Lintas Genre / Cari Bacaan Baru:**
   - *Fokus:* Bertanya atau meminta saran bacaan baru dari pembaca lain saat habis menamatkan serial favorit.
   - *Contoh inspirasi:* `"Habis tamatin bacaan utama rasanya hampa banget. Kalian kalau lagi fase kosong gini biasanya ngapain atau baca genre apa?"` atau `"Ada yang lagi ngikutin manhwa action/fantasi yang underrated tapi art-nya gokil?"`
5. **Obrolan Santai Malam / Akhir Pekan Pembaca:**
   - *Fokus:* Suasana begadang baca komik atau maraton di akhir pekan.
   - *Contoh inspirasi:* `"Jam segini masih melek gara-gara bilang 'satu chapter lagi deh' dari jam 11 malam, ada temennya?"`
6. **Adaptasi Anime / Live Action vs Versi Manhwa/Manga:**
   - *Fokus:* Perbandingan kualitas adaptasi anime/drama dengan sumber komiknya.
   - *Contoh inspirasi:* `"Menurut kalian adaptasi anime dari manhwa belakangan ini udah sesuai ekspektasi belum, atau tetep lebih dapet feel-nya pas baca komiknya?"`
7. **Unpopular Opinion / Pendapat Kontroversial:**
   - *Fokus:* Mengajak pembaca berbagi pendapat jujur soal serial populer yang terasa *overrated* atau serial sepi pembaca yang justru *underrated*.
   - *Contoh inspirasi:* `"Coba sebutin satu manhwa/manga populer yang menurut kalian agak overrated, atau sebaliknya yang underrated padahal ceritanya bagus banget."`
8. **First Love / Komik Gerbang Pembuka:**
   - *Fokus:* Nostalgia judul komik pertama yang membuat pembaca mulai hobi membaca manga/manhwa/manhua.
   - *Contoh inspirasi:* `"Judul manhwa/manga pertama yang bikin kalian ketagihan baca komik sampai sekarang judulnya apa?"`
9. **Rating & Standar Art Style:**
   - *Fokus:* Prioritas pembaca antara kualitas visual (*art style*) dengan kekuatan alur cerita (*storyline*).
   - *Contoh inspirasi:* `"Kalau cerita bagus tapi art-nya biasa aja vs art dewa tapi cerita standar, kalian tim yang mana?"`
10. **Trivia Author / Studio & Bahasan Top 50 Komik Populer (`useTop50Context: true`):**
    - *Fokus:* Membahas salah satu komik dari **Top 50 Populer** atau karya author/studio-nya berdasarkan data nyata yang dikirimkan ke prompt.
    - *Contoh inspirasi:* `"Studio atau author mana yang kalau ngeluarin karya baru udah pasti langsung kalian masukin bookmark tanpa mikir panjang?"` dikombinasikan dengan fakta nyata komik Top 50 (misal menyinggung judul/author/premis salah satu judul Top 50 Populer secara santai).

---

## 3. Pembaruan Alur di Backend

### A. Update Crawl Top 300 Manga (`src/lib/shinigami-api.ts`)
- Pastikan saat menyimpan manga ke koleksi `mangas` Firestore, ikut simpan field tambahan berikut (jika tersedia dari item `GET /v1/manga/list`):
  - `authors`: `string[]` (diambil dari `item.taxonomy?.Author?.map(a => a.name) || []`)
  - `artists`: `string[]` (diambil dari `item.taxonomy?.Artist?.map(a => a.name) || []`)
  - `releaseYear`: `string` (`item.release_year || ""`)
  - `description`: `string` (`(item.description || "").slice(0, 400)`)
- Tambahkan helper `getRandomTop50Manga()` yang mengambil 1 manga acak dari koleksi `mangas` dengan `where("popularityRank", "<=", 50)` (atau dari 50 dokumen pertama `orderBy("popularityRank", "asc").limit(50)`, dan jika koleksi `mangas` masih kosong, fallback langsung hit `GET https://api.shinigami.io/v1/manga/list?page=1&page_size=50&sort=popularity&sort_order=desc` lalu pilih 1 item acak).

### B. Update `createCommunityPost()` (`src/lib/shinigami-api.ts`)
- Ubah parameter `mangaId` menjadi opsional (`mangaId?: string`):
  - Jika `category === "off-topic"`:
    ```typescript
    payload = {
      title: post.title,
      content: post.content,
      category: "off-topic",
      attachments: [],
      is_spoiler: Boolean(post.is_spoiler),
    };
    ```
  - Jika kategori lain (`teori`, `tanya`, `rekomendasi`, `polling`): tetap sertakan `"manga_id": mangaId` (dan `"poll": { "options": ... }` khusus `polling`).

### C. Update Generator KoboiLLM (`src/lib/koboillm.ts`)
- Tambahkan cabang khusus untuk `category === "off-topic"`:
  1. Pilih 1 angle acak dari `OFF_TOPIC_ANGLES` (`index 0–9`).
  2. Jika angle terpilih adalah #10 (`Trivia Author / Studio & Bahasan Top 50 Komik Populer`), panggil `getRandomTop50Manga()` dan masukkan ringkasan fakta nyatanya ke user prompt (judul, format, genre, author, artist, tahun rilis, sinopsis singkat).
  3. **System Prompt Wajib:**
     ```text
     Kamu adalah pembaca aktif di komunitas komik Shinigami yang suka mengajak pembaca lain ngobrol santai.
     TUGAS: Buat 1 postingan forum kategori "off-topic" dalam bahasa Indonesia santai, natural, dan memancing diskusi.
     ATURAN KERAS:
     - DILARANG bertanya balik kepada user, DILARANG meminta klarifikasi, DILARANG menawarkan format/tabel.
     - DILARANG menggunakan tanda kurung siku placeholder seperti [Judul] atau [Nama].
     - DILARANG menulis markdown heading (#), bullet list, atau hashtag (#).
     - Gunakan maksimal 1-2 emoji saja.
     - Panjang judul (title): 20-80 karakter, menarik dan langsung ke inti obrolan.
     - Panjang isi (content): 100-280 karakter, terasa seperti ketikan manusia di forum komik.
     - Output WAJIB berupa JSON valid tanpa teks tambahan:
       {"title":"...","content":"...","is_spoiler":false}
     ```
  4. Gunakan `response_format: { type: "json_object" }` saat memanggil `POST https://api.koboillm.com/v1/chat/completions` serta parser JSON defensif untuk mengekstrak objek `{ title, content, is_spoiler }`.

### D. Update Endpoint Cronjob Auto-Post (`src/app/api/cron/autopost/route.ts`)
- Saat memilih kategori acak dari `settings.enabledCategories`:
  - **Jika `category === "off-topic"`:**
    - Jangan query/update `lastPostedAt` pada antrean Top 300 Manga (hemat Read & Write Firestore).
    - Panggil `generatePostContent({ category: "off-topic" })` -> kirim ke `createCommunityPost()` tanpa `manga_id`.
    - Kembalikan response JSON dengan `category: "off-topic"` dan `mangaTitle: "Off-Topic (Komunitas)"`.
  - **Jika kategori selain `"off-topic"`:**
    - Jalankan alur normal (ambil 1 manga dengan `lastPostedAt` terlama dari Top 300 -> generate konten -> `POST /v1/posts` dengan `manga_id` -> update `lastPostedAt` manga).

---

## 4. Pembaruan Settings & UI Dashboard (`src/app/page.tsx`)
1. **Default `enabledCategories` (`src/app/api/settings/route.ts`):**
   - Ubah default array kategori menjadi `["teori", "tanya", "rekomendasi", "polling", "off-topic"]`.
2. **Tab `Auto-Post` (`src/app/page.tsx`):**
   - Tambahkan opsi checkbox **`Off-Topic`** pada pilihan kategori aktif (bersama `Teori`, `Tanya`, `Rekomendasi`, dan `Polling`).
   - Pada **Live Feed Post (`mahpudeen`)**, tampilkan badge khusus **`Off-Topic`** (misalnya warna ungu/indigo) saat `post.category === "off-topic"` atau `post.manga == null` agar tidak error ketika membaca properti `post.manga?.title`.

---

## 5. Checklist Eksekusi Agent
1. Perbarui `src/lib/shinigami-api.ts`:
   - Simpan `authors`, `artists`, `releaseYear`, dan `description` saat crawl Top 300 manga.
   - Tambahkan `getRandomTop50Manga()`.
   - Dukung payload `off-topic` (tanpa `manga_id`, dengan `"category": "off-topic"` dan `"attachments": []`) di `createCommunityPost()`.
2. Perbarui `src/lib/koboillm.ts`:
   - Tambahkan 10 sub-topik `off-topic` beserta integrasi data Top 50 manga/author untuk angle ke-10.
   - Terapkan `response_format: { type: "json_object" }` dan system prompt anti-klarifikasi.
3. Perbarui `src/app/api/cron/autopost/route.ts` dan `src/app/api/settings/route.ts` untuk menangani kategori `off-topic`.
4. Perbarui `src/app/page.tsx` (checkbox kategori `Off-Topic` + penanganan render post tanpa `manga` di Live Feed).
5. Jalankan `npm run build` dan pastikan kompilasi sukses tanpa error TypeScript.