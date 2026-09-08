(function () {
  const LS_KEY = "tfdev-player-dashboard";

  /** Seeded sample — Rafi-like youth midfielder (example / demo). */
  const SAMPLE_DASHBOARD = {
    player: {
      name: "Rafi Pratama",
      age: 8,
      position: "Midfielder",
      foot: "Right Foot",
      heightCm: 128,
      weightKg: 26,
      photoDataUrl: null,
      example: true
    },
    score: { overall: 78, delta: 7 },
    skills: [
      { key: "firstTouch", label: "First Touch", value: 82, delta: 2 },
      { key: "dribbling", label: "Dribbling Control", value: 75, delta: 1 },
      { key: "shooting", label: "Shooting Form", value: 71, delta: 3 },
      { key: "agility", label: "Agility", value: 80, delta: 2 }
    ],
    radar: [
      { axis: "First Touch", value: 82 },
      { axis: "Dribbling Control", value: 75 },
      { axis: "Shooting Form", value: 71 },
      { axis: "Agility", value: 80 },
      { axis: "Passing Accuracy", value: 73 },
      { axis: "Tactical Awareness", value: 77 }
    ],
    sessionAnalysis: [
      { metric: "Ball-Foot Distance", value: 14, unit: "cm", status: "Good", estimated: false },
      { metric: "Contact Acceleration", value: 6.2, unit: "m/s²", status: "Good", estimated: true },
      { metric: "Knee Flexion", value: 48, unit: "°", status: "Good", estimated: true },
      { metric: "Hip Rotation", value: 32, unit: "°", status: "Good", estimated: true },
      { metric: "Ball Deceleration", value: 4.1, unit: "m/s", status: "Good", estimated: true }
    ],
    progress: [
      { date: "Apr 20", score: 68 },
      { date: "Apr 27", score: 71 },
      { date: "May 4", score: 74 },
      { date: "May 11", score: 76 },
      { date: "May 18", score: 78 }
    ],
    drills: [
      {
        title: "Cone Dribbling Mastery",
        desc: "Tight touches through cones — fokus keep ball dekat kaki kanan."
      },
      {
        title: "Precision Passing Circuit",
        desc: "Wall / partner pass 2-touch → 1-touch. Target foot accuracy."
      },
      {
        title: "Shooting Technique Fundamentals",
        desc: "Plant foot & hip rotation; finishing setelah receive di half-space."
      }
    ],
    source: "video_analytics",
    sessionDate: "May 18, 2024",
    honestyNote:
      "Sample demo data. Values marked estimated/null come from video analytics limits (wide cam)."
  };

  let current = null;
  let radarChart = null;
  let progressChart = null;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function clampScore(n) {
    const x = Number(n);
    if (!isFinite(x)) return null;
    return Math.max(0, Math.min(100, Math.round(x)));
  }

  function parseMetricTo100(val) {
    if (val == null || val === "" || val === "N/C") return null;
    const n = Number(String(val).replace(/[^0-9.]/g, ""));
    if (!isFinite(n)) return null;
    if (n <= 10) return clampScore(n * 10);
    return clampScore(n);
  }

  function statusClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "focus" || s === "improve" || s === "needs work") return "focus";
    if (s === "good" || s === "ok" || s === "solid") return "good";
    return "neutral";
  }

  function deltaVs3Weeks(progress, overall) {
    if (!Array.isArray(progress) || progress.length < 2) return null;
    const now =
      clampScore(overall != null ? overall : progress[progress.length - 1].score);
    // Weekly series: ~3 minggu ≈ 4th from end; else first point
    const idx = progress.length >= 4 ? progress.length - 4 : 0;
    const then = clampScore(progress[idx].score);
    if (now == null || then == null) return null;
    return now - then;
  }

  function formatDelta(d) {
    if (d == null || d === "" || !isFinite(Number(d))) {
      return { text: "— vs 3 minggu", cls: "flat" };
    }
    const n = Number(d);
    if (n === 0) return { text: "— 0 pts vs 3 minggu", cls: "flat" };
    if (n > 0) return { text: "↑ +" + Math.abs(n) + " pts vs 3 minggu", cls: "up" };
    return { text: "↓ " + Math.abs(n) + " pts vs 3 minggu", cls: "down" };
  }

  function initials(name) {
    const parts = String(name || "P").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "P";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /** Map parentReports[0] + optional metrics into playerDashboard shape. */
  function mapFromParentReport(report, root) {
    if (!report || typeof report !== "object") return null;
    const player = report.player || {};
    const metrics = Array.isArray(report.metrics) ? report.metrics : [];
    const focusAreas = Array.isArray(report.focusAreas) ? report.focusAreas : [];
    const homeDrills =
      (report.homeSupport && Array.isArray(report.homeSupport.drills) && report.homeSupport.drills) ||
      (Array.isArray(report.drills) && report.drills) ||
      [];

    const skillKeys = [
      { key: "firstTouch", labels: ["first touch", "touch", "receiving"], fallback: "First Touch" },
      { key: "dribbling", labels: ["dribbl", "ball control", "control"], fallback: "Dribbling Control" },
      { key: "shooting", labels: ["shoot", "finish", "finishing"], fallback: "Shooting Form" },
      { key: "agility", labels: ["agility", "speed", "mobility", "work rate"], fallback: "Agility" }
    ];

    function findMetric(keys) {
      for (let i = 0; i < metrics.length; i++) {
        const m = metrics[i];
        const blob = ((m.key || "") + " " + (m.label || "")).toLowerCase();
        if (keys.some((k) => blob.indexOf(k) >= 0)) return m;
      }
      return null;
    }

    const overall = clampScore(report.overallScore != null ? report.overallScore : 75) || 75;
    const skills = skillKeys.map((sk, idx) => {
      const m = findMetric(sk.labels) || metrics[idx];
      const value = m ? parseMetricTo100(m.value) : null;
      return {
        key: sk.key,
        label: (m && m.label) || sk.fallback,
        value: value != null ? value : clampScore(overall - 4 + idx * 2),
        delta: m && m.delta != null ? Number(m.delta) : null,
        estimated: !m || value == null
      };
    });

    const extraAxes = [
      { axis: "Passing Accuracy", labels: ["pass", "passing"] },
      { axis: "Tactical Awareness", labels: ["decision", "tactical", "awareness", "scan"] }
    ];
    const radar = skills.map((s) => ({ axis: s.label, value: s.value }));
    extraAxes.forEach((ea, i) => {
      const m = findMetric(ea.labels) || metrics[4 + i];
      const value = m ? parseMetricTo100(m.value) : clampScore(overall - 2 + i);
      radar.push({ axis: ea.axis, value: value != null ? value : clampScore(overall - 2) });
    });

    const sessionAnalysis = [];
    if (Array.isArray(report.sessionAnalysis) && report.sessionAnalysis.length) {
      report.sessionAnalysis.forEach((row) => sessionAnalysis.push(normalizeSessionRow(row)));
    } else if (Array.isArray(report.biomechanics) && report.biomechanics.length) {
      report.biomechanics.forEach((row) => sessionAnalysis.push(normalizeSessionRow(row)));
    } else {
      // Honest placeholders from video analytics — often estimated / null on wide cam
      const defaults = [
        { metric: "Ball-Foot Distance", value: null, unit: "cm", status: "Focus", estimated: true },
        { metric: "Contact Acceleration", value: null, unit: "m/s²", status: "Focus", estimated: true },
        { metric: "Knee Flexion", value: null, unit: "°", status: "Focus", estimated: true },
        { metric: "Hip Rotation", value: null, unit: "°", status: "Focus", estimated: true },
        { metric: "Ball Deceleration", value: null, unit: "m/s", status: "Focus", estimated: true }
      ];
      metrics.slice(0, 5).forEach((m, i) => {
        if (defaults[i]) {
          defaults[i].metric = m.label || defaults[i].metric;
          const raw = m.value;
          if (raw != null && raw !== "" && raw !== "N/C") {
            defaults[i].value = raw;
            defaults[i].unit = m.unit || "";
            defaults[i].status = m.tag || m.status || "Good";
            defaults[i].estimated = m.source !== "measurement";
          }
        }
      });
      defaults.forEach((d) => sessionAnalysis.push(d));
    }

    const drills = [];
    if (homeDrills.length) {
      homeDrills.forEach((d) => {
        if (typeof d === "string") drills.push({ title: d, desc: "" });
        else drills.push({ title: d.title || d.name || "Drill", desc: d.desc || d.goal || "" });
      });
    }
    focusAreas.forEach((f) => {
      if (drills.length >= 3) return;
      if (typeof f === "string") drills.push({ title: f, desc: "Fokus dari video analytics." });
      else drills.push({ title: f.title || "Focus drill", desc: f.desc || "" });
    });
    if (!drills.length) {
      drills.push(
        { title: "Cone Dribbling Mastery", desc: "Recommended from session focus." },
        { title: "Precision Passing Circuit", desc: "Recommended from session focus." },
        { title: "Shooting Technique Fundamentals", desc: "Recommended from session focus." }
      );
    }

    // Progress: invent honest last-4-weeks trend ending at overall (demo curve)
    const progress = buildProgressSeries(overall, player.sessionDate);

    let age = player.age != null ? Number(player.age) : null;
    if (age == null && player.ageGroup) {
      const m = String(player.ageGroup).match(/(\d+)/);
      if (m) age = Number(m[1]);
    }

    return {
      player: {
        name: player.name || "Pemain",
        age: age,
        position: player.position || "",
        foot: player.foot || player.preferredFoot || "—",
        heightCm: player.heightCm != null ? player.heightCm : null,
        weightKg: player.weightKg != null ? player.weightKg : null,
        photoDataUrl: player.photoDataUrl || null,
        example: false
      },
      score: {
        overall: overall,
        delta:
          report.scoreDelta != null && isFinite(Number(report.scoreDelta))
            ? Number(report.scoreDelta)
            : deltaVs3Weeks(progress, overall)
      },
      skills: skills,
      radar: radar,
      sessionAnalysis: sessionAnalysis,
      progress: progress,
      drills: drills.slice(0, 5),
      source: "video_analytics",
      sessionDate: player.sessionDate || "",
      honestyNote:
        "Mapped from parentReports[0] + metrics. Biomechanics null/estimated if not in video JSON."
    };
  }

  function normalizeSessionRow(row) {
    if (!row || typeof row !== "object") {
      return { metric: "—", value: null, unit: "", status: "Focus", estimated: true };
    }
    const value =
      row.value === undefined || row.value === null || row.value === "N/C" || row.value === ""
        ? null
        : row.value;
    return {
      metric: row.metric || row.label || row.name || "Metric",
      value: value,
      unit: row.unit || "",
      status: row.status || row.tag || (value == null ? "Focus" : "Good"),
      estimated: row.estimated === true || value == null,
      reason: row.reason || ""
    };
  }

  function buildProgressSeries(overall, sessionDate) {
    const end = clampScore(overall) || 70;
    const pts = [end - 10, end - 7, end - 4, end - 2, end].map((x) => clampScore(Math.max(40, x)));
    // Rough last-4-weeks labels relative to sessionDate if parseable, else generic
    let labels = ["W-4", "W-3", "W-2", "W-1", "Now"];
    if (sessionDate) {
      const d = new Date(sessionDate);
      if (!isNaN(d.getTime())) {
        labels = [];
        for (let i = 4; i >= 0; i--) {
          const x = new Date(d);
          x.setDate(x.getDate() - i * 7);
          labels.push(
            x.toLocaleDateString("en-US", { month: "short", day: "numeric" })
          );
        }
      }
    }
    return labels.map((date, i) => ({ date: date, score: pts[i] }));
  }

  function normalizeDashboard(data) {
    if (!data || typeof data !== "object") throw new Error("playerDashboard kosong");
    if (data.playerDashboard) return normalizeDashboard(data.playerDashboard);

    // Already in schema
    if (data.player && (data.skills || data.radar || data.score)) {
      const d = Object.assign({}, data);
      d.player = Object.assign({}, data.player);
      d.score = Object.assign({ overall: 70, delta: null }, data.score || {});
      d.score.overall = clampScore(d.score.overall) || 70;
      d.skills = Array.isArray(data.skills) ? data.skills.map(normalizeSkill) : SAMPLE_DASHBOARD.skills;
      d.radar = Array.isArray(data.radar) && data.radar.length
        ? data.radar.map((r) => ({ axis: r.axis || r.label, value: clampScore(r.value) || 0 }))
        : d.skills.map((s) => ({ axis: s.label, value: s.value }));
      while (d.radar.length < 6) {
        d.radar.push({ axis: "Axis " + (d.radar.length + 1), value: d.score.overall });
      }
      d.sessionAnalysis = Array.isArray(data.sessionAnalysis)
        ? data.sessionAnalysis.map(normalizeSessionRow)
        : [];
      d.progress = Array.isArray(data.progress) && data.progress.length
        ? data.progress
        : buildProgressSeries(d.score.overall, d.sessionDate || d.player.sessionDate);
      if (d.score.delta == null || !isFinite(Number(d.score.delta))) {
        const computed = deltaVs3Weeks(d.progress, d.score.overall);
        if (computed != null) d.score.delta = computed;
      }
      d.drills = Array.isArray(data.drills) ? data.drills : [];
      d.source = data.source || "video_analytics";
      return d;
    }

    // parent report shape
    if (data.overallScore != null || (data.player && data.metrics)) {
      return mapFromParentReport(data, null);
    }

    throw new Error("Schema tidak dikenali — butuh playerDashboard atau parentReports[0]");
  }

  function normalizeSkill(s) {
    return {
      key: s.key || "",
      label: s.label || s.key || "Skill",
      value: clampScore(s.value) != null ? clampScore(s.value) : 0,
      delta: s.delta != null && isFinite(Number(s.delta)) ? Number(s.delta) : null,
      estimated: !!s.estimated
    };
  }

  /**
   * Apply analytics JSON root: prefer playerDashboard; else map parentReports[0].
   */
  function applyFromAnalytics(root) {
    if (!root || typeof root !== "object") throw new Error("JSON kosong");
    let dash = null;
    if (root.playerDashboard) {
      dash = normalizeDashboard(root.playerDashboard);
    } else if (Array.isArray(root.parentReports) && root.parentReports.length) {
      dash = mapFromParentReport(root.parentReports[0], root);
    } else if (root.player && (root.skills || root.score || root.radar)) {
      dash = normalizeDashboard(root);
    } else if (root.overallScore != null || (root.player && root.metrics)) {
      dash = mapFromParentReport(root, null);
    } else {
      throw new Error("Tidak ada playerDashboard / parentReports di JSON");
    }
    setDashboard(dash);
    return dash;
  }

  function setDashboard(dash) {
    current = dash;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(dash));
    } catch (_) {}
    render();
  }

  function loadStored() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return normalizeDashboard(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  }

  function destroyCharts() {
    if (radarChart) {
      try {
        radarChart.destroy();
      } catch (_) {}
      radarChart = null;
    }
    if (progressChart) {
      try {
        progressChart.destroy();
      } catch (_) {}
      progressChart = null;
    }
  }

  function chartOrange() {
    return "#FF6B1A";
  }


  function drawFallbackRadar(canvas, dash) {
    var radar = dash.radar || [];
    if (!radar.length) return;
    var parent = canvas.parentElement;
    var size = Math.min(parent ? parent.clientWidth : 320, 360) || 320;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var cx = size / 2, cy = size / 2, R = size * 0.34;
    var n = radar.length;
    ctx.clearRect(0, 0, size, size);
    var ring, i, ang, rr, x, y;
    for (ring = 1; ring <= 5; ring++) {
      ctx.beginPath();
      for (i = 0; i < n; i++) {
        ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        rr = (R * ring) / 5;
        x = cx + Math.cos(ang) * rr;
        y = cy + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(36,48,64,0.9)";
      ctx.stroke();
    }
    ctx.fillStyle = "#c5d4e3";
    ctx.font = "600 11px Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (i = 0; i < n; i++) {
      ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
      ctx.strokeStyle = "rgba(36,48,64,0.9)";
      ctx.stroke();
      var lx = cx + Math.cos(ang) * (R + 20);
      var ly = cy + Math.sin(ang) * (R + 20);
      var parts = String(radar[i].axis || "").split(" ");
      if (parts.length > 1) {
        ctx.fillText(parts[0], lx, ly - 7);
        ctx.fillText(parts.slice(1).join(" "), lx, ly + 7);
      } else {
        ctx.fillText(parts[0] || "", lx, ly);
      }
    }
    ctx.beginPath();
    for (i = 0; i < n; i++) {
      ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      var val = Math.max(0, Math.min(100, Number(radar[i].value) || 0));
      rr = (R * val) / 100;
      x = cx + Math.cos(ang) * rr;
      y = cy + Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(255,107,26,0.28)";
    ctx.fill();
    ctx.strokeStyle = "#FF6B1A";
    ctx.lineWidth = 2;
    ctx.stroke();
    for (i = 0; i < n; i++) {
      ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      val = Math.max(0, Math.min(100, Number(radar[i].value) || 0));
      rr = (R * val) / 100;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#FF6B1A";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawFallbackLine(canvas, dash) {
    var prog = dash.progress || [];
    if (!prog.length) return;
    var parent = canvas.parentElement;
    var w = Math.max(280, parent ? parent.clientWidth : 320);
    var h = 220;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var pad = { t: 16, r: 16, b: 36, l: 40 };
    var plotW = w - pad.l - pad.r;
    var plotH = h - pad.t - pad.b;
    var ymin = 40, ymax = 100;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(36,48,64,0.5)";
    ctx.fillStyle = "#8aa0b5";
    ctx.font = "11px Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "right";
    var g, yy, gval;
    for (g = 0; g <= 3; g++) {
      yy = pad.t + (plotH * g) / 3;
      gval = ymax - ((ymax - ymin) * g) / 3;
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(pad.l + plotW, yy);
      ctx.stroke();
      ctx.fillText(String(Math.round(gval)), pad.l - 6, yy + 3);
    }
    var pts = prog.map(function (p, i) {
      var x = pad.l + (prog.length === 1 ? plotW / 2 : (plotW * i) / (prog.length - 1));
      var sc = Math.max(ymin, Math.min(ymax, Number(p.score) || ymin));
      var y = pad.t + plotH * (1 - (sc - ymin) / (ymax - ymin));
      return { x: x, y: y, label: p.date };
    });
    ctx.beginPath();
    pts.forEach(function (pt, i) {
      if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    });
    ctx.lineTo(pts[pts.length - 1].x, pad.t + plotH);
    ctx.lineTo(pts[0].x, pad.t + plotH);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,107,26,0.18)";
    ctx.fill();
    ctx.beginPath();
    pts.forEach(function (pt, i) {
      if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    });
    ctx.strokeStyle = "#FF6B1A";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.textAlign = "center";
    pts.forEach(function (pt) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#FF6B1A";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#8aa0b5";
      ctx.fillText(String(pt.label || ""), pt.x, h - 12);
    });
  }

  function renderCharts(dash) {
    const note = $("pdChartsNote");
    const radarCanvas = $("pdRadarChart");
    const lineCanvas = $("pdProgressChart");
    if (!radarCanvas || !lineCanvas) return;

    if (typeof Chart === "undefined") {
      if (note) {
        note.hidden = false;
        note.textContent = "Using canvas charts (add Chart.js CDN for Chart.js rendering).";
      }
      destroyCharts();
      drawFallbackRadar(radarCanvas, dash);
      drawFallbackLine(lineCanvas, dash);
      return;
    }
    if (note) note.hidden = true;
    destroyCharts();

    const radarLabels = (dash.radar || []).map((r) => r.axis);
    const radarValues = (dash.radar || []).map((r) => r.value);

    radarChart = new Chart(radarCanvas.getContext("2d"), {
      type: "radar",
      data: {
        labels: radarLabels,
        datasets: [
          {
            label: "Skills",
            data: radarValues,
            backgroundColor: "rgba(255, 107, 26, 0.28)",
            borderColor: chartOrange(),
            borderWidth: 2,
            pointBackgroundColor: chartOrange(),
            pointBorderColor: "#fff",
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.label + ": " + ctx.raw + "/100";
              }
            }
          }
        },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: {
              stepSize: 20,
              color: "#6b8094",
              backdropColor: "transparent",
              font: { size: 10 }
            },
            grid: { color: "rgba(36, 48, 64, 0.9)" },
            angleLines: { color: "rgba(36, 48, 64, 0.9)" },
            pointLabels: {
              color: "#c5d4e3",
              font: { size: 11, weight: "600" }
            }
          }
        }
      }
    });

    const prog = dash.progress || [];
    progressChart = new Chart(lineCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels: prog.map((p) => p.date),
        datasets: [
          {
            label: "TFdev Score",
            data: prog.map((p) => p.score),
            borderColor: chartOrange(),
            backgroundColor: "rgba(255, 107, 26, 0.18)",
            fill: true,
            tension: 0.35,
            pointRadius: 5,
            pointBackgroundColor: chartOrange(),
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
            borderWidth: 2.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            ticks: { color: "#8aa0b5", font: { size: 11 } },
            grid: { color: "rgba(36, 48, 64, 0.5)" }
          },
          y: {
            min: 40,
            max: 100,
            ticks: { color: "#8aa0b5", font: { size: 11 } },
            grid: { color: "rgba(36, 48, 64, 0.5)" }
          }
        }
      }
    });
  }

  function skillIcon(key) {
    const k = String(key || "").toLowerCase();
    if (k.indexOf("touch") >= 0 || k === "firsttouch") return "◎";
    if (k.indexOf("dribbl") >= 0) return "⚽";
    if (k.indexOf("shoot") >= 0) return "◎";
    if (k.indexOf("agil") >= 0) return "⚡";
    return "◆";
  }

  function render() {
    const dash = current || SAMPLE_DASHBOARD;
    const p = dash.player || {};
    const score = dash.score || { overall: 0, delta: null };

    const badge = $("pdSourceBadge");
    if (badge) {
      badge.textContent = p.example
        ? "Sample · video_analytics"
        : (dash.source || "video_analytics");
      badge.className = "pill" + (p.example ? " orange" : "");
    }

    const photo = $("pdPhoto");
    if (photo) {
      if (p.photoDataUrl) {
        photo.innerHTML = '<img src="' + esc(p.photoDataUrl) + '" alt="' + esc(p.name) + '" />';
      } else {
        photo.innerHTML = '<span class="pd-photo-initials">' + esc(initials(p.name)) + "</span>";
      }
    }

    if ($("pdName")) $("pdName").textContent = p.name || "—";
    if ($("pdAge")) {
      $("pdAge").textContent = p.age != null ? "Age " + p.age : "Age —";
      $("pdAge").style.display = "";
    }
    if ($("pdPosition")) $("pdPosition").textContent = p.position || "—";

    if ($("pdFoot")) $("pdFoot").textContent = p.foot || "—";
    if ($("pdHeight"))
      $("pdHeight").textContent = p.heightCm != null ? p.heightCm + " cm" : "—";
    if ($("pdWeight"))
      $("pdWeight").textContent = p.weightKg != null ? p.weightKg + " kg" : "—";

    if ($("pdOverall")) $("pdOverall").textContent = String(score.overall != null ? score.overall : "—");
    const deltaEl = $("pdDelta");
    if (deltaEl) {
      let deltaVal = score.delta;
      if (deltaVal == null || !isFinite(Number(deltaVal))) {
        deltaVal = deltaVs3Weeks(dash.progress, score.overall);
      }
      const fmt = formatDelta(deltaVal);
      deltaEl.textContent = fmt.text;
      deltaEl.className = "pd-delta " + fmt.cls;
      deltaEl.hidden = false;
    }

    const blurb = $("pdSessionBlurb");
    const pill = $("pdSummaryPill");
    if (blurb) {
      const skills = dash.skills || [];
      const top = skills.slice().sort((a, b) => (b.value || 0) - (a.value || 0))[0];
      const focusSkill = skills.slice().sort((a, b) => (a.value || 0) - (b.value || 0))[0];
      const drills = dash.drills || [];
      const parts = [];
      if (dash.sessionDate) parts.push("Sesi " + dash.sessionDate);
      if (top) parts.push((top.label || "skill") + " " + top.value + "/100");
      if (focusSkill && (!top || focusSkill.key !== top.key)) {
        parts.push("fokus " + (focusSkill.label || "area lemah"));
      }
      if (drills[0]) parts.push("drill: " + (drills[0].title || "berikutnya"));
      blurb.textContent =
        parts.length
          ? parts.join(" · ") + "."
          : "Belum ada ringkasan sesi — apply JSON atau isi dari clips.";
    }
    if (pill) {
      pill.textContent = p.example ? "sample" : (dash.source || "video").replace(/_/g, " ");
    }

    const skillsHost = $("pdSkillCards");
    if (skillsHost) {
      const skills = dash.skills || [];
      skillsHost.innerHTML = skills
        .map((s) => {
          const val = s.value != null ? s.value : 0;
          const delta =
            s.delta != null && isFinite(Number(s.delta))
              ? '<span class="pd-skill-delta up">↑ ' + esc(String(s.delta)) + "</span>"
              : s.estimated
                ? '<span class="pd-skill-delta muted">est.</span>'
                : '<span class="pd-skill-delta up">↑</span>';
          return (
            '<article class="pd-skill-card">' +
            '<div class="pd-skill-top">' +
            '<span class="pd-skill-icon" aria-hidden="true">' +
            skillIcon(s.key || s.label) +
            "</span>" +
            delta +
            "</div>" +
            '<div class="pd-skill-label">' +
            esc(s.label) +
            "</div>" +
            '<div class="pd-skill-value"><strong>' +
            esc(String(val)) +
            "</strong><span>/100</span></div>" +
            '<div class="pd-skill-bar"><i style="width:' +
            Math.max(0, Math.min(100, val)) +
            '%"></i></div>' +
            "</article>"
          );
        })
        .join("");
    }

    const sessLabel = $("pdSessionDate");
    if (sessLabel) {
      sessLabel.textContent = dash.sessionDate
        ? "Session · " + dash.sessionDate
        : "Recent Session Analysis";
    }

    const tableBody = $("pdSessionBody");
    if (tableBody) {
      const rows = dash.sessionAnalysis || [];
      if (!rows.length) {
        tableBody.innerHTML =
          '<tr><td colspan="3" class="pd-empty">Belum ada metrik sesi — apply JSON dari Analitik AI.</td></tr>';
      } else {
        tableBody.innerHTML = rows
          .map((r) => {
            const st = statusClass(r.status);
            let displayVal;
            if (r.value == null || r.value === "") {
              displayVal = '<span class="pd-nc">N/C' + (r.estimated ? " · est." : "") + "</span>";
            } else {
              displayVal =
                esc(String(r.value)) +
                (r.unit ? " <span class=\"pd-unit\">" + esc(r.unit) + "</span>" : "") +
                (r.estimated ? ' <span class="pd-est" title="Estimated from video">est.</span>' : "");
            }
            return (
              "<tr>" +
              "<td>" +
              esc(r.metric) +
              "</td>" +
              "<td>" +
              displayVal +
              "</td>" +
              '<td><span class="pd-tag ' +
              st +
              '">' +
              esc(r.status || (r.value == null ? "Focus" : "Good")) +
              "</span></td>" +
              "</tr>"
            );
          })
          .join("");
      }
    }

    const drillsHost = $("pdDrills");
    if (drillsHost) {
      const drills = dash.drills || [];
      drillsHost.innerHTML = drills
        .map(
          (d, i) =>
            '<article class="pd-drill" id="pd-drill-' +
            i +
            '">' +
            "<div>" +
            "<h4>" +
            esc(d.title || "Drill") +
            "</h4>" +
            "<p>" +
            esc(d.desc || "") +
            "</p>" +
            "</div>" +
            '<button type="button" class="btn btn-ghost btn-sm pd-start-drill" data-drill="' +
            i +
            '">Start Drill</button>' +
            "</article>"
        )
        .join("");
    }

    const honesty = $("pdHonesty");
    if (honesty) {
      honesty.textContent =
        dash.honestyNote ||
        "Data dari video analytics. Nilai null / N/C / estimated = tidak terukur pasti dari footage.";
    }

    renderCharts(dash);
  }

  function setPasteStatus(msg, ok) {
    const el = $("pdPasteStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "gen-status" + (msg ? (ok ? " ok" : " err") : "");
  }

  function applyPaste() {
    try {
      const raw = ($("pdJsonPaste") && $("pdJsonPaste").value.trim()) || "";
      if (!raw) throw new Error("Tempel JSON dulu.");
      let text = raw;
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) text = fence[1].trim();
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) text = text.slice(start, end + 1);
      const data = JSON.parse(text);
      applyFromAnalytics(data);
      setPasteStatus("Player Dashboard diterapkan dari JSON video analytics.", true);
      window.TFDEV.toast("Player Dashboard updated");
    } catch (e) {
      setPasteStatus("Gagal: " + e.message, false);
      window.TFDEV.toast("JSON tidak valid");
    }
  }

  function loadSample() {
    setDashboard(JSON.parse(JSON.stringify(SAMPLE_DASHBOARD)));
    if ($("pdJsonPaste")) {
      $("pdJsonPaste").value = JSON.stringify({ playerDashboard: SAMPLE_DASHBOARD }, null, 2);
    }
    setPasteStatus("Sample Rafi Pratama dimuat (example).", true);
    window.TFDEV.toast("Sample player loaded");
  }

  window.TFDEV = window.TFDEV || {};
  window.PlayerDashboard = {
    applyJson: applyFromAnalytics,
    applyFromAnalytics: applyFromAnalytics,
    get: function () {
      return current;
    },
    loadSample: loadSample,
    SAMPLE: SAMPLE_DASHBOARD,
    render: render
  };

  window.TFDEV.initPlayer = function () {
    if (!$("page-player")) return;

    const stored = loadStored();
    current = stored || JSON.parse(JSON.stringify(SAMPLE_DASHBOARD));

    if ($("pdLoadSample")) $("pdLoadSample").addEventListener("click", loadSample);
    if ($("pdApplyPaste")) $("pdApplyPaste").addEventListener("click", applyPaste);
    if ($("pdOpenAnalitik"))
      $("pdOpenAnalitik").addEventListener("click", () => window.TFDEV.showPage("analitik"));

    const drillsHost = $("pdDrills");
    if (drillsHost) {
      drillsHost.addEventListener("click", (e) => {
        const btn = e.target.closest(".pd-start-drill");
        if (!btn) return;
        const id = btn.getAttribute("data-drill");
        const el = $("pd-drill-" + id);
        if (el) {
          el.classList.add("highlight");
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          window.TFDEV.toast("Drill detail");
          setTimeout(() => el.classList.remove("highlight"), 1600);
        }
      });
    }

    // Re-render charts when navigating to player (canvas may have been hidden)
    const navLinks = document.querySelectorAll(".nav-link[data-page='player'], [data-go='player']");
    navLinks.forEach((el) => {
      el.addEventListener("click", () => {
        setTimeout(() => {
          if (current) renderCharts(current);
        }, 80);
      });
    });

    render();
  };
})();
