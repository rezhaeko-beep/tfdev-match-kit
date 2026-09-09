/**
 * Match stats formula — single source of truth for Match Centre numbers.
 * Spec: prompts/match-stats-formula.md · sheets: data/event-sheets.json
 */
(function () {
  const SHEETS_URL = "data/event-sheets.json";
  let sheetsCache = null;
  let sheetsPromise = null;

  function loadSheets() {
    if (sheetsCache) return Promise.resolve(sheetsCache);
    if (sheetsPromise) return sheetsPromise;
    sheetsPromise = fetch(SHEETS_URL)
      .then(function (r) {
        return r.ok ? r.json() : { sheets: [] };
      })
      .then(function (j) {
        sheetsCache = j && Array.isArray(j.sheets) ? j.sheets : [];
        return sheetsCache;
      })
      .catch(function () {
        sheetsCache = builtinSheets();
        return sheetsCache;
      });
    return sheetsPromise;
  }

  function builtinSheets() {
    return [
      {
        id: "tfs-vs-g8-babak-1",
        matchKeys: ["tfs", "g8"],
        half: 1,
        title: "TFS VS G8 Babak 1",
        teams: { home: "TFS", away: "G8" },
        score: { home: 0, away: 3 },
        corners: { home: 0, away: 1 },
        saves: { home: 3, away: 0 },
        shotsOnTarget: { home: null, away: null, reason: "wide_cam_N/C" },
        cards: { home: 0, away: 0 },
        source: "coach_event_sheet",
        note: "Coach Event Sheet Babak 1: skor 0–3 · corner 0–1 · saves 3–0. Shot N/C wide-cam."
      }
    ];
  }

  function normTitle(mc) {
    if (!mc) return "";
    const meta = mc.meta || {};
    const teams = mc.teams || {};
    return (
      String(meta.title || "") +
      " " +
      String((teams.home && teams.home.name) || "") +
      " " +
      String((teams.away && teams.away.name) || "") +
      " " +
      String(meta.sourceFile || "")
    ).toLowerCase();
  }

  function detectHalf(title) {
    const m = String(title || "").match(/babak\s*(\d+)/i);
    return m ? Number(m[1]) : null;
  }

  function findSheet(sheets, mc) {
    const title = normTitle(mc);
    const half = detectHalf(title);
    const list = sheets && sheets.length ? sheets : builtinSheets();
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const keys = s.matchKeys || [];
      if (!keys.length) continue;
      let ok = true;
      for (let k = 0; k < keys.length; k++) {
        if (title.indexOf(String(keys[k]).toLowerCase()) < 0) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (s.half != null && half != null && Number(s.half) !== Number(half)) continue;
      return s;
    }
    // fallback: keys match without half constraint
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const keys = s.matchKeys || [];
      if (!keys.length) continue;
      let ok = true;
      for (let k = 0; k < keys.length; k++) {
        if (title.indexOf(String(keys[k]).toLowerCase()) < 0) {
          ok = false;
          break;
        }
      }
      if (ok) return s;
    }
    return null;
  }

  function pairEmpty(p) {
    return !p || (p.home == null && p.away == null);
  }

  function countTimelineGoals(mc) {
    const out = { home: 0, away: 0, total: 0 };
    const homeName = ((mc.teams && mc.teams.home && mc.teams.home.name) || "TFS").toLowerCase();
    const awayName = ((mc.teams && mc.teams.away && mc.teams.away.name) || "").toLowerCase();
    const tl = Array.isArray(mc.timeline) ? mc.timeline : [];
    tl.forEach(function (ev) {
      const ty = String((ev && ev.type) || "").toUpperCase();
      if (ty !== "GOL" && ty !== "GOAL") return;
      out.total += 1;
      const team = String((ev && ev.team) || "").toLowerCase();
      if (team.indexOf("tfs") >= 0 || (homeName && team.indexOf(homeName) >= 0)) out.home += 1;
      else if (awayName && team.indexOf(awayName) >= 0) out.away += 1;
      else if (/g8|lawan|away|opp/.test(team)) out.away += 1;
      else out.away += 1;
    });
    return out;
  }

  function ensureGoalTimeline(mc, sheet) {
    if (!sheet || !sheet.score) return mc;
    if (!Array.isArray(mc.timeline)) mc.timeline = [];
    const needAway = Number(sheet.score.away) || 0;
    const needHome = Number(sheet.score.home) || 0;
    const g = countTimelineGoals(mc);
    const awayName = (sheet.teams && sheet.teams.away) || "AWAY";
    const homeName = (sheet.teams && sheet.teams.home) || "TFS";
    let i;
    for (i = g.away; i < needAway; i++) {
      mc.timeline.push({
        type: "GOL",
        team: awayName,
        t: null,
        desc: "Gol " + (i + 1) + " " + awayName + " (Event Sheet) — detik N/C",
        source: "coach_event_sheet"
      });
    }
    for (i = g.home; i < needHome; i++) {
      mc.timeline.push({
        type: "GOL",
        team: homeName,
        t: null,
        desc: "Gol " + (i + 1) + " " + homeName + " (Event Sheet) — detik N/C",
        source: "coach_event_sheet"
      });
    }
    return mc;
  }

  function isWeakZeroZero(score) {
    if (!score) return true;
    const h = score.home;
    const a = score.away;
    if (h == null || a == null) return true;
    const src = String(score.source || "").toLowerCase();
    const fromSheet = src.indexOf("coach") >= 0 || src.indexOf("event") >= 0 || src.indexOf("sheet") >= 0;
    if (h === 0 && a === 0 && !fromSheet) return true;
    return false;
  }

  /**
   * Apply formula to a matchCentre object (mutates + returns).
   * opts.sheets optional preloaded sheets array.
   */
  function resolve(mc, opts) {
    opts = opts || {};
    if (!mc || typeof mc !== "object") return mc;
    const sheets = opts.sheets || sheetsCache || builtinSheets();
    const sheet = findSheet(sheets, mc);

    if (!mc.stats) mc.stats = {};
    if (!mc.score) mc.score = {};

    // --- Goals ---
    if (sheet && sheet.score) {
      const ai = mc.score;
      const conflict =
        ai.home != null &&
        ai.away != null &&
        !isWeakZeroZero(ai) &&
        String(ai.source || "").indexOf("coach") < 0 &&
        (Number(ai.home) !== Number(sheet.score.home) || Number(ai.away) !== Number(sheet.score.away));
      mc.score = {
        home: sheet.score.home,
        away: sheet.score.away,
        confidence: "high",
        source: sheet.source || "coach_event_sheet",
        note: sheet.note || "Coach Event Sheet."
      };
      if (conflict) {
        mc.score.note =
          (mc.score.note || "") +
          " · Konflik AI " +
          ai.home +
          "–" +
          ai.away +
          " diabaikan (sheet menang).";
        mc.score.conflict = { home: ai.home, away: ai.away, source: ai.source || "ai" };
      }
      ensureGoalTimeline(mc, sheet);
    } else if (isWeakZeroZero(mc.score)) {
      const g = countTimelineGoals(mc);
      if (g.total > 0) {
        mc.score = {
          home: g.home,
          away: g.away,
          confidence: "medium",
          source: "timeline_gol",
          note: "Skor dari hitungan timeline GOL."
        };
      } else {
        mc.score.confidence = "low";
        mc.score.note = (mc.score.note ? mc.score.note + " · " : "") +
          "Skor 0-0 belum terverifikasi — N/C preferensi; jangan anggap final.";
        if (mc.score.home == null) mc.score.home = null;
        if (mc.score.away == null) mc.score.away = null;
      }
    }

    // --- Corners / Saves (sheet wins for known fixture) ---
    if (sheet) {
      if (sheet.corners) mc.stats.corners = Object.assign({}, sheet.corners);
      if (sheet.saves) mc.stats.saves = Object.assign({}, sheet.saves);
      if (sheet.cards && pairEmpty(mc.stats.cards)) mc.stats.cards = Object.assign({}, sheet.cards);
      if (sheet.shotsOnTarget && pairEmpty(mc.stats.shotsOnTarget) && pairEmpty(mc.stats.shots)) {
        mc.stats.shotsOnTarget = {
          home: sheet.shotsOnTarget.home,
          away: sheet.shotsOnTarget.away
        };
      }
      if (!mc.teams) mc.teams = {};
      if (!mc.teams.home) mc.teams.home = { name: (sheet.teams && sheet.teams.home) || "TFS" };
      if (!mc.teams.away) mc.teams.away = { name: (sheet.teams && sheet.teams.away) || "G8" };
      if (!mc.meta) mc.meta = {};
      if (!mc.meta.title) mc.meta.title = sheet.title;
    } else {
      if (pairEmpty(mc.stats.corners)) mc.stats.corners = { home: null, away: null };
      if (pairEmpty(mc.stats.saves)) mc.stats.saves = { home: null, away: null };
    }

    // --- Possession / attacking = estimate only ---
    if (mc.possession && mc.possession.estimated !== false) {
      mc.possession.estimated = true;
    }
    if (mc.stats.attackingSequences) {
      mc.stats.attackingSequences.estimated = true;
    }

    mc.statsResolvedBy = "match-stats-formula-v1";
    if (sheet) mc.eventSheetId = sheet.id;
    return mc;
  }

  function resolveAsync(mc, opts) {
    return loadSheets().then(function (sheets) {
      return resolve(mc, Object.assign({}, opts || {}, { sheets: sheets }));
    });
  }

  /** Flat map for Match Centre form fields */
  function toFormFields(mc) {
    mc = resolve(mc);
    const score = mc.score || {};
    const st = mc.stats || {};
    const corners = st.corners || {};
    const saves = st.saves || {};
    const sot = st.shotsOnTarget || st.shots || {};
    const att = st.attackingSequences || {};
    const cards = st.cards || {};
    const poss = mc.possession || {};
    const teams = mc.teams || {};
    const meta = mc.meta || {};
    function nc(v, est) {
      if (v === null || v === undefined || v === "") return "N/C";
      if (typeof v === "number" && est) return "~" + v;
      return String(v);
    }
    return {
      mcHome: (teams.home && teams.home.name) || "TFS",
      mcAway: (teams.away && teams.away.name) || "",
      mcScoreH: score.home != null ? score.home : 0,
      mcScoreA: score.away != null ? score.away : 0,
      mcComp:
        "TFS VIDEO ANALYSIS · " +
        ((meta.title || "").match(/babak\s*\d+/i) || ["MATCH"])[0].toString().toUpperCase(),
      mcSource: meta.sourceFile || meta.title || score.source || "",
      mcDate: meta.dateStamp || "",
      mcPossH: poss.homePct != null ? poss.homePct : 50,
      mcPossA: poss.awayPct != null ? poss.awayPct : 50,
      mcCornerH: nc(corners.home),
      mcCornerA: nc(corners.away),
      mcSaveH: nc(saves.home),
      mcSaveA: nc(saves.away),
      mcShotH: nc(sot.home),
      mcShotA: nc(sot.away),
      mcAttH: nc(att.home, true),
      mcAttA: nc(att.away, true),
      mcCardH: nc(cards.home != null ? cards.home : 0),
      mcCardA: nc(cards.away != null ? cards.away : 0),
      mcNote: score.note || ""
    };
  }

  window.TFDEV = window.TFDEV || {};
  window.TFDEV.MatchStats = {
    loadSheets: loadSheets,
    findSheet: findSheet,
    resolve: resolve,
    resolveAsync: resolveAsync,
    toFormFields: toFormFields,
    builtinSheets: builtinSheets,
    formulaVersion: "v1"
  };
})();
