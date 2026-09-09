(function () {
  const SYSTEM_PROMPT_FALLBACK =
    "Kamu analis youth football TFS/TFDEV yang ahli membaca perilaku manusia di lapangan (bukan hanya skor). " +
    "Tim kita jersey orange. PRIMARY EVIDENCE = VIDEO / frame gambar. Jangan mengarang gol/shot/kartu/skor. " +
    "N/C jika unreadable dari footage. Angka yang tidak yakin dari wide cam = null + reason. " +
    "Possession & attacking sequences boleh estimasi (estimated:true). No fake GPS. " +
    "OBSERVASI FRAME SANGAT DETAIL: amati SETIAP frame — nomor punggung, orientasi tubuh, scanning/shoulder check, " +
    "first touch, spacing, courage 1v1, reset setelah lose, help peers, GK, momen coaching. " +
    "Per momen: timestamp dari urutan frame, siapa/apa/mengapa, valence. " +
    "STAR LAYER = human behavior. behaviorInsights kaya: teamMood; keyBehaviors min 5–8 bila bukti; " +
    "parentStory paragraf hangat Indonesia spesifik; coachCues drill actionable Indonesia. " +
    "Match Centre hanya jika bukti; else N/C + reason. Never invent GPS. " +
    "Lebih baik detail lambat daripada jawaban generik. Klaim hanya dari frame. " +
    "Output: ringkasan singkat + JSON { matchCentre, behaviorInsights, parentReports?, highlights? }. " +
    "Petakan perilaku ke strengths/focus Parent Report & judul/note Highlights. " +
    "Bahasa Indonesia, konkret, cocok untuk coach & orang tua.";

  const FULL_PROMPT_EMBEDDED = `# Prompt Analitik — TFDEV Analitik · Human Behavior Vision

Gunakan prompt ini saat AI memproses video match academy (TFS / TFDEV) untuk **Match Centre**, **behaviorInsights** (bintang), **Parent Session Report**, dan **Highlights**.

## Peran
Analis youth academy TFS/TFDEV yang membaca **bagaimana pemain berperilaku sebagai manusia di lapangan** — bukan scoreboard kering saja. Bahasa Indonesia, jujur terhadap footage.

## Konteks
- Tim: **TFS** jersey **orange** · youth / small-sided · kamera wide sideline
- Jangan mengarang gol/shot/kartu/skor · **no fake GPS** · N/C jika unreadable

## Tugas
### A. Match Centre — angka tetap, bukan bintang
Identitas, scoreline (confidence), possession estimated, attacking sequences, shots/SoT/corners/FK/cards (null+reason), timeline, players identified, internal notes.

### B. Human Behavior Insights — STAR (wajib)
Amati SETIAP frame detail: nomor punggung, orientasi tubuh, scanning/shoulder check, first touch, spacing, courage 1v1, reset setelah lose, help peers, GK, momen coaching. Per key moment: t dari urutan frame, siapa/apa/mengapa, valence.
Observasi: decision under pressure, body language/effort setelah lose, scanning & communication, reaksi coach/teman, 1v1 courage, recovery honesty, pressing triggers, leadership/help/celebrate/fair play, attention (bahasa lembut).
Hanya klaim dari footage. Lebih baik detail lambat daripada jawaban generik. Klaim hanya dari frame.
\`behaviorInsights\`: teamMood; keyBehaviors min 5–8 bila bukti [{t, playerNo, tag∈SCANNING|COURAGE|RESET|PRESS|HELP|FOCUS|COMM|LEADER|FAIRPLAY|CELEBRATE|PATIENCE|EFFORT|DISTRACT|FIRSTTOUCH|GK, note, valence∈positive|coach|caution}]; parentStory (paragraf hangat Indonesia spesifik untuk ortu); coachCues[] (drill actionable Indonesia).

### C. Parent Report (jika diminta)
Overall score + label; sessionSummary **bernuansa perilaku**; metrics proxy video_observation; strengths dari keyBehaviors positif; focus dari coach/caution; 4 home drills; coach note hangat.

### D. Highlights (preferred)
Judul/note bernuansa perilaku; type∈GOL|CHANCE|SKILL|SAVE|COACHING|LAINNYA; t=detik.

## Aturan
Honesty / video-first; Match Centre hanya jika bukti di frames else N/C + reason; never invent GPS; confirmed vs estimated; Lebih baik detail lambat daripada jawaban generik. Klaim hanya dari frame. JSON valid { matchCentre, behaviorInsights, parentReports?, highlights? }.

## Schema ringkas
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
  "behaviorInsights": {
    "teamMood": "",
    "keyBehaviors": [{ "t": 90, "playerNo": "7", "tag": "SCANNING", "note": "", "valence": "positive" }],
    "parentStory": "",
    "coachCues": [""]
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
  ],
  "highlights": [{ "t": 90, "type": "COACHING", "team": "TFS", "playerNo": "7", "title": "", "note": "", "rating": 4 }]
}
\`\`\`

## Prompt satu-blok
Analisis VIDEO match youth academy untuk TFDEV · Human Behavior Vision (observasi sangat detail).
PRIMARY EVIDENCE = video/frame. Jangan mengarang. N/C jika unreadable. No fake GPS.
Lebih baik detail lambat daripada jawaban generik. Klaim hanya dari frame.
Amati SETIAP frame: nomor, orientasi, scanning, first touch, spacing, courage, reset, help, GK, coaching moment.
STAR = perilaku manusia. behaviorInsights: keyBehaviors min 5–8 bila bukti; parentStory paragraf hangat Indonesia; coachCues drill actionable.
Tim: TFS (orange). Lawan: [ISI]. Babak: [ISI]. Frames: [ISI]. Parent: [NAMA/NO atau skip].
Kembalikan ringkasan singkat (utamakan perilaku detail) lalu JSON schema di atas.`;

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
        away: 3,
        confidence: "high",
        note: "Coach Event Sheet Babak 1 (bukan tebakan 0-0). Corner 0–1 · saves 3–0.",
        source: "coach_event_sheet"
      },
      possession: { homePct: 54, awayPct: 46, estimated: true },
      stats: {
        attackingSequences: { home: 4, away: 3, estimated: true },
        shots: { home: null, away: null },
        shotsOnTarget: { home: null, away: null },
        corners: { home: 0, away: 1 },
        saves: { home: 3, away: 0 },
        freeKicks: { home: null, away: null },
        cards: { home: 0, away: 0 }
      },
      uncountable: ["shotsOnTarget"],
      timeline: [
        { minute: "12", type: "CHANCE", team: "TFS", playerNo: "7", text: "Cutback half-space", confidence: "medium" }
      ],
      playersIdentified: { TFS: [{ no: "7", note: "Aktif di build-up" }] },
      internalNotes: ["Pressing midfield agresif babak 1", "Finishing masih kurang tajam"]
    },
    behaviorInsights: {
      teamMood: "Kompak, tetap mencoba setelah chance terbuang",
      keyBehaviors: [
        {
          t: 90,
          playerNo: "7",
          tag: "SCANNING",
          note: "Head up sebelum receive di half-space; peer cue ke #8",
          valence: "positive"
        },
        {
          t: 210,
          playerNo: "7",
          tag: "RESET",
          note: "Setelah lose ball, recovery run jujur tanpa sulk",
          valence: "positive"
        },
        {
          t: 300,
          playerNo: "7",
          tag: "PATIENCE",
          note: "Sempat force pass di tekanan — cue: napas & scan dulu",
          valence: "coach"
        }
      ],
      parentStory:
        "Athalla terlihat semakin berani mengangkat kepala sebelum menerima bola, dan tetap berusaha pulih setelah kehilangan bola. Ada momen di mana ia terburu-buru mengoper di bawah tekanan — itu titik coaching yang sehat untuk usia ini, bukan kekurangan karakter.",
      coachCues: [
        "Rayakan scanning & recovery honesty di clip",
        "Drill: receive under press → 2 opsi (patience vs pass)",
        "Bahasa lembut saat bahas force-pass moment"
      ]
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
          "Athalla aktif di build-up dengan scanning yang lebih sering, dan recovery run setelah lose ball terasa jujur. Di sepertiga akhir masih ada momen force-pass — fokus minggu depan: patience + finishing setelah receive di half-space.",
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

    // Prefer Tim Analis v2; fallback to v1 then embedded
    const [sys2, full2, sys1, full1] = await Promise.all([
      tryFetch("prompts/system-prompt-analitik-v2.txt"),
      tryFetch("prompts/prompt-analitik-tfdev-v2.md"),
      tryFetch("prompts/system-prompt-analitik.txt"),
      tryFetch("prompts/prompt-analitik-tfdev.md")
    ]);

    const sys = (sys2 && sys2.trim()) || (sys1 && sys1.trim()) || "";
    const full = (full2 && full2.trim()) || (full1 && full1.trim()) || "";

    if (sys) systemPrompt = sys;
    if (full) promptText = full;
    else promptText = SYSTEM_PROMPT_FALLBACK + "\n\n---\n\n" + FULL_PROMPT_EMBEDDED;

    const mode = document.querySelector('input[name="genPromptMode"]:checked');
    const useFull = !mode || mode.value === "full";
    displayPrompt(useFull ? promptText : systemPrompt);

    const badge = document.getElementById("genPromptSource");
    if (badge) {
      const src = full2 ? "prompts/ v2" : full1 ? "prompts/ v1" : "Embedded fallback";
      badge.textContent = "Loaded from " + src;
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
