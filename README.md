# TFDEV Analitik

Standalone web app untuk **Coach Pramu** & **Tim Analis** Total Football School.

Dark UI TFDEV (hitam + `#FF6B1A`), Bahasa Indonesia, mobile-friendly. **Tidak perlu backend** (Vision API opsional).

## Modul

1. **Home** — overview & quick facts
2. **Event Sheet** — catat menit / tipe / tim / nomor / skor · export JSON (logging lapangan; bukan input utama Analitik AI)
3. **Match Centre** — form → live preview kartu stats (sample TFS vs G8 0–0)
4. **Parent Session Report** — generator laporan orang tua bergaya TFDEV
5. **Generate** — salin prompt analitik, tempel JSON dari AI, terapkan ke Match Centre / Parent Report
6. **Analitik AI** — **video-based**: upload video → ambil frame → paket prompt eksternal (default) atau Vision API → paste JSON → Match Centre / Parent Report / Player Dashboard
7. **Player (Personal Dashboard)** — TFdev Score, skill cards, radar & progress charts, session analysis, drills; sample Rafi + apply JSON (`playerDashboard` atau map dari `parentReports[0]`)
8. **Club · Member & Finance** — dashboard finance, member CRUD, paket & harga, tagihan, pembayaran (offline `localStorage`)
9. **Highlights** — tandai momen kunci dari video match (GOL/CHANCE/SKILL/SAVE/COACHING/LAINNYA), thumbnail, export JSON / daftar teks CapCut; `localStorage` `tfdev-highlights-v1` per nama file

## Hosting permanen (Pramu)

- **Live:** https://rezhaeko-beep.github.io/tfdev-match-kit/
- Highlights: https://rezhaeko-beep.github.io/tfdev-match-kit/#highlights
- Analitik AI: https://rezhaeko-beep.github.io/tfdev-match-kit/#analitik
- Repo: https://github.com/rezhaeko-beep/tfdev-match-kit


## Cara buka

Dari folder ini:

```bash
cd /workspace/tfdev-match-kit
python3 -m http.server 8766
```

Lalu buka: **http://127.0.0.1:8766/** atau **http://localhost:8766/**

Atau:

```bash
npx --yes serve -p 8766
```

Buka lewat `http.server` (bukan `file://`) supaya halaman **Generate** / **Analitik AI** bisa fetch `prompts/*.txt` / `*.md`. Jika fetch gagal, app memakai prompt yang di-embed di JS.

Tip tunnel (opsional): jika akses dari HP/LAN, forward port **8766** (mis. `ssh -L 8766:127.0.0.1:8766 …` atau cloudflared/ngrok ke 8766).

## Alur Analitik AI (video → AI → JSON → reports)

1. Buka **Analitik AI**.
2. **Upload video** match (tap / drag-drop; `accept=video/*` — works on phone browser). Preview HTML5 `<video controls>`.
3. Isi meta minimal: **lawan**, **kit**, **babak**; opsional nama pemain untuk Parent Report.
4. **Frame capture:**
   - *Ambil frame sekarang* — dari currentTime → canvas → JPEG
   - *Ambil sample otomatis* — setiap N detik, max ~12
   - Hapus frame yang tidak perlu dari strip
5. Mode **A) Paket eksternal (default, tanpa API key):**
   - Klik **Salin prompt video-analitik**
   - Upload video (atau frame JPEG) ke ChatGPT / Claude / Grok vision + paste prompt
   - Salin JSON jawaban → tempel di langkah 5 app
6. Mode **B) API Vision (opsional):** isi API key (`localStorage`) → **Jalankan Vision API** (kirim beberapa frame sebagai `image_url` data URL).
7. **Terapkan ke Match Centre** / **Parent Report** / **Player Dashboard** / **Terapkan ke semua**, atau **Full auto: video → semua modul** (`Analitik.runFullAuto` → Vision/JSON → `applyAll` termasuk Highlights).

Aturan prompt: primary evidence = VIDEO/frames; jangan mengarang; N/C / `null` + reason jika unreadable dari footage.

### Drive Pramu → Gemini (tanpa unduh manual)

1. Di langkah **Upload**, pilih video katalog **Drive Pramu · Bali 7** (atau paste Drive id).
2. Paste **API key Gemini** di panel Proses (localStorage).
3. Isi **Google OAuth Client ID** (Web client, origins: `https://rezhaeko-beep.github.io`, `http://127.0.0.1:8766`, `http://localhost:8766`) — disimpan di `localStorage` `tfdev-google-oauth-client-id`. Config kosong di `data/google-oauth.json` (jangan commit secret).
4. **Analisa total · Gemini dari Drive** — GIS OAuth `drive.readonly` → unduh file → resumable upload Gemini Files → `generateContent` video utuh → apply Match Centre / parent / highlights.
5. Atau **Cepat · Drive + sample frame** — unduh lalu `runFullAuto` (sample frame, lebih cepat).

## Alur Generate (AI eksternal → form)

1. Buka halaman **Generate**.
2. Pilih **Full prompt** atau **System singkat**, lalu **Salin prompt**.
3. Upload video match ke ChatGPT / Claude / Grok dan paste prompt.
4. Salin JSON jawaban AI (`matchCentre` + `parentReports`).
5. Tempel di textarea → **Terapkan ke Match Centre** dan/atau **Terapkan ke Parent Report**.

Prompt sumber: `prompts/system-prompt-analitik.txt` dan `prompts/prompt-analitik-tfdev.md`.

## API JS

- `window.MatchCentre.applyJson(data)`
- `window.ParentReport.applyJson(report, matchCentre?)`
- `window.EventSheet.getEvents()` / `window.EventSheet.getData()`
- `window.Generate.getSystemPrompt()` / `getFullPrompt()`
- `window.Analitik.buildPrompt()` / `getFrames()` / `run()`
- `window.PlayerDashboard.applyFromAnalytics(json)` / `loadSample()` / `get()`
- `window.ClubStore` — member/finance localStorage helpers + rumus remaining/status/dashboard
- `window.Highlights.get()` / `addFromAnalitik(payload)` / `importPayload` / `generateMissingThumbs`
- `window.Analitik.runFullAuto()` / `applyAll()` / `loadVideoBlob()` / `applyVisionResult()`
- `window.TFDEV.analitik` — hooks Drive→Gemini (`loadVideoBlob`, `applyVisionResult`, `parseAiJson`, …)
- `window.TFDEV.drivePramu` / `window.TFDEV.driveGemini`


## Club MVP (Member + Finance)

Offline modules under nav **Club**. Data di `localStorage` key `tfdev-club-v1` via `window.ClubStore`.

### URL hashes

| Halaman | Hash |
|---------|------|
| Dashboard Finance | `#finance` |
| Member | `#members` |
| Paket & Harga | `#packages` |
| Tagihan | `#invoices` |
| Pembayaran | `#payments` |

### Cara pakai singkat

1. Buka **Paket** → pastikan ada harga (seed: Bulanan U8, Trial 2 Sesi, Term U10).
2. **Member** → Tambah / edit anak + ortu + paket + status.
3. **Tagihan** → Buat invoice (pilih member + paket → amount & dueDate terisi otomatis) → **Tandai terbit**.
4. **Bayar** → catat pembayaran ke invoice → lihat kwitansi; status invoice & dashboard ikut update.
5. **Finance** → lihat member aktif, overdue, penerimaan bulan ini, outstanding piutang.

Tombol **Reset seed** di Finance mengembalikan 3 member + 3 paket + 2 invoice + 1 payment sample (TFS-flavored).

### Rumus finance (otomatis)

| Item | Formula |
|------|---------|
| `invoice.remaining` | `max(0, amount − Σ payments untuk invoice itu)` |
| Status invoice | **lunas** jika `remaining === 0` & `amount > 0`; **sebagian** jika `0 < remaining < amount`; **overdue** jika `remaining > 0` & `dueDate < hari ini` (bukan `draft`/`batal`); `draft`/`batal`/`terbit` sesuai aksi admin |
| `member.outstanding` | `Σ remaining` invoice member (exclude `draft` & `batal`) |
| Filter tunggakan | member punya invoice **overdue** atau **sebagian** |
| `penerimaanBulanIni` | `Σ payments` dengan `payment.date` di bulan kalender berjalan |
| `piutangOutstanding` | `Σ remaining` semua invoice selain `batal`/`draft` |
| `overdueCount` | jumlah invoice status **overdue** |
| `memberAktif` | jumlah member `status === aktif` |
| Invoice dari paket | `amount = package.price` (boleh override); `dueDate = startDate + durationDays` (monthly default 30 hari jika kosong) |
| Tampilan uang | IDR dengan pemisah ribuan (`Rp 450.000`) lewat `ClubStore.formatIDR` |

API: `window.ClubStore.getDashboard()`, `getMembers()`, `saveMember()`, `getPackages()`, `savePackage()`, `createInvoice()`, `markInvoiceTerbit()`, `recordPayment()`, `resetSeed()`.


## Highlights (Coach Pramu)

Halaman `#highlights` — video-based only.

1. Upload video match (pola sama dengan Analitik AI).
2. Putar ke momen penting → **Tandai highlight di waktu ini** (simpan `currentTime` + thumbnail canvas).
3. Isi tipe / tim / no pemain / judul / catatan / rating 1–5.
4. Daftar terurut waktu: edit, hapus, **Jump** (`video.currentTime = t; play`).
5. **Export JSON** atau **Salin daftar teks** (timestamp + type + note) untuk CapCut/editor.
6. Persistence: `localStorage` key `tfdev-highlights-v1`, bucket per nama file video. Tanpa video → 3 demo seed (jump disabled).
7. Opsional dari Analitik AI: **Kirim frame ke Highlights**.

API: `window.Highlights.get()` / `addFromAnalitik({ t, thumb, type, … })` / `importPayload(payload)` / `generateMissingThumbs()`.

Tutorial PDF: `/workspace/academy-reports/Tutorial-Highlights-Pramu-TFDEV.pdf`

## Stack

Vanilla HTML / CSS / JS (premium, tanpa build step). Entry: `index.html`. Player charts: Chart.js when available, else canvas fallback.

## Fakta kamera

- Sony **ZV-E10**: **tidak ada IBIS** → tripod tinggi **2.5–3.5 m**
- Cam1: mid-sideline, full pitch
- **4K30**, Daylight lock, timestamp **ON**
- Kit TFS: **orange**

## Pitch deck PDF

Lihat juga: `/workspace/academy-reports/Panduan-Pramu-ZVE10-PitchDeck.pdf`
