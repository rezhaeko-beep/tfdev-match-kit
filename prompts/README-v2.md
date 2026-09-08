# Analitik prompts v2

| File | Role |
|------|------|
| `system-prompt-analitik-v2.txt` | System / developer instruction |
| `prompt-analitik-tfdev-v2.md` | User / package prompt (+ schema) |

Wire: Super Grok hooks kecil di `analitik.js` / `generate.js` — prefer load v2; fallback ke file tanpa `-v2` jika perlu.

Compatible with apply-all: `matchCentre`, optional `behaviorInsights`, `parentReports`, `playerDashboard`, `highlights`.
