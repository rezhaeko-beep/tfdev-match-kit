# Analitik prompts v2

| File | Role |
|------|------|
| `system-prompt-analitik-v2.txt` | System / developer instruction |
| `prompt-analitik-tfdev-v2.md` | User / package prompt (+ schema) |

Wire: Super Grok hooks kecil di `analitik.js` / `generate.js` — prefer load v2; fallback ke file tanpa `-v2` jika perlu.

Compatible with apply-all: `matchCentre`, optional `behaviorInsights`, `parentReports`, `playerDashboard`, `highlights`.

Score honesty: never default `0-0`. Priority: coach_event_sheet → overlay → full_video_ai → clip_tags → N/C (`match-stats-formula.md`).

Modes: **full video** (Gemini Files, primary) vs **~8 frame sample** (fast fallback). Same apply path; score honesty rules identical.


| `prompt-deep-watch-half.md` | Deep-watch satu babak (timeline, shape, pola, big chance) |
| `prompt-full-match-report.md` | Gabung Babak 1+2: taktik antarbabak, sub, penilaian manajer |
| `prompt-kids-pro-report.md` | Laporan pro bahasa anak (9 bagian + kidsProReport JSON) |
| `match-stats-formula.md` | Rumus Match stats v1 (sheet→overlay→AI→clips→N/C); paired with `js/match-stats.js` |
