(function () {
  function v(id) { return document.getElementById(id).value; }
  function set(id, val) {
    const el = document.getElementById(id);
    if (el != null && val !== undefined && val !== null) el.value = val;
  }
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function lines(id) {
    return v(id).split(/\n+/).map((x) => x.trim()).filter(Boolean);
  }

  const PAGES_URL = "https://rezhaeko-beep.github.io/tfdev-match-kit/";

  function render() {
    const strengths = lines("prStrengths").map((t) => `<li>${esc(t)}</li>`).join("") || "<li>—</li>";
    const focus = lines("prFocus").map((t) => `<li>${esc(t)}</li>`).join("") || "<li>—</li>";

    document.getElementById("prPreview").innerHTML = `
      <div class="pr-header">
        <div class="pr-logo">
          <div class="tf">T<span>F</span></div>
          <div class="brand">TFDEV</div>
        </div>
        <div class="pr-title">
          <h1>Parent Session Report</h1>
          <div class="tag">Total Football School</div>
        </div>
        <div class="pr-date">
          <div class="l">DATE</div>
          <div class="v">${esc(v("prDate"))}</div>
        </div>
      </div>
      <div class="pr-player">
        <div>
          <div class="pr-player-name">${esc(v("prName"))}</div>
          <div class="pr-player-meta">${esc(v("prMeta"))}</div>
          <div class="pr-player-sub">${esc(v("prSession"))}</div>
        </div>
        <div class="pr-score">
          <div class="l">SCORE</div>
          <div class="s">${esc(v("prScore"))}</div>
          <div class="p">${esc(v("prScorePill"))}</div>
        </div>
      </div>
      <div class="pr-sec">
        <div class="pr-sec-h">Session summary</div>
        <div class="pr-summary">${esc(v("prSummary"))}</div>
      </div>
      <div class="pr-sec">
        <div class="pr-sec-h">Performance metrics</div>
        <div class="pr-metrics">
          <div class="pr-metric"><div class="ml">${esc(v("prM1L"))}</div><div class="mv">${esc(v("prM1V"))}</div><div class="mt">/ 10</div></div>
          <div class="pr-metric"><div class="ml">${esc(v("prM2L"))}</div><div class="mv">${esc(v("prM2V"))}</div><div class="mt">/ 10</div></div>
          <div class="pr-metric"><div class="ml">${esc(v("prM3L"))}</div><div class="mv">${esc(v("prM3V"))}</div><div class="mt">/ 10</div></div>
        </div>
      </div>
      <div class="pr-cols">
        <div class="pr-panel"><h4>Strengths</h4><ul>${strengths}</ul></div>
        <div class="pr-panel"><h4>Focus next</h4><ul>${focus}</ul></div>
      </div>
      <div class="pr-foot">
        <span>TFDEV · Parent Session Report · cream paper</span>
        <span>TFS Orange Kits · Video Analysis</span>
      </div>
    `;
  }

  function buildWhatsAppText() {
    const name = v("prName") || "Pemain";
    const score = v("prScore") || "—";
    const pill = v("prScorePill") || "";
    const strengths = lines("prStrengths").slice(0, 2);
    const focus = lines("prFocus").slice(0, 1);
    const bits = [
      "TFDEV · Laporan Sesi",
      name + (pill ? " · " + pill : ""),
      "Skor: " + score
    ];
    if (strengths.length) {
      bits.push("Kekuatan:");
      strengths.forEach((s) => bits.push("• " + s));
    }
    if (focus.length) bits.push("Fokus: " + focus[0]);
    bits.push(PAGES_URL + "#report");
    return bits.join("\n");
  }

  function shareWhatsApp() {
    const text = buildWhatsAppText();
    const url = "https://wa.me/?text=" + encodeURIComponent(text);
    window.open(url, "_blank", "noopener,noreferrer");
    if (window.TFDEV && window.TFDEV.toast) window.TFDEV.toast("WhatsApp ortu dibuka");
  }

  /** Apply parentReports[0] schema (optional matchCentre for session title / score). */
  function applyJson(report, matchCentre) {
    if (!report || typeof report !== "object") throw new Error("parent report kosong");

    const player = report.player || {};
    const metrics = Array.isArray(report.metrics) ? report.metrics : [];
    let strengths = Array.isArray(report.strengths) ? report.strengths.slice() : [];
    let focusAreas = Array.isArray(report.focusAreas) ? report.focusAreas.slice() : [];
    const bi = report.behaviorInsights || null;
    if (bi && typeof bi === "object") {
      if ((!report.sessionSummary || !String(report.sessionSummary).trim()) && bi.parentStory) {
        report = Object.assign({}, report, { sessionSummary: bi.parentStory });
      }
      if ((!report.coach || !report.coach.note) && Array.isArray(bi.coachCues) && bi.coachCues.length) {
        report = Object.assign({}, report, {
          coach: Object.assign({}, report.coach || {}, { note: bi.coachCues.filter(Boolean).join(" ") })
        });
      }
      if (strengths.length < 2 && Array.isArray(bi.keyBehaviors)) {
        bi.keyBehaviors.filter((k) => k && k.valence === "positive" && k.note).forEach((k) => {
          const line = (k.tag ? String(k.tag).toUpperCase() + ": " : "") + k.note;
          if (line && strengths.indexOf(line) < 0) strengths.push(line);
        });
      }
      if (focusAreas.length < 1 && Array.isArray(bi.keyBehaviors)) {
        bi.keyBehaviors.filter((k) => k && (k.valence === "coach" || k.valence === "caution")).forEach((k) => {
          focusAreas.push({ title: String(k.tag || "Fokus").toUpperCase(), desc: k.note || "" });
        });
      }
    }

    const metaBits = [];
    if (player.number || player.no) metaBits.push("#" + (player.number || player.no));
    if (player.position) metaBits.push(player.position);
    else if (player.ageGroup) metaBits.push(player.ageGroup);
    const meta = metaBits.length ? metaBits.join(" · ") : (player.ageGroup || "");

    let session = "Match Day";
    if (matchCentre && matchCentre.meta && matchCentre.meta.title) {
      session = "Match Day · " + matchCentre.meta.title;
    } else if (player.location) {
      session = player.location;
    }

    let scoreDisplay = report.overallScore != null ? String(report.overallScore) : "";
    let scorePill = report.scoreLabel || "";
    if (matchCentre && matchCentre.score) {
      scoreDisplay = (matchCentre.score.home ?? 0) + " – " + (matchCentre.score.away ?? 0);
      if (!scorePill && matchCentre.meta && matchCentre.meta.title) {
        const m = matchCentre.meta.title.match(/babak\s*\d+/i);
        scorePill = m ? m[0].toUpperCase() : (report.scoreLabel || "");
      }
    }

    const m1 = metrics[0] || {};
    const m2 = metrics[1] || {};
    const m3 = metrics[2] || {};

    const focusLines = focusAreas.map((f) => {
      if (typeof f === "string") return f;
      if (f.title && f.desc) return f.title + " — " + f.desc;
      return f.title || f.desc || "";
    }).filter(Boolean);

    set("prName", player.name || "");
    set("prMeta", meta);
    set("prDate", player.sessionDate || "");
    set("prSession", session);
    set("prScore", scoreDisplay);
    set("prScorePill", scorePill);
    set("prSummary", report.sessionSummary || (report.coach && report.coach.note) || "");
    set("prM1L", m1.label || "Work rate");
    set("prM1V", m1.value != null ? String(m1.value) : "");
    set("prM2L", m2.label || "Passing");
    set("prM2V", m2.value != null ? String(m2.value) : "");
    set("prM3L", m3.label || "Decision");
    set("prM3V", m3.value != null ? String(m3.value) : "");
    set("prStrengths", strengths.join("\n"));
    set("prFocus", focusLines.join("\n"));
    render();
  }

  window.TFDEV = window.TFDEV || {};
  window.ParentReport = {
    render: render,
    applyJson: applyJson,
    shareWhatsApp: shareWhatsApp,
    buildWhatsAppText: buildWhatsAppText
  };

  window.TFDEV.initReport = function () {
    document.querySelectorAll("#page-report input, #page-report textarea").forEach((el) => {
      el.addEventListener("input", render);
    });
    const printBtn = document.getElementById("prPrint");
    if (printBtn) {
      printBtn.addEventListener("click", () => {
        window.TFDEV.showPage("report");
        document.body.classList.add("print-report");
        document.body.classList.remove("print-matchcentre");
        setTimeout(() => window.print(), 120);
      });
    }
    const wa = document.getElementById("prWhatsApp");
    if (wa) wa.addEventListener("click", shareWhatsApp);
    window.addEventListener("afterprint", () => {
      document.body.classList.remove("print-report", "print-matchcentre");
    });
    render();
  };
})();
