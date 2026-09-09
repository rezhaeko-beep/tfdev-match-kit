# Laporan pro · bahasa anak (full video)

Tonton video pertandingan ini sampai selesai. Buat analisis pro yang mudah dipahami anak-anak.

## DATA (isi jika tahu; jika kosong, deteksi dari video)
- Kompetisi / turnamen:
- Tim A vs Tim B:
- Ini pertandingan dewasa / anak-anak:
- Usia pembaca: [contoh 10 tahun]
- Skor (jika tahu):
- Fokus: [seluruh laga / hanya Tim A / hanya pemain nomor X / hanya gol dan peluang]

Meta dari UI (jika ada) dipakai mengisi DATA di atas.

## HASILKAN LAPORAN DENGAN URUTAN INI

### 1) KABAR LAPANGAN (maks 8 kalimat)
Siapa lawan siapa, skor, siapa yang lebih menguasai permainan, suasana laga. Bahasa anak.

### 2) KAMUS MINI PERTANDINGAN INI
Maks 6 istilah yang memang muncul di laga. Format:
- Istilah: arti anak-anak + 1 contoh dari video + timestamp

### 3) JALAN CERITA LAGA
Bagi jadi 4–6 babak cerita (bukan cuma babak 1/2).
Tiap bagian: judul seru, skor saat itu, 3 bullet, 1 timestamp kunci.

### 4) PETA TAKTIK (PRO, TAPI ANAK PAHAM)
Untuk Tim A dan Tim B:
- Bentuk di lapangan (contoh: 4-3-3, lalu jelaskan "4 penjaga belakang, 3 otak tengah, 3 penyerang")
- Cara membangun serangan
- Cara merebut bola
- Cara balik menyerang
- 1 trik yang berhasil + timestamp
- 1 lubang yang sering kebobolan peluang + timestamp

### 5) MOMEN WOW & MOMEN OOPS
List minimal 8 momen:
Timestamp | Apa yang terjadi | Kenapa pintar / kurang tepat | Pelajaran untuk anak
Termasuk: gol, peluang emas, save, umpan kunci, salah posisi, kartu (jika ada).

### 6) PAHLAWAN LAPANGAN
Pilih 5 pemain paling berpengaruh.
Untuk tiap pemain (jika pemain anak: pakai nomor, jangan kritik pedas):
- Peran aslinya di lapangan
- 1 aksi hebat + timestamp
- 1 hal yang bisa dilatih
- Bintang 1–5 (bukan 1–10) + alasan 1 kalimat

### 7) PELUANG GOL
Daftar peluang jelas. Kualitas: Emas / Bagus / Sayang sekali.
Jelaskan kenapa gampang atau sulit, tanpa angka xG rumit.

### 8) PESAN PELATIH UNTUK ANAK
- 5 pelajaran taktik
- 1 latihan 10 menit yang bisa ditiru di sekolah/SSB
- 3 cuplikan wajib tonton ulang (rentang timestamp)

### 9) YANG BELUM BISA PASTI
Batasannya: statistik jarak lari, sentuhan resmi, dsb. tidak ada di video.

Jangan panjang bertele-tele. Padat, urut, selalu terikat gambar/video.
Jangan default skor 0-0. N/C jika tidak terbaca. No fake GPS.

## Output
Narasi berstruktur (urut 1–9) + JSON:
`{ matchCentre, behaviorInsights, parentReports?, highlights?, kidsProReport? }`

`kidsProReport` (opsional tapi dianjurkan): ringkas field untuk UI —
`{ kabarLapangan, kamusMini[], ceritaBab[], petaTaktik, momenWowOops[], pahlawan[], peluangGol[], pesanPelatih, belumPasti[] }`
