(function () {
  const STORAGE_KEY = "tfdev-zve10-checklist-v1";

  const GROUPS = [
    {
      title: "Sebelum berangkat",
      items: [
        { id: "bat1", title: "ZV-E10 + baterai penuh", desc: "Bawa baterai cadangan / power bank USB" },
        { id: "card1", title: "Memory card kosong (min. 64 GB, V30+)", desc: "Format di kamera jika perlu" },
        { id: "lens1", title: "Lensa lebar siap", desc: "10–18 / 10–20 / 16–50 OSS untuk Cam1" },
        { id: "trip1", title: "Tripod / light stand 2.5–3.5 m", desc: "Fluid head + sandbag di kaki" },
        { id: "note1", title: "Kertas / notes HP untuk event sheet", desc: "Kolom: menit · tipe · nomor · skor" },
        { id: "ibis1", title: "Ingat: ZV-E10 tidak ada IBIS", desc: "Andalkan OSS + tripod. Product Showcase Mode OFF" }
      ]
    },
    {
      title: "Setting kamera (wajib)",
      items: [
        { id: "mode1", title: "Mode Movie · 4K 30p", desc: "Cadangan: 1080p 60p bila storage sempit" },
        { id: "shut1", title: "Shutter 1/60 (30p) · ISO Auto max 3200–6400", desc: "Jangan S-Log untuk match cepat" },
        { id: "wb1", title: "White Balance Daylight · LOCK", desc: "Supaya jersey orange konsisten" },
        { id: "ts1", title: "Timestamp ON", desc: "Penting untuk sync event sheet" },
        { id: "af1", title: "AF Wide/Zone tengah · Eye AF ketat OFF", desc: "Zoom digital OFF · SteadyShot Standard" },
        { id: "ae1", title: "AE Lock ON sebelum kickoff", desc: "Picture Profile: S-Cinetone / Standard" }
      ]
    },
    {
      title: "Posisi di lapangan",
      items: [
        { id: "pos1", title: "Cam1: tengah sideline, tinggi 2.5–3.5 m", desc: "Frame: 2 gawang + garis tengah" },
        { id: "pos2", title: "Horizon lurus · lock framing", desc: "Jangan pan/zoom saat play" },
        { id: "pos3", title: "Langit tidak makan >1/3 frame", desc: "Garis tengah di 1/3–1/2 tinggi frame" },
        { id: "pos4", title: "Jersey orange TFS & lawan terbaca", desc: "Mulai REC 30 detik sebelum kickoff" }
      ]
    },
    {
      title: "Selama match",
      items: [
        { id: "rec1", title: "Kamera diam · file per babak OK", desc: "Jangan pause tiap dead ball kecuali ganti baterai" },
        { id: "ev1", title: "Catat event sheet live", desc: "GOL · SHOT · SAVE · CORNER · FK · KARTU" },
        { id: "fix1", title: "Betulkan framing hanya saat dead ball", desc: "Jangan ikut bola dengan pan terus" },
        { id: "bat2", title: "Cek baterai & storage di babak break", desc: "Ganti baterai sebelum Babak 2" }
      ]
    },
    {
      title: "Setelah peluit akhir",
      items: [
        { id: "stop1", title: "Stop REC · cek 5 detik awal & akhir", desc: "Pastikan file tidak corrupt" },
        { id: "name1", title: "Rename: (T#) TFS VS [LAWAN] Babak X", desc: "Contoh: (T8) TFS VS G8 Babak 1" },
        { id: "up1", title: "Upload Drive folder match", desc: "Share ke analis / parkspot07@gmail.com" },
        { id: "sheet1", title: "Foto / export event sheet", desc: "Sertakan bersama video" },
        { id: "chg1", title: "Charge baterai · kosongkan card setelah backup", desc: "Siap sesi berikutnya" }
      ]
    }
  ];

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch { return {}; }
  }
  function save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function render() {
    const root = document.getElementById("checklistRoot");
    if (!root) return;
    const state = load();
    let total = 0, done = 0;
    root.innerHTML = GROUPS.map((g, gi) => {
      const items = g.items.map((it) => {
        total++;
        const on = !!state[it.id];
        if (on) done++;
        return `<label class="check-item ${on ? "done" : ""}" data-id="${it.id}">
          <input type="checkbox" ${on ? "checked" : ""} />
          <span class="check-box"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#111" stroke-width="2" stroke-linecap="round"/></svg></span>
          <span class="txt"><strong>${it.title}</strong><span>${it.desc}</span></span>
        </label>`;
      }).join("");
      return `<div class="card check-group" style="margin-bottom:14px">
        <h3><span class="num">${gi + 1}</span>${g.title}</h3>
        ${items}
      </div>`;
    }).join("") + `<div class="warn">⚠️ ZV-E10: tidak ada IBIS. Cam1 mid-sideline full pitch, 4K30, Daylight lock, timestamp ON. Kit TFS = orange.</div>`;

    const pct = total ? Math.round((done / total) * 100) : 0;
    document.getElementById("checkProgressLabel").textContent = `${done} / ${total} selesai`;
    document.getElementById("checkProgressPct").textContent = pct + "%";
    document.getElementById("checkProgressBar").style.width = pct + "%";

    root.querySelectorAll(".check-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const id = el.dataset.id;
        const s = load();
        s[id] = !s[id];
        save(s);
        render();
      });
    });
  }

  window.TFDEV = window.TFDEV || {};
  window.TFDEV.initChecklist = function () {
    render();
    document.getElementById("resetChecklist").addEventListener("click", () => {
      if (confirm("Reset semua progress checklist?")) {
        localStorage.removeItem(STORAGE_KEY);
        render();
        window.TFDEV.toast("Checklist direset");
      }
    });
    document.getElementById("checkAllBtn").addEventListener("click", () => {
      const s = {};
      GROUPS.forEach((g) => g.items.forEach((it) => { s[it.id] = true; }));
      save(s);
      render();
      window.TFDEV.toast("Semua dicentang");
    });
  };
})();
