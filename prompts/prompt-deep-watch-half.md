# Deep-watch · satu babak (full video)

Ini adalah **[BABAK 1 / BABAK 2]** pertandingan. Tonton seluruh cuplikan ini.

## Tugas
1. Tulis **timeline event lengkap** dengan timestamp video (detik dari awal clip/babak).
2. Gambar **bentuk kedua tim** dengan kata-kata (baris belakang, lini tengah, baris depan) di menit **5, 20, dan 40+** (atau ekuivalen babak 2).
3. Jelaskan **3 pola berulang** tiap tim (contoh: "fullback kiri selalu invert ke half-space saat pivot terima bola").
4. Daftar semua **big chance**.
5. Catat perubahan setelah **gol / kartu / pergantian**.
6. Tutup dengan **ringkasan 8 bullet**: siapa mengendalikan babak ini dan mengapa.

Jangan ringkas berlebihan. Lebih baik lengkap dan terikat timestamp.

## Output
Ringkasan berstruktur (Bahasa Indonesia) + JSON TFDEV:
`{ matchCentre, behaviorInsights, parentReports?, highlights?, deepWatch? }`

`deepWatch` (opsional tapi dianjurkan):
```json
{
  "half": "Babak 1|Babak 2",
  "timeline": [{ "t": 0, "type": "GOL|CHANCE|SAVE|CORNER|KARTU|SUB|SHAPE|NOTE", "team": "", "playerNo": "", "desc": "" }],
  "shapes": [{ "minute": 5, "home": "", "away": "" }],
  "patterns": { "home": ["", "", ""], "away": ["", "", ""] },
  "bigChances": [{ "t": 0, "team": "", "desc": "" }],
  "afterEvents": [{ "t": 0, "trigger": "gol|kartu|sub", "change": "" }],
  "controlSummary": ["", "", "", "", "", "", "", ""]
}
```

matchCentre.timeline type ∈ GOL|SHOT|SAVE|CORNER|FK|KARTU|CHANCE|NOTE|SUB.
Jangan default skor 0-0. N/C jika tidak terbaca. No fake GPS.
