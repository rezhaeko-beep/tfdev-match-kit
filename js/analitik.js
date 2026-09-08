(function () {
  const API_KEY_LS = "tfdev-analitik-api-key";
  const API_BASE_LS = "tfdev-analitik-api-base";
  const API_MODEL_LS = "tfdev-analitik-api-model";
  const MAX_VISION_FRAMES = 6;
  const JPEG_QUALITY = 0.72;

  let videoObjectUrl = null;
  let frames = []; // { id, t, dataUrl, w, h }
  let lastResult = null;
  let frameSeq = 0;

  const SYSTEM_PROMPT_FALLBACK =
    "Kamu analis youth football TFS/TFDEV. Tim kita jersey orange. " +
    "PRIMARY EVIDENCE = VIDEO / frame gambar yang disertakan. Jangan mengarang gol/shot/kartu/skor. " +
    "Angka yang tidak terbaca dari footage = null + reason (N/C). " +
    "Possession & attacking sequences boleh estimasi (estimated:true). " +
    "Output: ringkasan singkat + JSON Match Centre dan (jika diminta) Parent Session Report gaya TFDEV " +
    "(overall score, 9 metrics, strengths, focus, 4 home drills, coach note). " +
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
    return checked ? checked.value : "external";
  }

  function syncModeUi() {
    const api = getMode() === "api";
    if ($("anApiFields")) $("anApiFields").style.display = api ? "" : "none";
    if ($("anExternalFields")) $("anExternalFields").style.display = api ? "none" : "";
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
    setStatus("Video dimuat: " + file.name, true);
    window.TFDEV.toast("Video siap");
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
    const maxW = 1280;
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

    const times = [];
    // always include near start
    times.push(0.5);
    for (let t = every; t < v.duration - 0.5 && times.length < maxN; t += every) {
      times.push(t);
    }
    // ensure last moment if room
    if (times.length < maxN && v.duration > 1) {
      const last = Math.max(0.5, v.duration - 0.8);
      if (!times.some((x) => Math.abs(x - last) < every * 0.4)) times.push(last);
    }
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
      "=== TFDEV VIDEO-ANALITIK PROMPT ===",
      "",
      "PRIMARY EVIDENCE: video match / frame yang kamu lihat. JANGAN mengarang. N/C atau null + reason jika tidak terbaca dari footage.",
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
      "1. Upload VIDEO penuh (atau frame JPEG di atas) ke ChatGPT / Claude / Grok vision.",
      "2. Paste seluruh prompt ini.",
      "3. Minta output: ringkasan singkat (5–8 baris) lalu JSON valid { matchCentre, parentReports, highlights? }.",
      "4. Salin JSON kembali ke app TFDEV → Analitik AI → Paste JSON → Terapkan / Full auto.",
      "",
      "Aturan: jangan invent gol/shot/kartu/skor; possession & attacking sequences boleh estimated:true; SoT dari wide cam sering null.",
      "",
      "Opsional tapi preferred — sertakan juga array highlights (momen kunci dari footage):",
      '"highlights": [{ "t": 40, "type": "CHANCE", "team": "TFS", "playerNo": "7", "title": "...", "note": "...", "rating": 4 }]',
      "type ∈ GOL|CHANCE|SKILL|SAVE|COACHING|LAINNYA; t = detik dari awal clip/video.",
      ""
    ];

    if (full && full.length < 12000) {
      packagePrompt.push("--- Referensi schema / full prompt ---");
      packagePrompt.push(full.slice(0, 8000));
      packagePrompt.push("");
    }

    packagePrompt.push(
      "Kembalikan ringkasan singkat lalu JSON sesuai schema Match Centre + Parent Reports TFDEV (+ highlights opsional)."
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
        "Upload video atau " + frames.length + " frame ke ChatGPT / Claude / Grok vision.",
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

  function buildUserContentForVision(meta) {
    const parts = [];
    const textBlock =
      "Analisis VIDEO/frames youth academy berikut untuk TFDEV Analitik.\n" +
      "PRIMARY EVIDENCE = gambar frame di bawah (dan video jika model mendukung). Jangan mengarang. N/C jika unreadable.\n\n" +
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
      "Frame timestamps:\n" +
      (frames.length
        ? frames
            .slice(0, MAX_VISION_FRAMES)
            .map((f, i) => (i + 1) + ". t=" + fmtTime(f.t))
            .join("\n")
        : "(tidak ada frame — analisis terbatas)") +
      "\n\nKembalikan ringkasan singkat lalu JSON { matchCentre, parentReports, highlights? }.\n" +
      "Opsional preferred highlights: [{ t, type, team, playerNo, title, note, rating }] " +
      "type∈GOL|CHANCE|SKILL|SAVE|COACHING|LAINNYA; t=detik.";

    parts.push({ type: "text", text: textBlock });

    frames.slice(0, MAX_VISION_FRAMES).forEach((f) => {
      parts.push({
        type: "image_url",
        image_url: { url: f.dataUrl, detail: "low" }
      });
    });
    return parts;
  }

  async function runApiVision() {
    const meta = readMeta();
    if (!frames.length) {
      throw new Error("Ambil minimal 1 frame dulu (Ambil frame sekarang / sample otomatis).");
    }
    const base = (($("anApiBase") && $("anApiBase").value.trim()) || "https://api.openai.com/v1").replace(
      /\/$/,
      ""
    );
    const model = ($("anApiModel") && $("anApiModel").value.trim()) || "gpt-4o-mini";
    const key = ($("anApiKey") && $("anApiKey").value.trim()) || localStorage.getItem(API_KEY_LS) || "";
    if (!key) throw new Error("API key kosong — isi dulu (disimpan di localStorage).");

    localStorage.setItem(API_KEY_LS, key);
    localStorage.setItem(API_BASE_LS, base);
    localStorage.setItem(API_MODEL_LS, model);

    const system = getSystemPrompt();
    const userContent = buildUserContentForVision(meta);

    setStatus("Mengirim " + Math.min(frames.length, MAX_VISION_FRAMES) + " frame ke Vision API…", true);

    const res = await fetch(base + "/chat/completions", {
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

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error("API " + res.status + ": " + (errText.slice(0, 220) || res.statusText));
    }
    const body = await res.json();
    const content =
      (body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content) ||
      body.content ||
      "";
    const data = parseAiJson(content);
    lastResult = data;
    const pretty = {
      matchCentre: data.matchCentre,
      parentReports: data.parentReports || [],
      highlights: data.highlights || data.keyMoments || undefined,
      playerDashboard: data.playerDashboard || undefined
    };
    if (!pretty.highlights) delete pretty.highlights;
    if (!pretty.playerDashboard) delete pretty.playerDashboard;
    if ($("anJsonOut")) $("anJsonOut").value = JSON.stringify(pretty, null, 2);
    const hlCount =
      (Array.isArray(data.highlights) && data.highlights.length) ||
      (Array.isArray(data.keyMoments) && data.keyMoments.length) ||
      0;
    const summary = [
      "Mode: API Vision (" + model + ")",
      "Frames dikirim: " + Math.min(frames.length, MAX_VISION_FRAMES),
      "Match: " + ((data.matchCentre && data.matchCentre.meta && data.matchCentre.meta.title) || meta.lawan),
      "parentReports: " + ((data.parentReports && data.parentReports.length) || 0),
      "highlights: " + hlCount
    ];
    if ($("anSummaryList")) {
      $("anSummaryList").innerHTML = summary.map((s) => "<li>" + escapeHtml(s) + "</li>").join("");
    }
    setStatus("Vision API selesai · JSON siap diterapkan.", true);
    window.TFDEV.toast("Analitik Vision selesai");
    return data;
  }

  /* ---------- Apply / copy JSON ---------- */

  function getCurrentJson() {
    if (lastResult && (lastResult.matchCentre || lastResult.highlights || lastResult.parentReports)) {
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
      const mc = data.matchCentre || data;
      if (!window.MatchCentre || !window.MatchCentre.applyJson) {
        throw new Error("MatchCentre.applyJson belum siap");
      }
      window.MatchCentre.applyJson(mc);
      window.TFDEV.showPage("matchcentre");
      window.TFDEV.toast("Diterapkan ke Match Centre");
      setStatus("Match Centre diterapkan dari JSON video-analitik.", true);
    } catch (e) {
      setStatus("Gagal terapkan Match Centre: " + e.message, false);
      window.TFDEV.toast("Gagal terapkan");
    }
  }

  function applyPr() {
    try {
      const data = getCurrentJson();
      const reports = data.parentReports || [];
      if (!reports.length) {
        throw new Error("parentReports kosong — minta AI isi parent report (nama pemain di meta).");
      }
      if (!window.ParentReport || !window.ParentReport.applyJson) {
        throw new Error("ParentReport.applyJson belum siap");
      }
      window.ParentReport.applyJson(reports[0], data.matchCentre || null);
      window.TFDEV.showPage("report");
      window.TFDEV.toast("Diterapkan ke Parent Report");
      setStatus("Parent Report diterapkan dari parentReports[0].", true);
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

  function collectHighlightItems(data) {
    if (!data || typeof data !== "object") return [];
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
      const mc = data.matchCentre || (data.teams || data.score || data.meta ? data : null);
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

    // Parent Report — skip gracefully if empty
    try {
      const reports = data.parentReports || [];
      if (!reports.length) {
        results.push({ module: "parentReport", ok: false, skipped: true, reason: "kosong" });
        lines.push("· Parent Report dilewati (parentReports kosong)");
      } else if (!window.ParentReport || !window.ParentReport.applyJson) {
        results.push({ module: "parentReport", ok: false, reason: "API belum siap" });
        lines.push("· Parent Report dilewati (API belum siap)");
      } else {
        window.ParentReport.applyJson(reports[0], data.matchCentre || null);
        results.push({ module: "parentReport", ok: true });
        lines.push("✓ Parent Report diterapkan (parentReports[0])");
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

    // Highlights
    try {
      const hl = applyHighlightsFromData(data, { confirm: false });
      if (hl.ok) {
        results.push({ module: "highlights", ok: true, count: hl.count });
        lines.push("✓ Highlights: " + hl.count + " momen diimpor");
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

    if (opts.navigate !== false) {
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
      setStatus("Full auto: mengambil sample frame otomatis…", true);
      await captureAutoSample();
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
      setStatus("Full auto: menjalankan Vision API…", true);
      data = await runApiVision();
    } else {
      const raw = ($("anJsonOut") && $("anJsonOut").value.trim()) || "";
      if (raw) {
        data = parseAiJson(raw);
        lastResult = data;
        setStatus("Full auto: memakai JSON yang sudah di-paste.", true);
      } else if (lastResult && (lastResult.matchCentre || lastResult.highlights)) {
        data = lastResult;
        setStatus("Full auto: memakai hasil JSON terakhir.", true);
      } else {
        throw new Error(
          "Belum ada JSON. Paste JSON hasil AI, atau aktifkan mode API Vision + isi API key."
        );
      }
    }

    if (!data) throw new Error("JSON analitik kosong.");
    setStatus("Full auto: menerapkan ke semua modul…", true);
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
    const base = localStorage.getItem(API_BASE_LS) || "https://api.openai.com/v1";
    const model = localStorage.getItem(API_MODEL_LS) || "gpt-4o-mini";
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
  window.Analitik = {
    getFrames: function () {
      return frames.slice();
    },
    buildPrompt: buildVideoAnalitikPrompt,
    run: function () {
      if (getMode() === "api") return runApiVision();
      return copyPrompt();
    },
    runFullAuto: runFullAuto,
    applyAll: applyAll,
    getLast: function () {
      return lastResult;
    },
    captureCurrentFrame: captureCurrentFrame
  };

  window.TFDEV.initAnalitik = function () {
    if (!$("page-analitik")) return;
    loadApiSettings();
    syncModeUi();
    wireDropZone();
    renderFramesStrip();
    rebuildPromptPreview();

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
(function () {
  const LS_KEY = "tfdev-player-dashboard";

  /** Seeded sample — Rafi-like youth midfielder (example / demo). */
  const SAMPLE_DASHBOARD = {
    player: {
      name: "Rafi Pratama",
      age: 8,
      position: "Midfielder",
      foot: "Right Foot",
      heightCm: 128,
      weightKg: 26,
      photoDataUrl: null,
      example: true
    },
    score: { overall: 78, delta: 6 },
    skills: [
      { key: "firstTouch", label: "First Touch", value: 82, delta: 2 },
      { key: "dribbling", label: "Dribbling Control", value: 75, delta: 1 },
      { key: "shooting", label: "Shooting Form", value: 71, delta: 3 },
      { key: "agility", label: "Agility", value: 80, delta: 2 }
    ],
    radar: [
      { axis: "First Touch", value: 82 },
      { axis: "Dribbling Control", value: 75 },
      { axis: "Shooting Form", value: 71 },
      { axis: "Agility", value: 80 },
      { axis: "Passing Accuracy", value: 73 },
      { axis: "Tactical Awareness", value: 77 }
    ],
    sessionAnalysis: [
      { metric: "Ball-Foot Distance", value: 14, unit: "cm", status: "Good", estimated: false },
      { metric: "Contact Acceleration", value: 6.2, unit: "m/s²", status: "Good", estimated: true },
      { metric: "Knee Flexion", value: 48, unit: "°", status: "Good", estimated: true },
      { metric: "Hip Rotation", value: 32, unit: "°", status: "Good", estimated: true },
      { metric: "Ball Deceleration", value: 4.1, unit: "m/s", status: "Good", estimated: true }
    ],
    progress: [
      { date: "Apr 20", score: 68 },
      { date: "Apr 27", score: 71 },
      { date: "May 4", score: 74 },
      { date: "May 11", score: 76 },
      { date: "May 18", score: 78 }
    ],
    drills: [
      {
        title: "Cone Dribbling Mastery",
        desc: "Tight touches through cones — fokus keep ball dekat kaki kanan."
      },
      {
        title: "Precision Passing Circuit",
        desc: "Wall / partner pass 2-touch → 1-touch. Target foot accuracy."
      },
      {
        title: "Shooting Technique Fundamentals",
        desc: "Plant foot & hip rotation; finishing setelah receive di half-space."
      }
    ],
    source: "video_analytics",
    sessionDate: "May 18, 2024",
    honestyNote:
      "Sample demo data. Values marked estimated/null come from video analytics limits (wide cam)."
  };

  let current = null;
  let radarChart = null;
  let progressChart = null;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function clampScore(n) {
    const x = Number(n);
    if (!isFinite(x)) return null;
    return Math.max(0, Math.min(100, Math.round(x)));
  }

  function parseMetricTo100(val) {
    if (val == null || val === "" || val === "N/C") return null;
    const n = Number(String(val).replace(/[^0-9.]/g, ""));
    if (!isFinite(n)) return null;
    if (n <= 10) return clampScore(n * 10);
    return clampScore(n);
  }

  function statusClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "focus" || s === "improve" || s === "needs work") return "focus";
    if (s === "good" || s === "ok" || s === "solid") return "good";
    return "neutral";
  }

  function formatDelta(d) {
    if (d == null || d === "" || !isFinite(Number(d))) return null;
    const n = Number(d);
    if (n === 0) return "→ 0 pts vs last period";
    return (n > 0 ? "↑ " : "↓ ") + Math.abs(n) + " pts vs last 7 days";
  }

  function initials(name) {
    const parts = String(name || "P").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "P";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /** Map parentReports[0] + optional metrics into playerDashboard shape. */
  function mapFromParentReport(report, root) {
    if (!report || typeof report !== "object") return null;
    const player = report.player || {};
    const metrics = Array.isArray(report.metrics) ? report.metrics : [];
    const focusAreas = Array.isArray(report.focusAreas) ? report.focusAreas : [];
    const homeDrills =
      (report.homeSupport && Array.isArray(report.homeSupport.drills) && report.homeSupport.drills) ||
      (Array.isArray(report.drills) && report.drills) ||
      [];

    const skillKeys = [
      { key: "firstTouch", labels: ["first touch", "touch", "receiving"], fallback: "First Touch" },
      { key: "dribbling", labels: ["dribbl", "ball control", "control"], fallback: "Dribbling Control" },
      { key: "shooting", labels: ["shoot", "finish", "finishing"], fallback: "Shooting Form" },
      { key: "agility", labels: ["agility", "speed", "mobility", "work rate"], fallback: "Agility" }
    ];

    function findMetric(keys) {
      for (let i = 0; i < metrics.length; i++) {
        const m = metrics[i];
        const blob = ((m.key || "") + " " + (m.label || "")).toLowerCase();
        if (keys.some((k) => blob.indexOf(k) >= 0)) return m;
      }
      return null;
    }

    const overall = clampScore(report.overallScore != null ? report.overallScore : 75) || 75;
    const skills = skillKeys.map((sk, idx) => {
      const m = findMetric(sk.labels) || metrics[idx];
      const value = m ? parseMetricTo100(m.value) : null;
      return {
        key: sk.key,
        label: (m && m.label) || sk.fallback,
        value: value != null ? value : clampScore(overall - 4 + idx * 2),
        delta: m && m.delta != null ? Number(m.delta) : null,
        estimated: !m || value == null
      };
    });

    const extraAxes = [
      { axis: "Passing Accuracy", labels: ["pass", "passing"] },
      { axis: "Tactical Awareness", labels: ["decision", "tactical", "awareness", "scan"] }
    ];
    const radar = skills.map((s) => ({ axis: s.label, value: s.value }));
    extraAxes.forEach((ea, i) => {
      const m = findMetric(ea.labels) || metrics[4 + i];
      const value = m ? parseMetricTo100(m.value) : clampScore(overall - 2 + i);
      radar.push({ axis: ea.axis, value: value != null ? value : clampScore(overall - 2) });
    });

    const sessionAnalysis = [];
    if (Array.isArray(report.sessionAnalysis) && report.sessionAnalysis.length) {
      report.sessionAnalysis.forEach((row) => sessionAnalysis.push(normalizeSessionRow(row)));
    } else if (Array.isArray(report.biomechanics) && report.biomechanics.length) {
      report.biomechanics.forEach((row) => sessionAnalysis.push(normalizeSessionRow(row)));
    } else {
      // Honest placeholders from video analytics — often estimated / null on wide cam
      const defaults = [
        { metric: "Ball-Foot Distance", value: null, unit: "cm", status: "Focus", estimated: true },
        { metric: "Contact Acceleration", value: null, unit: "m/s²", status: "Focus", estimated: true },
        { metric: "Knee Flexion", value: null, unit: "°", status: "Focus", estimated: true },
        { metric: "Hip Rotation", value: null, unit: "°", status: "Focus", estimated: true },
        { metric: "Ball Deceleration", value: null, unit: "m/s", status: "Focus", estimated: true }
      ];
      metrics.slice(0, 5).forEach((m, i) => {
        if (defaults[i]) {
          defaults[i].metric = m.label || defaults[i].metric;
          const raw = m.value;
          if (raw != null && raw !== "" && raw !== "N/C") {
            defaults[i].value = raw;
            defaults[i].unit = m.unit || "";
            defaults[i].status = m.tag || m.status || "Good";
            defaults[i].estimated = m.source !== "measurement";
          }
        }
      });
      defaults.forEach((d) => sessionAnalysis.push(d));
    }

    const drills = [];
    if (homeDrills.length) {
      homeDrills.forEach((d) => {
        if (typeof d === "string") drills.push({ title: d, desc: "" });
        else drills.push({ title: d.title || d.name || "Drill", desc: d.desc || d.goal || "" });
      });
    }
    focusAreas.forEach((f) => {
      if (drills.length >= 3) return;
      if (typeof f === "string") drills.push({ title: f, desc: "Fokus dari video analytics." });
      else drills.push({ title: f.title || "Focus drill", desc: f.desc || "" });
    });
    if (!drills.length) {
      drills.push(
        { title: "Cone Dribbling Mastery", desc: "Recommended from session focus." },
        { title: "Precision Passing Circuit", desc: "Recommended from session focus." },
        { title: "Shooting Technique Fundamentals", desc: "Recommended from session focus." }
      );
    }

    // Progress: invent honest last-4-weeks trend ending at overall (demo curve)
    const progress = buildProgressSeries(overall, player.sessionDate);

    let age = player.age != null ? Number(player.age) : null;
    if (age == null && player.ageGroup) {
      const m = String(player.ageGroup).match(/(\d+)/);
      if (m) age = Number(m[1]);
    }

    return {
      player: {
        name: player.name || "Pemain",
        age: age,
        position: player.position || "",
        foot: player.foot || player.preferredFoot || "—",
        heightCm: player.heightCm != null ? player.heightCm : null,
        weightKg: player.weightKg != null ? player.weightKg : null,
        photoDataUrl: player.photoDataUrl || null,
        example: false
      },
      score: {
        overall: overall,
        delta: report.scoreDelta != null ? Number(report.scoreDelta) : null
      },
      skills: skills,
      radar: radar,
      sessionAnalysis: sessionAnalysis,
      progress: progress,
      drills: drills.slice(0, 5),
      source: "video_analytics",
      sessionDate: player.sessionDate || "",
      honestyNote:
        "Mapped from parentReports[0] + metrics. Biomechanics null/estimated if not in video JSON."
    };
  }

  function normalizeSessionRow(row) {
    if (!row || typeof row !== "object") {
      return { metric: "—", value: null, unit: "", status: "Focus", estimated: true };
    }
    const value =
      row.value === undefined || row.value === null || row.value === "N/C" || row.value === ""
        ? null
        : row.value;
    return {
      metric: row.metric || row.label || row.name || "Metric",
      value: value,
      unit: row.unit || "",
      status: row.status || row.tag || (value == null ? "Focus" : "Good"),
      estimated: row.estimated === true || value == null,
      reason: row.reason || ""
    };
  }

  function buildProgressSeries(overall, sessionDate) {
    const end = clampScore(overall) || 70;
    const pts = [end - 10, end - 7, end - 4, end - 2, end].map((x) => clampScore(Math.max(40, x)));
    // Rough last-4-weeks labels relative to sessionDate if parseable, else generic
    let labels = ["W-4", "W-3", "W-2", "W-1", "Now"];
    if (sessionDate) {
      const d = new Date(sessionDate);
      if (!isNaN(d.getTime())) {
        labels = [];
        for (let i = 4; i >= 0; i--) {
          const x = new Date(d);
          x.setDate(x.getDate() - i * 7);
          labels.push(
            x.toLocaleDateString("en-US", { month: "short", day: "numeric" })
          );
        }
      }
    }
    return labels.map((date, i) => ({ date: date, score: pts[i] }));
  }

  function normalizeDashboard(data) {
    if (!data || typeof data !== "object") throw new Error("playerDashboard kosong");
    if (data.playerDashboard) return normalizeDashboard(data.playerDashboard);

    // Already in schema
    if (data.player && (data.skills || data.radar || data.score)) {
      const d = Object.assign({}, data);
      d.player = Object.assign({}, data.player);
      d.score = Object.assign({ overall: 70, delta: null }, data.score || {});
      d.score.overall = clampScore(d.score.overall) || 70;
      d.skills = Array.isArray(data.skills) ? data.skills.map(normalizeSkill) : SAMPLE_DASHBOARD.skills;
      d.radar = Array.isArray(data.radar) && data.radar.length
        ? data.radar.map((r) => ({ axis: r.axis || r.label, value: clampScore(r.value) || 0 }))
        : d.skills.map((s) => ({ axis: s.label, value: s.value }));
      while (d.radar.length < 6) {
        d.radar.push({ axis: "Axis " + (d.radar.length + 1), value: d.score.overall });
      }
      d.sessionAnalysis = Array.isArray(data.sessionAnalysis)
        ? data.sessionAnalysis.map(normalizeSessionRow)
        : [];
      d.progress = Array.isArray(data.progress) && data.progress.length
        ? data.progress
        : buildProgressSeries(d.score.overall, d.sessionDate || d.player.sessionDate);
      d.drills = Array.isArray(data.drills) ? data.drills : [];
      d.source = data.source || "video_analytics";
      return d;
    }

    // parent report shape
    if (data.overallScore != null || (data.player && data.metrics)) {
      return mapFromParentReport(data, null);
    }

    throw new Error("Schema tidak dikenali — butuh playerDashboard atau parentReports[0]");
  }

  function normalizeSkill(s) {
    return {
      key: s.key || "",
      label: s.label || s.key || "Skill",
      value: clampScore(s.value) != null ? clampScore(s.value) : 0,
      delta: s.delta != null && isFinite(Number(s.delta)) ? Number(s.delta) : null,
      estimated: !!s.estimated
    };
  }

  /**
   * Apply analytics JSON root: prefer playerDashboard; else map parentReports[0].
   */
  function applyFromAnalytics(root) {
    if (!root || typeof root !== "object") throw new Error("JSON kosong");
    let dash = null;
    if (root.playerDashboard) {
      dash = normalizeDashboard(root.playerDashboard);
    } else if (Array.isArray(root.parentReports) && root.parentReports.length) {
      dash = mapFromParentReport(root.parentReports[0], root);
    } else if (root.player && (root.skills || root.score || root.radar)) {
      dash = normalizeDashboard(root);
    } else if (root.overallScore != null || (root.player && root.metrics)) {
      dash = mapFromParentReport(root, null);
    } else {
      throw new Error("Tidak ada playerDashboard / parentReports di JSON");
    }
    setDashboard(dash);
    return dash;
  }

  function setDashboard(dash) {
    current = dash;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(dash));
    } catch (_) {}
    render();
  }

  function loadStored() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return normalizeDashboard(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  }

  function destroyCharts() {
    if (radarChart) {
      try {
        radarChart.destroy();
      } catch (_) {}
      radarChart = null;
    }
    if (progressChart) {
      try {
        progressChart.destroy();
      } catch (_) {}
      progressChart = null;
    }
  }

  function chartOrange() {
    return "#FF6B1A";
  }


  function drawFallbackRadar(canvas, dash) {
    var radar = dash.radar || [];
    if (!radar.length) return;
    var parent = canvas.parentElement;
    var size = Math.min(parent ? parent.clientWidth : 320, 360) || 320;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var cx = size / 2, cy = size / 2, R = size * 0.34;
    var n = radar.length;
    ctx.clearRect(0, 0, size, size);
    var ring, i, ang, rr, x, y;
    for (ring = 1; ring <= 5; ring++) {
      ctx.beginPath();
      for (i = 0; i < n; i++) {
        ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        rr = (R * ring) / 5;
        x = cx + Math.cos(ang) * rr;
        y = cy + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(36,48,64,0.9)";
      ctx.stroke();
    }
    ctx.fillStyle = "#c5d4e3";
    ctx.font = "600 11px Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (i = 0; i < n; i++) {
      ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
      ctx.strokeStyle = "rgba(36,48,64,0.9)";
      ctx.stroke();
      var lx = cx + Math.cos(ang) * (R + 20);
      var ly = cy + Math.sin(ang) * (R + 20);
      var parts = String(radar[i].axis || "").split(" ");
      if (parts.length > 1) {
        ctx.fillText(parts[0], lx, ly - 7);
        ctx.fillText(parts.slice(1).join(" "), lx, ly + 7);
      } else {
        ctx.fillText(parts[0] || "", lx, ly);
      }
    }
    ctx.beginPath();
    for (i = 0; i < n; i++) {
      ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      var val = Math.max(0, Math.min(100, Number(radar[i].value) || 0));
      rr = (R * val) / 100;
      x = cx + Math.cos(ang) * rr;
      y = cy + Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(255,107,26,0.28)";
    ctx.fill();
    ctx.strokeStyle = "#FF6B1A";
    ctx.lineWidth = 2;
    ctx.stroke();
    for (i = 0; i < n; i++) {
      ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      val = Math.max(0, Math.min(100, Number(radar[i].value) || 0));
      rr = (R * val) / 100;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#FF6B1A";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawFallbackLine(canvas, dash) {
    var prog = dash.progress || [];
    if (!prog.length) return;
    var parent = canvas.parentElement;
    var w = Math.max(280, parent ? parent.clientWidth : 320);
    var h = 220;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var pad = { t: 16, r: 16, b: 36, l: 40 };
    var plotW = w - pad.l - pad.r;
    var plotH = h - pad.t - pad.b;
    var ymin = 40, ymax = 100;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(36,48,64,0.5)";
    ctx.fillStyle = "#8aa0b5";
    ctx.font = "11px Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "right";
    var g, yy, gval;
    for (g = 0; g <= 3; g++) {
      yy = pad.t + (plotH * g) / 3;
      gval = ymax - ((ymax - ymin) * g) / 3;
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(pad.l + plotW, yy);
      ctx.stroke();
      ctx.fillText(String(Math.round(gval)), pad.l - 6, yy + 3);
    }
    var pts = prog.map(function (p, i) {
      var x = pad.l + (prog.length === 1 ? plotW / 2 : (plotW * i) / (prog.length - 1));
      var sc = Math.max(ymin, Math.min(ymax, Number(p.score) || ymin));
      var y = pad.t + plotH * (1 - (sc - ymin) / (ymax - ymin));
      return { x: x, y: y, label: p.date };
    });
    ctx.beginPath();
    pts.forEach(function (pt, i) {
      if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    });
    ctx.lineTo(pts[pts.length - 1].x, pad.t + plotH);
    ctx.lineTo(pts[0].x, pad.t + plotH);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,107,26,0.18)";
    ctx.fill();
    ctx.beginPath();
    pts.forEach(function (pt, i) {
      if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    });
    ctx.strokeStyle = "#FF6B1A";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.textAlign = "center";
    pts.forEach(function (pt) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#FF6B1A";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#8aa0b5";
      ctx.fillText(String(pt.label || ""), pt.x, h - 12);
    });
  }

  function renderCharts(dash) {
    const note = $("pdChartsNote");
    const radarCanvas = $("pdRadarChart");
    const lineCanvas = $("pdProgressChart");
    if (!radarCanvas || !lineCanvas) return;

    if (typeof Chart === "undefined") {
      if (note) {
        note.hidden = false;
        note.textContent = "Using canvas charts (add Chart.js CDN for Chart.js rendering).";
      }
      destroyCharts();
      drawFallbackRadar(radarCanvas, dash);
      drawFallbackLine(lineCanvas, dash);
      return;
    }
    if (note) note.hidden = true;
    destroyCharts();

    const radarLabels = (dash.radar || []).map((r) => r.axis);
    const radarValues = (dash.radar || []).map((r) => r.value);

    radarChart = new Chart(radarCanvas.getContext("2d"), {
      type: "radar",
      data: {
        labels: radarLabels,
        datasets: [
          {
            label: "Skills",
            data: radarValues,
            backgroundColor: "rgba(255, 107, 26, 0.28)",
            borderColor: chartOrange(),
            borderWidth: 2,
            pointBackgroundColor: chartOrange(),
            pointBorderColor: "#fff",
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.label + ": " + ctx.raw + "/100";
              }
            }
          }
        },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: {
              stepSize: 20,
              color: "#6b8094",
              backdropColor: "transparent",
              font: { size: 10 }
            },
            grid: { color: "rgba(36, 48, 64, 0.9)" },
            angleLines: { color: "rgba(36, 48, 64, 0.9)" },
            pointLabels: {
              color: "#c5d4e3",
              font: { size: 11, weight: "600" }
            }
          }
        }
      }
    });

    const prog = dash.progress || [];
    progressChart = new Chart(lineCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels: prog.map((p) => p.date),
        datasets: [
          {
            label: "TFdev Score",
            data: prog.map((p) => p.score),
            borderColor: chartOrange(),
            backgroundColor: "rgba(255, 107, 26, 0.18)",
            fill: true,
            tension: 0.35,
            pointRadius: 5,
            pointBackgroundColor: chartOrange(),
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
            borderWidth: 2.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            ticks: { color: "#8aa0b5", font: { size: 11 } },
            grid: { color: "rgba(36, 48, 64, 0.5)" }
          },
          y: {
            min: 40,
            max: 100,
            ticks: { color: "#8aa0b5", font: { size: 11 } },
            grid: { color: "rgba(36, 48, 64, 0.5)" }
          }
        }
      }
    });
  }

  function skillIcon(key) {
    const k = String(key || "").toLowerCase();
    if (k.indexOf("touch") >= 0 || k === "firsttouch") return "◎";
    if (k.indexOf("dribbl") >= 0) return "⚽";
    if (k.indexOf("shoot") >= 0) return "◎";
    if (k.indexOf("agil") >= 0) return "⚡";
    return "◆";
  }

  function render() {
    const dash = current || SAMPLE_DASHBOARD;
    const p = dash.player || {};
    const score = dash.score || { overall: 0, delta: null };

    const badge = $("pdSourceBadge");
    if (badge) {
      badge.textContent = p.example
        ? "Sample · video_analytics"
        : (dash.source || "video_analytics");
      badge.className = "pill" + (p.example ? " orange" : "");
    }

    const photo = $("pdPhoto");
    if (photo) {
      if (p.photoDataUrl) {
        photo.innerHTML = '<img src="' + esc(p.photoDataUrl) + '" alt="' + esc(p.name) + '" />';
      } else {
        photo.innerHTML = '<span class="pd-photo-initials">' + esc(initials(p.name)) + "</span>";
      }
    }

    if ($("pdName")) $("pdName").textContent = p.name || "—";
    if ($("pdAge")) {
      $("pdAge").textContent = p.age != null ? "Age " + p.age : "Age —";
      $("pdAge").style.display = "";
    }
    if ($("pdPosition")) $("pdPosition").textContent = p.position || "—";

    if ($("pdFoot")) $("pdFoot").textContent = p.foot || "—";
    if ($("pdHeight"))
      $("pdHeight").textContent = p.heightCm != null ? p.heightCm + " cm" : "—";
    if ($("pdWeight"))
      $("pdWeight").textContent = p.weightKg != null ? p.weightKg + " kg" : "—";

    if ($("pdOverall")) $("pdOverall").textContent = String(score.overall != null ? score.overall : "—");
    const deltaEl = $("pdDelta");
    if (deltaEl) {
      const txt = formatDelta(score.delta);
      if (txt) {
        deltaEl.textContent = txt;
        deltaEl.className = "pd-delta " + (Number(score.delta) >= 0 ? "up" : "down");
        deltaEl.hidden = false;
      } else {
        deltaEl.textContent = "Delta vs last period: N/C (video)";
        deltaEl.className = "pd-delta muted";
        deltaEl.hidden = false;
      }
    }

    const skillsHost = $("pdSkillCards");
    if (skillsHost) {
      const skills = dash.skills || [];
      skillsHost.innerHTML = skills
        .map((s) => {
          const val = s.value != null ? s.value : 0;
          const delta =
            s.delta != null && isFinite(Number(s.delta))
              ? '<span class="pd-skill-delta up">↑ ' + esc(String(s.delta)) + "</span>"
              : s.estimated
                ? '<span class="pd-skill-delta muted">est.</span>'
                : '<span class="pd-skill-delta up">↑</span>';
          return (
            '<article class="pd-skill-card">' +
            '<div class="pd-skill-top">' +
            '<span class="pd-skill-icon" aria-hidden="true">' +
            skillIcon(s.key || s.label) +
            "</span>" +
            delta +
            "</div>" +
            '<div class="pd-skill-label">' +
            esc(s.label) +
            "</div>" +
            '<div class="pd-skill-value"><strong>' +
            esc(String(val)) +
            "</strong><span>/100</span></div>" +
            '<div class="pd-skill-bar"><i style="width:' +
            Math.max(0, Math.min(100, val)) +
            '%"></i></div>' +
            "</article>"
          );
        })
        .join("");
    }

    const sessLabel = $("pdSessionDate");
    if (sessLabel) {
      sessLabel.textContent = dash.sessionDate
        ? "Session · " + dash.sessionDate
        : "Recent Session Analysis";
    }

    const tableBody = $("pdSessionBody");
    if (tableBody) {
      const rows = dash.sessionAnalysis || [];
      if (!rows.length) {
        tableBody.innerHTML =
          '<tr><td colspan="3" class="pd-empty">Belum ada metrik sesi — apply JSON dari Analitik AI.</td></tr>';
      } else {
        tableBody.innerHTML = rows
          .map((r) => {
            const st = statusClass(r.status);
            let displayVal;
            if (r.value == null || r.value === "") {
              displayVal = '<span class="pd-nc">N/C' + (r.estimated ? " · est." : "") + "</span>";
            } else {
              displayVal =
                esc(String(r.value)) +
                (r.unit ? " <span class=\"pd-unit\">" + esc(r.unit) + "</span>" : "") +
                (r.estimated ? ' <span class="pd-est" title="Estimated from video">est.</span>' : "");
            }
            return (
              "<tr>" +
              "<td>" +
              esc(r.metric) +
              "</td>" +
              "<td>" +
              displayVal +
              "</td>" +
              '<td><span class="pd-tag ' +
              st +
              '">' +
              esc(r.status || (r.value == null ? "Focus" : "Good")) +
              "</span></td>" +
              "</tr>"
            );
          })
          .join("");
      }
    }

    const drillsHost = $("pdDrills");
    if (drillsHost) {
      const drills = dash.drills || [];
      drillsHost.innerHTML = drills
        .map(
          (d, i) =>
            '<article class="pd-drill" id="pd-drill-' +
            i +
            '">' +
            "<div>" +
            "<h4>" +
            esc(d.title || "Drill") +
            "</h4>" +
            "<p>" +
            esc(d.desc || "") +
            "</p>" +
            "</div>" +
            '<button type="button" class="btn btn-ghost btn-sm pd-start-drill" data-drill="' +
            i +
            '">Start Drill</button>' +
            "</article>"
        )
        .join("");
    }

    const honesty = $("pdHonesty");
    if (honesty) {
      honesty.textContent =
        dash.honestyNote ||
        "Data dari video analytics. Nilai null / N/C / estimated = tidak terukur pasti dari footage.";
    }

    renderCharts(dash);
  }

  function setPasteStatus(msg, ok) {
    const el = $("pdPasteStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "gen-status" + (msg ? (ok ? " ok" : " err") : "");
  }

  function applyPaste() {
    try {
      const raw = ($("pdJsonPaste") && $("pdJsonPaste").value.trim()) || "";
      if (!raw) throw new Error("Tempel JSON dulu.");
      let text = raw;
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) text = fence[1].trim();
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) text = text.slice(start, end + 1);
      const data = JSON.parse(text);
      applyFromAnalytics(data);
      setPasteStatus("Player Dashboard diterapkan dari JSON video analytics.", true);
      window.TFDEV.toast("Player Dashboard updated");
    } catch (e) {
      setPasteStatus("Gagal: " + e.message, false);
      window.TFDEV.toast("JSON tidak valid");
    }
  }

  function loadSample() {
    setDashboard(JSON.parse(JSON.stringify(SAMPLE_DASHBOARD)));
    if ($("pdJsonPaste")) {
      $("pdJsonPaste").value = JSON.stringify({ playerDashboard: SAMPLE_DASHBOARD }, null, 2);
    }
    setPasteStatus("Sample Rafi Pratama dimuat (example).", true);
    window.TFDEV.toast("Sample player loaded");
  }

  window.TFDEV = window.TFDEV || {};
  window.PlayerDashboard = {
    applyJson: applyFromAnalytics,
    applyFromAnalytics: applyFromAnalytics,
    get: function () {
      return current;
    },
    loadSample: loadSample,
    SAMPLE: SAMPLE_DASHBOARD,
    render: render
  };

  window.TFDEV.initPlayer = function () {
    if (!$("page-player")) return;

    const stored = loadStored();
    current = stored || JSON.parse(JSON.stringify(SAMPLE_DASHBOARD));

    if ($("pdLoadSample")) $("pdLoadSample").addEventListener("click", loadSample);
    if ($("pdApplyPaste")) $("pdApplyPaste").addEventListener("click", applyPaste);
    if ($("pdOpenAnalitik"))
      $("pdOpenAnalitik").addEventListener("click", () => window.TFDEV.showPage("analitik"));

    const drillsHost = $("pdDrills");
    if (drillsHost) {
      drillsHost.addEventListener("click", (e) => {
        const btn = e.target.closest(".pd-start-drill");
        if (!btn) return;
        const id = btn.getAttribute("data-drill");
        const el = $("pd-drill-" + id);
        if (el) {
          el.classList.add("highlight");
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          window.TFDEV.toast("Drill detail");
          setTimeout(() => el.classList.remove("highlight"), 1600);
        }
      });
    }

    // Re-render charts when navigating to player (canvas may have been hidden)
    const navLinks = document.querySelectorAll(".nav-link[data-page='player'], [data-go='player']");
    navLinks.forEach((el) => {
      el.addEventListener("click", () => {
        setTimeout(() => {
          if (current) renderCharts(current);
        }, 80);
      });
    });

    render();
  };
})();
