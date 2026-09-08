/**
 * Consistent metric labels ID/EN for Parent Report + Player Dashboard.
 */
(function (global) {
  var GLOSSARY = [
    { key: "firstTouch", en: "First Touch", id: "First Touch", aliases: ["first touch", "touch", "receiving", "kontrol pertama"] },
    { key: "dribbling", en: "Dribbling Control", id: "Kontrol Dribble", aliases: ["dribbl", "ball control", "kontrol bola"] },
    { key: "passing", en: "Passing Accuracy", id: "Akurasi Passing", aliases: ["pass", "passing", "umpan"] },
    { key: "shooting", en: "Shooting Form", id: "Formasi Tembakan", aliases: ["shoot", "finish", "finishing", "tembakan"] },
    { key: "decisionMaking", en: "Decision Making", id: "Pengambilan Keputusan", aliases: ["decision", "tactical", "awareness", "scan", "keputusan"] },
    { key: "workRate", en: "Work Rate", id: "Work Rate", aliases: ["work rate", "effort", "intensitas", "agility", "mobility"] },
    { key: "positioning", en: "Positioning", id: "Positioning", aliases: ["position", "shape", "posisi"] },
    { key: "composure", en: "Composure", id: "Ketenangan", aliases: ["compos", "calm", "ketenangan"] },
    { key: "1v1", en: "1v1 Courage", id: "Courage 1v1", aliases: ["1v1", "duel", "courage"] },
    { key: "ballsTouched", en: "Balls Touched", id: "Sentuhan Bola", aliases: ["balls touched", "touch count", "sentuhan"] }
  ];

  function resolveKey(blob) {
    var s = String(blob || "").toLowerCase();
    for (var i = 0; i < GLOSSARY.length; i++) {
      var g = GLOSSARY[i];
      if (s === g.key.toLowerCase()) return g;
      for (var j = 0; j < g.aliases.length; j++) {
        if (s.indexOf(g.aliases[j]) !== -1) return g;
      }
    }
    return null;
  }

  function normalizeMetric(m, lang) {
    if (!m || typeof m !== "object") return m;
    var g = resolveKey((m.key || "") + " " + (m.label || ""));
    var out = Object.assign({}, m);
    if (g) {
      out.key = g.key;
      out.label = lang === "id" ? g.id : g.en;
      out.labelEn = g.en;
      out.labelId = g.id;
    }
    if (!out.source) {
      out.source = out.value == null || out.value === "" || out.value === "N/C" ? "nc" : "video_observation";
    }
    return out;
  }

  function normalizeReport(report) {
    if (!report || typeof report !== "object") return report;
    var r = Object.assign({}, report);
    if (Array.isArray(r.metrics)) {
      r.metrics = r.metrics.map(function (m) { return normalizeMetric(m, "id"); });
    }
    return r;
  }

  function normalizeDashboard(dash) {
    if (!dash || typeof dash !== "object") return dash;
    var d = Object.assign({}, dash);
    if (Array.isArray(d.metrics)) {
      d.metrics = d.metrics.map(function (m) { return normalizeMetric(m, "en"); });
    }
    if (Array.isArray(d.skills)) {
      d.skills = d.skills.map(function (s) {
        var g = resolveKey((s.key || "") + " " + (s.label || ""));
        if (!g) return s;
        return Object.assign({}, s, { key: g.key, label: g.en });
      });
    }
    return d;
  }

  global.TFDEV = global.TFDEV || {};
  global.TFDEV.MetricGlossary = {
    GLOSSARY: GLOSSARY,
    resolveKey: resolveKey,
    normalizeMetric: normalizeMetric,
    normalizeReport: normalizeReport,
    normalizeDashboard: normalizeDashboard
  };
})(typeof window !== "undefined" ? window : globalThis);
