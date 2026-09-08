(function () {
  const LS_KEY = "tfdev-highlights-v1";
  const DEMO_KEY = "__demo__";
  const JPEG_QUALITY = 0.72;
  const TYPES = ["GOL", "CHANCE", "SKILL", "SAVE", "COACHING", "LAINNYA"];
  const TEAMS = ["TFS", "Lawan"];

  let videoObjectUrl = null;
  let videoName = "";
  let videoReady = false;
  let highlights = [];
  let editingId = null;
  let seq = 0;
  let autoThumbToken = 0;
  let genThumbsRunning = false;

  const SEED = [
    { id: "m1", t: 40, type: "COACHING", team: "TFS", playerNo: "", title: "Shape awal Babak 1", note: "TFS orange vs G8 pink; wide cam full lapangan. Cek jarak antar lini & width di build-up awal.", rating: 3, thumb: null, seed: true },
    { id: "m2", t: 90, type: "CHANCE", team: "TFS", playerNo: "7", title: "Serangan sisi / peluang transisi", note: "#7 sering terlibat di jalur serangan. Clip bagus untuk parent: intensitas pressing & support.", rating: 4, thumb: null, seed: true },
    { id: "m3", t: 150, type: "SKILL", team: "TFS", playerNo: "10", title: "Kontrol + progresi tengah", note: "Observasi first touch & turn di zona tengah. Cocok untuk highlight skill ortu.", rating: 4, thumb: null, seed: true },
    { id: "m4", t: 210, type: "CHANCE", team: "Lawan", playerNo: "", title: "Tekanan G8 ke kotak TFS", note: "Momen defensive shape TFS. Coaching point: compact + clear first ball.", rating: 3, thumb: null, seed: true },
    { id: "m5", t: 245, type: "COACHING", team: "TFS", playerNo: "6", title: "Midfield duel & second ball", note: "#6 di duels tengah. Fokus body orientation & reaction setelah lose ball.", rating: 4, thumb: null, seed: true },
    { id: "m6", t: 300, type: "CHANCE", team: "TFS", playerNo: "8", title: "Peluang setengah lapangan", note: "Kombinasi #8 di half-space. Finishing/keputusan akhir bisa jadi fokus latihan.", rating: 4, thumb: null, seed: true },
    { id: "m7", t: 335, type: "SAVE", team: "TFS", playerNo: "1", title: "Situasi di depan gawang TFS", note: "Aksi dekat gawang (0-0 dipertahankan). Clip untuk sesi GK / block.", rating: 4, thumb: null, seed: true },
    { id: "m8", t: 396, type: "SKILL", team: "TFS", playerNo: "7", title: "1v1 / change of pace", note: "Momen individu #7. Bagus untuk CapCut parent highlight.", rating: 5, thumb: null, seed: true },
    { id: "m9", t: 450, type: "CHANCE", team: "TFS", playerNo: "", title: "Build-up ke sepertiga akhir", note: "Possession TFS lebih tinggi (~54%). Lihat patience vs force the pass.", rating: 3, thumb: null, seed: true },
    { id: "m10", t: 510, type: "COACHING", team: "TFS", playerNo: "", title: "Rest defense saat loss of possession", note: "Transisi negatif: jarak antar line & counter-press 3 detik pertama.", rating: 4, thumb: null, seed: true },
    { id: "m11", t: 570, type: "CHANCE", team: "Lawan", playerNo: "", title: "Counter / peluang G8 akhir babak", note: "Kelola game state 0-0 menjelang akhir Babak 1.", rating: 3, thumb: null, seed: true },
    { id: "m12", t: 610, type: "LAINNYA", team: "TFS", playerNo: "", title: "Tutup Babak 1 (0-0)", note: "Skor babak 1: 0-0. Siap highlight reel CapCut dari timestamp di atas.", rating: 3, thumb: null, seed: true }
  ];

  function $(id) { return document.getElementById(id); }
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
  function setStatus(msg, ok) {
    const el = $("hlStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "gen-status" + (msg ? (ok ? " ok" : " err") : "");
  }
  function storageKeyForVideo() { return videoName ? videoName : DEMO_KEY; }
  function isMatchVideoKey(key) {
    return key === DEMO_KEY || /TFS.*G8|G8.*TFS|Babak\s*1/i.test(String(key || ""));
  }
  function loadStore() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return { byVideo: {} };
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return { byVideo: {} };
      if (!data.byVideo || typeof data.byVideo !== "object") data.byVideo = {};
      return data;
    } catch (_) {
      return { byVideo: {} };
    }
  }
  function saveStore(store) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(store));
    } catch (e) {
      setStatus("Gagal simpan localStorage: " + e.message, false);
    }
  }
  function persist() {
    const store = loadStore();
    const key = storageKeyForVideo();
    store.byVideo[key] = highlights.map((h) => ({
      id: h.id,
      t: h.t,
      type: h.type,
      team: h.team,
      playerNo: h.playerNo || "",
      title: h.title || "",
      note: h.note || "",
      rating: h.rating == null || h.rating === "" ? null : Number(h.rating),
      thumb: h.thumb || null,
      seed: !!h.seed
    }));
    store.lastKey = key;
    saveStore(store);
    notifyCoachAnalytics();
  }
  function notifyCoachAnalytics() {
    try {
      if (window.TFDEV && window.TFDEV.coachAnalytics && typeof window.TFDEV.coachAnalytics.recompute === "function") {
        window.TFDEV.coachAnalytics.recompute({ highlights: highlights.slice() });
      }
    } catch (_) {}
  }
  function loadForCurrentVideo() {
    const store = loadStore();
    const key = storageKeyForVideo();
    const saved = store.byVideo[key];
    if (Array.isArray(saved) && saved.length) {
      highlights = saved.map((h) => ({ ...h }));
      seq = highlights.reduce((m, h) => {
        const n = parseInt(String(h.id).replace(/\D/g, ""), 10);
        return isFinite(n) && n > m ? n : m;
      }, 0);
    } else if (isMatchVideoKey(key)) {
      highlights = SEED.map((h) => ({ ...h }));
      seq = SEED.length;
      persist();
    } else {
      highlights = [];
      seq = 0;
    }
    editingId = null;
    renderList();
    syncFormMode();
  }
  function revokeVideoUrl() {
    if (videoObjectUrl) {
      try { URL.revokeObjectURL(videoObjectUrl); } catch (_) {}
      videoObjectUrl = null;
    }
  }
  function updateBadge() {
    const badge = $("hlVideoBadge");
    if (!badge) return;
    badge.textContent = videoReady
      ? "Video siap · jump ON"
      : "Tanpa video · jump OFF (demo)";
  }
  function maybeAutoGenThumbs() {
    if (!videoReady) return;
    const missing = highlights.some((h) => !h.thumb);
    if (!missing || genThumbsRunning) return;
    const token = ++autoThumbToken;
    // Quiet auto-run once per video load for items missing thumbs (seed included).
    setTimeout(() => {
      if (token !== autoThumbToken) return;
      if (!videoReady || genThumbsRunning) return;
      if (!highlights.some((h) => !h.thumb)) return;
      generateMissingThumbs({ quiet: true }).catch(() => {});
    }, 350);
  }
  function onVideoMeta() {
    const v = $("hlVideo");
    if (!v) return;
    videoReady = !!(v.src && isFinite(v.duration) && v.duration > 0);
    const info = $("hlVideoInfo");
    if (info) {
      info.textContent = videoReady
        ? fmtTime(v.duration) + " · " + (v.videoWidth || "?") + "×" + (v.videoHeight || "?")
        : "—";
    }
    updateBadge();
    updateTimeLabel();
    maybeAutoGenThumbs();
  }
  function updateTimeLabel() {
    const v = $("hlVideo");
    const lab = $("hlTimeLabel");
    if (!lab) return;
    if (v && videoReady) lab.textContent = fmtTime(v.currentTime || 0);
    else lab.textContent = "—";
  }
  function clearVideo() {
    autoThumbToken += 1;
    revokeVideoUrl();
    videoName = "";
    videoReady = false;
    const v = $("hlVideo");
    if (v) {
      v.removeAttribute("src");
      v.load();
    }
    const wrap = $("hlVideoWrap");
    if (wrap) wrap.hidden = true;
    const nameEl = $("hlVideoName");
    if (nameEl) nameEl.textContent = "—";
    const info = $("hlVideoInfo");
    if (info) info.textContent = "—";
    updateBadge();
    loadForCurrentVideo();
  }
  function acceptVideoFile(file) {
    if (!file) return;
    if (!String(file.type || "").startsWith("video/") && !/\.(mp4|mov|webm|m4v|mkv)$/i.test(file.name || "")) {
      setStatus("File harus video.", false);
      window.TFDEV && window.TFDEV.toast && window.TFDEV.toast("Bukan file video");
      return;
    }
    autoThumbToken += 1;
    revokeVideoUrl();
    videoObjectUrl = URL.createObjectURL(file);
    videoName = file.name || "video";
    const v = $("hlVideo");
    const wrap = $("hlVideoWrap");
    const nameEl = $("hlVideoName");
    if (nameEl) nameEl.textContent = videoName;
    if (wrap) wrap.hidden = false;
    if (v) {
      v.src = videoObjectUrl;
      v.onloadedmetadata = onVideoMeta;
      try { v.load(); } catch (_) {}
    }
    loadForCurrentVideo();
    setStatus("Video dimuat: " + videoName + " — highlight match auto-load jika TFS vs G8.", true);
  }

  function seekVideoTo(t) {
    const v = $("hlVideo");
    return new Promise((resolve, reject) => {
      if (!v || !videoReady) return reject(new Error("Video belum siap"));
      const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : null;
      const target = Math.max(0, Math.min(Number(t) || 0, dur != null ? Math.max(0, dur - 0.05) : Number(t) || 0));
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        v.removeEventListener("seeked", onSeeked);
        clearTimeout(timer);
        resolve(target);
      };
      const onSeeked = () => finish();
      v.addEventListener("seeked", onSeeked);
      const timer = setTimeout(() => {
        if (Math.abs((v.currentTime || 0) - target) < 0.5) finish();
        else {
          if (!settled) {
            settled = true;
            v.removeEventListener("seeked", onSeeked);
            resolve(target);
          }
        }
      }, 1200);
      try {
        if (Math.abs((v.currentTime || 0) - target) < 0.05 && v.readyState >= 2) {
          finish();
          return;
        }
        v.currentTime = target;
      } catch (e) {
        v.removeEventListener("seeked", onSeeked);
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  function drawThumbFromVideo() {
    const v = $("hlVideo");
    const canvas = $("hlCanvas");
    if (!v || !canvas || !videoReady || !v.videoWidth) return null;
    try {
      const w = Math.min(320, v.videoWidth);
      const h = Math.round((v.videoHeight / v.videoWidth) * w) || 1;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(v, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    } catch (_) {
      return null;
    }
  }

  /** Sync capture at current frame (legacy). Prefer captureThumbAtAsync for reliable seeks. */
  function captureThumbAt(t) {
    const v = $("hlVideo");
    if (!v || !videoReady || !v.videoWidth) return null;
    const cur = Number(v.currentTime) || 0;
    if (t != null && Math.abs(cur - Number(t)) > 0.75) {
      // Without await, fall back to current frame only if close enough
      return null;
    }
    return drawThumbFromVideo();
  }

  async function captureThumbAtAsync(t) {
    const v = $("hlVideo");
    if (!v || !videoReady || !v.videoWidth) return null;
    const wasPaused = v.paused;
    try {
      v.pause();
      await seekVideoTo(t);
      await new Promise((r) => setTimeout(r, 40));
      return drawThumbFromVideo();
    } catch (_) {
      return null;
    } finally {
      if (!wasPaused) {
        try { v.play().catch(() => {}); } catch (_) {}
      }
    }
  }

  function parseTimeToSec(val) {
    if (val == null || val === "") return null;
    if (typeof val === "number" && isFinite(val)) return Math.max(0, val);
    const s = String(val).trim();
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) return Math.max(0, Number(s));
    const m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
    if (m) {
      if (m[3] != null) {
        return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      }
      return Number(m[1]) * 60 + Number(m[2]);
    }
    return null;
  }

  function normalizeHighlightItem(raw, opts) {
    if (!raw || typeof raw !== "object") return null;
    let t = null;
    if (raw.t != null) t = Number(raw.t);
    else if (raw.timeSec != null) t = Number(raw.timeSec);
    else if (raw.second != null) t = Number(raw.second);
    else if (raw.time != null) t = parseTimeToSec(raw.time);
    if (!isFinite(t) || t < 0) t = 0;
    t = Math.round(t);
    let type = String(raw.type || "LAINNYA").toUpperCase();
    if (TYPES.indexOf(type) < 0) type = "LAINNYA";
    let team = String(raw.team || "TFS");
    if (TEAMS.indexOf(team) < 0) {
      team = /lawan|away|g8|opp/i.test(team) ? "Lawan" : "TFS";
    }
    const playerNo = String(
      raw.playerNo != null ? raw.playerNo : raw.number != null ? raw.number : ""
    ).trim();
    const title = String(raw.title || "").trim();
    const note = String(raw.note != null ? raw.note : raw.description != null ? raw.description : "").trim();
    const rating =
      raw.rating == null || raw.rating === ""
        ? null
        : Math.max(1, Math.min(5, Number(raw.rating)));
    const thumb = raw.thumb || null;
    const id = raw.id ? String(raw.id) : null;
    return {
      id,
      t,
      type,
      team,
      playerNo,
      title,
      note,
      rating: isFinite(rating) ? rating : null,
      thumb,
      seed: !!(opts && opts.seed) || !!raw.seed
    };
  }

  function readForm(tOverride) {
    const v = $("hlVideo");
    const t = tOverride != null ? tOverride : (v && videoReady ? v.currentTime : 0);
    return {
      t: Math.max(0, Math.round(Number(t) || 0)),
      type: ($("hlType") && $("hlType").value) || "CHANCE",
      team: ($("hlTeam") && $("hlTeam").value) || "TFS",
      playerNo: (($("hlPlayerNo") && $("hlPlayerNo").value) || "").trim(),
      title: (($("hlTitle") && $("hlTitle").value) || "").trim(),
      note: (($("hlNote") && $("hlNote").value) || "").trim(),
      rating: $("hlRating") && $("hlRating").value !== "" ? Number($("hlRating").value) : null
    };
  }
  function fillForm(h) {
    if ($("hlType")) $("hlType").value = h.type || "CHANCE";
    if ($("hlTeam")) $("hlTeam").value = h.team || "TFS";
    if ($("hlPlayerNo")) $("hlPlayerNo").value = h.playerNo || "";
    if ($("hlTitle")) $("hlTitle").value = h.title || "";
    if ($("hlNote")) $("hlNote").value = h.note || "";
    if ($("hlRating")) $("hlRating").value = h.rating != null ? String(h.rating) : "";
    if ($("hlTimeLabel")) $("hlTimeLabel").textContent = fmtTime(h.t);
  }
  function syncFormMode() {
    const mode = $("hlFormMode");
    const cancel = $("hlCancelEdit");
    if (editingId) {
      if (mode) mode.textContent = "Edit highlight";
      if (cancel) cancel.hidden = false;
    } else {
      if (mode) mode.textContent = "Highlight baru";
      if (cancel) cancel.hidden = true;
    }
  }
  function clearForm() {
    editingId = null;
    fillForm({ type: "CHANCE", team: "TFS", playerNo: "", title: "", note: "", rating: null, t: 0 });
    updateTimeLabel();
    syncFormMode();
  }
  function saveHighlight() {
    const data = readForm(editingId ? (highlights.find((x) => x.id === editingId) || {}).t : undefined);
    if (editingId) {
      const idx = highlights.findIndex((h) => h.id === editingId);
      if (idx < 0) return;
      const prev = highlights[idx];
      highlights[idx] = {
        ...prev,
        ...data,
        t: prev.t,
        thumb: prev.thumb || captureThumbAt(prev.t),
        seed: false
      };
      setStatus("Highlight diupdate.", true);
      // async refresh thumb if missing
      if (!highlights[idx].thumb && videoReady) {
        captureThumbAtAsync(prev.t).then((thumb) => {
          if (!thumb) return;
          const i = highlights.findIndex((h) => h.id === prev.id);
          if (i >= 0) {
            highlights[i].thumb = thumb;
            persist();
            renderList();
          }
        });
      }
    } else {
      seq += 1;
      const id = "hl" + seq;
      const thumb = captureThumbAt(data.t);
      highlights.push({ id, ...data, thumb, seed: false });
      highlights.sort((a, b) => a.t - b.t);
      setStatus("Highlight ditambah @" + fmtTime(data.t), true);
      if (!thumb && videoReady) {
        captureThumbAtAsync(data.t).then((th) => {
          if (!th) return;
          const i = highlights.findIndex((h) => h.id === id);
          if (i >= 0) {
            highlights[i].thumb = th;
            persist();
            renderList();
          }
        });
      }
    }
    persist();
    clearForm();
    renderList();
    window.TFDEV && window.TFDEV.toast && window.TFDEV.toast("Highlight disimpan");
  }
  function markNow() {
    const v = $("hlVideo");
    if (!videoReady || !v) {
      setStatus("Upload video dulu untuk tandai waktu akurat — atau isi form manual.", false);
      return;
    }
    updateTimeLabel();
    if ($("hlTitle") && !$("hlTitle").value) $("hlTitle").value = "Highlight @" + fmtTime(v.currentTime);
  }
  function jumpTo(t) {
    const v = $("hlVideo");
    if (!v || !videoReady) {
      window.TFDEV && window.TFDEV.toast && window.TFDEV.toast("Upload video untuk jump");
      setStatus("Upload video dulu untuk jump ke timestamp.", false);
      return;
    }
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : null;
    const target = Math.max(0, Math.min(Number(t) || 0, dur != null ? Math.max(0, dur - 0.05) : Number(t) || 0));
    setStatus("Jump ke " + fmtTime(target) + "…", true);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      v.removeEventListener("seeked", onSeeked);
      updateTimeLabel();
      setStatus("Diputar dari " + fmtTime(target), true);
      try {
        const p = v.play && v.play();
        if (p && p.catch) p.catch(() => {});
      } catch (_) {}
    };
    const onSeeked = () => finish();
    v.addEventListener("seeked", onSeeked);
    try {
      v.pause();
      if (Math.abs((v.currentTime || 0) - target) < 0.05 && v.readyState >= 2) {
        finish();
      } else {
        v.currentTime = target;
      }
    } catch (e) {
      v.removeEventListener("seeked", onSeeked);
      setStatus("Gagal jump: " + e.message, false);
      return;
    }
    setTimeout(() => {
      if (!settled && Math.abs((v.currentTime || 0) - target) < 0.5) finish();
    }, 900);
  }
  function editHighlight(id) {
    const h = highlights.find((x) => x.id === id);
    if (!h) return;
    editingId = id;
    fillForm(h);
    syncFormMode();
    jumpTo(h.t);
  }
  function deleteHighlight(id) {
    highlights = highlights.filter((h) => h.id !== id);
    if (editingId === id) clearForm();
    persist();
    renderList();
    setStatus("Highlight dihapus.", true);
  }
  function renderList() {
    const list = $("hlList");
    const count = $("hlCount");
    if (count) count.textContent = highlights.length + " highlight";
    const tip = $("hlSeedTip");
    if (tip) {
      const hasSeed = highlights.some((h) => h && h.seed);
      tip.hidden = !hasSeed;
    }
    if (!list) return;
    const sorted = highlights.slice().sort((a, b) => a.t - b.t);
    if (!sorted.length) {
      list.innerHTML = '<div class="hl-empty">Belum ada highlight. Upload video TFS vs G8 atau ketuk Reset demo seed.</div>';
      return;
    }
    list.innerHTML = sorted
      .map((h) => {
        const thumb = h.thumb
          ? '<img class="hl-thumb" src="' + h.thumb + '" alt="" />'
          : '<div class="hl-thumb hl-thumb-empty"></div>';
        return (
          '<article class="hl-item" data-id="' + escapeHtml(h.id) + '">' +
          thumb +
          '<div class="hl-body">' +
          '<div class="hl-meta">' +
          '<button type="button" class="hl-time" data-jump="' + h.t + '">' + fmtTime(h.t) + "</button>" +
          '<span class="pill">' + escapeHtml(h.type) + "</span>" +
          '<span class="pill">' + escapeHtml(h.team) + "</span>" +
          (h.playerNo ? '<span class="pill">#' + escapeHtml(h.playerNo) + "</span>" : "") +
          (h.rating != null ? '<span class="pill">' + h.rating + "/5</span>" : "") +
          "</div>" +
          "<strong>" + escapeHtml(h.title || "(tanpa judul)") + "</strong>" +
          (h.note ? '<p class="hl-note">' + escapeHtml(h.note) + "</p>" : "") +
          '<div class="btn-row">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-edit="' + escapeHtml(h.id) + '">Edit</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-del="' + escapeHtml(h.id) + '">Hapus</button>' +
          "</div></div></article>"
        );
      })
      .join("");
  }
  function exportJson() {
    const payload = {
      version: 1,
      video: videoName || null,
      exportedAt: new Date().toISOString(),
      highlights: highlights
        .slice()
        .sort((a, b) => a.t - b.t)
        .map((h) => ({
          t: h.t,
          time: fmtTime(h.t),
          type: h.type,
          team: h.team,
          playerNo: h.playerNo || null,
          title: h.title,
          note: h.note,
          rating: h.rating,
          thumb: h.thumb || null
        }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const safe = (videoName || "tfs-vs-g8-babak1").replace(/[^\w.\-]+/g, "_");
    a.href = URL.createObjectURL(blob);
    a.download = "tfdev-highlights-" + safe + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    setStatus("JSON diexport (" + payload.highlights.length + ").", true);
    window.TFDEV && window.TFDEV.toast && window.TFDEV.toast("Export JSON");
  }
  function copyTextList() {
    const lines = highlights
      .slice()
      .sort((a, b) => a.t - b.t)
      .map((h) => {
        const parts = [fmtTime(h.t), h.type, h.team];
        if (h.playerNo) parts.push("#" + h.playerNo);
        if (h.title) parts.push(h.title);
        if (h.note) parts.push("— " + h.note);
        if (h.rating) parts.push("(" + h.rating + "/5)");
        return parts.join(" · ");
      });
    const text = lines.length
      ? "TFDEV Highlights" + (videoName ? " · " + videoName : " · TFS vs G8 Babak 1") + "\n" + lines.join("\n")
      : "(kosong)";
    const done = () => {
      setStatus("Salin CapCut OK (" + lines.length + " baris) — paste ke CapCut/editor.", true);
      window.TFDEV && window.TFDEV.toast && window.TFDEV.toast("CapCut list disalin");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); }
    catch (_) { setStatus("Gagal salin.", false); }
    document.body.removeChild(ta);
  }
  function resetSeed() {
    highlights = SEED.map((h) => ({ ...h }));
    seq = SEED.length;
    persist();
    clearForm();
    renderList();
    setStatus("Seed TFS vs G8 Babak 1 dimuat (" + SEED.length + ").", true);
    if (videoReady) maybeAutoGenThumbs();
  }

  /**
   * Import {highlights:[...]} or bare array.
   * opts.replace: replace list; opts.merge (default): merge by t+type+title; opts.confirm: ask user.
   */
  function importPayload(payload, opts) {
    opts = opts || {};
    let arr = null;
    if (Array.isArray(payload)) arr = payload;
    else if (payload && Array.isArray(payload.highlights)) arr = payload.highlights;
    else if (payload && Array.isArray(payload.keyMoments)) arr = payload.keyMoments;
    else throw new Error("JSON harus berisi array highlights (atau bare array).");

    const normalized = [];
    arr.forEach((raw) => {
      const n = normalizeHighlightItem(raw);
      if (n) normalized.push(n);
    });
    if (!normalized.length) throw new Error("Tidak ada highlight valid di JSON.");

    let mode = opts.replace ? "replace" : opts.merge === false ? "replace" : "merge";
    if (opts.confirm !== false && typeof window.confirm === "function" && highlights.length) {
      const replace = window.confirm(
        "Import " +
          normalized.length +
          " highlight.\n\nOK = ganti semua (replace)\nCancel = gabung dengan yang ada (merge)"
      );
      mode = replace ? "replace" : "merge";
    }

    if (mode === "replace") {
      // Preserve thumbs from previous items when same t+type+title match
      const thumbMap = {};
      highlights.forEach((h) => {
        const k = h.t + "|" + h.type + "|" + (h.title || "");
        if (h.thumb) thumbMap[k] = h.thumb;
      });
      highlights = normalized.map((n) => {
        seq += 1;
        const k = n.t + "|" + n.type + "|" + (n.title || "");
        return {
          id: n.id || "hl" + seq,
          t: n.t,
          type: n.type,
          team: n.team,
          playerNo: n.playerNo,
          title: n.title,
          note: n.note,
          rating: n.rating,
          thumb: n.thumb || thumbMap[k] || null,
          seed: !!n.seed
        };
      });
      seq = Math.max(
        seq,
        highlights.reduce((m, h) => {
          const num = parseInt(String(h.id).replace(/\D/g, ""), 10);
          return isFinite(num) && num > m ? num : m;
        }, 0)
      );
    } else {
      normalized.forEach((n) => {
        const existing = highlights.find(
          (h) => h.t === n.t && h.type === n.type && (h.title || "") === (n.title || "")
        );
        if (existing) {
          existing.team = n.team || existing.team;
          existing.playerNo = n.playerNo || existing.playerNo;
          existing.note = n.note || existing.note;
          existing.rating = n.rating != null ? n.rating : existing.rating;
          if (n.thumb) existing.thumb = n.thumb;
          // keep existing thumb if import has none
        } else {
          seq += 1;
          highlights.push({
            id: n.id || "hl" + seq,
            t: n.t,
            type: n.type,
            team: n.team,
            playerNo: n.playerNo,
            title: n.title,
            note: n.note,
            rating: n.rating,
            thumb: n.thumb || null,
            seed: false
          });
        }
      });
      highlights.sort((a, b) => a.t - b.t);
    }

    if (payload && payload.video && !videoName) {
      videoName = String(payload.video);
    }

    persist();
    renderList();
    setStatus(
      "Import " + mode + ": " + normalized.length + " item · total " + highlights.length + ".",
      true
    );
    return { mode, count: normalized.length, total: highlights.length };
  }

  async function generateMissingThumbs(opts) {
    opts = opts || {};
    if (genThumbsRunning) {
      if (!opts.quiet) setStatus("Generate thumbs sedang berjalan…", true);
      return { done: 0, skipped: true };
    }
    if (!videoReady) {
      if (!opts.quiet) {
        setStatus("Upload video dulu untuk generate thumbnail.", false);
        window.TFDEV && window.TFDEV.toast && window.TFDEV.toast("Video belum siap");
      }
      return { done: 0, error: "no-video" };
    }
    const missing = highlights.filter((h) => !h.thumb);
    if (!missing.length) {
      if (!opts.quiet) setStatus("Semua highlight sudah punya thumbnail.", true);
      return { done: 0 };
    }
    genThumbsRunning = true;
    const v = $("hlVideo");
    const wasPaused = !v || v.paused;
    let done = 0;
    try {
      if (v) v.pause();
      for (let i = 0; i < missing.length; i++) {
        const h = missing[i];
        if (!opts.quiet) {
          setStatus(
            "Generate thumbs " + (i + 1) + "/" + missing.length + " @" + fmtTime(h.t) + "…",
            true
          );
        }
        const thumb = await captureThumbAtAsync(h.t);
        if (thumb) {
          const idx = highlights.findIndex((x) => x.id === h.id);
          if (idx >= 0) {
            highlights[idx].thumb = thumb;
            done += 1;
            persist();
            renderList();
          }
        }
        await new Promise((r) => setTimeout(r, 60));
      }
      if (!opts.quiet) {
        setStatus("Thumbnail dibuat: " + done + "/" + missing.length + ".", true);
        window.TFDEV && window.TFDEV.toast && window.TFDEV.toast(done + " thumbs");
      } else if (done) {
        setStatus("Auto-thumb: " + done + " dibuat dari video.", true);
      }
      return { done, total: missing.length };
    } finally {
      genThumbsRunning = false;
      if (v && !wasPaused) {
        try { v.play().catch(() => {}); } catch (_) {}
      }
    }
  }

  function onImportFileChange(e) {
    const input = e.target;
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || ""));
        importPayload(data, { confirm: true });
        window.TFDEV && window.TFDEV.toast && window.TFDEV.toast("JSON diimpor");
      } catch (err) {
        setStatus("Gagal import JSON: " + err.message, false);
        window.TFDEV && window.TFDEV.toast && window.TFDEV.toast("Import gagal");
      }
      input.value = "";
    };
    reader.onerror = () => {
      setStatus("Gagal baca file.", false);
      input.value = "";
    };
    reader.readAsText(file);
  }

  function wireDropZone() {
    const zone = $("hlDropZone");
    const input = $("hlVideoFile");
    const pick = $("hlPickVideo");
    if (pick && input) pick.addEventListener("click", () => input.click());
    if (input) input.addEventListener("change", () => {
      const f = input.files && input.files[0];
      if (f) acceptVideoFile(f);
      input.value = "";
    });
    if (!zone) return;
    zone.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      input && input.click();
    });
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drag");
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) acceptVideoFile(f);
    });
  }
  function wireList() {
    const list = $("hlList");
    if (!list) return;
    list.addEventListener("click", (e) => {
      const jump = e.target.closest("[data-jump]");
      if (jump) { jumpTo(Number(jump.getAttribute("data-jump"))); return; }
      const ed = e.target.closest("[data-edit]");
      if (ed) { editHighlight(ed.getAttribute("data-edit")); return; }
      const del = e.target.closest("[data-del]");
      if (del) { deleteHighlight(del.getAttribute("data-del")); return; }
    });
  }
  function addFromAnalitik(item) {
    const n = normalizeHighlightItem(item || {});
    seq += 1;
    const row = {
      id: "hl" + seq,
      t: n ? n.t : Math.max(0, Math.round(Number(item && item.t) || 0)),
      type: (n && n.type) || "LAINNYA",
      team: (n && n.team) || "TFS",
      playerNo: (n && n.playerNo) || "",
      title: (n && n.title) || ("Frame Analitik @" + fmtTime(item && item.t)),
      note: (n && n.note) || "",
      rating: n ? n.rating : null,
      thumb: (item && item.thumb) || (n && n.thumb) || null,
      seed: false
    };
    highlights.push(row);
    highlights.sort((a, b) => a.t - b.t);
    if (item && item.videoName) videoName = item.videoName;
    persist();
    renderList();
    return row;
  }

  window.Highlights = {
    addFromAnalitik,
    importPayload,
    generateMissingThumbs,
    fmtTime,
    get: () => highlights.slice().sort((a, b) => a.t - b.t),
    list: () => highlights.slice().sort((a, b) => a.t - b.t),
    resetSeed,
    jumpTo,
    captureThumbAtAsync
  };

  window.TFDEV = window.TFDEV || {};
  window.TFDEV.initHighlights = function () {
    if (!$("page-highlights")) return;
    wireDropZone();
    wireList();
    const v = $("hlVideo");
    if (v) {
      v.addEventListener("timeupdate", updateTimeLabel);
      v.addEventListener("loadedmetadata", onVideoMeta);
    }
    if ($("hlClearVideo")) $("hlClearVideo").addEventListener("click", clearVideo);
    if ($("hlMarkNow")) $("hlMarkNow").addEventListener("click", markNow);
    if ($("hlSaveBtn")) $("hlSaveBtn").addEventListener("click", saveHighlight);
    if ($("hlCancelEdit")) $("hlCancelEdit").addEventListener("click", clearForm);
    if ($("hlExportJson")) $("hlExportJson").addEventListener("click", exportJson);
    if ($("hlCopyText")) $("hlCopyText").addEventListener("click", copyTextList);
    if ($("hlResetSeed")) $("hlResetSeed").addEventListener("click", resetSeed);
    if ($("hlImportJson") && $("hlImportFile")) {
      $("hlImportJson").addEventListener("click", () => $("hlImportFile").click());
      $("hlImportFile").addEventListener("change", onImportFileChange);
    }
    if ($("hlGenThumbs")) {
      $("hlGenThumbs").addEventListener("click", () => {
        generateMissingThumbs({ quiet: false }).catch((e) => {
          setStatus("Gagal generate thumbs: " + e.message, false);
        });
      });
    }
    if ($("hlApplyMatchCentre")) {
      $("hlApplyMatchCentre").addEventListener("click", () => {
        try {
          if (!window.TFDEV || !window.TFDEV.coachAnalytics) {
            setStatus("coachAnalytics belum siap.", false);
            return;
          }
          const summary = window.TFDEV.coachAnalytics.applyToMatchCentre({
            highlights: highlights.slice(),
            navigate: true
          });
          setStatus(
            "Match Centre diisi dari " + (summary && summary.clipCount != null ? summary.clipCount : highlights.length) + " clips.",
            true
          );
        } catch (e) {
          setStatus("Gagal isi Match Centre: " + e.message, false);
        }
      });
    }
    if ($("hlApplyParentReport")) {
      $("hlApplyParentReport").addEventListener("click", () => {
        try {
          if (!window.TFDEV || !window.TFDEV.coachAnalytics) {
            setStatus("coachAnalytics belum siap.", false);
            return;
          }
          if (typeof window.TFDEV.coachAnalytics.applyToParentReport !== "function") {
            setStatus("applyToParentReport belum siap.", false);
            return;
          }
          const report = window.TFDEV.coachAnalytics.applyToParentReport({
            highlights: highlights.slice(),
            navigate: true
          });
          setStatus(
            "Laporan ortu diisi dari clips" +
              (report && report.player && report.player.name ? " · " + report.player.name : "") +
              " (tanpa Vision key).",
            true
          );
        } catch (e) {
          setStatus("Gagal isi laporan ortu: " + e.message, false);
        }
      });
    }
    // Auto-show match seed on first open (demo key)
    loadForCurrentVideo();
    updateBadge();
    notifyCoachAnalytics();
  };
})();
