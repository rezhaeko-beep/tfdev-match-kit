(function () {
  const SAMPLE = {
    home: "TFS", away: "G8", scoreH: 0, scoreA: 0,
    comp: "TFS VIDEO ANALYSIS · BABAK 1",
    source: "(T8) TFS VS G8 Babak 1",
    date: "01/02/2024",
    possH: 54, possA: 46,
    attH: "~4", attA: "~3",
    shotH: "N/C", shotA: "N/C",
    cardH: "0", cardA: "0",
    note: "Estimasi dari footage wide sideline. Shot/corner N/C jika tidak terkonfirmasi."
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

  function render() {
    const possH = Math.min(100, Math.max(0, num("mcPossH")));
    const possA = Math.min(100, Math.max(0, num("mcPossA")));
    const [attL, attR] = barPair(val("mcAttH"), val("mcAttA"));
    const [shL, shR] = barPair(val("mcShotH"), val("mcShotA"));
    const [cL, cR] = barPair(val("mcCardH"), val("mcCardA"));

    document.getElementById("mcPreview").innerHTML = `
      <div class="mc-topbar">
        <span class="comp">${esc(val("mcComp"))}</span>
        <span class="pill">LIVE CARD</span>
      </div>
      <div class="mc-scoreboard">
        <div class="mc-team home">
          <div class="mc-team-row">
            <div class="mc-kit orange">${esc(val("mcHome").slice(0, 3).toUpperCase())}</div>
            <div>
              <div class="mc-team-name">${esc(val("mcHome"))}</div>
              <div class="mc-team-sub">Orange kit</div>
            </div>
          </div>
        </div>
        <div class="mc-score-mid">
          <div class="score">${num("mcScoreH")} – ${num("mcScoreA")}</div>
          <div class="ht">Best-supported score</div>
        </div>
        <div class="mc-team away">
          <div class="mc-team-row">
            <div class="mc-kit away">${esc(val("mcAway").slice(0, 3).toUpperCase())}</div>
            <div>
              <div class="mc-team-name">${esc(val("mcAway"))}</div>
              <div class="mc-team-sub">Away kit</div>
            </div>
          </div>
        </div>
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
        <div>TFS VIDEO ANALYSIS · MATCH STATS</div>
        <div>TFDEV ANALITIK</div>
      </div>
    `;
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
      mcScoreH: score.home ?? 0,
      mcScoreA: score.away ?? 0,
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
      setTimeout(() => window.print(), 100);
    });
    render();
  };
})();
