(function () {
  const CATALOG_URL = "data/drive-pramu-videos.json";
  const LS_SELECTED = "tfdev-drive-pramu-selected";
  const DEFAULT_VIDEO_ID = "1QHxCz5PIsqRrMGHdIwMevAHY6fRrcUig"; // (T8) TFS VS G8 Babak 1

  let catalog = null;
  let selectedId = null;

  function $(id) {
    return document.getElementById(id);
  }

  function toast(msg) {
    if (window.TFDEV && window.TFDEV.toast) window.TFDEV.toast(msg);
  }

  function formatBabak(raw) {
    if (!raw) return "";
    const s = String(raw).trim();
    return s.replace(/^babak\b/i, "Babak").replace(/^bbk\b/i, "Babak");
  }

  function viewUrlFor(id) {
    return "https://drive.google.com/file/d/" + id + "/view";
  }

  function parseDriveFileId(input) {
    if (!input) return "";
    const s = String(input).trim();
    if (!s) return "";
    // Bare file id (Drive ids are typically 25–44 chars, alphanumeric + _ -)
    if (/^[a-zA-Z0-9_-]{20,}$/.test(s) && !/\s/.test(s) && !/\//.test(s)) {
      return s;
    }
    let m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = s.match(/\/open\?id=([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = s.match(/drive\.google\.com\/([a-zA-Z0-9_-]{20,})/);
    if (m) return m[1];
    return "";
  }

  function findVideo(id) {
    if (!catalog || !catalog.videos) return null;
    return catalog.videos.find((v) => v.id === id) || null;
  }

  function setField(id, value) {
    const el = $(id);
    if (!el || value == null || value === "") return;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function applyMeta(video) {
    if (!video) return;
    setField("anLawan", video.lawan || "");
    setField("anBabak", formatBabak(video.babak || ""));
    setField("anSource", video.title || "");
    // Kit stays user-editable; only hint via toast if empty
    try {
      localStorage.setItem(
        LS_SELECTED,
        JSON.stringify({
          id: video.id,
          title: video.title,
          lawan: video.lawan,
          babak: video.babak,
          viewUrl: video.viewUrl || viewUrlFor(video.id),
          at: Date.now()
        })
      );
    } catch (_) {}
  }

  function renderList() {
    const sel = $("anDrivePramuSelect");
    if (!sel || !catalog) return;
    const prev = selectedId || sel.value;
    sel.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Pilih video Bali 7 —";
    sel.appendChild(opt0);
    (catalog.videos || []).forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      const gb = typeof v.sizeGb === "number" ? v.sizeGb.toFixed(2) + " GB" : "";
      opt.textContent = (v.title || v.id) + (gb ? " · " + gb : "");
      sel.appendChild(opt);
    });
    const pick = (prev && findVideo(prev) && prev) || selectedId || DEFAULT_VIDEO_ID;
    if (pick && findVideo(pick)) {
      sel.value = pick;
      selectedId = pick;
    }
    updateSelectedHint();
  }

  function updateSelectedHint() {
    const hint = $("anDrivePramuSelected");
    const v = findVideo(selectedId);
    if (!hint) return;
    if (!v) {
      hint.textContent = "Belum ada video dipilih.";
      return;
    }
    const gb = typeof v.sizeGb === "number" ? " · ~" + v.sizeGb.toFixed(2) + " GB" : "";
    hint.textContent =
      "Terpilih: " +
      (v.title || v.id) +
      " · lawan " +
      (v.lawan || "—") +
      " · " +
      formatBabak(v.babak || "—") +
      gb;
  }

  function selectVideo(id, opts) {
    const openDrive = !!(opts && opts.openDrive);
    const video = findVideo(id);
    if (!video) {
      toast("Video tidak ada di katalog");
      return false;
    }
    selectedId = video.id;
    const sel = $("anDrivePramuSelect");
    if (sel) sel.value = video.id;
    applyMeta(video);
    updateSelectedHint();
    toast("Meta diisi · " + (video.lawan || "") + " · " + formatBabak(video.babak || ""));
    if (openDrive) {
      window.open(video.viewUrl || viewUrlFor(video.id), "_blank", "noopener,noreferrer");
    }
    return true;
  }

  function openSelectedDrive() {
    const id = selectedId || ($("anDrivePramuSelect") && $("anDrivePramuSelect").value);
    const video = findVideo(id);
    if (!video) {
      toast("Pilih video dulu");
      return;
    }
    window.open(video.viewUrl || viewUrlFor(video.id), "_blank", "noopener,noreferrer");
  }

  function openFolder() {
    const url =
      (catalog && catalog.folderUrl) ||
      "https://drive.google.com/drive/folders/1R_ZED8_m71AseqADjFCUwRtH2UabWB2G";
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function applyPaste() {
    const input = $("anDrivePramuPaste");
    const raw = input ? input.value.trim() : "";
    const id = parseDriveFileId(raw);
    if (!id) {
      toast("Link / id Drive tidak dikenali");
      return;
    }
    const known = findVideo(id);
    if (known) {
      selectVideo(id, { openDrive: false });
      return;
    }
    // Unknown id: still set source + open link; leave lawan/babak to user
    selectedId = id;
    const sel = $("anDrivePramuSelect");
    if (sel) sel.value = "";
    setField("anSource", "drive:" + id);
    try {
      localStorage.setItem(
        LS_SELECTED,
        JSON.stringify({ id: id, title: "", viewUrl: viewUrlFor(id), at: Date.now(), custom: true })
      );
    } catch (_) {}
    updateSelectedHint();
    const hint = $("anDrivePramuSelected");
    if (hint) hint.textContent = "Custom Drive id: " + id + " (meta lawan/babak isi manual)";
    toast("Drive id diparse · isi meta manual");
  }

  async function loadCatalog() {
    const res = await fetch(CATALOG_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Gagal load katalog Drive (" + res.status + ")");
    catalog = await res.json();
    (catalog.videos || []).forEach((v) => {
      if (!v.viewUrl && v.id) v.viewUrl = viewUrlFor(v.id);
    });
    return catalog;
  }

  function restoreSelected() {
    let id = null;
    try {
      const raw = localStorage.getItem(LS_SELECTED);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved.id && findVideo(saved.id)) id = saved.id;
      }
    } catch (_) {}
    if (!id && findVideo(DEFAULT_VIDEO_ID)) id = DEFAULT_VIDEO_ID;
    if (!id && catalog && catalog.videos && catalog.videos[0]) id = catalog.videos[0].id;
    if (!id) return;
    selectedId = id;
    const sel = $("anDrivePramuSelect");
    if (sel) sel.value = id;
    // Preselect in UI; apply meta so Upload step is ready for G8 Babak 1 default
    const video = findVideo(id);
    if (video) applyMeta(video);
    updateSelectedHint();
  }

  function wireUi() {
    const sel = $("anDrivePramuSelect");
    if (sel) {
      sel.addEventListener("change", () => {
        selectedId = sel.value || null;
        updateSelectedHint();
      });
    }
    if ($("anDrivePramuUse")) {
      $("anDrivePramuUse").addEventListener("click", () => {
        const id = ($("anDrivePramuSelect") && $("anDrivePramuSelect").value) || selectedId;
        if (!id) {
          toast("Pilih video dari daftar");
          return;
        }
        selectVideo(id, { openDrive: false });
      });
    }
    if ($("anDrivePramuOpen")) {
      $("anDrivePramuOpen").addEventListener("click", openSelectedDrive);
    }
    if ($("anDrivePramuFolder")) {
      $("anDrivePramuFolder").addEventListener("click", openFolder);
    }
    if ($("anDrivePramuPasteBtn")) {
      $("anDrivePramuPasteBtn").addEventListener("click", applyPaste);
    }
    if ($("anDrivePramuPaste")) {
      $("anDrivePramuPaste").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          applyPaste();
        }
      });
    }
  }

  async function init() {
    if (!$("anDrivePramuCard")) return;
    wireUi();
    try {
      await loadCatalog();
      renderList();
      restoreSelected();
      const owner = $("anDrivePramuOwner");
      if (owner && catalog && catalog.owner) {
        owner.textContent = catalog.owner;
      }
    } catch (e) {
      const hint = $("anDrivePramuSelected");
      if (hint) hint.textContent = "Katalog gagal dimuat: " + (e.message || e);
      toast("Katalog Drive gagal");
    }
  }

  window.TFDEV = window.TFDEV || {};
  function getSelectedId() {
    if (selectedId) return selectedId;
    const sel = $("anDrivePramuSelect");
    if (sel && sel.value) return sel.value;
    try {
      const raw = localStorage.getItem(LS_SELECTED);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved.id) return saved.id;
      }
    } catch (_) {}
    return null;
  }

  function getSelectedMeta() {
    const id = getSelectedId();
    if (!id) return null;
    const known = findVideo(id);
    if (known) return known;
    let saved = null;
    try {
      const raw = localStorage.getItem(LS_SELECTED);
      if (raw) saved = JSON.parse(raw);
    } catch (_) {}
    if (saved && saved.id === id) {
      return {
        id: id,
        title: saved.title || ("drive:" + id),
        lawan: saved.lawan || "",
        babak: saved.babak || "",
        viewUrl: saved.viewUrl || viewUrlFor(id),
        custom: !!saved.custom
      };
    }
    return {
      id: id,
      title: "drive:" + id,
      lawan: "",
      babak: "",
      viewUrl: viewUrlFor(id),
      custom: true
    };
  }

  window.TFDEV.drivePramu = {
    init: init,
    loadCatalog: loadCatalog,
    selectVideo: selectVideo,
    parseDriveFileId: parseDriveFileId,
    getCatalog: function () {
      return catalog;
    },
    getSelected: function () {
      return findVideo(selectedId);
    },
    getSelectedId: getSelectedId,
    getSelectedMeta: getSelectedMeta,
    openFolder: openFolder,
    openSelectedDrive: openSelectedDrive
  };
  window.TFDEV.initDrivePramu = init;
})();
