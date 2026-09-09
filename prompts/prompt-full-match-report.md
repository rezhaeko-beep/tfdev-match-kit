# Laporan utuh · Gabung Babak 1 + Babak 2

Gabungkan analisis **Babak 1** dan **Babak 2** menjadi laporan pertandingan utuh.

## Tambahkan wajib
1. **Perubahan taktik antarbabak** (apa yang berubah dari babak 1 → 2, mengapa).
2. **Dampak pergantian pemain** (siapa masuk/keluar, efek ke shape/press/chance).
3. **Penilaian manajer** (keputusan bagus/buruk, game management, reaction).

## Aturan
- **Jangan mengulang timeline mentah** dari tiap babak.
- **Sitir timestamp penting saja** (gol, big chance, momen taktikal, sub kunci).
- Bahasa Indonesia, konkret, terikat bukti video / Event Sheet.

## Output
Laporan naratif berstruktur + JSON:
`{ matchCentre, behaviorInsights, parentReports?, highlights?, fullMatchReport? }`

`fullMatchReport`:
```json
{
  "tacticalChange": "",
  "substitutionImpact": [{ "t": 0, "playerIn": "", "playerOut": "", "impact": "" }],
  "managerAssessment": { "positives": [""], "negatives": [""], "grade": "A|B|C|D", "note": "" },
  "keyTimestamps": [{ "t": 0, "why": "" }],
  "whoControlled": "",
  "finalBullets": ["", "", "", "", "", "", "", ""]
}
```

Score/corners/saves dari bukti atau Event Sheet; jangan default 0-0. N/C jika unclear.
