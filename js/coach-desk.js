/**
 * Home Coach Desk — demo strip + parent-story teaser from coach analytics / seed.
 */
(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function seedFallback() {
    return {
      demoStrip: {
        home: "TFS",
        away: "G8",
        scoreH: 0,
        scoreA: 0,
        half: "Babak 1",
        stats: [
          { label: "Clip", value: "12" },
          { label: "Chance", value: "5" },
          { label: "Skill", value: "2" },
          { label: "Save", value: "1" },
          { label: "Coach", value: "3" }
        ]
      },
      briefing: [
        "Demo seed TFS vs G8 Babak 1 · skor 0–0 dari clip tags.",
        "Peluang (CHANCE): TFS 3 · Lawan 2.",
        "Clip SKILL & COACHING siap untuk ortu / CapCut."
      ],
      parentStory:
        "Cerita ortu siap dari clip: skill #7/#10, peluang, coaching — tombol Isi laporan ortu dari clips (tanpa Vision). Salin CapCut di Highlights."
    };
  }

  function readSummary() {
    try {
      if (window.TFDEV && window.TFDEV.coachAnalytics) {
        let s = window.TFDEV.coachAnalytics.get();
        if (!s || !s.clipCount) {
          s = window.TFDEV.coachAnalytics.recompute();
        }
        if (s && s.clipCount) return s;
      }
    } catch (_) {}
    return seedFallback();
  }

  function renderStrip(summary) {
    const strip = $("coachDeskStrip");
    if (!strip) return;
    const d = (summary && summary.demoStrip) || seedFallback().demoStrip;
    const statsHtml = (d.stats || [])
      .map(
        (s) =>
          '<div class="coach-desk-stat"><div class="n">' +
          String(s.value) +
          '</div><div class="l">' +
          String(s.label) +
          "</div></div>"
      )
      .join("");
    strip.innerHTML =
      '<div class="coach-desk-scoreboard">' +
      '<div class="coach-desk-team home"><span class="kit">TFS</span><strong>' +
      (d.home || "TFS") +
      "</strong></div>" +
      '<div class="coach-desk-score-mid">' +
      '<div class="score">' +
      (d.scoreH != null ? d.scoreH : 0) +
      " – " +
      (d.scoreA != null ? d.scoreA : 0) +
      "</div>" +
      '<div class="half">' +
      (d.half || "Babak 1") +
      " · dari clips</div>" +
      "</div>" +
      '<div class="coach-desk-team away"><span class="kit away">G8</span><strong>' +
      (d.away || "G8") +
      "</strong></div>" +
      "</div>" +
      '<div class="coach-desk-stats">' +
      statsHtml +
      "</div>";
  }

  function renderStory(summary) {
    const el = $("coachDeskStory");
    if (!el) return;
    const story =
      (summary && summary.parentStory) ||
      seedFallback().parentStory;
    const brief = (summary && summary.briefing) || seedFallback().briefing;
    el.innerHTML =
      "<strong>Cerita ortu / perilaku</strong>" +
      "<p>" +
      String(story).replace(/</g, "&lt;") +
      "</p>" +
      '<ul class="coach-desk-brief">' +
      (brief || [])
        .slice(0, 3)
        .map((b) => "<li>" + String(b).replace(/</g, "&lt;") + "</li>")
        .join("") +
      "</ul>";
  }

  function refresh() {
    const summary = readSummary();
    renderStrip(summary);
    renderStory(summary);
  }

  window.TFDEV = window.TFDEV || {};
  window.TFDEV.initCoachDesk = function () {
    if (!$("page-home")) return;
    refresh();
    document.addEventListener("tfdev:coach-analytics", refresh);
    const applyBtn = $("coachDeskApplyClips");
    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        try {
          if (!window.TFDEV.coachAnalytics) return;
          window.TFDEV.coachAnalytics.applyToMatchCentre({ navigate: true });
        } catch (e) {
          window.TFDEV.toast && window.TFDEV.toast(e.message || "Gagal apply");
        }
      });
    }
    const reportBtn = $("coachDeskApplyReport");
    if (reportBtn) {
      reportBtn.addEventListener("click", () => {
        try {
          if (!window.TFDEV.coachAnalytics || !window.TFDEV.coachAnalytics.applyToParentReport) {
            window.TFDEV.toast && window.TFDEV.toast("coachAnalytics belum siap");
            return;
          }
          window.TFDEV.coachAnalytics.applyToParentReport({ navigate: true });
        } catch (e) {
          window.TFDEV.toast && window.TFDEV.toast(e.message || "Gagal laporan ortu");
        }
      });
    }
  };

  // Refresh when navigating home
  const prev = window.TFDEV.onPage;
  window.TFDEV.onPage = function (id) {
    if (typeof prev === "function") prev(id);
    if (id === "home") refresh();
  };
})();
