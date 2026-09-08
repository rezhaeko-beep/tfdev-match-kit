/**
 * Coach analytics: derive Match Centre-ish stats + briefing from Highlights clips.
 * Clips/tag OR Gemini Vision can both feed the same Match Centre.
 */
(function () {
  const LS_KEY = "tfdev-coach-analytics-v1";
  const TYPES = ["GOL", "CHANCE", "SKILL", "SAVE", "COACHING", "LAINNYA"];

  function emptyCounts() {
    const o = {};
    TYPES.forEach((t) => {
      o[t] = 0;
    });
    return o;
  }

  function teamBucket(team) {
    const t = String(team || "").toLowerCase();
    if (!t || t === "tfs" || t === "home") return "TFS";
    return "Lawan";
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const s = Math.floor(sec % 60);
    const m = Math.floor(sec / 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  function loadHighlights(list) {
    if (Array.isArray(list)) return list;
    try {
      if (window.Highlights && typeof window.Highlights.list === "function") {
        return window.Highlights.list() || [];
      }
      if (window.Highlights && typeof window.Highlights.get === "function") {
        return window.Highlights.get() || [];
      }
    } catch (_) {}
    return [];
  }

  function buildBriefing(highlights, counts, scoreH, scoreA) {
    const bullets = [];
    const total = highlights.length;
    bullets.push(
      total
        ? "Dari " + total + " clip bertanda: skor estimasi " + scoreH + "–" + scoreA + " (GOL tags)."
        : "Belum ada clip — tandai momen di Highlights atau jalankan AI Vision."
    );

    const chanceTfs = highlights.filter((h) => h.type === "CHANCE" && teamBucket(h.team) === "TFS").length;
    const chanceAway = highlights.filter((h) => h.type === "CHANCE" && teamBucket(h.team) !== "TFS").length;
    if (chanceTfs || chanceAway) {
      bullets.push("Peluang (CHANCE): TFS " + chanceTfs + " · Lawan " + chanceAway + ".");
    }
    if (counts.SAVE) {
      bullets.push(counts.SAVE + " situasi SAVE — bagus untuk sesi GK / block.");
    }
    if (counts.SKILL) {
      bullets.push(counts.SKILL + " clip SKILL — cocok untuk highlight ortu / CapCut.");
    }
    const coaching = highlights
      .filter((h) => h.type === "COACHING")
      .slice(0, 2)
      .map((h) => (h.title || h.note || "poin coaching").slice(0, 72));
    coaching.forEach((c) => bullets.push("Coaching: " + c));

    const top = highlights
      .slice()
      .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || a.t - b.t)
      .find((h) => h.type === "SKILL" || h.type === "CHANCE" || h.type === "GOL");
    if (top) {
      bullets.push(
        "Momen utama @" +
          fmtTime(top.t) +
          ": " +
          (top.title || top.type) +
          (top.playerNo ? " (#" + top.playerNo + ")" : "") +
          "."
      );
    }
    return bullets.slice(0, 6);
  }

  function derive(highlights) {
    const list = (highlights || []).map((h) => ({
      id: h.id,
      t: Number(h.t) || 0,
      type: String(h.type || "LAINNYA").toUpperCase(),
      team: teamBucket(h.team),
      playerNo: h.playerNo || "",
      title: h.title || "",
      note: h.note || "",
      rating: h.rating == null || h.rating === "" ? null : Number(h.rating),
      seed: !!h.seed
    }));

    const counts = emptyCounts();
    const byTeam = {
      TFS: emptyCounts(),
      Lawan: emptyCounts()
    };
    list.forEach((h) => {
      if (!counts[h.type]) counts[h.type] = 0;
      counts[h.type] += 1;
      if (!byTeam[h.team][h.type]) byTeam[h.team][h.type] = 0;
      byTeam[h.team][h.type] += 1;
    });

    const scoreH = byTeam.TFS.GOL || 0;
    const scoreA = byTeam.Lawan.GOL || 0;
    // Attack / chance proxies from tags only — never invent GPS
    const attH = byTeam.TFS.CHANCE + byTeam.TFS.GOL + byTeam.TFS.SKILL;
    const attA = byTeam.Lawan.CHANCE + byTeam.Lawan.GOL + byTeam.Lawan.SKILL;
    const shotH = byTeam.TFS.GOL + byTeam.TFS.CHANCE;
    const shotA = byTeam.Lawan.GOL + byTeam.Lawan.CHANCE;
    // Soft possession estimate from attack volume (tag-based, labeled as estimate)
    let possH = 50;
    let possA = 50;
    const attSum = attH + attA;
    if (attSum > 0) {
      possH = Math.round((attH / attSum) * 100);
      possA = 100 - possH;
    }

    const briefing = buildBriefing(list, counts, scoreH, scoreA);
    const note =
      "Estimasi dari " +
      list.length +
      " clip bertanda (bukan GPS). " +
      briefing.slice(0, 2).join(" ");

    const matchCentre = {
      meta: {
        title: "TFS VS G8 Babak 1",
        sourceFile: "Highlights clips → coach analytics",
        dateStamp: new Date().toLocaleDateString("id-ID")
      },
      teams: { home: { name: "TFS" }, away: { name: "G8" } },
      score: {
        home: scoreH,
        away: scoreA,
        note: note
      },
      possession: { homePct: possH, awayPct: possA },
      stats: {
        attackingSequences: { home: attH || null, away: attA || null, estimated: true },
        shotsOnTarget: {
          home: shotH ? "~" + shotH : "N/C",
          away: shotA ? "~" + shotA : "N/C"
        },
        cards: { home: 0, away: 0 }
      },
      internalNotes: briefing
    };

    // Flat form map also available for MatchCentre.applyJson
    const flat = {
      home: "TFS",
      away: "G8",
      scoreH: scoreH,
      scoreA: scoreA,
      comp: "TFS VIDEO ANALYSIS · BABAK 1",
      source: "Clips · coach analytics",
      date: matchCentre.meta.dateStamp,
      possH: possH,
      possA: possA,
      attH: attH ? "~" + attH : "N/C",
      attA: attA ? "~" + attA : "N/C",
      shotH: shotH ? "~" + shotH : "N/C",
      shotA: shotA ? "~" + shotA : "N/C",
      cardH: "0",
      cardA: "0",
      note: note
    };

    const parentStory =
      list.length === 0
        ? "Belum ada clip. Tandai momen di Highlights — cerita ortu + CapCut ikut dari tag (tanpa Vision key)."
        : "Hari ini anak terlibat di " +
          list.length +
          " momen bertanda" +
          (counts.SKILL ? " (termasuk " + counts.SKILL + " skill)" : "") +
          (counts.CHANCE ? " dan " + counts.CHANCE + " peluang" : "") +
          ". Skor clip: " +
          scoreH +
          "–" +
          scoreA +
          ". Siap isi laporan ortu dari clips + Salin CapCut.";

    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      clipCount: list.length,
      counts: counts,
      byTeam: byTeam,
      score: { home: scoreH, away: scoreA },
      briefing: briefing,
      parentStory: parentStory,
      matchCentre: matchCentre,
      flat: flat,
      demoStrip: {
        home: "TFS",
        away: "G8",
        scoreH: scoreH,
        scoreA: scoreA,
        half: "Babak 1",
        stats: [
          { label: "Clip", value: String(list.length) },
          { label: "Chance", value: String(counts.CHANCE || 0) },
          { label: "Skill", value: String(counts.SKILL || 0) },
          { label: "Save", value: String(counts.SAVE || 0) },
          { label: "Coach", value: String(counts.COACHING || 0) }
        ]
      }
    };
  }


  /** Build parentReports[0]-compatible object from clip tags (no Vision key). */
  function buildParentReport(opts) {
    opts = opts || {};
    const list = (opts.highlights ? opts.highlights : loadHighlights()).map((h) => ({
      t: Number(h.t) || 0,
      type: String(h.type || "LAINNYA").toUpperCase(),
      team: teamBucket(h.team),
      playerNo: String(h.playerNo || "").replace(/^#/, ""),
      title: h.title || "",
      note: h.note || "",
      rating: h.rating == null || h.rating === "" ? null : Number(h.rating)
    }));
    const summary = opts.summary || derive(list);
    const skillOrChance = list.filter(
      (h) =>
        h.type === "SKILL" ||
        (h.type === "CHANCE" && h.team === "TFS") ||
        h.type === "GOL"
    );
    const coaching = list.filter((h) => h.type === "COACHING");
    const named =
      list.find((h) => h.type === "SKILL" && h.playerNo) ||
      list.find((h) => h.playerNo) ||
      null;
    const playerNo = named ? named.playerNo : "";
    const playerName = playerNo ? "Pemain #" + playerNo : "Pemain TFS";

    const strengths = [];
    skillOrChance
      .slice()
      .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || a.t - b.t)
      .forEach((h) => {
        const line =
          (h.title || h.note || h.type) +
          (h.playerNo ? " (#" + h.playerNo + ")" : "") +
          " @" +
          fmtTime(h.t);
        if (line && strengths.indexOf(line) < 0) strengths.push(line);
      });
    while (strengths.length < 2 && coaching.length) {
      const c = coaching[strengths.length];
      if (!c) break;
      strengths.push((c.title || "Keterlibatan positif") + " @" + fmtTime(c.t));
    }
    if (!strengths.length) {
      strengths.push("Aktif mengikuti sesi (dari clip tags)");
      strengths.push("Siap dikembangkan lewat highlight CapCut");
    }

    const focusAreas = coaching.slice(0, 3).map((h) => ({
      title: h.title || "Poin coaching",
      desc: (h.note || "Fokus latihan berikutnya.") + " @" + fmtTime(h.t)
    }));
    if (!focusAreas.length) {
      focusAreas.push({
        title: "Keputusan di sepertiga akhir",
        desc: "Latihan receive + scan sebelum pass / finish."
      });
    }

    const skillN = summary.counts.SKILL || 0;
    const chanceN = summary.counts.CHANCE || 0;
    const clipN = list.length;
    const scoreH = summary.score.home;
    const scoreA = summary.score.away;
    const warm =
      clipN === 0
        ? "Belum ada clip bertanda. Tandai SKILL / CHANCE / COACHING di Highlights — laporan ortu ikut terisi tanpa Vision key."
        : "Hari ini " +
          playerName +
          " terlihat di " +
          clipN +
          " momen yang kami tandai" +
          (skillN ? ", termasuk " + skillN + " momen skill" : "") +
          (chanceN ? " dan " + chanceN + " peluang" : "") +
          ". Skor babak dari tag GOL: " +
          scoreH +
          "–" +
          scoreA +
          ". Kami bangga dengan usaha dan keberanian bermain — fokus minggu depan ada di poin coaching di bawah. Highlight CapCut siap dari daftar timestamp.";

    const overall = Math.max(
      62,
      Math.min(
        92,
        70 +
          Math.round((skillN + chanceN) * 1.5) +
          Math.min(8, Math.round((Number(named && named.rating) || 3) * 1.2))
      )
    );

    const metrics = [
      { label: "Work rate", value: Math.min(9.5, (7 + skillN * 0.3)).toFixed(1), key: "work" },
      { label: "Involvement", value: Math.min(9.5, (6.5 + clipN * 0.15)).toFixed(1), key: "involve" },
      {
        label: "Decision",
        value: Math.min(9.5, (7 + (coaching.length ? 0.5 : 0) + skillN * 0.2)).toFixed(1),
        key: "decision"
      }
    ];

    const keyBehaviors = list
      .filter((h) => h.type === "SKILL" || h.type === "CHANCE" || h.type === "COACHING")
      .slice(0, 8)
      .map((h) => ({
        t: h.t,
        playerNo: h.playerNo || "",
        tag: h.type === "COACHING" ? "FOCUS" : h.type === "SKILL" ? "COURAGE" : "EFFORT",
        note: h.title || h.note || h.type,
        valence: h.type === "COACHING" ? "coach" : "positive"
      }));

    return {
      player: {
        name: playerName,
        number: playerNo || null,
        no: playerNo || null,
        position: "Academy",
        sessionDate: new Date().toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        }),
        location: "Match Day · dari Highlights clips"
      },
      overallScore: overall,
      scoreLabel: "CLIPS",
      scoreDelta: null,
      sessionSummary: warm,
      strengths: strengths.slice(0, 4),
      focusAreas: focusAreas.slice(0, 3),
      metrics: metrics,
      coach: {
        name: "Coach Pramu",
        note: (summary.briefing || []).slice(0, 2).join(" ")
      },
      behaviorInsights: {
        teamMood: "Dari clip tags (tanpa Vision)",
        keyBehaviors: keyBehaviors,
        parentStory: warm,
        coachCues: (summary.briefing || []).slice(0, 4)
      },
      homeSupport: {
        drills: focusAreas.slice(0, 3).map((f) => ({
          title: f.title,
          desc: f.desc
        }))
      },
      source: "coach-analytics-clips"
    };
  }

  function applyToParentReport(opts) {
    opts = opts || {};
    const summary = opts.recompute === false ? get() || recompute() : recompute(opts);
    const report = buildParentReport({
      highlights: opts.highlights,
      summary: summary
    });
    if (!window.ParentReport || typeof window.ParentReport.applyJson !== "function") {
      throw new Error("ParentReport.applyJson belum siap");
    }
    window.ParentReport.applyJson(report, summary.matchCentre || null);
    try {
      if (window.PlayerDashboard && typeof window.PlayerDashboard.applyFromAnalytics === "function") {
        window.PlayerDashboard.applyFromAnalytics({
          parentReports: [report],
          matchCentre: summary.matchCentre
        });
      }
    } catch (_) {}
    try {
      const ta = document.getElementById("anJsonOut");
      if (ta) {
        let existing = {};
        try {
          existing = JSON.parse(ta.value || "{}") || {};
        } catch (_) {
          existing = {};
        }
        existing.parentReports = [report];
        existing.matchCentre = existing.matchCentre || summary.matchCentre;
        existing.behaviorInsights = report.behaviorInsights;
        existing.source = "coach-analytics-clips";
        ta.value = JSON.stringify(existing, null, 2);
      }
    } catch (_) {}
    if (opts.navigate !== false && window.TFDEV && window.TFDEV.showPage) {
      window.TFDEV.showPage("report");
    }
    if (window.TFDEV && window.TFDEV.toast) {
      window.TFDEV.toast("Laporan ortu diisi dari clips");
    }
    return report;
  }

    function persist(summary) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(summary));
    } catch (e) {
      /* quota / private mode */
    }
    return summary;
  }

  function get() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && typeof data === "object" ? data : null;
    } catch (_) {
      return null;
    }
  }

  function recompute(opts) {
    opts = opts || {};
    const list = loadHighlights(opts.highlights);
    const summary = derive(list);
    persist(summary);
    try {
      document.dispatchEvent(
        new CustomEvent("tfdev:coach-analytics", { detail: summary })
      );
    } catch (_) {}
    return summary;
  }

  function applyToMatchCentre(opts) {
    opts = opts || {};
    const summary = opts.recompute === false ? get() || recompute() : recompute(opts);
    if (!summary || !summary.matchCentre) {
      throw new Error("Belum ada analytics dari clips.");
    }
    if (!window.MatchCentre || typeof window.MatchCentre.applyJson !== "function") {
      throw new Error("MatchCentre.applyJson belum siap");
    }
    window.MatchCentre.applyJson(summary.matchCentre);

    // Keep Analitik JSON area in sync so Vision/clip paths share one sink
    try {
      const payload = {
        matchCentre: summary.matchCentre,
        behaviorInsights: {
          teamMood: "Dari clip tags (tanpa Vision)",
          keyBehaviors: (loadHighlights(opts.highlights) || [])
            .filter((h) => h.type === "COACHING" || h.type === "SKILL" || h.type === "CHANCE")
            .slice(0, 6)
            .map((h) => ({
              t: h.t,
              playerNo: h.playerNo || "",
              tag: h.type,
              note: h.title || h.note || "",
              valence: h.type === "CHANCE" && teamBucket(h.team) !== "TFS" ? "challenge" : "positive"
            })),
          parentStory: summary.parentStory,
          coachCues: summary.briefing || []
        },
        source: "coach-analytics-clips"
      };
      const ta = document.getElementById("anJsonOut");
      if (ta) ta.value = JSON.stringify(payload, null, 2);
    } catch (_) {}

    if (opts.navigate !== false && window.TFDEV && window.TFDEV.showPage) {
      window.TFDEV.showPage("matchcentre");
    }
    if (window.TFDEV && window.TFDEV.toast) {
      window.TFDEV.toast("Match Centre diisi dari clips");
    }
    return summary;
  }

  window.TFDEV = window.TFDEV || {};
  window.TFDEV.coachAnalytics = {
    get: get,
    recompute: recompute,
    applyToMatchCentre: applyToMatchCentre,
    buildParentReport: buildParentReport,
    applyToParentReport: applyToParentReport,
    LS_KEY: LS_KEY
  };
})();
