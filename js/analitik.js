(function () {
  const API_KEY_LS = "tfdev-analitik-api-key";
  const API_BASE_LS = "tfdev-analitik-api-base";
  const API_MODEL_LS = "tfdev-analitik-api-model";
  const MAX_VISION_FRAMES = 8;
  const MAX_VISION_FRAMES_FULL_AUTO = 8;
  const JPEG_QUALITY = 0.68;
  const CAPTURE_MAX_WIDTH = 960;
  const GEMINI_MODEL_FALLBACKS = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest"
  ];

  let videoObjectUrl = null;
  let frames = []; // { id, t, dataUrl, w, h }
  let lastVideoFile = null; // File/Blob for full-video Gemini upload
  let lastResult = null;
  let frameSeq = 0;

  const SYSTEM_PROMPT_FALLBACK =
    "Kamu analis youth football TFS/TFDEV yang ahli membaca perilaku manusia di lapangan (bukan hanya skor). " +
    "Tim kita jersey orange. PRIMARY EVIDENCE = VIDEO / frame gambar yang disertakan. " +
    "Jangan mengarang gol/shot/kartu/skor. Angka yang tidak terbaca = null + reason (N/C). " +
    "Possession & attacking sequences boleh estimasi (estimated:true). No fake GPS. " +
    "OBSERVASI FRAME SANGAT DETAIL: amati SETIAP frame — nomor punggung jika terbaca, orientasi tubuh, " +
    "scanning (shoulder check / head up), first touch, spacing, courage 1v1, reset setelah lose ball, " +
    "help peers, keterlibatan GK, momen coaching-relevant. Per momen kunci: timestamp dari urutan frame, " +
    "siapa/apa/mengapa, valence (positive|coach|caution). " +
    "STAR LAYER = human behavior: decision under pressure, scanning, courage 1v1, reset setelah lose, " +
    "help peers, body language, fair play, first touch, GK, attention (bahasa lembut, age-appropriate). " +
    "behaviorInsights kaya: teamMood; keyBehaviors min 5–8 bila bukti [{t,playerNo,tag,note,valence}]; " +
    "parentStory = paragraf hangat Indonesia untuk ortu (spesifik dari frame); " +
    "coachCues = drill actionable berbahasa Indonesia. " +
    "Match Centre stats hanya jika bukti di frames; else N/C + reason — never invent GPS. " +
    "Lebih baik detail lambat daripada jawaban generik. Klaim hanya dari frame. " +
    "Output: ringkasan singkat + JSON { matchCentre, behaviorInsights, parentReports?, highlights? }. " +
    "Petakan perilaku ke strengths/focus Parent Report & judul/note Highlights. " +
    "Bahasa Indonesia, konkret, cocok untuk coach & orang tua.";

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(msg, ok) {
    const el = $("anStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "gen-status" + (msg ? (ok ? " ok" : " err") : "");
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const s = Math.floor(sec % 60);
    const m = Math.floor(sec / 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  function getMode() {
    const checked = document.querySelector('input[name="anMode"]:checked');
    return checked ? checked.value : "api";
  }

  function syncModeUi() {
    // Gemini hero (key/base/model) always visible; legacy prompt/JSON stays in <details>.
    if ($("anApiFields")) $("anApiFields").style.display = "";
    if ($("anExternalFields")) $("anExternalFields").style.display = "";
  }

  function showPostApply(show) {
    const el = $("anPostApply");
    if (el) el.hidden = !show;
  }

  function setMode(value) {
    const radio = document.querySelector('input[name="anMode"][value="' + value + '"]');
    if (radio) {
      radio.checked = true;
      syncModeUi();
    }
  }

  function readMeta() {
    const video = $("anVideo");
    const durFromVideo =
      video && isFinite(video.duration) && video.duration > 0
        ? Math.round(video.duration)
        : null;
    return {
      lawan: ($("anLawan") && $("anLawan").value.trim()) || "Lawan",
      kitLawan: ($("anKitLawan") && $("anKitLawan").value.trim()) || "",
      babak: ($("anBabak") && $("anBabak").value.trim()) || "Babak 1",
      durasi: Number(($("anDurasi") && $("anDurasi").value) || 0) || durFromVideo,
      sourceFile: ($("anSource") && $("anSource").value.trim()) || "",
      player: {
        name: ($("anPlayerName") && $("anPlayerName").value.trim()) || "",
        no: ($("anPlayerNo") && $("anPlayerNo").value.trim()) || "",
        ageGroup: ($("anPlayerAge") && $("anPlayerAge").value.trim()) || "",
        position: ($("anPlayerPos") && $("anPlayerPos").value.trim()) || ""
      }
    };
  }

  function getSystemPrompt() {
    if (window.Generate && typeof window.Generate.getSystemPrompt === "function") {
      return window.Generate.getSystemPrompt() || SYSTEM_PROMPT_FALLBACK;
    }
    return SYSTEM_PROMPT_FALLBACK;
  }

  function getFullPromptBase() {
    if (window.Generate && typeof window.Generate.getFullPrompt === "function") {
      return window.Generate.getFullPrompt() || "";
    }
    return "";
  }

  /* ---------- Video load ---------- */

  function revokeVideoUrl() {
    if (videoObjectUrl) {
      try {
        URL.revokeObjectURL(videoObjectUrl);
      } catch (_) {}
      videoObjectUrl = null;
    }
  }

  function clearVideo() {
    revokeVideoUrl();
    const v = $("anVideo");
    if (v) {
      v.removeAttribute("src");
      v.load();
    }
    if ($("anVideoWrap")) $("anVideoWrap").hidden = true;
    if ($("anDropInner")) $("anDropInner").hidden = false;
    if ($("anVideoFile")) $("anVideoFile").value = "";
    if ($("anVideoName")) $("anVideoName").textContent = "—";
    if ($("anVideoInfo")) $("anVideoInfo").textContent = "—";
    clearFrames();
    setStatus("Video dihapus.", true);
  }

  function loadVideoFile(file) {
    if (!file) return;
    if (!String(file.type || "").startsWith("video/") && !/\.(mp4|mov|webm|m4v|mkv)$/i.test(file.name || "")) {
      setStatus("File harus video (video/*).", false);
      window.TFDEV.toast("Bukan file video");
      return;
    }
    revokeVideoUrl();
    clearFrames();
    videoObjectUrl = URL.createObjectURL(file);
    const v = $("anVideo");
    v.src = videoObjectUrl;
    v.load();
    if ($("anDropInner")) $("anDropInner").hidden = true;
    if ($("anVideoWrap")) $("anVideoWrap").hidden = false;
    if ($("anVideoName")) $("anVideoName").textContent = file.name;
    if ($("anSource") && !$("anSource").value.trim()) {
      $("anSource").value = file.name.replace(/\.[^.]+$/, "");
    }
    lastVideoFile = file;
    setStatus("Video dimuat: " + file.name, true);
    window.TFDEV.toast("Video siap");
  }

  /** Load a Blob/File from Drive (or elsewhere) into #anVideo — same path as file picker. */
  function loadVideoBlob(blob, filename) {
    if (!blob) throw new Error("Blob video kosong");
    const name = filename || "drive-video.mp4";
    const type =
      (blob.type && String(blob.type)) ||
      ( /\.mov$/i.test(name) ? "video/quicktime" :
        /\.webm$/i.test(name) ? "video/webm" :
        /\.m4v$/i.test(name) ? "video/x-m4v" :
        "video/mp4" );
    let file = null;
    try {
      file = new File([blob], name, { type: type, lastModified: Date.now() });
    } catch (_) {
      file = blob;
      try {
        if (!file.name) Object.defineProperty(file, "name", { value: name, configurable: true });
      } catch (__) {}
      try {
        if (!file.type) Object.defineProperty(file, "type", { value: type, configurable: true });
      } catch (__) {}
    }
    loadVideoFile(file);
    return file;
  }

  function onVideoMeta() {
    const v = $("anVideo");
    if (!v) return;
    const dur = isFinite(v.duration) ? v.duration : 0;
    if ($("anDurasi") && (!$("anDurasi").value || Number($("anDurasi").value) === 0)) {
      $("anDurasi").value = String(Math.round(dur) || "");
    }
    if ($("anVideoInfo")) {
      $("anVideoInfo").textContent =
        fmtTime(dur) +
        " · " +
        (v.videoWidth || "?") +
        "×" +
        (v.videoHeight || "?");
    }
    rebuildPromptPreview();
  }

  /* ---------- Frame capture ---------- */

  function updateFramesBadge() {
    const badge = $("anFramesBadge");
    if (badge) {
      badge.textContent = frames.length + " frame";
      badge.className = "pill" + (frames.length ? " orange" : "");
    }
  }

  function renderFramesStrip() {
    const strip = $("anFramesStrip");
    if (!strip) return;
    if (!frames.length) {
      strip.innerHTML = '<div class="an-frames-empty">Belum ada frame — putar video lalu Ambil frame sekarang, atau Ambil sample otomatis.</div>';
      updateFramesBadge();
      return;
    }
    strip.innerHTML = frames
      .map(
        (f) =>
          '<div class="an-frame" data-id="' +
          f.id +
          '">' +
          '<img src="' +
          f.dataUrl +
          '" alt="t=' +
          fmtTime(f.t) +
          '" />' +
          '<div class="an-frame-meta">' +
          "<span>" +
          fmtTime(f.t) +
          "</span>" +
          '<button type="button" class="an-frame-rm" data-rm="' +
          f.id +
          '" aria-label="Hapus frame">×</button>' +
          "</div></div>"
      )
      .join("");
    updateFramesBadge();
    rebuildPromptPreview();
  }

  function clearFrames() {
    frames = [];
    renderFramesStrip();
  }

  function removeFrame(id) {
    frames = frames.filter((f) => f.id !== id);
    renderFramesStrip();
  }

  function captureCurrentFrame() {
    const v = $("anVideo");
    if (!v || !v.src || !v.videoWidth) {
      setStatus("Belum ada video siap — upload dulu.", false);
      window.TFDEV.toast("Upload video dulu");
      return null;
    }
    const canvas = $("anCanvas");
    const maxW = CAPTURE_MAX_WIDTH;
    let w = v.videoWidth;
    let h = v.videoHeight;
    if (w > maxW) {
      h = Math.round((h * maxW) / w);
      w = maxW;
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(v, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const item = {
      id: "f" + ++frameSeq,
      t: Number(v.currentTime) || 0,
      dataUrl: dataUrl,
      w: w,
      h: h
    };
    frames.push(item);
    frames.sort((a, b) => a.t - b.t);
    renderFramesStrip();
    setStatus("Frame diambil di " + fmtTime(item.t) + " (" + frames.length + " total).", true);
    window.TFDEV.toast("Frame @" + fmtTime(item.t));
    return item;
  }

  function seekVideo(t) {
    const v = $("anVideo");
    return new Promise((resolve, reject) => {
      if (!v) return reject(new Error("no video"));
      const onSeeked = () => {
        v.removeEventListener("seeked", onSeeked);
        resolve();
      };
      v.addEventListener("seeked", onSeeked);
      try {
        v.currentTime = Math.min(Math.max(0, t), isFinite(v.duration) ? v.duration - 0.05 : t);
      } catch (e) {
        v.removeEventListener("seeked", onSeeked);
        reject(e);
      }
      // fallback if seeked already at position
      setTimeout(() => {
        if (Math.abs(v.currentTime - t) < 0.35) {
          v.removeEventListener("seeked", onSeeked);
          resolve();
        }
      }, 800);
    });
  }

  async function captureAutoSample() {
    const v = $("anVideo");
    if (!v || !v.src || !isFinite(v.duration) || v.duration <= 0) {
      setStatus("Video belum siap (tunggu metadata / upload dulu).", false);
      window.TFDEV.toast("Video belum siap");
      return;
    }
    const every = Math.max(5, Number(($("anSampleEvery") && $("anSampleEvery").value) || 30));
    const maxN = Math.min(24, Math.max(1, Number(($("anSampleMax") && $("anSampleMax").value) || 12)));
    const wasPaused = v.paused;
    v.pause();

    // Bias: spread + final-third + late transitions (Tim Analis v2), not only evenly spaced
    const times = [];
    const dur = v.duration;
    const near = (a, b) => Math.abs(a - b) < Math.max(2, every * 0.35);
    const pushT = (t) => {
      const x = Math.max(0.4, Math.min(dur - 0.5, t));
      if (!times.some((y) => near(y, x))) times.push(x);
    };
    pushT(0.5);
    // ~40% slots evenly across full match
    const evenSlots = Math.max(2, Math.floor(maxN * 0.4));
    for (let i = 1; i <= evenSlots; i++) {
      pushT((dur * i) / (evenSlots + 1));
    }
    // ~40% slots in final third of video (decisive phase)
    const lateSlots = Math.max(2, Math.floor(maxN * 0.4));
    const late0 = dur * (2 / 3);
    for (let i = 0; i < lateSlots; i++) {
      pushT(late0 + ((dur - late0 - 0.8) * (i + 0.5)) / lateSlots);
    }
    // transition-ish anchors: mid → late, and near end
    pushT(dur * 0.5);
    pushT(dur * 0.72);
    pushT(dur * 0.88);
    pushT(Math.max(0.5, dur - 0.8));
    times.sort((a, b) => a - b);
    const unique = times.slice(0, maxN);

    setStatus("Mengambil " + unique.length + " sample frame…", true);
    const prev = frames.slice();
    try {
      // replace auto samples: keep manually? For simplicity clear then capture
      frames = [];
      for (let i = 0; i < unique.length; i++) {
        await seekVideo(unique[i]);
        // small settle
        await new Promise((r) => setTimeout(r, 40));
        captureCurrentFrame();
      }
      setStatus("Sample otomatis: " + frames.length + " frame (setiap ~" + every + "s).", true);
      window.TFDEV.toast(frames.length + " frame diambil");
    } catch (e) {
      frames = prev;
      renderFramesStrip();
      setStatus("Gagal sample: " + e.message, false);
    }
    if (!wasPaused) {
      try {
        v.play();
      } catch (_) {}
    }
  }

  /* ---------- Prompt package (external) ---------- */

  function buildVideoAnalitikPrompt() {
    const meta = readMeta();
    const sys = getSystemPrompt();
    const full = getFullPromptBase();
    const frameLines = frames.length
      ? frames
          .map((f, i) => "  " + (i + 1) + ". t=" + fmtTime(f.t) + " (" + f.t.toFixed(1) + "s) · " + f.w + "×" + f.h)
          .join("\n")
      : "  (belum ada frame di app — upload video penuh atau JPEG frame ke chat AI)";

    const playerLine = meta.player.name
      ? meta.player.name +
        (meta.player.no ? " #" + meta.player.no : "") +
        (meta.player.ageGroup ? " · " + meta.player.ageGroup : "") +
        (meta.player.position ? " · " + meta.player.position : "")
      : "skip parent report";

    const packagePrompt = [
      "=== TFDEV VIDEO-ANALITIK · HUMAN BEHAVIOR VISION ===",
      "",
      "PRIMARY EVIDENCE: video match / frame yang kamu lihat. JANGAN mengarang. N/C atau null + reason jika tidak terbaca. No fake GPS.",
      "",
      "OBSERVASI FRAME SANGAT DETAIL — amati SETIAP frame:",
      "- Nomor punggung jika terbaca, orientasi tubuh, scanning (shoulder check), first touch, spacing",
      "- Courage 1v1, reset setelah lose ball, help peers, keterlibatan GK, momen coaching-relevant",
      "- Per key moment: timestamp dari urutan frame, siapa/apa/mengapa, valence (positive|coach|caution)",
      "",
      "STAR LAYER = perilaku manusia di lapangan (youth football):",
      "- Decision under pressure (force pass vs patience)",
      "- Body language / confidence / effort setelah lose ball",
      "- Communication & scanning (head up, peer cues)",
      "- Reaksi ke coach / teammates (encouragement, sulk, reset)",
      "- 1v1 courage, recovery run honesty, pressing triggers",
      "- Leadership / help peers / celebrate / fair play",
      "- First touch & body orientation; GK involvement jika terlihat",
      "- Attention / distraction (bahasa lembut, age-appropriate)",
      "Hanya klaim dari frames/video. Match Centre hanya jika bukti (else N/C + reason). No fake GPS.",
      "Lebih baik detail lambat daripada jawaban generik. Klaim hanya dari frame.",
      "behaviorInsights = bintang: keyBehaviors min 5–8 bila bukti; parentStory paragraf hangat Indonesia; coachCues drill actionable.",
      "",
      sys,
      "",
      "--- Meta match ---",
      "Tim kita: TFS (jersey orange)",
      "Lawan: " + meta.lawan + (meta.kitLawan ? " (kit " + meta.kitLawan + ")" : ""),
      "Babak/clip: " + meta.babak + (meta.durasi ? " · durasi ~" + meta.durasi + "s" : ""),
      "Source file: " + (meta.sourceFile || "(dari video upload)"),
      "Pemain Parent Report: " + playerLine,
      "",
      "--- Frame timestamps (dari app TFDEV Analitik) ---",
      frameLines,
      "",
      "INSTRUKSI UNTUK USER (sudah diikuti jika frame/video terlampir):",
      "1. Upload VIDEO penuh (atau frame JPEG di atas) ke Gemini (AI Studio / Chat) vision — jalur utama TFDEV.",
      "2. Paste seluruh prompt ini.",
      "3. Minta output: ringkasan singkat (5–8 baris, utamakan perilaku) lalu JSON valid",
      "   { matchCentre, behaviorInsights, parentReports?, highlights? }.",
      "4. Salin JSON kembali ke app TFDEV → Analitik AI → Paste JSON → Terapkan / Full auto.",
      "",
      "Aturan: jangan invent gol/shot/kartu/skor/perilaku; possession & attacking sequences boleh estimated:true; SoT dari wide cam sering null.",
      "",
      "Wajib — behaviorInsights (kaya, spesifik dari frame):",
      '"behaviorInsights": {',
      '  "teamMood": "…",',
      '  "keyBehaviors": [{ "t": 90, "playerNo": "7", "tag": "SCANNING|COURAGE|RESET|PRESS|HELP|FOCUS|…", "note": "…", "valence": "positive|coach|caution" }],',
      '  "parentStory": "paragraf hangat berbahasa Indonesia untuk ortu — spesifik dari frame, bukan generik",',
      '  "coachCues": ["drill actionable berbahasa Indonesia"]',
      "}",
      "keyBehaviors: min 5–8 bila bukti ada. Lebih baik detail lambat daripada jawaban generik.",
      "Petakan keyBehaviors positif → parentReports.strengths; valence coach/caution → focusAreas; parentStory → sessionSummary.",
      "",
      "Opsional preferred — highlights (judul/note bernuansa perilaku):",
      '"highlights": [{ "t": 40, "type": "COACHING", "team": "TFS", "playerNo": "7", "title": "Scanning sebelum receive", "note": "…", "rating": 4 }]',
      "type ∈ GOL|CHANCE|SKILL|SAVE|COACHING|LAINNYA; t = detik dari awal clip/video.",
      ""
    ];

    if (full && full.length < 12000) {
      packagePrompt.push("--- Referensi schema / full prompt ---");
      packagePrompt.push(full.slice(0, 8000));
      packagePrompt.push("");
    }

    packagePrompt.push(
      "Kembalikan ringkasan singkat (utamakan human behavior) lalu JSON sesuai schema Match Centre + behaviorInsights + Parent Reports TFDEV (+ highlights opsional)."
    );
    return packagePrompt.join("\n");
  }

  function rebuildPromptPreview() {
    const ta = $("anPromptOut");
    if (!ta) return;
    ta.value = buildVideoAnalitikPrompt();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  async function copyPrompt() {
    rebuildPromptPreview();
    const text = ($("anPromptOut") && $("anPromptOut").value) || buildVideoAnalitikPrompt();
    try {
      await copyText(text);
      setStatus("Prompt video-analitik disalin. Upload video/frames ke AI + paste prompt.", true);
      window.TFDEV.toast("Prompt disalin");
      $("anSummaryList").innerHTML = [
        "Prompt disalin (" + text.length + " karakter).",
        "Upload video atau " + frames.length + " frame ke Gemini vision (jalur utama) / cadangan chat vision.",
        "Paste prompt → salin JSON jawaban → tempel di langkah 5 → Terapkan."
      ]
        .map((s) => "<li>" + escapeHtml(s) + "</li>")
        .join("");
    } catch (e) {
      setStatus("Gagal salin prompt: " + e.message, false);
    }
  }

  /* ---------- API Vision ---------- */

  function parseAiJson(raw) {
    if (window.TFDEV && window.TFDEV.JsonRepair && typeof window.TFDEV.JsonRepair.parseAndRepair === "function") {
      return window.TFDEV.JsonRepair.parseAndRepair(raw);
    }
    let text = String(raw || "").trim();
    if (!text) throw new Error("Respons AI kosong");
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
    const data = JSON.parse(text);
    if (!data.matchCentre && !data.teams && !data.score) {
      if (data.meta || data.stats) {
        return { matchCentre: data, parentReports: data.parentReports || [] };
      }
    }
    return data;
  }

  function buildUserContentForVision(meta, maxFrames) {
    const limit = Math.max(1, Number(maxFrames) || MAX_VISION_FRAMES);
    const parts = [];
    const textBlock =
      "Analisis VIDEO/frames youth academy berikut untuk TFDEV Analitik · observasi perilaku sangat detail.\n" +
      "PRIMARY EVIDENCE = gambar frame di bawah (dan video jika model mendukung). Jangan mengarang. N/C jika unreadable.\n" +
      "Lebih baik detail lambat daripada jawaban generik. Klaim hanya dari frame.\n\n" +
      "Tim kita: TFS (jersey orange).\n" +
      "Lawan: " +
      meta.lawan +
      (meta.kitLawan ? " (kit " + meta.kitLawan + ")" : "") +
      ".\n" +
      "Babak/clip: " +
      meta.babak +
      (meta.durasi ? " · durasi ~" + meta.durasi + "s" : "") +
      ".\n" +
      "Source: " +
      (meta.sourceFile || "(video upload)") +
      ".\n" +
      "Pemain Parent Report: " +
      (meta.player.name
        ? meta.player.name + (meta.player.no ? " #" + meta.player.no : "")
        : "skip parent report") +
      ".\n\n" +
      "Frame timestamps (urut — pakai untuk tebak t key moment):\n" +
      (frames.length
        ? frames
            .slice(0, limit)
            .map((f, i) => (i + 1) + ". t=" + fmtTime(f.t) + " (" + f.t.toFixed(1) + "s)")
            .join("\n")
        : "(tidak ada frame — analisis terbatas)") +
      "\n\nAMATI SETIAP FRAME: nomor punggung, orientasi tubuh, scanning/shoulder check, first touch, spacing, " +
      "courage 1v1, reset setelah lose, help peers, GK involvement, momen coaching-relevant.\n" +
      "Per key moment: timestamp dari urutan frame, siapa/apa/mengapa, valence.\n" +
      "STAR = human behavior. Match Centre stats hanya jika bukti di frames; else N/C + reason. No fake GPS.\n" +
      "Kembalikan ringkasan singkat (utamakan perilaku detail) lalu JSON { matchCentre, behaviorInsights, parentReports?, highlights? }.\n" +
      "behaviorInsights wajib kaya: { teamMood, keyBehaviors[{t,playerNo,tag,note,valence}] min 5–8 bila bukti, " +
      "parentStory (paragraf hangat Indonesia spesifik untuk ortu), coachCues (drill actionable Indonesia) }.\n" +
      "Opsional preferred highlights (judul/note perilaku): [{ t, type, team, playerNo, title, note, rating }] " +
      "type∈GOL|CHANCE|SKILL|SAVE|COACHING|LAINNYA; t=detik.";

    parts.push({ type: "text", text: textBlock });

    frames.slice(0, limit).forEach((f) => {
      parts.push({
        type: "image_url",
        image_url: { url: f.dataUrl, detail: "low" }
      });
    });
    return parts;
  }

  function buildModelFallbackChain(preferred) {
    const chain = [];
    const push = (m) => {
      const v = String(m || "").trim();
      if (v && chain.indexOf(v) === -1) chain.push(v);
    };
    push(preferred);
    GEMINI_MODEL_FALLBACKS.forEach(push);
    return chain.slice(0, 3);
  }

  function persistSucceededModel(model) {
    if ($("anApiModel")) $("anApiModel").value = model;
    try {
      localStorage.setItem(API_MODEL_LS, model);
    } catch (_) {}
  }

  async function runApiVision(opts) {
    opts = opts || {};
    const meta = readMeta();
    if (!frames.length) {
      throw new Error("Ambil minimal 1 frame dulu (Ambil frame sekarang / sample otomatis).");
    }
    const base = (($("anApiBase") && $("anApiBase").value.trim()) || "https://generativelanguage.googleapis.com/v1beta/openai").replace(
      /\/$/,
      ""
    );
    const preferred = ($("anApiModel") && $("anApiModel").value.trim()) || "gemini-3.6-flash";
    const key = ($("anApiKey") && $("anApiKey").value.trim()) || localStorage.getItem(API_KEY_LS) || "";
    if (!key) throw new Error("API key kosong — paste key Gemini di atas (disimpan di localStorage).");

    localStorage.setItem(API_KEY_LS, key);
    localStorage.setItem(API_BASE_LS, base);
    localStorage.setItem(API_MODEL_LS, preferred);

    const frameLimit = opts.fullAuto ? MAX_VISION_FRAMES_FULL_AUTO : MAX_VISION_FRAMES;
    const system = getSystemPrompt();
    const userContent = buildUserContentForVision(meta, frameLimit);
    const models = buildModelFallbackChain(preferred);
    let lastErr = null;
    let content = "";
    let usedModel = preferred;

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      usedModel = model;
      setStatus(
        "Gemini observasi detail · " +
          model +
          "… (" +
          Math.min(frames.length, frameLimit) +
          " frame human-behavior)" +
          (i ? " · fallback " + (i + 1) + "/" + models.length : ""),
        true
      );

      let res;
      try {
        res = await fetch(base + "/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + key
          },
          body: JSON.stringify({
            model: model,
            temperature: 0.2,
            messages: [
              { role: "system", content: system },
              { role: "user", content: userContent }
            ]
          })
        });
      } catch (netErr) {
        throw new Error(
          "Jaringan/CORS gagal ke Vision API (" +
            ((netErr && netErr.message) || "Failed to fetch") +
            "). Cek koneksi atau base Gemini OpenAI-compat."
        );
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        const retryable = res.status === 404 || res.status === 503 || res.status === 429;
        lastErr = new Error(
          "API " + res.status + ": " + (errText.slice(0, 180) || res.statusText)
        );
        if (retryable && i < models.length - 1) {
          setStatus(
            "Model " + model + " gagal (" + res.status + ") — mencoba " + models[i + 1] + "…",
            true
          );
          continue;
        }
        let hint = "";
        if (res.status === 401 || res.status === 403) {
          hint = " → API key salah/expired, paste ulang di atas.";
        } else if (res.status === 429 || res.status === 503) {
          hint = " → Gemini sibuk, coba lagi 10–20 detik.";
        } else if (res.status === 404) {
          hint = " → semua model fallback gagal; cek model di panel.";
        }
        throw new Error(lastErr.message + hint);
      }

      const body = await res.json();
      content =
        (body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content) ||
        body.content ||
        "";
      if (Array.isArray(content)) {
        content = content
          .map(function (p) {
            if (typeof p === "string") return p;
            if (p && typeof p.text === "string") return p.text;
            if (p && p.type === "text" && typeof p.text === "string") return p.text;
            return "";
          })
          .join("\n");
      }
      if (!String(content || "").trim()) {
        lastErr = new Error("Respons Vision kosong dari " + model);
        if (i < models.length - 1) {
          setStatus("Respons kosong dari " + model + " — mencoba model lain…", true);
          continue;
        }
        throw new Error("Respons Vision kosong — coba model lain atau kurangi frame.");
      }

      persistSucceededModel(model);
      break;
    }

    if (!String(content || "").trim()) {
      throw lastErr || new Error("Vision gagal pada semua model fallback.");
    }

    const data = parseAiJson(content);
    if (data.matchCentre) softenUnverifiedZeroZero(data.matchCentre);
    lastResult = data;
    const pretty = {
      matchCentre: data.matchCentre,
      behaviorInsights: data.behaviorInsights || undefined,
      parentReports: data.parentReports || [],
      highlights: data.highlights || data.keyMoments || undefined,
      playerDashboard: data.playerDashboard || undefined
    };
    if (!pretty.behaviorInsights) delete pretty.behaviorInsights;
    if (!pretty.highlights) delete pretty.highlights;
    if (!pretty.playerDashboard) delete pretty.playerDashboard;
    if ($("anJsonOut")) $("anJsonOut").value = JSON.stringify(pretty, null, 2);
    const hlCount =
      (Array.isArray(data.highlights) && data.highlights.length) ||
      (Array.isArray(data.keyMoments) && data.keyMoments.length) ||
      0;
    const behN =
      (data.behaviorInsights &&
        Array.isArray(data.behaviorInsights.keyBehaviors) &&
        data.behaviorInsights.keyBehaviors.length) ||
      0;
    const summary = [
      "Mode: API Vision (" + usedModel + ") · Human Behavior detail",
      "Frames dikirim: " + Math.min(frames.length, frameLimit),
      "Match: " + ((data.matchCentre && data.matchCentre.meta && data.matchCentre.meta.title) || meta.lawan),
      "behaviorInsights: " + (data.behaviorInsights ? behN + " key behaviors" : "—"),
      "parentReports: " + ((data.parentReports && data.parentReports.length) || 0),
      "highlights: " + hlCount
    ];
    if ($("anSummaryList")) {
      $("anSummaryList").innerHTML = summary.map((s) => "<li>" + escapeHtml(s) + "</li>").join("");
    }
    renderBehaviorPanel(data.behaviorInsights || null);
    setStatus("Vision API selesai · " + usedModel + " · JSON siap diterapkan.", true);
    window.TFDEV.toast("Analitik Vision selesai");
    setWizardStep(3);
    return data;
  }

  /* ---------- Apply / copy JSON ---------- */

  function getCurrentJson() {
    if (lastResult && (lastResult.matchCentre || lastResult.highlights || lastResult.parentReports || lastResult.behaviorInsights)) {
      return lastResult;
    }
    const raw = ($("anJsonOut") && $("anJsonOut").value.trim()) || "";
    if (!raw) throw new Error("Belum ada JSON — paste hasil AI dulu.");
    const data = parseAiJson(raw);
    lastResult = data;
    return data;
  }

  async function copyJson() {
    try {
      const data = getCurrentJson();
      await copyText(JSON.stringify(data, null, 2));
      window.TFDEV.toast("JSON disalin");
      setStatus("JSON disalin ke clipboard.", true);
    } catch (e) {
      setStatus("Gagal salin: " + e.message, false);
    }
  }

  function applyMc() {
    try {
      const data = getCurrentJson();
      const mc = softenUnverifiedZeroZero(data.matchCentre || data);
      if (!window.MatchCentre || !window.MatchCentre.applyJson) {
        throw new Error("MatchCentre.applyJson belum siap");
      }
      window.MatchCentre.applyJson(mc);
      renderBehaviorPanel(getBehaviorInsights(data));
      setWizardStep(3);
      showPostApply(true);
      window.TFDEV.toast("Diterapkan ke Match Centre");
      setStatus("Match Centre diterapkan. Klik Buka Match Centre untuk melihat hasil.", true);
    } catch (e) {
      showPostApply(false);
      setStatus("Gagal terapkan Match Centre: " + e.message, false);
      window.TFDEV.toast("Gagal terapkan");
    }
  }

  function applyPr() {
    try {
      const data = getCurrentJson();
      const behavior = getBehaviorInsights(data);
      renderBehaviorPanel(behavior);
      let reports = data.parentReports || [];
      if (!reports.length && behavior && (behavior.parentStory || (behavior.keyBehaviors && behavior.keyBehaviors.length))) {
        reports = [
          enrichParentReportWithBehavior(
            {
              player: {},
              sessionSummary: "",
              strengths: [],
              focusAreas: [],
              coach: { name: "Coach Pramu", note: "" }
            },
            behavior
          )
        ];
      }
      if (!reports.length) {
        throw new Error("parentReports kosong — minta AI isi parent report (nama pemain di meta).");
      }
      if (!window.ParentReport || !window.ParentReport.applyJson) {
        throw new Error("ParentReport.applyJson belum siap");
      }
      const enriched = enrichParentReportWithBehavior(reports[0], behavior);
      window.ParentReport.applyJson(enriched, data.matchCentre || null);
      window.TFDEV.showPage("report");
      window.TFDEV.toast("Diterapkan ke Parent Report");
      setStatus(
        "Parent Report diterapkan" + (behavior ? " (+ behaviorInsights)" : "") + " dari parentReports[0].",
        true
      );
    } catch (e) {
      setStatus("Gagal terapkan Parent Report: " + e.message, false);
      window.TFDEV.toast("Gagal terapkan");
    }
  }


  function applyPd() {
    try {
      const data = getCurrentJson();
      if (!window.PlayerDashboard || !window.PlayerDashboard.applyFromAnalytics) {
        throw new Error("PlayerDashboard.applyFromAnalytics belum siap");
      }
      window.PlayerDashboard.applyFromAnalytics(data);
      window.TFDEV.showPage("player");
      window.TFDEV.toast("Diterapkan ke Player Dashboard");
      setStatus("Player Dashboard diterapkan dari JSON video-analitik.", true);
    } catch (e) {
      setStatus("Gagal terapkan Player Dashboard: " + e.message, false);
      window.TFDEV.toast("Gagal terapkan");
    }
  }

  function getBehaviorInsights(data) {
    if (!data || typeof data !== "object") return null;
    const b = data.behaviorInsights || data.behavior || null;
    if (!b || typeof b !== "object") return null;
    return b;
  }

  function behaviorTagToHighlightType(tag) {
    const t = String(tag || "").toUpperCase();
    if (/COURAGE|1V1|SKILL|DRIBBLE|CELEBRATE/.test(t)) return "SKILL";
    if (/SAVE|GK/.test(t)) return "SAVE";
    if (/GOL|GOAL/.test(t)) return "GOL";
    if (/PRESS|RESET|SCAN|HELP|FOCUS|COMM|LEADER|FAIR|PATIENCE|EFFORT|DISTRACT|BODY|MOOD/.test(t)) {
      return "COACHING";
    }
    return "COACHING";
  }

  function enrichParentReportWithBehavior(report, behavior) {
    if (!report || typeof report !== "object") return report;
    if (!behavior || typeof behavior !== "object") return report;
    const r = Object.assign({}, report);
    r.coach = Object.assign({}, report.coach || {});
    const keys = Array.isArray(behavior.keyBehaviors) ? behavior.keyBehaviors : [];

    if (!r.sessionSummary && behavior.parentStory) {
      r.sessionSummary = behavior.parentStory;
    } else if (
      behavior.parentStory &&
      r.sessionSummary &&
      String(r.sessionSummary).length < 40
    ) {
      r.sessionSummary = behavior.parentStory;
    }

    if (!r.coach.note) {
      if (Array.isArray(behavior.coachCues) && behavior.coachCues.length) {
        r.coach.note = behavior.coachCues.filter(Boolean).join(" ");
      } else if (behavior.parentStory) {
        r.coach.note = behavior.parentStory;
      } else if (behavior.teamMood) {
        r.coach.note = "Suasana tim: " + behavior.teamMood;
      }
    }

    const strengths = Array.isArray(r.strengths) ? r.strengths.slice() : [];
    if (strengths.length < 3) {
      keys
        .filter((k) => k && (k.valence === "positive" || !k.valence) && k.note)
        .forEach((k) => {
          const line =
            (k.tag ? String(k.tag).toUpperCase() + ": " : "") +
            String(k.note) +
            (k.playerNo ? " (#" + k.playerNo + ")" : "");
          if (line && strengths.indexOf(line) < 0 && strengths.length < 5) strengths.push(line);
        });
      r.strengths = strengths;
    }

    let focus = Array.isArray(r.focusAreas) ? r.focusAreas.slice() : [];
    if (focus.length < 2) {
      keys
        .filter((k) => k && (k.valence === "coach" || k.valence === "caution") && (k.note || k.tag))
        .forEach((k) => {
          const title = k.tag ? String(k.tag).toUpperCase() : "Fokus perilaku";
          const desc = k.note || "";
          const exists = focus.some(
            (f) =>
              (typeof f === "string" && f.indexOf(title) >= 0) ||
              (f && f.title === title)
          );
          if (!exists && focus.length < 3) focus.push({ title: title, desc: desc });
        });
      r.focusAreas = focus;
    }

    return r;
  }

  function applyBehaviorsToHighlights(behavior, opts) {
    opts = opts || {};
    const keys = behavior && Array.isArray(behavior.keyBehaviors) ? behavior.keyBehaviors : [];
    if (!keys.length) return { ok: false, skipped: true, reason: "keyBehaviors kosong", count: 0 };
    if (!window.Highlights || typeof window.Highlights.addFromAnalitik !== "function") {
      return { ok: false, skipped: true, reason: "Highlights belum siap", count: 0 };
    }
    const videoName =
      ($("anVideoName") && $("anVideoName").textContent) ||
      "";
    let n = 0;
    keys.forEach((b) => {
      if (!b || b.t == null || b.t === "") return;
      const tag = String(b.tag || "BEHAVIOR").toUpperCase();
      const title =
        tag +
        (b.playerNo ? " #" + b.playerNo : "") +
        (b.valence === "caution" ? " · fokus" : b.valence === "coach" ? " · cue" : "");
      window.Highlights.addFromAnalitik({
        t: Number(b.t) || 0,
        type: behaviorTagToHighlightType(tag),
        team: "TFS",
        playerNo: b.playerNo != null ? String(b.playerNo) : "",
        title: title,
        note: b.note || behavior.parentStory || "",
        rating: b.valence === "positive" ? 4 : b.valence === "caution" ? 3 : 3,
        videoName: videoName && videoName !== "—" ? videoName : ""
      });
      n += 1;
    });
    return { ok: n > 0, count: n, via: "keyBehaviors→addFromAnalitik" };
  }

  function renderBehaviorPanel(behavior) {
    const panel = $("anBehaviorPanel");
    if (!panel) return;
    if (!behavior || typeof behavior !== "object") {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }
    const keys = Array.isArray(behavior.keyBehaviors) ? behavior.keyBehaviors : [];
    const cues = Array.isArray(behavior.coachCues) ? behavior.coachCues : [];
    const chips = keys
      .map((b, i) => {
        if (!b) return "";
        const tag = escapeHtml(String(b.tag || "BEHAVIOR").toUpperCase());
        const valence = String(b.valence || "coach");
        const note = escapeHtml(b.note || "");
        const who = b.playerNo ? "#" + escapeHtml(String(b.playerNo)) + " · " : "";
        const t = b.t != null && b.t !== "" ? Number(b.t) : null;
        const timeLabel = t != null && isFinite(t) ? escapeHtml(fmtTime(t)) : "";
        const jump =
          t != null && isFinite(t)
            ? '<button type="button" class="bhv-jump" data-bhv-t="' +
              t +
              '" title="Jump ke highlight / waktu">⏱ ' +
              timeLabel +
              "</button>"
            : "";
        return (
          '<article class="bhv-card valence-' +
          escapeHtml(valence) +
          '" data-bhv-i="' +
          i +
          '">' +
          '<div class="bhv-card-top">' +
          '<span class="bhv-tag">' +
          tag +
          "</span>" +
          (jump || "") +
          "</div>" +
          '<p class="bhv-note">' +
          who +
          note +
          "</p>" +
          "</article>"
        );
      })
      .filter(Boolean)
      .join("");

    const story = behavior.parentStory
      ? '<div class="bhv-story"><div class="bhv-story-label">Cerita untuk ortu</div><p>' +
        escapeHtml(behavior.parentStory) +
        "</p></div>"
      : "";
    const mood = behavior.teamMood
      ? '<div class="bhv-mood">Suasana tim: <strong>' +
        escapeHtml(behavior.teamMood) +
        "</strong></div>"
      : "";
    const cueHtml = cues.length
      ? '<ul class="bhv-cues">' +
        cues.map((c) => "<li>" + escapeHtml(c) + "</li>").join("") +
        "</ul>"
      : "";

    panel.hidden = false;
    panel.innerHTML =
      '<div class="bhv-head">' +
      "<div>" +
      "<strong>AI Vision · Human Behavior</strong>" +
      "<span>Momen perilaku dari footage — bukan scoreboard kering</span>" +
      "</div>" +
      '<span class="bhv-count">' +
      keys.length +
      " perilaku</span>" +
      "</div>" +
      mood +
      story +
      (chips ? '<div class="bhv-strip">' + chips + "</div>" : '<p class="ux-hint">Belum ada keyBehaviors di JSON.</p>') +
      (cueHtml
        ? '<div class="bhv-cues-wrap"><div class="bhv-story-label">Coach cues</div>' + cueHtml + "</div>"
        : "");
  }

  function jumpBehaviorTime(t) {
    t = Number(t);
    if (!isFinite(t)) return;
    try {
      if (window.Highlights && typeof window.Highlights.jumpTo === "function") {
        window.Highlights.jumpTo(t);
      }
    } catch (_) {}
    const v = $("anVideo");
    if (v && v.src) {
      try {
        v.currentTime = Math.max(0, t);
        v.play().catch(function () {});
      } catch (_) {}
    }
    window.TFDEV.toast("Jump · " + fmtTime(t));
  }

  function collectHighlightItems(data) {
    if (!data || typeof data !== "object") return [];
    if (window.TFDEV && window.TFDEV.JsonRepair && typeof window.TFDEV.JsonRepair.ensureHighlights === "function") {
      window.TFDEV.JsonRepair.ensureHighlights(data);
    }
    if (Array.isArray(data.highlights) && data.highlights.length) return data.highlights;
    if (Array.isArray(data.keyMoments) && data.keyMoments.length) return data.keyMoments;
    // frames-as-moments: [{t|timeSec|second, type?, ...}]
    if (Array.isArray(data.moments) && data.moments.length) return data.moments;
    if (Array.isArray(data.frames) && data.frames.length) {
      const looksLikeMoments = data.frames.some(
        (f) => f && (f.type || f.title || f.note || f.description || f.playerNo)
      );
      if (looksLikeMoments) return data.frames;
    }
    return [];
  }

  function applyHighlightsFromData(data, opts) {
    opts = opts || {};
    const items = collectHighlightItems(data);
    if (!items.length) {
      return { ok: false, skipped: true, reason: "highlights kosong" };
    }
    if (!window.Highlights) {
      return { ok: false, skipped: true, reason: "Highlights belum siap" };
    }
    const videoName =
      ($("anVideoName") && $("anVideoName").textContent) ||
      (data.matchCentre && data.matchCentre.meta && data.matchCentre.meta.sourceFile) ||
      "";
    const payload = {
      video: videoName && videoName !== "—" ? videoName : undefined,
      highlights: items.map((raw) => ({
        t: raw.t != null ? raw.t : raw.timeSec != null ? raw.timeSec : raw.second,
        time: raw.time,
        type: raw.type,
        team: raw.team,
        playerNo: raw.playerNo != null ? raw.playerNo : raw.number,
        number: raw.number,
        title: raw.title,
        note: raw.note != null ? raw.note : raw.description,
        description: raw.description,
        rating: raw.rating,
        thumb: raw.thumb
      }))
    };
    if (typeof window.Highlights.importPayload === "function") {
      const res = window.Highlights.importPayload(payload, {
        confirm: opts.confirm === true,
        merge: true
      });
      return { ok: true, count: (res && res.count) || items.length, via: "importPayload" };
    }
    let n = 0;
    items.forEach((raw) => {
      window.Highlights.addFromAnalitik({
        t: raw.t != null ? raw.t : raw.timeSec != null ? raw.timeSec : raw.second,
        type: raw.type,
        team: raw.team,
        playerNo: raw.playerNo != null ? raw.playerNo : raw.number,
        title: raw.title,
        note: raw.note != null ? raw.note : raw.description,
        rating: raw.rating,
        thumb: raw.thumb,
        videoName: videoName && videoName !== "—" ? videoName : ""
      });
      n += 1;
    });
    return { ok: true, count: n, via: "addFromAnalitik" };
  }

  /**
   * Apply a Vision/Gemini JSON result: fill anJsonOut, behavior panel, then applyAll.
   * Used by Drive→Gemini full-video path and other external callers.
   */
  function applyVisionResult(data, opts) {
    opts = opts || {};
    if (!data || typeof data !== "object") {
      throw new Error("Hasil Vision kosong / bukan objek");
    }
    // Full-video (Gemini Files) and frame paths share this entry — soften before JSON/UI.
    if (data.matchCentre) softenUnverifiedZeroZero(data.matchCentre);
    lastResult = data;
    const pretty = {
      matchCentre: data.matchCentre,
      behaviorInsights: data.behaviorInsights || undefined,
      parentReports: data.parentReports || [],
      highlights: data.highlights || data.keyMoments || undefined,
      playerDashboard: data.playerDashboard || undefined
    };
    if (!pretty.behaviorInsights) delete pretty.behaviorInsights;
    if (!pretty.highlights) delete pretty.highlights;
    if (!pretty.playerDashboard) delete pretty.playerDashboard;
    if ($("anJsonOut")) $("anJsonOut").value = JSON.stringify(pretty, null, 2);
    renderBehaviorPanel(getBehaviorInsights(data));
    setWizardStep(3);
    showPostApply(true);
    if (opts.apply === false) {
      setStatus("JSON Vision siap — belum diterapkan ke modul.", true);
      return { data: data, results: [] };
    }
    const results = applyAll({ navigate: opts.navigate !== false });
    setStatus(
      "Vision diterapkan · " +
        results.filter(function (r) { return r.ok; }).length +
        " modul OK.",
      true
    );
    return { data: data, results: results };
  }

  /**
   * Apply current JSON to all modules without page-jump spam.
   * opts.navigate: if true, go to matchcentre once at end.
   */
  function applyAll(opts) {
    opts = opts || {};
    const data = getCurrentJson();
    const results = [];
    const lines = [];

    // Match Centre
    try {
      const mc = softenUnverifiedZeroZero(
        data.matchCentre || (data.teams || data.score || data.meta ? data : null)
      );
      if (mc && window.MatchCentre && window.MatchCentre.applyJson) {
        window.MatchCentre.applyJson(mc);
        results.push({ module: "matchCentre", ok: true });
        lines.push("✓ Match Centre diterapkan");
      } else {
        results.push({ module: "matchCentre", ok: false, reason: "tidak ada matchCentre" });
        lines.push("· Match Centre dilewati (tidak ada data)");
      }
    } catch (e) {
      results.push({ module: "matchCentre", ok: false, reason: e.message });
      lines.push("✗ Match Centre: " + e.message);
    }

    const behavior = getBehaviorInsights(data);
    renderBehaviorPanel(behavior);

    // Parent Report — skip gracefully if empty; enrich from behaviorInsights
    try {
      let reports = data.parentReports || [];
      if (!reports.length && behavior && (behavior.parentStory || (behavior.keyBehaviors && behavior.keyBehaviors.length))) {
        reports = [
          {
            player: {},
            sessionSummary: "",
            strengths: [],
            focusAreas: [],
            coach: { name: "Coach Pramu", note: "" }
          }
        ];
      }
      if (!reports.length) {
        results.push({ module: "parentReport", ok: false, skipped: true, reason: "kosong" });
        lines.push("· Parent Report dilewati (parentReports kosong)");
      } else if (!window.ParentReport || !window.ParentReport.applyJson) {
        results.push({ module: "parentReport", ok: false, reason: "API belum siap" });
        lines.push("· Parent Report dilewati (API belum siap)");
      } else {
        const enriched = enrichParentReportWithBehavior(reports[0], behavior);
        window.ParentReport.applyJson(enriched, data.matchCentre || null);
        results.push({ module: "parentReport", ok: true });
        lines.push(
          "✓ Parent Report diterapkan" + (behavior ? " (+ behaviorInsights)" : "") + " (parentReports[0])"
        );
      }
    } catch (e) {
      results.push({ module: "parentReport", ok: false, reason: e.message });
      lines.push("✗ Parent Report: " + e.message);
    }

    // Player Dashboard
    try {
      if (!window.PlayerDashboard || !window.PlayerDashboard.applyFromAnalytics) {
        results.push({ module: "playerDashboard", ok: false, skipped: true, reason: "API belum siap" });
        lines.push("· Player Dashboard dilewati (API belum siap)");
      } else {
        window.PlayerDashboard.applyFromAnalytics(data);
        results.push({ module: "playerDashboard", ok: true });
        lines.push("✓ Player Dashboard diterapkan");
      }
    } catch (e) {
      results.push({ module: "playerDashboard", ok: false, skipped: true, reason: e.message });
      lines.push("· Player Dashboard dilewati: " + e.message);
    }

    // Highlights (+ keyBehaviors → highlights jika array highlights kosong)
    try {
      let hl = applyHighlightsFromData(data, { confirm: false });
      let behHl = { ok: false, count: 0 };
      if ((!hl.ok || hl.skipped) && behavior) {
        behHl = applyBehaviorsToHighlights(behavior, {});
        if (behHl.ok) hl = behHl;
      } else if (hl.ok && behavior) {
        // merge behavior moments as extra coaching clips when possible
        behHl = applyBehaviorsToHighlights(behavior, {});
        if (behHl.ok) {
          hl = { ok: true, count: (hl.count || 0) + (behHl.count || 0), via: "highlights+keyBehaviors" };
        }
      }
      if (hl.ok) {
        results.push({ module: "highlights", ok: true, count: hl.count });
        lines.push("✓ Highlights: " + hl.count + " momen diimpor" + (behHl.ok ? " (incl. behavior)" : ""));
      } else {
        results.push({ module: "highlights", ok: false, skipped: true, reason: hl.reason });
        lines.push("· Highlights dilewati (" + (hl.reason || "kosong") + ")");
      }
    } catch (e) {
      results.push({ module: "highlights", ok: false, reason: e.message });
      lines.push("✗ Highlights: " + e.message);
    }

    if ($("anSummaryList")) {
      $("anSummaryList").innerHTML = lines.map((s) => "<li>" + escapeHtml(s) + "</li>").join("");
    }
    const okN = results.filter((r) => r.ok).length;
    setStatus("Terapkan ke semua: " + okN + "/" + results.length + " modul OK.", okN > 0);
    window.TFDEV.toast("Terapkan semua · " + okN + " OK");
    showPostApply(okN > 0);

    if (opts.navigate !== false && okN > 0) {
      try {
        window.TFDEV.showPage("matchcentre");
      } catch (_) {}
    }
    return results;
  }

  function hasApiKey() {
    const key = ($("anApiKey") && $("anApiKey").value.trim()) || localStorage.getItem(API_KEY_LS) || "";
    return !!key;
  }

  function videoIsLoaded() {
    const v = $("anVideo");
    return !!(v && v.src && (v.videoWidth || (isFinite(v.duration) && v.duration > 0)));
  }

  async function waitForFrames(timeoutMs) {
    const start = Date.now();
    while (!frames.length) {
      if (Date.now() - start > (timeoutMs || 120000)) {
        throw new Error("Timeout menunggu frame sample.");
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  /**
   * Full auto: video → sample frames → Vision (or existing JSON) → applyAll.
   */
  async function runFullAuto() {
    if (!videoIsLoaded()) {
      throw new Error("Upload video dulu sebelum Full auto.");
    }
    setStatus("Full auto: memeriksa frame…", true);

    if (!frames.length) {
      setStatus("Full auto: sample frame untuk observasi perilaku detail…", true);
      const maxEl = $("anSampleMax");
      const prevMax = maxEl ? maxEl.value : null;
      if (maxEl) {
        const want = Math.min(
          MAX_VISION_FRAMES_FULL_AUTO,
          Math.max(1, Number(maxEl.value) || MAX_VISION_FRAMES_FULL_AUTO)
        );
        maxEl.value = String(want);
      }
      try {
        await captureAutoSample();
      } finally {
        if (maxEl && prevMax != null) maxEl.value = prevMax;
      }
      if (!frames.length) {
        await waitForFrames(5000);
      }
      if (!frames.length) {
        throw new Error("Gagal mengambil frame — coba Ambil sample otomatis manual.");
      }
    }

    let data = null;
    const mode = getMode();
    const apiReady = mode === "api" || hasApiKey();

    if (apiReady) {
      if (getMode() !== "api") {
        const apiRadio = document.querySelector('input[name="anMode"][value="api"]');
        if (apiRadio) {
          apiRadio.checked = true;
          syncModeUi();
        }
      }
      setStatus("Full auto: Gemini Vision · observasi perilaku manusia detail…", true);
      data = await runApiVision({ fullAuto: true });
    } else {
      const raw = ($("anJsonOut") && $("anJsonOut").value.trim()) || "";
      if (raw) {
        data = parseAiJson(raw);
        lastResult = data;
        setStatus("Full auto: memakai JSON yang sudah di-paste.", true);
      } else if (lastResult && (lastResult.matchCentre || lastResult.highlights || lastResult.behaviorInsights)) {
        data = lastResult;
        setStatus("Full auto: memakai hasil JSON terakhir.", true);
      } else {
        throw new Error(
          "Belum ada API key Gemini. Paste key di panel Proses (disimpan di browser ini), lalu Full auto lagi."
        );
      }
    }

    if (!data) throw new Error("JSON analitik kosong.");
    setStatus("Full auto: menerapkan ke semua modul…", true);
    setWizardStep(3);
    showPostApply(true);
    const results = applyAll({ navigate: true });
    setStatus(
      "Full auto selesai · " +
        results.filter((r) => r.ok).length +
        " modul diterapkan. Lihat ringkasan di bawah.",
      true
    );
    window.TFDEV.toast("Full auto selesai");
    return { data, results };
  }

  function loadApiSettings() {
    const key = localStorage.getItem(API_KEY_LS) || "";
    let base = localStorage.getItem(API_BASE_LS) || "https://generativelanguage.googleapis.com/v1beta/openai";
    let model = localStorage.getItem(API_MODEL_LS) || "gemini-3.6-flash";
    // Migrate stale OpenAI / retired Gemini defaults so Full auto does not 404.
    const staleBase =
      !base ||
      /api\.openai\.com/i.test(base) ||
      /api\.groq\.com/i.test(base);
    const staleModel =
      !model ||
      /^gpt-/i.test(model) ||
      /llama/i.test(model) ||
      /^gemini-2\.0/i.test(model) ||
      /^gemini-2\.5-flash$/i.test(model);
    if (staleBase) {
      base = "https://generativelanguage.googleapis.com/v1beta/openai";
      localStorage.setItem(API_BASE_LS, base);
    }
    if (staleModel) {
      model = "gemini-3.6-flash";
      localStorage.setItem(API_MODEL_LS, model);
    }
    if ($("anApiKey")) $("anApiKey").value = key;
    if ($("anApiBase")) $("anApiBase").value = base;
    if ($("anApiModel")) $("anApiModel").value = model;
  }

  /* ---------- DnD / init ---------- */

  function wireDropZone() {
    const zone = $("anDropZone");
    const input = $("anVideoFile");
    if (!zone || !input) return;

    const pick = () => input.click();
    if ($("anPickVideo")) $("anPickVideo").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      pick();
    });
    zone.addEventListener("click", (e) => {
      if (e.target && e.target.id === "anPickVideo") return;
      if ($("anVideoWrap") && !$("anVideoWrap").hidden) return;
      pick();
    });
    zone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick();
      }
    });

    input.addEventListener("change", () => {
      const f = input.files && input.files[0];
      if (f) loadVideoFile(f);
    });

    ["dragenter", "dragover"].forEach((ev) => {
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach((ev) => {
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove("dragover");
      });
    });
    zone.addEventListener("drop", (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadVideoFile(f);
    });
  }

  window.TFDEV = window.TFDEV || {};

  /* ---------- Wizard (Upload → Proses → Lihat) ---------- */
  const WIZARD_STEP_SS = "tfdev-an-wizard-step";
  let wizardStep = 1;

  function syncFullAutoBanner() {
    const banner = $("anFullAutoBanner");
    if (!banner) return;
    banner.hidden = false;
    const ready = hasApiKey();
    const title = $("anFullAutoTitle");
    const hint = $("anFullAutoHint");
    if (title) {
      title.textContent = ready
        ? "Siap Full auto · Gemini · observasi detail"
        : "Full auto · Gemini Vision · observasi detail";
    }
    if (hint) {
      hint.textContent = ready
        ? "Siap Full auto · Gemini — sample hingga 8 frame → observasi perilaku manusia detail → modul."
        : "Paste key Gemini di atas, lalu Full auto (observasi perilaku detail)";
    }
  }

  /** Known coach Event Sheet for seeded demos — never invent 0-0 for these titles. */
  function coachSheetForTitle(title) {
    const t = String(title || "").toLowerCase();
    if (t.indexOf("tfs") >= 0 && t.indexOf("g8") >= 0) {
      return {
        score: {
          home: 0,
          away: 3,
          confidence: "high",
          note: "Coach Event Sheet · Babak 1 (bukan tebakan 0-0).",
          source: "coach_event_sheet"
        },
        corners: { home: 0, away: 1 },
        saves: { home: 3, away: 0 },
        // Goal events from sheet scoreline — timestamps N/C until tagged in Highlights/video
        goals: [
          { team: "G8", desc: "Gol 1 G8 (Event Sheet) — detik N/C sampai ditandai di Highlights" },
          { team: "G8", desc: "Gol 2 G8 (Event Sheet) — detik N/C sampai ditandai di Highlights" },
          { team: "G8", desc: "Gol 3 G8 (Event Sheet) — detik N/C sampai ditandai di Highlights" }
        ]
      };
    }
    return null;
  }

  function matchTitleFromMc(mc) {
    if (!mc) return "";
    return (
      (mc.meta && mc.meta.title) ||
      ((mc.teams && mc.teams.home && mc.teams.home.name) || "") +
        " VS " +
        ((mc.teams && mc.teams.away && mc.teams.away.name) || "")
    );
  }

  /** Ensure GOL timeline entries match coach sheet score when frames miss celebrations. */
  function ensureCoachGoalTimeline(mc) {
    if (!mc) return mc;
    const coach = coachSheetForTitle(matchTitleFromMc(mc));
    if (!coach || !coach.goals || !coach.goals.length) return mc;
    if (!Array.isArray(mc.timeline)) mc.timeline = [];
    const golCount = mc.timeline.filter(function (ev) {
      const ty = String((ev && ev.type) || "").toUpperCase();
      return ty === "GOL" || ty === "GOAL";
    }).length;
    const need = coach.goals.length;
    if (golCount >= need) return mc;
    for (let i = golCount; i < need; i++) {
      const g = coach.goals[i];
      mc.timeline.push({
        type: "GOL",
        team: g.team,
        playerNo: "",
        t: null,
        minute: null,
        desc: g.desc,
        source: "coach_event_sheet"
      });
    }
    if (!mc.stats) mc.stats = {};
    if (coach.corners) mc.stats.corners = coach.corners;
    if (coach.saves) mc.stats.saves = coach.saves;
    return mc;
  }

  /** Align score + goals with coach sheet; demote fake 0-0 when unknown fixture. */
  function softenUnverifiedZeroZero(mc) {
    if (!mc || !mc.score) return mc;
    const s = mc.score;
    const h = s.home;
    const a = s.away;
    const src = String(s.source || "").toLowerCase();
    const title = matchTitleFromMc(mc);
    const coach = coachSheetForTitle(title);
    const fromCoach =
      src.indexOf("coach") >= 0 || src.indexOf("event") >= 0 || src.indexOf("sheet") >= 0;

    if (coach) {
      // Always prefer Event Sheet scoreline for this fixture
      if (!fromCoach || (h === 0 && a === 0) || h == null || a == null) {
        mc.score = Object.assign({}, coach.score);
      }
      if (!mc.stats) mc.stats = {};
      if (coach.corners) mc.stats.corners = coach.corners;
      if (coach.saves) mc.stats.saves = coach.saves;
      ensureCoachGoalTimeline(mc);
      return mc;
    }

    if (h === 0 && a === 0 && s.confidence !== "low") {
      s.confidence = "low";
      const tip = "Skor 0-0 belum terverifikasi Event Sheet/overlay — prefer N/C + scoreConfidence low.";
      s.note = s.note ? String(s.note) + " · " + tip : tip;
    }
    return mc;
  }

  /** Built-in demo so Pramu can see end-to-end without an API key (beats rival offline demo). */
  function getDemoAnalitikPayload() {
    return {
      matchCentre: {
        meta: {
          title: "TFS VS G8 Babak 1",
          sourceFile: "demo-json-tanpa-api",
          dateStamp: "01/02/2024"
        },
        teams: { home: { name: "TFS" }, away: { name: "G8" } },
        score: (coachSheetForTitle("TFS VS G8 Babak 1") || {}).score || {
          home: null,
          away: null,
          confidence: "low",
          note: "N/C — tidak ada Event Sheet/overlay."
        },
        possession: { homePct: 54, awayPct: 46 },
        stats: {
          attackingSequences: { home: 4, away: 3, estimated: true },
          shotsOnTarget: { home: "N/C", away: "N/C" },
          corners: { home: 0, away: 1 },
          saves: { home: 3, away: 0 },
          cards: { home: 0, away: 0 }
        },
        internalNotes: [
          "Demo JSON tanpa API — Match Centre + behaviorInsights + highlights.",
          "Ganti dengan Full auto Gemini bila punya key AI Studio."
        ]
      },
      behaviorInsights: {
        teamMood: "Kompak di build-up; jujur pada skor — jangan asumsikan 0-0 jika Event Sheet beda.",
        keyBehaviors: [
          {
            t: 90,
            playerNo: "7",
            tag: "press_support",
            note: "Intensitas pressing & support di jalur serangan.",
            valence: "positive"
          },
          {
            t: 150,
            playerNo: "10",
            tag: "first_touch",
            note: "Kontrol + turn di zona tengah — bagus untuk cerita ortu.",
            valence: "positive"
          },
          {
            t: 510,
            playerNo: "",
            tag: "rest_defense",
            note: "Rest defense saat loss of possession — coaching cue kuat.",
            valence: "challenge"
          }
        ],
        parentStory:
          "Di Babak 1 vs G8 (skor coach 0–3), anak terlihat terlibat di transisi dan duel tengah. Keputusan di bawah tekanan dan keberanian 1v1 sudah muncul di clip — cerita ortu fokus perilaku, skor dari Event Sheet. Cocok tanpa menunggu Vision API.",
        coachCues: [
          "Jaga jarak antar lini di build-up awal.",
          "Counter-press 3 detik pertama setelah lose ball.",
          "Finishing di half-space jadi fokus latihan berikutnya."
        ]
      },
      parentReports: [
        {
          player: {
            name: "Rafi Pratama",
            number: "7",
            position: "Winger",
            ageGroup: "U12",
            sessionDate: "01/02/2024"
          },
          sessionSummary:
            "Sesi solid: terlibat di peluang & skill. Cerita fokus ke perilaku; skor mengikuti Event Sheet/overlay, bukan tebakan 0-0.",
          strengths: ["Pressing support", "Change of pace 1v1"],
          focusAreas: [
            { title: "Finishing", desc: "Keputusan akhir di sepertiga akhir" },
            { title: "Rest defense", desc: "Jaga jarak antar lini setelah lose ball" }
          ],
          coach: { name: "Coach Pramu", note: "Demo tanpa API — ganti dengan Full auto Gemini bila ada key." },
          overallScore: "7.5",
          scoreLabel: "BABAK 1"
        }
      ],
      highlights: [
        {
          t: 90,
          type: "CHANCE",
          team: "TFS",
          playerNo: "7",
          title: "Serangan sisi / peluang transisi",
          note: "Demo highlight dari paket tanpa API.",
          rating: 4
        },
        {
          t: 396,
          type: "SKILL",
          team: "TFS",
          playerNo: "7",
          title: "1v1 / change of pace",
          note: "Clip ortu demo.",
          rating: 5
        },
        {
          t: 510,
          type: "COACHING",
          team: "TFS",
          playerNo: "",
          title: "Rest defense saat loss of possession",
          note: "Poin coaching demo.",
          rating: 4
        }
      ]
    };
  }

  function loadDemoJson(opts) {
    opts = opts || {};
    const data = getDemoAnalitikPayload();
    lastResult = data;
    const pretty = JSON.stringify(data, null, 2);
    if ($("anJsonOut")) $("anJsonOut").value = pretty;
    renderBehaviorPanel(data.behaviorInsights || null);
    setWizardStep(3);
    setStatus("Demo JSON dimuat (tanpa API). Terapkan ke Match Centre / semua modul.", true);
    if (opts.apply) {
      try {
        applyAll({ navigate: !!opts.navigate });
        setStatus("Demo diterapkan ke modul · tanpa API key.", true);
        window.TFDEV.toast && window.TFDEV.toast("Demo JSON diterapkan");
      } catch (e) {
        setStatus("Demo dimuat; apply gagal: " + e.message, false);
      }
    } else {
      window.TFDEV.toast && window.TFDEV.toast("Demo JSON siap");
    }
    return data;
  }

  function setWizardStep(step) {
    step = Number(step) || 1;
    if (step < 1) step = 1;
    if (step > 3) step = 3;
    wizardStep = step;
    try {
      sessionStorage.setItem(WIZARD_STEP_SS, String(step));
    } catch (e) {}

    for (let i = 1; i <= 3; i++) {
      const panel = $("anPanel" + i);
      const tab = $("anWizardStep" + i);
      if (panel) {
        const active = i === step;
        panel.classList.toggle("is-active", active);
        panel.hidden = !active;
      }
      if (tab) {
        tab.classList.toggle("is-active", i === step);
        tab.classList.toggle("is-done", i < step);
      }
    }
    if (step === 2) syncFullAutoBanner();
  }

  function initWizard() {
    let saved = 1;
    try {
      saved = Number(sessionStorage.getItem(WIZARD_STEP_SS)) || 1;
    } catch (e) {
      saved = 1;
    }
    setWizardStep(saved);

    const go = (n) => () => setWizardStep(n);
    if ($("anWizardNext1")) $("anWizardNext1").addEventListener("click", go(2));
    if ($("anWizardNext2")) $("anWizardNext2").addEventListener("click", go(3));
    if ($("anWizardBack2")) $("anWizardBack2").addEventListener("click", go(1));
    if ($("anWizardBack3")) $("anWizardBack3").addEventListener("click", go(2));

    document.querySelectorAll(".an-wizard-step[data-an-step]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const n = Number(btn.getAttribute("data-an-step")) || 1;
        setWizardStep(n);
      });
    });

    const runFull = () => {
      runFullAuto().catch((e) => {
        setStatus("Full auto gagal: " + e.message, false);
        window.TFDEV.toast("Full auto gagal");
      });
    };
    if ($("anFullAutoPrimary")) $("anFullAutoPrimary").addEventListener("click", runFull);
    if ($("anLoadDemoJson")) {
      $("anLoadDemoJson").addEventListener("click", () => {
        try {
          loadDemoJson({ apply: true, navigate: true });
        } catch (e) {
          setStatus("Demo JSON gagal: " + e.message, false);
        }
      });
    }
    syncFullAutoBanner();

    if ($("anApiKey")) {
      const onKey = () => {
        if (hasApiKey()) setMode("api");
        syncFullAutoBanner();
      };
      $("anApiKey").addEventListener("input", onKey);
      $("anApiKey").addEventListener("change", onKey);
    }
    syncFullAutoBanner();

    // Home primary CTA → Analitik wizard step 1
    const homeCta = $("homeStartWizard");
    if (homeCta && !homeCta.__anWizardBound) {
      homeCta.__anWizardBound = true;
      homeCta.addEventListener("click", (e) => {
        // data-go still navigates via app.js; ensure step 1
        setWizardStep(1);
      });
    }

    window.AnalitikWizard = {
      setStep: setWizardStep,
      getStep: function () {
        return wizardStep;
      }
    };
  }

  window.Analitik = {
    getFrames: function () {
      return frames.slice();
    },
    buildPrompt: buildVideoAnalitikPrompt,
    renderBehaviorPanel: renderBehaviorPanel,
    run: function () {
      if (getMode() === "api") return runApiVision();
      return copyPrompt();
    },
    runFullAuto: runFullAuto,
    getVideoFile: function () { return lastVideoFile; },
    applyAll: applyAll,
    applyVisionResult: applyVisionResult,
    loadVideoFile: loadVideoFile,
    loadVideoBlob: loadVideoBlob,
    parseAiJson: parseAiJson,
    getSystemPrompt: getSystemPrompt,
    readMeta: readMeta,
    hasApiKey: hasApiKey,
    setStatus: setStatus,
    setWizardStep: setWizardStep,
    getLast: function () {
      return lastResult;
    },
    captureCurrentFrame: captureCurrentFrame
  };

  /** Minimal hooks for Drive→Gemini (and other callers) without breaking Gemini-first flow. */
  window.TFDEV.analitik = {
    loadVideoFile: loadVideoFile,
    loadVideoBlob: loadVideoBlob,
    applyVisionResult: applyVisionResult,
    parseAiJson: parseAiJson,
    runFullAuto: runFullAuto,
    getVideoFile: function () { return lastVideoFile; },
    applyAll: applyAll,
    getSystemPrompt: getSystemPrompt,
    readMeta: readMeta,
    hasApiKey: hasApiKey,
    setStatus: setStatus,
    setWizardStep: setWizardStep,
    getApiKey: function () {
      return (($("anApiKey") && $("anApiKey").value.trim()) || localStorage.getItem(API_KEY_LS) || "");
    },
    getPreferredModel: function () {
      return (($("anApiModel") && $("anApiModel").value.trim()) || localStorage.getItem(API_MODEL_LS) || "gemini-3.6-flash");
    },
    buildModelFallbackChain: buildModelFallbackChain,
    getLast: function () {
      return lastResult;
    }
  };

  window.TFDEV.initAnalitik = function () {
    if (!$("page-analitik")) return;
    loadApiSettings();
    setMode("api");
    if ($("anBehaviorPanel")) {
      $("anBehaviorPanel").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-bhv-t]");
        if (!btn) return;
        jumpBehaviorTime(btn.getAttribute("data-bhv-t"));
      });
    }
    if ($("anJsonOut")) {
      $("anJsonOut").addEventListener("blur", () => {
        try {
          const raw = $("anJsonOut").value.trim();
          if (!raw) return;
          const data = parseAiJson(raw);
          lastResult = data;
          renderBehaviorPanel(getBehaviorInsights(data));
        } catch (_) {}
      });
    }
    syncModeUi();
    wireDropZone();
    renderFramesStrip();
    rebuildPromptPreview();
    initWizard();

    document.querySelectorAll('input[name="anMode"]').forEach((el) => {
      el.addEventListener("change", syncModeUi);
    });

    const video = $("anVideo");
    if (video) {
      video.addEventListener("loadedmetadata", onVideoMeta);
      video.addEventListener("durationchange", onVideoMeta);
    }

    if ($("anClearVideo")) $("anClearVideo").addEventListener("click", clearVideo);
    if ($("anCaptureNow")) $("anCaptureNow").addEventListener("click", () => captureCurrentFrame());
    if ($("anCaptureAuto"))
      $("anCaptureAuto").addEventListener("click", () => {
        captureAutoSample();
      });
    if ($("anClearFrames")) $("anClearFrames").addEventListener("click", () => {
      clearFrames();
      setStatus("Semua frame dihapus.", true);
    });

    const strip = $("anFramesStrip");
    if (strip) {
      strip.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-rm]");
        if (btn) removeFrame(btn.getAttribute("data-rm"));
      });
    }

    if ($("anCopyPrompt")) $("anCopyPrompt").addEventListener("click", copyPrompt);
    if ($("anRebuildPrompt"))
      $("anRebuildPrompt").addEventListener("click", () => {
        rebuildPromptPreview();
        setStatus("Prompt di-rebuild dari meta + frame timestamps.", true);
      });
    if ($("anRunApi"))
      $("anRunApi").addEventListener("click", () => {
        runApiVision().catch((e) => {
          setStatus("Gagal: " + e.message, false);
          window.TFDEV.toast("Vision gagal");
        });
      });

    if ($("anCopyJson")) $("anCopyJson").addEventListener("click", copyJson);
    if ($("anApplyMc")) $("anApplyMc").addEventListener("click", applyMc);
    if ($("anApplyPr")) $("anApplyPr").addEventListener("click", applyPr);
    if ($("anApplyPd")) $("anApplyPd").addEventListener("click", applyPd);
    if ($("anGoMc"))
      $("anGoMc").addEventListener("click", () => window.TFDEV.showPage("matchcentre"));
    if ($("anEnableApiMode"))
      $("anEnableApiMode").addEventListener("click", () => {
        setMode("api");
        const adv = $("anAdvancedBlock");
        if (adv) adv.open = true;
        setStatus("Mode API Vision aktif — isi key lalu Jalankan.", true);
      });
    if ($("anEnableExternalMode"))
      $("anEnableExternalMode").addEventListener("click", () => {
        setMode("external");
        setStatus("Mode paket eksternal (tanpa API key).", true);
      });
    if ($("anApplyAll")) {
      $("anApplyAll").addEventListener("click", () => {
        try {
          applyAll({ navigate: true });
        } catch (e) {
          setStatus("Gagal terapkan semua: " + e.message, false);
          window.TFDEV.toast("Gagal terapkan");
        }
      });
    }
    if ($("anFullAuto")) {
      $("anFullAuto").addEventListener("click", () => {
        runFullAuto().catch((e) => {
          setStatus("Full auto gagal: " + e.message, false);
          window.TFDEV.toast("Full auto gagal");
        });
      });
    }
    if ($("anOpenPd")) $("anOpenPd").addEventListener("click", () => window.TFDEV.showPage("player"));
    if ($("anOpenMc")) $("anOpenMc").addEventListener("click", () => window.TFDEV.showPage("matchcentre"));
    if ($("anOpenPr")) $("anOpenPr").addEventListener("click", () => window.TFDEV.showPage("report"));

    if ($("anSendToHighlights")) {
      $("anSendToHighlights").addEventListener("click", () => {
        const item = captureCurrentFrame();
        if (!item) return;
        const name = ($("anVideoName") && $("anVideoName").textContent) || "";
        const ok =
          window.Highlights &&
          window.Highlights.addFromAnalitik({
            t: item.t,
            thumb: item.dataUrl,
            type: "COACHING",
            team: "TFS",
            title: "Frame dari Analitik @" + (window.Highlights.fmtTime ? window.Highlights.fmtTime(item.t) : item.t),
            note: "Dikirim dari Analitik AI",
            videoName: name && name !== "—" ? name : ""
          });
        if (ok) {
          setStatus("Frame dikirim ke Highlights @" + fmtTime(item.t), true);
          window.TFDEV.toast("Ke Highlights");
          window.TFDEV.showPage("highlights");
        } else {
          setStatus("Gagal kirim ke Highlights.", false);
        }
      });
    }

    if ($("anApiKey")) {
      $("anApiKey").addEventListener("change", () => {
        const v = $("anApiKey").value.trim();
        if (v) localStorage.setItem(API_KEY_LS, v);
      });
    }

    // rebuild prompt when meta fields change
    ["anLawan", "anKitLawan", "anBabak", "anDurasi", "anSource", "anPlayerName", "anPlayerNo", "anPlayerAge", "anPlayerPos"].forEach(
      (id) => {
        const el = $(id);
        if (el) el.addEventListener("change", rebuildPromptPreview);
        if (el) el.addEventListener("input", () => {
          /* light debounce via rAF */
          if (window.__anPromptRaf) cancelAnimationFrame(window.__anPromptRaf);
          window.__anPromptRaf = requestAnimationFrame(rebuildPromptPreview);
        });
      }
    );
  };
})();
