/**
 * Drive → Gemini full-video analyze (TRUE path, no manual download/upload).
 * OAuth (GIS) for Drive readonly + Gemini Files API for video understanding.
 */
(function () {
  const OAUTH_CFG_URL = "data/google-oauth.json";
  const CLIENT_ID_LS = "tfdev-google-oauth-client-id";
  const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
  const GSI_SRC = "https://accounts.google.com/gsi/client";
  const GEMINI_UPLOAD = "https://generativelanguage.googleapis.com/upload/v1beta/files";
  const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
  const MODEL_FALLBACKS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest"];
  const UPLOAD_CHUNK = 8 * 1024 * 1024; // 8 MiB

  let oauthCfg = null;
  let gsiLoading = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let busy = false;

  function $(id) {
    return document.getElementById(id);
  }

  function toast(msg) {
    if (window.TFDEV && window.TFDEV.toast) window.TFDEV.toast(msg);
  }

  function analitik() {
    return (window.TFDEV && window.TFDEV.analitik) || window.Analitik || null;
  }

  function setDriveStatus(msg, ok) {
    const el = $("anDriveGeminiStatus");
    if (el) {
      el.textContent = msg || "";
      el.className =
        "an-drive-gemini-status" + (msg ? (ok === false ? " err" : ok ? " ok" : "") : "");
    }
    const a = analitik();
    if (a && typeof a.setStatus === "function" && msg) {
      a.setStatus(msg, ok !== false);
    }
  }

  function pct(n) {
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(100, Math.round(n * 100));
  }

  function formatBytes(n) {
    const x = Number(n) || 0;
    if (x >= 1e9) return (x / 1e9).toFixed(2) + " GB";
    if (x >= 1e6) return (x / 1e6).toFixed(1) + " MB";
    if (x >= 1e3) return (x / 1e3).toFixed(0) + " KB";
    return x + " B";
  }

  function getClientId() {
    const fromField = ($("anGoogleOauthClientId") && $("anGoogleOauthClientId").value.trim()) || "";
    if (fromField) return fromField;
    try {
      const ls = localStorage.getItem(CLIENT_ID_LS);
      if (ls && ls.trim()) return ls.trim();
    } catch (_) {}
    if (oauthCfg && oauthCfg.clientId && String(oauthCfg.clientId).trim()) {
      return String(oauthCfg.clientId).trim();
    }
    return "";
  }

  function saveClientIdFromField() {
    const v = ($("anGoogleOauthClientId") && $("anGoogleOauthClientId").value.trim()) || "";
    if (!v) return;
    try {
      localStorage.setItem(CLIENT_ID_LS, v);
    } catch (_) {}
  }

  function oauthSetupHelp() {
    return (
      "OAuth Client ID belum diisi. Buat OAuth 2.0 Client ID (tipe Web application) di Google Cloud " +
      "(project yang sama dengan Gemini API), lalu isi Authorized JavaScript origins:\n" +
      "• https://rezhaeko-beep.github.io\n" +
      "• http://127.0.0.1:8766\n" +
      "• http://localhost:8766\n" +
      "Paste Client ID ke field «Google OAuth Client ID» (disimpan di browser). " +
      "API key Gemini di panel Proses dipakai hanya untuk Files/generateContent — Drive butuh OAuth."
    );
  }

  async function loadOauthConfig() {
    if (oauthCfg) return oauthCfg;
    try {
      const res = await fetch(OAUTH_CFG_URL, { cache: "no-store" });
      if (res.ok) oauthCfg = await res.json();
      else oauthCfg = { clientId: "", scopes: [DRIVE_SCOPE] };
    } catch (_) {
      oauthCfg = { clientId: "", scopes: [DRIVE_SCOPE] };
    }
    return oauthCfg;
  }

  function loadGsiScript() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      return Promise.resolve();
    }
    if (gsiLoading) return gsiLoading;
    gsiLoading = new Promise(function (resolve, reject) {
      const existing = document.querySelector('script[data-tfdev-gsi="1"]');
      if (existing) {
        existing.addEventListener("load", function () {
          resolve();
        });
        existing.addEventListener("error", function () {
          reject(new Error("Gagal memuat Google Identity Services"));
        });
        return;
      }
      const s = document.createElement("script");
      s.src = GSI_SRC;
      s.async = true;
      s.dataset.tfdevGsi = "1";
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        gsiLoading = null;
        reject(new Error("Gagal memuat Google Identity Services (gsi/client)"));
      };
      document.head.appendChild(s);
    });
    return gsiLoading;
  }

  function requestDriveToken(clientId, forceConsent) {
    return new Promise(function (resolve, reject) {
      try {
        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: DRIVE_SCOPE,
          callback: function (resp) {
            if (!resp) {
              reject(new Error("OAuth: respons kosong"));
              return;
            }
            if (resp.error) {
              reject(
                new Error(
                  "OAuth gagal: " +
                    (resp.error_description || resp.error) +
                    (resp.error === "popup_closed_by_user"
                      ? " — jendela login ditutup."
                      : "")
                )
              );
              return;
            }
            if (!resp.access_token) {
              reject(new Error("OAuth: access_token kosong"));
              return;
            }
            accessToken = resp.access_token;
            const expiresIn = Number(resp.expires_in) || 3600;
            tokenExpiresAt = Date.now() + expiresIn * 1000 - 30000;
            resolve(accessToken);
          },
          error_callback: function (err) {
            reject(
              new Error(
                "OAuth error: " +
                  ((err && (err.message || err.type)) || "tidak diketahui")
              )
            );
          }
        });
        const opts = {};
        if (forceConsent || !accessToken) opts.prompt = "consent";
        tokenClient.requestAccessToken(opts);
      } catch (e) {
        reject(e);
      }
    });
  }

  async function ensureDriveToken(clientId) {
    if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
    setDriveStatus("Auth Google Drive…", true);
    await loadGsiScript();
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      throw new Error("Google Identity Services belum siap. Refresh halaman lalu coba lagi.");
    }
    return requestDriveToken(clientId, !accessToken);
  }

  async function fetchDriveMeta(fileId, token) {
    const url =
      "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(fileId) +
      "?fields=id,name,mimeType,size";
    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) {
      const t = await res.text().catch(function () {
        return "";
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          "Drive menolak akses (" +
            res.status +
            "). Pastikan akun Google punya akses baca ke file & OAuth scope drive.readonly."
        );
      }
      throw new Error("Drive meta " + res.status + ": " + (t.slice(0, 160) || res.statusText));
    }
    return res.json();
  }

  async function downloadDriveFile(fileId, token, onProgress) {
    const url =
      "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(fileId) +
      "?alt=media";
    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) {
      const t = await res.text().catch(function () {
        return "";
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          "Unduh Drive ditolak (" +
            res.status +
            "). Login ulang OAuth atau cek permission file."
        );
      }
      throw new Error("Unduh Drive " + res.status + ": " + (t.slice(0, 160) || res.statusText));
    }
    const total = Number(res.headers.get("Content-Length")) || 0;
    if (!res.body || !res.body.getReader) {
      const blob = await res.blob();
      if (onProgress) onProgress(1, blob.size, blob.size);
      return blob;
    }
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      chunks.push(step.value);
      received += step.value.length;
      if (onProgress) onProgress(total ? received / total : 0, received, total);
    }
    return new Blob(chunks, {
      type: res.headers.get("Content-Type") || "application/octet-stream"
    });
  }

  async function resumableUploadGemini(blob, displayName, mimeType, apiKey, onProgress) {
    const startRes = await fetch(GEMINI_UPLOAD + "?key=" + encodeURIComponent(apiKey), {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(blob.size),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        file: { displayName: displayName || "tfdev-drive-video" }
      })
    });
    if (!startRes.ok) {
      const t = await startRes.text().catch(function () {
        return "";
      });
      throw new Error(
        "Gemini upload start " + startRes.status + ": " + (t.slice(0, 180) || startRes.statusText)
      );
    }
    const uploadUrl =
      startRes.headers.get("X-Goog-Upload-URL") || startRes.headers.get("x-goog-upload-url");
    if (!uploadUrl) throw new Error("Gemini tidak mengembalikan X-Goog-Upload-URL");

    let offset = 0;
    const size = blob.size;
    let finalJson = null;
    while (offset < size) {
      const end = Math.min(offset + UPLOAD_CHUNK, size);
      const chunk = blob.slice(offset, end);
      const isLast = end >= size;
      const cmd = isLast ? "upload, finalize" : "upload";
      const up = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Length": String(chunk.size),
          "X-Goog-Upload-Offset": String(offset),
          "X-Goog-Upload-Command": cmd
        },
        body: chunk
      });
      if (!up.ok) {
        const t = await up.text().catch(function () {
          return "";
        });
        throw new Error(
          "Gemini upload chunk " + up.status + " @ " + offset + ": " + (t.slice(0, 160) || up.statusText)
        );
      }
      offset = end;
      if (onProgress) onProgress(size ? offset / size : 1, offset, size);
      if (isLast) {
        finalJson = await up.json().catch(function () {
          return null;
        });
      }
    }
    const fileObj = (finalJson && finalJson.file) || finalJson;
    if (!fileObj || !fileObj.name) {
      throw new Error("Gemini upload selesai tapi metadata file kosong");
    }
    return fileObj;
  }

  async function pollFileActive(fileName, apiKey, onTick) {
    const name = String(fileName || "").replace(/^files\//, "");
    const url = GEMINI_API + "/files/" + encodeURIComponent(name) + "?key=" + encodeURIComponent(apiKey);
    const maxAttempts = 90;
    for (let i = 0; i < maxAttempts; i++) {
      const res = await fetch(url);
      if (!res.ok) {
        const t = await res.text().catch(function () {
          return "";
        });
        throw new Error("Poll file " + res.status + ": " + (t.slice(0, 140) || res.statusText));
      }
      const body = await res.json();
      const state = body.state || (body.file && body.file.state);
      const uri = body.uri || (body.file && body.file.uri);
      const mime = body.mimeType || (body.file && body.file.mimeType);
      if (onTick) onTick(state, i + 1);
      if (state === "ACTIVE") {
        return {
          name: body.name || "files/" + name,
          uri: uri,
          mimeType: mime,
          state: state
        };
      }
      if (state === "FAILED") {
        throw new Error("Gemini memproses video gagal (state=FAILED)");
      }
      await new Promise(function (r) {
        setTimeout(r, 2000);
      });
    }
    throw new Error("Timeout menunggu Gemini file ACTIVE");
  }

  function parseAiJsonLocal(raw) {
    const a = analitik();
    if (a && typeof a.parseAiJson === "function") return a.parseAiJson(raw);
    let text = String(raw || "").trim();
    if (!text) throw new Error("Respons AI kosong");
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
    return JSON.parse(text);
  }

  function buildFullVideoUserPrompt(meta) {
    meta = meta || {};
    return (
      "Analisis VIDEO UTUH youth academy berikut untuk TFDEV Analitik · observasi perilaku sangat detail.\n" +
      "PRIMARY EVIDENCE = seluruh video yang dilampirkan (file_data). Jangan mengarang. N/C jika unreadable.\n" +
      "Lebih baik detail lambat daripada jawaban generik. Klaim hanya dari video.\n\n" +
      "Tim kita: TFS (jersey orange).\n" +
      "Lawan: " +
      (meta.lawan || "Lawan") +
      (meta.kitLawan ? " (kit " + meta.kitLawan + ")" : "") +
      ".\n" +
      "Babak/clip: " +
      (meta.babak || "Babak 1") +
      (meta.durasi ? " · durasi ~" + meta.durasi + "s" : "") +
      ".\n" +
      "Source: " +
      (meta.sourceFile || "(Google Drive)") +
      ".\n" +
      "Pemain Parent Report: " +
      (meta.player && meta.player.name
        ? meta.player.name + (meta.player.no ? " #" + meta.player.no : "")
        : "skip parent report") +
      ".\n\n" +
      "AMATI SELURUH VIDEO: nomor punggung jika terbaca, orientasi tubuh, scanning/shoulder check, first touch, spacing, " +
      "courage 1v1, reset setelah lose, help peers, GK involvement, momen coaching-relevant.\n" +
      "Per key moment: timestamp detik dari video, siapa/apa/mengapa, valence (positive|coach|caution).\n" +
      "STAR = human behavior. Match Centre stats hanya jika bukti di video; else N/C + reason. No fake GPS.\n" +
      "Kembalikan ringkasan singkat (utamakan perilaku detail) lalu JSON { matchCentre, behaviorInsights, parentReports?, highlights? }.\n" +
      "behaviorInsights wajib kaya: { teamMood, keyBehaviors[{t,playerNo,tag,note,valence}] min 5–8 bila bukti, " +
      "parentStory (paragraf hangat Indonesia spesifik untuk ortu), coachCues (drill actionable Indonesia) }.\n" +
      "Opsional preferred highlights (judul/note perilaku): [{ t, type, team, playerNo, title, note, rating }] " +
      "type∈GOL|CHANCE|SKILL|SAVE|COACHING|LAINNYA; t=detik."
    );
  }

  function extractGenerateText(body) {
    const cands = body && body.candidates;
    if (!cands || !cands.length) return "";
    const parts = (cands[0].content && cands[0].content.parts) || [];
    return parts
      .map(function (p) {
        return (p && p.text) || "";
      })
      .join("\n");
  }

  async function generateFromFile(fileUri, mimeType, apiKey, preferredModel) {
    const a = analitik();
    const system =
      (a && typeof a.getSystemPrompt === "function" && a.getSystemPrompt()) ||
      "Kamu analis youth football TFS/TFDEV. Output JSON { matchCentre, behaviorInsights, parentReports?, highlights? }. Bahasa Indonesia.";
    const meta = (a && typeof a.readMeta === "function" && a.readMeta()) || {};
    const userText = buildFullVideoUserPrompt(meta);
    let models = MODEL_FALLBACKS.slice();
    if (a && typeof a.buildModelFallbackChain === "function") {
      models = a.buildModelFallbackChain(preferredModel || models[0]);
    } else if (preferredModel) {
      models = [preferredModel].concat(MODEL_FALLBACKS.filter(function (m) {
        return m !== preferredModel;
      })).slice(0, 3);
    }

    let lastErr = null;
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      setDriveStatus(
        "Processing video · " + model + (i ? " · fallback " + (i + 1) : "") + "…",
        true
      );
      const url =
        GEMINI_API +
        "/models/" +
        encodeURIComponent(model) +
        ":generateContent?key=" +
        encodeURIComponent(apiKey);
      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [
              {
                role: "user",
                parts: [
                  { fileData: { mimeType: mimeType, fileUri: fileUri } },
                  { text: userText }
                ]
              }
            ],
            generationConfig: { temperature: 0.2 }
          })
        });
      } catch (netErr) {
        lastErr = new Error(
          "Jaringan ke Gemini gagal: " + ((netErr && netErr.message) || "Failed to fetch")
        );
        continue;
      }
      if (!res.ok) {
        const t = await res.text().catch(function () {
          return "";
        });
        lastErr = new Error("generateContent " + res.status + " (" + model + "): " + (t.slice(0, 180) || res.statusText));
        if ((res.status === 404 || res.status === 429 || res.status === 503) && i < models.length - 1) {
          continue;
        }
        if (i < models.length - 1 && (res.status === 400 || res.status === 500)) continue;
        throw lastErr;
      }
      const body = await res.json();
      const content = extractGenerateText(body);
      if (!String(content || "").trim()) {
        lastErr = new Error("Respons kosong dari " + model);
        if (i < models.length - 1) continue;
        throw lastErr;
      }
      try {
        if ($("anApiModel")) $("anApiModel").value = model;
        localStorage.setItem("tfdev-analitik-api-model", model);
      } catch (_) {}
      return { content: content, model: model };
    }
    throw lastErr || new Error("generateContent gagal pada semua model");
  }

  function guessMime(name, driveMime, blobType) {
    if (driveMime && /^video\//i.test(driveMime)) return driveMime;
    if (blobType && /^video\//i.test(blobType)) return blobType;
    const n = name || "";
    if (/\.mov$/i.test(n)) return "video/quicktime";
    if (/\.webm$/i.test(n)) return "video/webm";
    if (/\.m4v$/i.test(n)) return "video/x-m4v";
    if (/\.mkv$/i.test(n)) return "video/x-matroska";
    return "video/mp4";
  }

  function getSelectedDriveVideo() {
    const dp = window.TFDEV && window.TFDEV.drivePramu;
    if (dp && typeof dp.getSelectedMeta === "function") {
      const m = dp.getSelectedMeta();
      if (m && m.id) return m;
    }
    if (dp && typeof dp.getSelected === "function") {
      const v = dp.getSelected();
      if (v && v.id) return v;
    }
    const sel = $("anDrivePramuSelect");
    if (sel && sel.value) return { id: sel.value, title: sel.options[sel.selectedIndex].text };
    return null;
  }

  function getGeminiApiKey() {
    const a = analitik();
    if (a && typeof a.getApiKey === "function") {
      const k = a.getApiKey();
      if (k) return k;
    }
    return (($("anApiKey") && $("anApiKey").value.trim()) || localStorage.getItem("tfdev-analitik-api-key") || "");
  }

  async function runAnalyze(opts) {
    opts = opts || {};
    const fast = !!opts.fast;
    if (busy) {
      toast("Analisa Drive masih berjalan…");
      return;
    }
    busy = true;
    const btnTotal = $("anDriveGeminiTotal");
    const btnFast = $("anDriveGeminiFast");
    if (btnTotal) btnTotal.disabled = true;
    if (btnFast) btnFast.disabled = true;

    try {
      await loadOauthConfig();
      saveClientIdFromField();

      const video = getSelectedDriveVideo();
      if (!video || !video.id) {
        throw new Error("Pilih video Drive Pramu dulu (katalog Bali 7 atau paste id).");
      }

      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        throw new Error(
          "API key Gemini kosong. Paste key di panel Proses · API key Gemini (disimpan di browser), lalu coba lagi."
        );
      }
      try {
        localStorage.setItem("tfdev-analitik-api-key", apiKey);
        if ($("anApiKey") && !$("anApiKey").value.trim()) $("anApiKey").value = apiKey;
      } catch (_) {}

      const clientId = getClientId();
      if (!clientId) {
        setDriveStatus(oauthSetupHelp(), false);
        throw new Error("OAuth Client ID belum diisi — lihat petunjuk di status.");
      }

      // Ensure catalog meta applied
      try {
        const dp = window.TFDEV && window.TFDEV.drivePramu;
        if (dp && typeof dp.selectVideo === "function" && !video.custom) {
          dp.selectVideo(video.id, { openDrive: false });
        }
      } catch (_) {}

      const token = await ensureDriveToken(clientId);

      setDriveStatus("Mengambil meta Drive…", true);
      let meta = { name: video.title || video.id, mimeType: "", size: "" };
      try {
        meta = await fetchDriveMeta(video.id, token);
      } catch (e) {
        // Retry once with fresh consent if 401
        if (/401|403|menolak/.test(String(e.message || e))) {
          accessToken = null;
          const token2 = await requestDriveToken(clientId, true);
          meta = await fetchDriveMeta(video.id, token2);
        } else {
          throw e;
        }
      }

      const filename = meta.name || video.title || "drive-video.mp4";
      setDriveStatus("Download Drive 0% · " + filename, true);
      const blob = await downloadDriveFile(video.id, accessToken, function (p, received, total) {
        setDriveStatus(
          "Download Drive " +
            pct(p) +
            "%" +
            (total ? " · " + formatBytes(received) + " / " + formatBytes(total) : " · " + formatBytes(received)),
          true
        );
      });

      const mime = guessMime(filename, meta.mimeType, blob.type);
      const a = analitik();
      if (!a || typeof a.loadVideoBlob !== "function") {
        throw new Error("Hook analitik.loadVideoBlob belum siap — pastikan analitik.js ter-load.");
      }
      a.loadVideoBlob(blob, filename);
      if (typeof a.setWizardStep === "function") a.setWizardStep(2);

      if (fast) {
        setDriveStatus("Cepat · sample frame (Full auto)…", true);
        if (typeof a.runFullAuto !== "function") {
          throw new Error("runFullAuto belum tersedia");
        }
        await a.runFullAuto();
        setDriveStatus("Selesai · Cepat (sample frame) diterapkan.", true);
        toast("Drive + sample frame selesai");
        return;
      }

      // Full video path
      setDriveStatus("Upload Gemini 0% · " + formatBytes(blob.size), true);
      const uploaded = await resumableUploadGemini(blob, filename, mime, apiKey, function (p, sent, total) {
        setDriveStatus(
          "Upload Gemini " + pct(p) + "% · " + formatBytes(sent) + " / " + formatBytes(total),
          true
        );
      });

      setDriveStatus("Processing video · menunggu ACTIVE…", true);
      const active = await pollFileActive(uploaded.name, apiKey, function (state, n) {
        setDriveStatus("Processing video · " + (state || "…") + " (" + n + ")", true);
      });

      const preferred =
        (a.getPreferredModel && a.getPreferredModel()) ||
        (($("anApiModel") && $("anApiModel").value.trim()) || "gemini-3.6-flash");
      const gen = await generateFromFile(active.uri, active.mimeType || mime, apiKey, preferred);
      setDriveStatus("Applying · parse JSON · " + gen.model + "…", true);
      const data = parseAiJsonLocal(gen.content);
      if (typeof a.applyVisionResult === "function") {
        a.applyVisionResult(data, { navigate: true });
      } else {
        throw new Error("applyVisionResult belum tersedia");
      }
      setDriveStatus("Selesai · Analisa total Gemini dari Drive diterapkan.", true);
      toast("Analisa total · Drive + Gemini selesai");
    } catch (e) {
      const msg = (e && e.message) || String(e);
      setDriveStatus(msg, false);
      toast("Drive→Gemini gagal");
      console.error("[drive-gemini]", e);
    } finally {
      busy = false;
      if (btnTotal) btnTotal.disabled = false;
      if (btnFast) btnFast.disabled = false;
    }
  }

  function syncOauthFieldHelp() {
    const help = $("anGoogleOauthHelp");
    const clientId = getClientId();
    if (help) {
      help.hidden = !!clientId;
    }
    const field = $("anGoogleOauthClientId");
    if (field && !field.value) {
      try {
        const ls = localStorage.getItem(CLIENT_ID_LS);
        if (ls) field.value = ls;
        else if (oauthCfg && oauthCfg.clientId) field.value = oauthCfg.clientId;
      } catch (_) {}
    }
  }

  function wireUi() {
    if ($("anDriveGeminiTotal")) {
      $("anDriveGeminiTotal").addEventListener("click", function () {
        runAnalyze({ fast: false });
      });
    }
    if ($("anDriveGeminiFast")) {
      $("anDriveGeminiFast").addEventListener("click", function () {
        runAnalyze({ fast: true });
      });
    }
    if ($("anGoogleOauthClientId")) {
      const persist = function () {
        saveClientIdFromField();
        syncOauthFieldHelp();
      };
      $("anGoogleOauthClientId").addEventListener("change", persist);
      $("anGoogleOauthClientId").addEventListener("blur", persist);
    }
  }

  async function init() {
    if (!$("anDrivePramuCard") && !$("anDriveGeminiTotal")) return;
    wireUi();
    await loadOauthConfig();
    syncOauthFieldHelp();
  }

  window.TFDEV = window.TFDEV || {};
  window.TFDEV.driveGemini = {
    init: init,
    runAnalyze: runAnalyze,
    getClientId: getClientId,
    oauthSetupHelp: oauthSetupHelp
  };
  window.TFDEV.initDriveGemini = init;
})();
