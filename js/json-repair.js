/**
 * TFDEV JSON repair — one gentle pass before apply-all.
 * Does not rewrite analitik.js logic; call from parseAiJson / apply paths.
 */
(function (global) {
  var HL_TYPES = { GOL: 1, CHANCE: 1, SKILL: 1, SAVE: 1, COACHING: 1, LAINNYA: 1 };
  var TL_TYPES = { GOL: 1, SHOT: 1, SAVE: 1, CORNER: 1, FK: 1, KARTU: 1, CHANCE: 1, NOTE: 1 };

  function extractJsonText(raw) {
    var text = String(raw || "").trim();
    if (!text) throw new Error("Respons AI kosong");
    var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    var start = text.indexOf("{");
    var end = text.lastIndexOf("}");
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
    // common model slip: trailing commas
    text = text.replace(/,\s*([}\]])/g, "$1");
    return text;
  }

  function numOrNull(v) {
    if (v == null || v === "") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function normalizeHighlight(h) {
    if (!h || typeof h !== "object") return null;
    var t = numOrNull(h.t != null ? h.t : h.timeSec != null ? h.timeSec : h.second);
    var type = String(h.type || "LAINNYA").toUpperCase();
    if (!HL_TYPES[type]) type = "LAINNYA";
    return {
      t: t != null ? t : 0,
      type: type,
      team: h.team || "TFS",
      playerNo: h.playerNo != null ? String(h.playerNo) : h.number != null ? String(h.number) : "",
      title: h.title || h.tag || "",
      note: h.note != null ? h.note : h.description || "",
      rating: numOrNull(h.rating)
    };
  }

  function highlightsFromDecisionMoments(data) {
    var bi = data && data.behaviorInsights;
    var dm = bi && Array.isArray(bi.decisionMoments) ? bi.decisionMoments : [];
    return dm
      .map(function (d) {
        if (!d) return null;
        return normalizeHighlight({
          t: d.t,
          type: "COACHING",
          team: "TFS",
          playerNo: d.playerNo,
          title: d.choice ? "Keputusan: " + d.choice : "Decision moment",
          note: [d.choice, d.betterOption ? "Opsi lebih baik: " + d.betterOption : ""]
            .filter(Boolean)
            .join(" — "),
          rating: 3
        });
      })
      .filter(Boolean);
  }

  function highlightsFromTimeline(data) {
    var mc = data && data.matchCentre;
    var tl = mc && Array.isArray(mc.timeline) ? mc.timeline : Array.isArray(data.timeline) ? data.timeline : [];
    return tl
      .map(function (ev) {
        if (!ev) return null;
        var type = String(ev.type || "NOTE").toUpperCase();
        var hlType = HL_TYPES[type] ? type : type === "SHOT" ? "CHANCE" : type === "NOTE" ? "LAINNYA" : "CHANCE";
        var t = numOrNull(ev.t != null ? ev.t : ev.minute != null ? Number(ev.minute) * 60 : ev.second);
        return normalizeHighlight({
          t: t,
          type: hlType,
          team: ev.team || "TFS",
          playerNo: ev.playerNo,
          title: ev.desc || ev.description || type,
          note: ev.desc || ev.description || "",
          rating: type === "GOL" ? 5 : 3
        });
      })
      .filter(Boolean);
  }

  function ensureHighlights(data) {
    if (!data || typeof data !== "object") return data;
    var existing =
      (Array.isArray(data.highlights) && data.highlights.length && data.highlights) ||
      (Array.isArray(data.keyMoments) && data.keyMoments.length && data.keyMoments) ||
      null;
    if (existing) {
      data.highlights = existing.map(normalizeHighlight).filter(Boolean);
      return data;
    }
    var fromDm = highlightsFromDecisionMoments(data);
    var fromTl = highlightsFromTimeline(data);
    var merged = fromDm.concat(fromTl);
    // dedupe by t+type+title
    var seen = {};
    data.highlights = merged.filter(function (h) {
      var k = (h.t || 0) + "|" + h.type + "|" + (h.title || "");
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    });
    return data;
  }

  function softNormalizeRoot(data) {
    if (data && data.kidsCard && typeof data.kidsCard === "object") {
      var kc = data.kidsCard;
      if (!Array.isArray(kc.kamus)) kc.kamus = [];
      if (!Array.isArray(kc.momen)) kc.momen = [];
      if (!Array.isArray(kc.pemain)) kc.pemain = [];
      if (!Array.isArray(kc.pelajaran)) kc.pelajaran = [];
      if (!Array.isArray(kc.klip_wajib)) kc.klip_wajib = [];
      if (!kc.keyakinan) kc.keyakinan = "Sedang";
    }
    if (!data || typeof data !== "object") return data;
    // wrap legacy shapes
    if (!data.matchCentre && (data.teams || data.score || data.meta || data.stats)) {
      data = { matchCentre: data, parentReports: data.parentReports || [], highlights: data.highlights };
    }
    if (data.matchCentre && Array.isArray(data.matchCentre.timeline)) {
      data.matchCentre.timeline = data.matchCentre.timeline.map(function (ev) {
        if (!ev || typeof ev !== "object") return ev;
        var type = String(ev.type || "NOTE").toUpperCase();
        if (!TL_TYPES[type]) ev.type = "NOTE";
        else ev.type = type;
        return ev;
      });
    }
    if (Array.isArray(data.parentReports) && global.TFDEV && global.TFDEV.MetricGlossary) {
      data.parentReports = data.parentReports.map(global.TFDEV.MetricGlossary.normalizeReport);
    }
    if (data.playerDashboard && global.TFDEV && global.TFDEV.MetricGlossary) {
      data.playerDashboard = global.TFDEV.MetricGlossary.normalizeDashboard(data.playerDashboard);
    }
    ensureHighlights(data);
    return data;
  }

  function parseAndRepair(raw) {
    var text = extractJsonText(raw);
    var data;
    try {
      data = JSON.parse(text);
    } catch (e1) {
      // one repair pass: strip control chars except \n\t
      var repaired = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
      repaired = repaired.replace(/,\s*([}\]])/g, "$1");
      try {
        data = JSON.parse(repaired);
      } catch (e2) {
        throw new Error("JSON AI tidak valid: " + (e1.message || e2.message));
      }
    }
    return softNormalizeRoot(data);
  }

  global.TFDEV = global.TFDEV || {};
  global.TFDEV.JsonRepair = {
    extractJsonText: extractJsonText,
    parseAndRepair: parseAndRepair,
    ensureHighlights: ensureHighlights,
    softNormalizeRoot: softNormalizeRoot
  };
})(typeof window !== "undefined" ? window : globalThis);
