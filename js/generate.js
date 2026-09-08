(function () {
  const SYSTEM_PROMPT_FALLBACK =
    "Kamu analis youth football TFS/TFDEV. Tim kita jersey orange. PRIMARY EVIDENCE = VIDEO / frame gambar. Jangan mengarang gol/shot/kartu/skor. N/C jika unreadable dari footage. Angka yang tidak yakin dari wide cam = null + reason. Possession & attacking sequences boleh estimasi (estimated:true). Output: ringkasan singkat + JSON Match Centre dan (jika diminta) Parent Session Report gaya TFDEV (overall score, 9 metrics, strengths, focus, 4 home drills, coach note). Bahasa Indonesia, konkret, cocok untuk coach & orang tua.";

  const FULL_PROMPT_EMBEDDED = `# Prompt Analitik — TFDEV Analitik

Gunakan prompt ini saat AI / Tim Analis memproses video match atau sesi latihan academy (TFS / TFDEV) untuk mengisi **Match Centre** dan **Parent Session Report**.

## Peran
Kamu adalah analis sepak bola youth academy untuk **Total Football School (TFS / TFDEV)**.
Output harus akurat, jujur terhadap footage, bahasa Indonesia yang mudah dipahami coach & orang tua, dan siap di-inject ke app TFDEV Analitik (JSON di bawah).

## Konteks tetap
- Tim kita: **TFS** — jersey **orange**
- Lawan: sebutkan nama + warna jersey jika terbaca
- Usia: youth / small-sided (sering 7v7–9v9, gawang portable)
- Kamera tipikal: sideline elevated (ZV-E10), wide tactical; boleh ada Cam2 detail
- Timestamp overlay di video sering format \`DD/MM/YYYY HH:MM:SS\`
- Jangan mengarang gol, shot, kartu, atau skor yang tidak terlihat jelas

## Input yang kamu terima
1. PRIMARY: Video match / babak (atau cuplikan) dan/atau frame JPEG
2. (Opsional) metadata: nama lawan, babak, lokasi, tanggal, nama pemain fokus untuk parent report
3. (Opsional, sekunder) event sheet — jangan dipakai untuk mengarang angka yang tidak terlihat di video

## Tugas analitik (urut)
### A. Match Centre (tim vs tim)
Dari VIDEO / frames (bukti utama), hasilkan:
1. Identitas match, scoreline (confidence), possession (estimated), attacking sequences, shots/SoT/corners/FK/cards (null + reason jika tidak yakin), timeline events, players identified, coach notes internal.

### B. Parent Session Report (per pemain — jika diminta)
Overall score 0–100 + label, session summary, 9 metrics (proxy observasi OK), strengths, focus areas, 4 home drills, coach note.

## Aturan kualitas
- Honesty first / video-first: bukti utama VIDEO/frames; lebih baik null / N/C daripada angka palsu
- Jangan invent event yang tidak terbaca dari footage
- Bedakan confirmed vs estimated
- Output JSON valid sesuai schema Match Centre + parentReports

## Schema output JSON (ringkas)
\`\`\`json
{
  "matchCentre": {
    "meta": { "title": "", "dateStamp": "", "sourceFile": "", "camera": "wide_sideline" },
    "teams": { "home": { "name": "TFS", "kit": "orange" }, "away": { "name": "", "kit": "" } },
    "score": { "home": 0, "away": 0, "confidence": "medium", "note": "" },
    "possession": { "homePct": 50, "awayPct": 50, "estimated": true },
    "stats": {
      "attackingSequences": { "home": null, "away": null, "estimated": true },
      "shotsOnTarget": { "home": null, "away": null },
      "cards": { "home": 0, "away": 0 }
    },
    "internalNotes": [""]
  },
  "parentReports": [
    {
      "player": { "name": "", "position": "", "sessionDate": "" },
      "overallScore": 0,
      "scoreLabel": "GOOD",
      "sessionSummary": "",
      "metrics": [{ "label": "Work rate", "value": "8.0", "tag": "" }],
      "strengths": [""],
      "focusAreas": [{ "title": "", "desc": "" }],
      "coach": { "name": "Coach Pramu", "note": "" }
    }
  ]
}
\`\`\`

## Prompt satu-blok (copy-paste)
Analisis VIDEO match youth academy berikut untuk TFDEV Analitik.
PRIMARY EVIDENCE = video / frame yang dilampirkan. Jangan mengarang. N/C jika unreadable dari footage.

Tim kita: TFS (jersey orange). Lawan: [ISI]. Babak/clip: [ISI].
Frame timestamps (jika ada): [ISI]
Pemain untuk Parent Report (opsional): [NAMA / NOMOR / ATAU "skip parent report"]

Ikuti aturan: jangan mengarang event; angka yang tidak terbaca dari wide cam = null + alasan; possession & attacking sequences boleh estimasi dengan flag estimated=true.

Kembalikan ringkasan singkat (5–8 baris) lalu JSON sesuai schema Match Centre + Parent Reports TFDEV.`;

  const SAMPLE_JSON = {
    matchCentre: {
      meta: {
        title: "TFS VS G8 Babak 1",
        dateStamp: "01/02/2024",
        clipDurationSec: 1200,
        format: "7v7",
        camera: "wide_sideline",
        sourceFile: "(T8) TFS VS G8 Babak 1"
      },
      teams: {
        home: { name: "TFS", kit: "orange" },
        away: { name: "G8", kit: "blue" }
      },
      score: {
        home: 0,
        away: 0,
        confidence: "high",
        note: "Estimasi dari footage wide sideline. Shot/corner N/C jika tidak terkonfirmasi."
      },
      possession: { homePct: 54, awayPct: 46, estimated: true },
      stats: {
        attackingSequences: { home: 4, away: 3, estimated: true },
        shots: { home: null, away: null },
        shotsOnTarget: { home: null, away: null },
        corners: { home: null, away: null },
        freeKicks: { home: null, away: null },
        cards: { home: 0, away: 0 }
      },
      uncountable: ["shotsOnTarget", "corners"],
      timeline: [
        { minute: "12", type: "CHANCE", team: "TFS", playerNo: "7", text: "Cutback half-space", confidence: "medium" }
      ],
      playersIdentified: { TFS: [{ no: "7", note: "Aktif di build-up" }] },
      internalNotes: ["Pressing midfield agresif babak 1", "Finishing masih kurang tajam"]
    },
    parentReports: [
      {
        player: {
          name: "Athalla Jiandra",
          ageGroup: "U10",
          location: "Lapangan TFS",
          position: "Midfielder",
          sessionDate: "08 Sep 2026"
        },
        overallScore: 82,
        scoreLabel: "GOOD",
        sessionSummary:
          "Athalla aktif di fase build-up dan pressing. Keputusan passing membaik di sepertiga akhir. Fokus minggu depan: finishing setelah receive di half-space.",
        metrics: [
          { key: "workRate", label: "Work rate", value: "8.5", tag: "tinggi", source: "video_observation" },
          { key: "passes", label: "Passing", value: "7.5", tag: "stabil", source: "video_observation" },
          { key: "decision", label: "Decision", value: "8.0", tag: "membaik", source: "video_observation" }
        ],
        strengths: [
          "Tekanan tinggi di midfield",
          "Komunikasi dengan #6 & #8",
          "Recovery run setelah lose ball"
        ],
        focusAreas: [
          { title: "Timing receive di half-space", desc: "Scan sebelum terima" },
          { title: "Finishing 1-touch setelah cutback", desc: "" },
          { title: "Scan sebelum terima bola", desc: "" }
        ],
        homeSupport: {
          frequency: "10–15 minutes, 2–3 times per week",
          drills: [{ title: "Wall pass + finish", desc: "2-touch", goal: "1-touch finish" }]
        },
        coach: { name: "Coach Pramu", note: "Pertahankan work rate; fokus finishing minggu ini." }
      }
    ]
  };

  let promptText = FULL_PROMPT_EMBEDDED;
  let systemPrompt = SYSTEM_PROMPT_FALLBACK;

  function setStatus(msg, ok) {
    const el = document.getElementById("genStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "gen-status" + (msg ? (ok ? " ok" : " err") : "");
  }

  function displayPrompt(text) {
    const pre = document.getElementById("genPromptView");
    if (pre) pre.textContent = text;
  }

  async function loadPrompts() {
    const tryFetch = async (path) => {
      try {
        const res = await fetch(path);
        if (!res.ok) return null;
        return await res.text();
      } catch (_) {
        return null;
      }
    };

    const [sys, full] = await Promise.all([
      tryFetch("prompts/system-prompt-analitik.txt"),
      tryFetch("prompts/prompt-analitik-tfdev.md")
    ]);

    if (sys && sys.trim()) systemPrompt = sys.trim();
    if (full && full.trim()) promptText = full.trim();
    else promptText = SYSTEM_PROMPT_FALLBACK + "\n\n---\n\n" + FULL_PROMPT_EMBEDDED;

    const mode = document.querySelector('input[name="genPromptMode"]:checked');
    const useFull = !mode || mode.value === "full";
    displayPrompt(useFull ? promptText : systemPrompt);

    const badge = document.getElementById("genPromptSource");
    if (badge) {
      badge.textContent = full ? "Loaded from prompts/" : "Embedded fallback";
      badge.className = "pill" + (full ? " orange" : "");
    }
  }

  function currentPrompt() {
    const mode = document.querySelector('input[name="genPromptMode"]:checked');
    return mode && mode.value === "system" ? systemPrompt : promptText;
  }

  async function copyPrompt() {
    const text = currentPrompt();
    try {
      await navigator.clipboard.writeText(text);
      window.TFDEV.toast("Prompt disalin ke clipboard");
      setStatus("Prompt disalin.", true);
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      window.TFDEV.toast("Prompt disalin");
      setStatus("Prompt disalin.", true);
    }
  }

  function parseJsonInput() {
    const raw = document.getElementById("genJsonInput").value.trim();
    if (!raw) throw new Error("JSON kosong — tempel hasil AI dulu.");
    let text = raw;
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
    return JSON.parse(text);
  }

  function applyMatchCentre() {
    try {
      const data = parseJsonInput();
      const mc = data.matchCentre || data;
      if (!window.MatchCentre || !window.MatchCentre.applyJson) {
        throw new Error("MatchCentre API belum siap");
      }
      window.MatchCentre.applyJson(mc);
      window.TFDEV.showPage("matchcentre");
      window.TFDEV.toast("Match Centre diisi dari JSON");
      setStatus("Match Centre diterapkan. Preview di halaman Match Centre.", true);
    } catch (e) {
      setStatus("Gagal parse/terapkan Match Centre: " + e.message, false);
      window.TFDEV.toast("JSON tidak valid");
    }
  }

  function applyParentReport() {
    try {
      const data = parseJsonInput();
      const reports = data.parentReports || (data.player ? [data] : null);
      if (!reports || !reports.length) {
        throw new Error("parentReports[0] tidak ditemukan di JSON");
      }
      if (!window.ParentReport || !window.ParentReport.applyJson) {
        throw new Error("ParentReport API belum siap");
      }
      window.ParentReport.applyJson(reports[0], data.matchCentre || null);
      window.TFDEV.showPage("report");
      window.TFDEV.toast("Parent Report diisi dari JSON");
      setStatus("Parent Report diterapkan dari parentReports[0].", true);
    } catch (e) {
      setStatus("Gagal parse/terapkan Parent Report: " + e.message, false);
      window.TFDEV.toast("JSON tidak valid");
    }
  }

  function loadSample() {
    document.getElementById("genJsonInput").value = JSON.stringify(SAMPLE_JSON, null, 2);
    setStatus("Sample JSON dimuat. Klik Terapkan ke Match Centre / Parent Report.", true);
    window.TFDEV.toast("Sample JSON dimuat");
  }


  function applyPlayerDashboard() {
    try {
      const data = parseJsonInput();
      if (!window.PlayerDashboard || !window.PlayerDashboard.applyFromAnalytics) {
        throw new Error("PlayerDashboard API belum siap");
      }
      window.PlayerDashboard.applyFromAnalytics(data);
      window.TFDEV.showPage("player");
      window.TFDEV.toast("Player Dashboard diisi dari JSON");
      setStatus("Player Dashboard diterapkan (playerDashboard atau parentReports[0]).", true);
    } catch (e) {
      setStatus("Gagal parse/terapkan Player Dashboard: " + e.message, false);
      window.TFDEV.toast("JSON tidak valid");
    }
  }
  window.TFDEV = window.TFDEV || {};
  window.Generate = {
    getSystemPrompt: function () { return systemPrompt || SYSTEM_PROMPT_FALLBACK; },
    getFullPrompt: function () { return promptText || FULL_PROMPT_EMBEDDED; },
    SYSTEM_PROMPT_FALLBACK: SYSTEM_PROMPT_FALLBACK,
    parseJsonInput: parseJsonInput,
    SAMPLE_JSON: SAMPLE_JSON
  };

  window.TFDEV.initGenerate = function () {
    document.getElementById("genCopyPrompt").addEventListener("click", copyPrompt);
    document.getElementById("genApplyMc").addEventListener("click", applyMatchCentre);
    document.getElementById("genApplyPr").addEventListener("click", applyParentReport);
    var pdBtn = document.getElementById("genApplyPd");
    if (pdBtn) pdBtn.addEventListener("click", applyPlayerDashboard);
    document.getElementById("genLoadSample").addEventListener("click", loadSample);
    document.querySelectorAll('input[name="genPromptMode"]').forEach((el) => {
      el.addEventListener("change", () => displayPrompt(currentPrompt()));
    });
    loadPrompts();
  };
})();
