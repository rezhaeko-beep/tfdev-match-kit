# Rumus Match Stats (TFDEV Match Kit)

Satu sumber kebenaran: `js/match-stats.js` + `data/event-sheets.json`.

## Urutan prioritas sumber (tinggi → rendah)

1. **coach_event_sheet** — angka coach terverifikasi di `event-sheets.json` (Goals / Corners / Saves).
2. **score_overlay** — skor/overlay terbaca jelas di footage.
3. **full_video_ai** — Gemini Files menonton video utuh (skor + timeline GOL + corner/save yang *countable*).
4. **clip_tags** — hitungan Highlights (`GOL`, `SAVE`, …). Hanya cadangan skor bila sumber 1–3 kosong.
5. **N/C** — tidak jelas → `null` / tampil `N/C`. **Jangan default 0–0** dengan confidence tinggi.

## Field Match stats (urutan kartu)

| Field | Rumus | Boleh estimasi? |
|-------|--------|-----------------|
| **Goals** | Sheet → overlay → AI skor → count timeline `GOL`/`GOAL` per tim → clip `GOL` tags | Tidak |
| **Corners** | Sheet → AI count bila jelas → N/C | Tidak |
| **Saves** | Sheet → AI/clip `SAVE` bila jelas → N/C | Tidak |
| **Shots on target** | Hanya jika jelas di footage; wide cam biasanya **N/C** | Tidak |
| **Attacking sequences** | Estimasi wilayah/serangan; wajib `estimated:true` + prefix `~` | Ya |
| **Cards** | Hanya jika terlihat; else 0 hanya jika yakin tidak ada, else N/C | Tidak |
| **Possession %** | Estimasi wilayah bola; `estimated:true`; bukan GPS | Ya |

## Aturan merge

- Fixture dikenal (mis. TFS×G8 Babak 1): **Goals / Corners / Saves dari sheet menang**. AI boleh menambah *timestamp* gol di timeline, tapi tidak menimpa skor sheet kecuali AI `confidence:high` **dan** jumlah timeline GOL = skor AI **dan** skor AI ≠ sheet (flag `conflict` di note — tetap tampilkan sheet sampai coach override).
- Fixture tidak dikenal: pakai AI full-video; skor lemah/`0-0` tanpa bukti → `confidence:low` + note N/C.
- `timeline` GOL harus selaras skor: jika sheet bilang away=3 dan AI hanya 1 GOL di timeline → *pad* entri GOL dari sheet (detik N/C) sampai jumlah cocok.
- Possession & attacking **tidak** ditampilkan sebagai “kebenaran Event Sheet”; selalu estimasi.

## Output JSON (inti)

```json
{
  "score": { "home": 0, "away": 3, "confidence": "high", "source": "coach_event_sheet", "note": "…" },
  "stats": {
    "corners": { "home": 0, "away": 1 },
    "saves": { "home": 3, "away": 0 },
    "shotsOnTarget": { "home": null, "away": null },
    "attackingSequences": { "home": null, "away": null, "estimated": true },
    "cards": { "home": 0, "away": 0 }
  },
  "possession": { "homePct": null, "awayPct": null, "estimated": true }
}
```
