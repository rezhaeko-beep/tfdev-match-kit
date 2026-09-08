(function () {
  const KEY = "tfdev-event-sheet-v1";
  let selectedType = "GOL";
  let selectedTeam = "TFS";

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{"title":"(T8) TFS VS G8 Babak 1","events":[]}');
    } catch {
      return { title: "(T8) TFS VS G8 Babak 1", events: [] };
    }
  }
  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function render() {
    const data = load();
    const list = document.getElementById("eventList");
    const title = document.getElementById("evMatchTitle");
    if (title && document.activeElement !== title) title.value = data.title || "";
    document.getElementById("eventCount").textContent = data.events.length + " event";

    if (!data.events.length) {
      list.innerHTML = `<div class="empty-state">Belum ada event.<br/>Tambah GOL / SHOT / dll dari form kiri.</div>`;
      return;
    }

    const sorted = [...data.events].sort((a, b) => String(a.minute).localeCompare(String(b.minute), undefined, { numeric: true }));
    list.innerHTML = sorted.map((ev) => `
      <div class="event-row" data-id="${ev.id}">
        <div class="event-min">${escapeHtml(ev.minute)}'</div>
        <div class="event-main">
          <div><strong>${escapeHtml(ev.team)}</strong>${ev.number ? " #" + escapeHtml(ev.number) : ""}</div>
          <div class="meta">${escapeHtml(ev.note || "—")} · skor ${ev.scoreHome}-${ev.scoreAway}</div>
        </div>
        <span class="tag-type ${ev.type}">${ev.type}</span>
        <button class="btn btn-ghost btn-sm del-ev" title="Hapus">✕</button>
      </div>
    `).join("");

    list.querySelectorAll(".del-ev").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.closest(".event-row").dataset.id;
        const d = load();
        d.events = d.events.filter((e) => e.id !== id);
        save(d);
        render();
        window.TFDEV.toast("Event dihapus");
      });
    });
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.TFDEV = window.TFDEV || {};
  window.EventSheet = {
    getEvents: function () {
      return load().events || [];
    },
    getData: function () {
      return load();
    },
    KEY: KEY
  };

  window.TFDEV.initEvents = function () {
    const data = load();
    document.getElementById("evMatchTitle").value = data.title || "";

    document.querySelectorAll("#evTypeChips .chip").forEach((c) => {
      c.addEventListener("click", () => {
        document.querySelectorAll("#evTypeChips .chip").forEach((x) => x.classList.remove("active"));
        c.classList.add("active");
        selectedType = c.dataset.type;
      });
    });
    document.querySelectorAll("#evTeamChips .chip").forEach((c) => {
      c.addEventListener("click", () => {
        document.querySelectorAll("#evTeamChips .chip").forEach((x) => x.classList.remove("active"));
        c.classList.add("active");
        selectedTeam = c.dataset.team;
      });
    });

    document.getElementById("evMatchTitle").addEventListener("change", (e) => {
      const d = load();
      d.title = e.target.value;
      save(d);
    });

    document.getElementById("addEventBtn").addEventListener("click", () => {
      const minute = document.getElementById("evMinute").value.trim();
      if (!minute) {
        window.TFDEV.toast("Isi menit dulu");
        return;
      }
      const d = load();
      d.title = document.getElementById("evMatchTitle").value;
      d.events.push({
        id: "e" + Date.now() + Math.random().toString(36).slice(2, 6),
        minute,
        type: selectedType,
        team: selectedTeam,
        number: document.getElementById("evNumber").value.trim(),
        scoreHome: Number(document.getElementById("evScoreHome").value) || 0,
        scoreAway: Number(document.getElementById("evScoreAway").value) || 0,
        note: document.getElementById("evNote").value.trim(),
        at: new Date().toISOString()
      });
      if (selectedType === "GOL") {
        if (selectedTeam === "TFS") {
          const n = (Number(document.getElementById("evScoreHome").value) || 0) + 1;
          document.getElementById("evScoreHome").value = n;
          d.events[d.events.length - 1].scoreHome = n;
        } else {
          const n = (Number(document.getElementById("evScoreAway").value) || 0) + 1;
          document.getElementById("evScoreAway").value = n;
          d.events[d.events.length - 1].scoreAway = n;
        }
      }
      save(d);
      document.getElementById("evNote").value = "";
      render();
      window.TFDEV.toast("Event ditambahkan");
    });

    document.getElementById("exportEventsBtn").addEventListener("click", () => {
      const d = load();
      d.title = document.getElementById("evMatchTitle").value;
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (d.title || "event-sheet").replace(/[^\w\-]+/g, "_") + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
      window.TFDEV.toast("JSON diexport");
    });

    document.getElementById("clearEventsBtn").addEventListener("click", () => {
      if (!confirm("Hapus semua event?")) return;
      const d = load();
      d.events = [];
      save(d);
      render();
      window.TFDEV.toast("Semua event dihapus");
    });

    render();
  };
})();
