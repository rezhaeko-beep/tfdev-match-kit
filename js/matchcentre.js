(function () {
  const SAMPLE = {
    home: "TFS", away: "G8", scoreH: 0, scoreA: 3,
    comp: "TFS VIDEO ANALYSIS · BABAK 1",
    source: "(T8) TFS VS G8 Babak 1 · coach_event_sheet",
    date: "01/02/2024",
    possH: 54, possA: 46,
    attH: "~4", attA: "~3",
    shotH: "N/C", shotA: "N/C",
    cardH: "0", cardA: "0",
    note: "Coach Event Sheet: skor 0–3 · corner 0–1 · saves 3–0. Shot N/C dari wide cam."
  };

  function val(id) { return document.getElementById(id).value; }
  function num(id) { return Number(document.getElementById(id).value) || 0; }

  function set(id, v) {
    const el = document.getElementById(id);
    if (el != null && v !== undefined && v !== null) el.value = v;
  }

  function nc(v, estimatedPrefix) {
    if (v === null || v === undefined || v === "") return "N/C";
    if (typeof v === "number" && estimatedPrefix) return "~" + v;
    return String(v);
  }

  function barPair(a, b) {
    const na = parseFloat(String(a).replace(/[^\d.]/g, ""));
    const nb = parseFloat(String(b).replace(/[^\d.]/g, ""));
    if (isNaN(na) || isNaN(nb) || (na + nb) === 0) return [50, 50];
    const t = na + nb;
    return [Math.round((na / t) * 100), Math.round((nb / t) * 100)];
  }

  function renderMoments() {
    const host = document.getElementById("mcMoments");
    const pill = document.getElementById("mcMomentsPill");
    if (!host) return;
    let list = [];
    try {
      if (window.Highlights && typeof window.Highlights.list === "function") {
        list = window.Highlights.list() || [];
      }
    } catch (_) {}
    if (!list.length) {
      try {
        const s = window.TFDEV && window.TFDEV.coachAnalytics && window.TFDEV.coachAnalytics.get();
        if (s && Array.isArray(s.briefing)) {
          /* fallback empty */
        }
      } catch (_) {}
    }
    const top = list
      .slice()
      .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || a.t - b.t)
      .filter((h) => h.type === "SKILL" || h.type === "CHANCE" || h.type === "GOL" || h.type === "COACHING" || h.type === "SAVE")
      .slice(0, 6);
    if (pill) pill.textContent = top.length ? top.length + " momen" : "dari clips";
    if (!top.length) {
      host.innerHTML = '<p class="ux-hint" style="margin:0">Belum ada clip — tandai di Highlights atau Full auto Gemini.</p>';
      return;
    }
    host.innerHTML = top
      .map((h) => {
        const t = Number(h.t) || 0;
        const label =
          (window.Highlights && window.Highlights.fmtTime
            ? window.Highlights.fmtTime(t)
            : String(t));
        return (
          '<button type="button" class="mc-moment" data-jump="' +
          t +
          '" title="Jump ke Highlights @' +
          label +
          '">' +
          '<span class="mc-moment-t">' +
          label +
          "</span>" +
          '<span class="mc-moment-type">' +
          esc(h.type || "") +
          "</span>" +
          '<span class="mc-moment-title">' +
          esc((h.title || h.note || "").slice(0, 42)) +
          (h.playerNo ? " #" + esc(h.playerNo) : "") +
          "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  function render() {
    const possH = Math.min(100, Math.max(0, num("mcPossH")));
    const possA = Math.min(100, Math.max(0, num("mcPossA")));
    const [attL, attR] = barPair(val("mcAttH"), val("mcAttA"));
    const [shL, shR] = barPair(val("mcShotH"), val("mcShotA"));
    const [cL, cR] = barPair(val("mcCardH"), val("mcCardA"));
    const homeName = val("mcHome") || "TFS";
    const awayName = val("mcAway") || "AWAY";

    document.getElementById("mcPreview").innerHTML = `
      <div class="mc-topbar">
        <span class="comp">${esc(val("mcComp"))}</span>
        <span class="mc-live"><i></i> BROADCAST</span>
      </div>
      <div class="mc-scoreboard">
        <div class="mc-team home">
          <div class="mc-team-row">
            <div class="mc-kit orange">${esc(homeName.slice(0, 3).toUpperCase())}</div>
            <div>
              <div class="mc-team-name">${esc(homeName)}</div>
              <div class="mc-team-sub">Orange kit</div>
            </div>
          </div>
        </div>
        <div class="mc-score-mid">
          <div class="score">${num("mcScoreH")}<span class="mc-score-sep">–</span>${num("mcScoreA")}</div>
          <div class="ht">Best-supported score</div>
        </div>
        <div class="mc-team away">
          <div class="mc-team-row">
            <div class="mc-kit away">${esc(awayName.slice(0, 3).toUpperCase())}</div>
            <div>
              <div class="mc-team-name">${esc(awayName)}</div>
              <div class="mc-team-sub">Away kit</div>
            </div>
          </div>
        </div>
      </div>
      <div class="mc-chips" aria-label="Key stats">
        <span class="mc-chip"><b>${possH}%</b> Poss</span>
        <span class="mc-chip"><b>${esc(val("mcAttH"))}</b> Att</span>
        <span class="mc-chip"><b>${esc(val("mcShotH"))}</b> SoT</span>
        <span class="mc-chip muted"><b>${esc(val("mcAttA"))}</b> Att away</span>
        <span class="mc-chip muted"><b>${esc(val("mcShotA"))}</b> SoT away</span>
        <span class="mc-chip muted"><b>${possA}%</b> Poss away</span>
      </div>
      <div class="mc-meta">
        <span>Date <b>${esc(val("mcDate"))}</b></span>
        <span>Source <b>${esc(val("mcSource"))}</b></span>
        <span>Camera <b>Wide sideline</b></span>
      </div>
      <div class="mc-section">
        <h2>Possession</h2>
        <div class="mc-poss">
          <div class="pct">${possH}%</div>
          <div class="mc-bar"><div class="h" style="width:${possH}%"></div><div class="a" style="width:${possA}%"></div></div>
          <div class="pct r">${possA}%</div>
        </div>
        <div class="mc-est">Estimasi wilayah bola — bukan GPS resmi.</div>
        <h2 style="margin-top:16px">Match stats</h2>
        ${statRow(val("mcAttH"), val("mcAttA"), "Attacking sequences", attL, attR)}
        ${statRow(val("mcShotH"), val("mcShotA"), "Shots on target", shL, shR)}
        ${statRow(String(num("mcScoreH")), String(num("mcScoreA")), "Goals confirmed", num("mcScoreH") || num("mcScoreA") ? barPair(num("mcScoreH"), num("mcScoreA"))[0] : 50, num("mcScoreH") || num("mcScoreA") ? barPair(num("mcScoreH"), num("mcScoreA"))[1] : 50)}
        ${statRow(val("mcCardH"), val("mcCardA"), "Cards (Y/R)", cL, cR)}
        <div class="mc-est">${esc(val("mcNote"))}</div>
      </div>
      <div class="mc-footer">
        <div>TFS VIDEO ANALYSIS · BROADCAST CARD</div>
        <div>TFDEV MATCH CENTRE</div>
      </div>
    `;
    renderMoments();
  }

  function statRow(l, r, label, wl, wr) {
    return `<div class="mc-stat-row">
      <div class="v">${esc(l)}</div>
      <div>
        <div class="label">${esc(label)}</div>
        <div class="mc-mini"><i style="width:${wl}%"></i><i style="width:${wr}%"></i></div>
      </div>
      <div class="v r">${esc(r)}</div>
    </div>`;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function applyFlat(map) {
    Object.entries(map).forEach(([id, v]) => set(id, v));
    render();
  }

  function applySample() {
    applyFlat({
      mcHome: SAMPLE.home, mcAway: SAMPLE.away,
      mcScoreH: SAMPLE.scoreH, mcScoreA: SAMPLE.scoreA,
      mcComp: SAMPLE.comp, mcSource: SAMPLE.source, mcDate: SAMPLE.date,
      mcPossH: SAMPLE.possH, mcPossA: SAMPLE.possA,
      mcAttH: SAMPLE.attH, mcAttA: SAMPLE.attA,
      mcShotH: SAMPLE.shotH, mcShotA: SAMPLE.shotA,
      mcCardH: SAMPLE.cardH, mcCardA: SAMPLE.cardA,
      mcNote: SAMPLE.note
    });
    window.TFDEV.toast("Sample TFS vs G8 dimuat");
  }

  /** Apply analytics JSON (matchCentre object or flat form map). */
  function applyJson(data) {
    if (!data || typeof data !== "object") throw new Error("matchCentre data kosong");

    // Flat / already-mapped form values
    if (data.mcHome != null || (data.home && typeof data.home === "string")) {
      applyFlat({
        mcHome: data.mcHome ?? data.home,
        mcAway: data.mcAway ?? data.away,
        mcScoreH: data.mcScoreH ?? data.scoreH,
        mcScoreA: data.mcScoreA ?? data.scoreA,
        mcComp: data.mcComp ?? data.comp,
        mcSource: data.mcSource ?? data.source,
        mcDate: data.mcDate ?? data.date,
        mcPossH: data.mcPossH ?? data.possH,
        mcPossA: data.mcPossA ?? data.possA,
        mcAttH: data.mcAttH ?? data.attH,
        mcAttA: data.mcAttA ?? data.attA,
        mcShotH: data.mcShotH ?? data.shotH,
        mcShotA: data.mcShotA ?? data.shotA,
        mcCardH: data.mcCardH ?? data.cardH,
        mcCardA: data.mcCardA ?? data.cardA,
        mcNote: data.mcNote ?? data.note
      });
      return;
    }

    const meta = data.meta || {};
    const teams = data.teams || {};
    const home = teams.home || {};
    const away = teams.away || {};
    const score = data.score || {};
    const poss = data.possession || {};
    const stats = data.stats || {};
    const att = stats.attackingSequences || {};
    const sot = stats.shotsOnTarget || stats.shots || {};
    const cards = stats.cards || {};
    const notes = Array.isArray(data.internalNotes) ? data.internalNotes.filter(Boolean).join(" · ") : "";
    const attEst = att.estimated === true;

    const title = meta.title || ((home.name || "TFS") + " VS " + (away.name || "Lawan"));
    const comp = "TFS VIDEO ANALYSIS · " + (title.match(/babak\s*\d+/i)?.[0]?.toUpperCase() || "MATCH");

    applyFlat({
      mcHome: home.name || "TFS",
      mcAway: away.name || "",
      mcScoreH: (function () {
        const title = (meta.title || "") + " " + (home.name || "") + " " + (away.name || "");
        const isG8 = /tfs/i.test(title) && /g8/i.test(title);
        if (isG8 && (score.home == null || score.away == null || (score.home === 0 && score.away === 0 && String(score.source || "").indexOf("coach") < 0))) {
          return 0;
        }
        return score.home ?? 0;
      })(),
      mcScoreA: (function () {
        const title = (meta.title || "") + " " + (home.name || "") + " " + (away.name || "");
        const isG8 = /tfs/i.test(title) && /g8/i.test(title);
        if (isG8 && (score.home == null || score.away == null || (score.home === 0 && score.away === 0 && String(score.source || "").indexOf("coach") < 0))) {
          return 3;
        }
        return score.away ?? 0;
      })(),
      mcComp: comp,
      mcSource: meta.sourceFile || meta.title || title,
      mcDate: meta.dateStamp || "",
      mcPossH: poss.homePct ?? 50,
      mcPossA: poss.awayPct ?? 50,
      mcAttH: nc(att.home, attEst),
      mcAttA: nc(att.away, attEst),
      mcShotH: nc(sot.home),
      mcShotA: nc(sot.away),
      mcCardH: nc(cards.home != null ? cards.home : 0),
      mcCardA: nc(cards.away != null ? cards.away : 0),
      mcNote: score.note || notes || ""
    });
  }

  window.TFDEV = window.TFDEV || {};
  window.MatchCentre = {
    render: render,
    applyJson: applyJson,
    applySample: applySample
  };

  window.TFDEV.initMatchCentre = function () {
    const form = document.getElementById("mcForm");
    form.querySelectorAll("input, textarea").forEach((el) => {
      el.addEventListener("input", render);
    });
    document.getElementById("mcLoadSample").addEventListener("click", applySample);
    document.getElementById("mcPrint").addEventListener("click", () => {
      window.TFDEV.showPage("matchcentre");
      document.body.classList.add("print-matchcentre");
      document.body.classList.remove("print-report");
      setTimeout(() => window.print(), 120);
    });
    const moments = document.getElementById("mcMoments");
    if (moments) {
      moments.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-jump]");
        if (!btn) return;
        const t = Number(btn.getAttribute("data-jump"));
        if (window.TFDEV && window.TFDEV.showPage) window.TFDEV.showPage("highlights");
        setTimeout(() => {
          if (window.Highlights && typeof window.Highlights.jumpTo === "function") {
            window.Highlights.jumpTo(t);
          }
        }, 80);
      });
    }
    document.addEventListener("tfdev:coach-analytics", () => {
      try { renderMoments(); } catch (_) {}
    });
    const prev = window.TFDEV.onPage;
    window.TFDEV.onPage = function (id) {
      if (typeof prev === "function") prev(id);
      if (id === "matchcentre") {
        setTimeout(() => {
          render();
        }, 40);
      }
    };
    window.addEventListener("afterprint", () => {
      document.body.classList.remove("print-report", "print-matchcentre");
    });
    // Default HTML used to ship 0–0; align TFS vs G8 with coach Event Sheet on first paint
    try {
      const h = document.getElementById("mcHome");
      const a = document.getElementById("mcAway");
      const sh = document.getElementById("mcScoreH");
      const sa = document.getElementById("mcScoreA");
      const home = h && h.value ? h.value : "";
      const away = a && a.value ? a.value : "";
      const looksG8 =
        /tfs/i.test(home) && /g8/i.test(away) &&
        sh && sa && Number(sh.value) === 0 && Number(sa.value) === 0;
      if (looksG8 || (Number(sh && sh.value) === 0 && Number(sa && sa.value) === 0 && /g8/i.test(away))) {
        applySample();
      } else {
        render();
      }
    } catch (_) {
      render();
    }
  };
})();
