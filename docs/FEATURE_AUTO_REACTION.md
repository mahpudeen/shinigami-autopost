# FEATURE_AUTO_REACTION.md — Penambahan Auto-Reaction Halaman Chapter pada Auto-Comment (+10 Aura)

## 1. Tujuan & Aturan Bisnis
Menambahkan aksi **Auto-Reaction** (`POST /comment/api/v2/pages/reactions`) ke dalam alur **Auto-Comment** (`/api/cron/autocomment`) agar setiap kali bot mengirim komentar pada sebuah chapter, bot sekaligus memberikan *page reaction* untuk mendapatkan bonus **+10 Aura** harian:
1. **Pasangan Eksekusi pada Chapter Target:**
   - Pada endpoint `GET /api/cron/autocomment` (yang memproses **3 chapter** per eksekusi), setiap kali bot berhasil menemukan chapter target yang belum dikomentari dan mengirim komentar (`POST /comment/api/v2/comments`), bot langsung memanggil `POST /comment/api/v2/pages/reactions` dengan `page_key` chapter yang sama (`manga:${mangaId}:chapter:${chapterId}`).
2. **Pilihan `reaction_id` yang Natural:**
   - Dari respons API, tersedia `reaction_id` `1` sampai `6` (dengan `1` sebagai reaction utama/jempol/suka terbanyak).
   - Gunakan weighted random agar terlihat natural seperti pembaca asli (misal **70% memilih `reaction_id: 1`**, dan **30% memilih acak antara `2`, `3`, atau `4`**), atau bisa dikunci ke `1` jika diinginkan.
3. **Saklar Kontrol di Pengaturan (`isReactionEnabled`):**
   - Tambahkan opsi toggle **`isReactionEnabled`** (default `true`) pada dokumen `settings/autopost` dan UI tab **Auto-Comment** agar fitur reaction bisa dinyalakan/dimatikan secara independen tanpa mematikan auto-comment.
4. **Non-Blocking & Tracking Kuota Aura:**
   - Jika endpoint `/pages/reactions` gagal atau `aura_remaining_today` sudah `0`, proses Auto-Comment **tidak boleh dianggap gagal** — tetap lanjut memproses komentar untuk chapter berikutnya, dan catat status reaction (`reactionSent`, `reactionId`, `auraGranted`, `auraRemainingToday`) pada JSON respons cronjob.

---

## 2. Spesifikasi Endpoint API Reaction (`Shinigami`)

- **Method & URL:** `POST https://api.shinigami.io/comment/api/v2/pages/reactions`
- **Headers wajib:**
  ```typescript
  {
    "accept": "application/json, text/plain, */*",
    "authorization": `Bearer ${accessToken}`,
    "content-type": "application/json",
    "origin": "[https://s1.shinigami.mx](https://s1.shinigami.mx)",
    "referer": "[https://s1.shinigami.mx/](https://s1.shinigami.mx/)",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
  }
  ```
- **Body JSON:**
  ```json
  {
    "action": "set",
    "page_key": "manga:a5d0bb1f-bfe4-4a5a-a72d-b7fa3695b202:chapter:0e02e023-570d-4573-b8ab-8c9e3074d43a",
    "reaction_id": 1
  }
  ```
- **Contoh Response Sukses:**
  ```json
  {
    "reactions": {
      "1": 2481,
      "2": 29,
      "3": 54,
      "4": 54,
      "5": 33,
      "6": 25
    },
    "my_reaction": 1,
    "aura_granted": 10,
    "aura_remaining_today": 3
  }
  ```

---

## 3. Pembaruan Kode Backend

### A. Helper `setChapterPageReaction()` (`src/lib/shinigami-api.ts`)
Tambahkan fungsi helper di `src/lib/shinigami-api.ts`:
- Parameter: `(account, pageKey: string, reactionId?: number)`
- Jika `reactionId` tidak diisi, pilih secara weighted random (`Math.random() < 0.7 ? 1 : [2, 3, 4][Math.floor(Math.random() * 3)]`).
- Kirim `POST https://api.shinigami.io/comment/api/v2/pages/reactions` dengan body `{ action: "set", page_key: pageKey, reaction_id: chosenReactionId }`.
- Gunakan wrapper request yang sama dengan `postChapterComment()` agar otomatis melakukan **refresh token WorkOS jika HTTP `401`** lalu retry 1x.
- Kembalikan objek ringkas:
  ```typescript
  {
    success: boolean;
    reactionId: number;
    myReaction?: number;
    auraGranted?: number;
    auraRemainingToday?: number;
    error?: string;
  }
  ```

### B. Update Settings (`src/app/api/settings/route.ts`)
- Tambahkan field `isReactionEnabled: boolean` (default `true`) pada dokumen `settings/autopost` di Firestore (baik saat `GET` default fallback maupun saat `POST` simpan pengaturan).

### C. Update Cronjob Auto-Comment (`src/app/api/cron/autocomment/route.ts`)
- Baca `isReactionEnabled` dari `settings/autopost` (default `true`).
- Di dalam loop **3 chapter** yang berhasil dikomentari:
  1. Kirim komentar via `postChapterComment(account, pageKey, commentContent)`.
  2. Jika komentar sukses **dan** `isReactionEnabled === true`:
     - Beri jeda singkat `500–1000ms` agar terlihat natural seperti user membaca lalu klik reaction setelah berkomentar.
     - Panggil `setChapterPageReaction(account, pageKey)` dalam blok `try/catch` (agar error reaction tidak menggagalkan loop utama).
     - Sertakan hasil reaction (`reactionId`, `auraGranted`, `auraRemainingToday`) ke dalam item `results[]` yang dikembalikan oleh endpoint cronjob.
  3. Di root JSON respons `GET /api/cron/autocomment`, tambahkan summary `totalAuraGranted` (total `aura_granted` yang didapat pada run tersebut) dan `auraRemainingToday` (nilai sisa kuota aura harian terakhir dari respons API).

---

## 4. Pembaruan UI Dashboard (`src/app/page.tsx`)
1. **Tab `Auto-Comment`:**
   - Tambahkan toggle/checkbox **"Auto-Reaction Chapter (+10 Aura/hari)"** yang terhubung ke `settings.isReactionEnabled`.
   - Pada kartu hasil **Test Run Comment**, tampilkan badge tambahan jika reaction terkirim, misalnya: `Reaction #1 • +10 Aura (Sisa kuota hari ini: 3)`.

---

## 5. Checklist Eksekusi Agent
1. Tambahkan `setChapterPageReaction()` di `src/lib/shinigami-api.ts` lengkap dengan auto-refresh token WorkOS saat `401`.
2. Tambahkan `isReactionEnabled` (default `true`) di `src/app/api/settings/route.ts`.
3. Integrasikan pemanggilan `setChapterPageReaction()` setelah komentar terkirim di `src/app/api/cron/autocomment/route.ts` dan tampilkan `totalAuraGranted` serta `auraRemainingToday` pada response JSON.
4. Tambahkan kontrol toggle `Auto-Reaction` dan tampilan info Aura pada hasil test run di tab **Auto-Comment** (`src/app/page.tsx`).
5. Jalankan `npm run build` dan pastikan kompilasi berjalan bersih tanpa error.