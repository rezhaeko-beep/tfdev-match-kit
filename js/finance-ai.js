/**
 * FinanceAI — smart analytics + optional LLM narrative for Club Finance
 * Reads ClubStore only; never mutates tfdev-club-v1 schema.
 * API key (optional): localStorage tfdev-analitik-api-key (+ base/model).
 */
(function () {
  "use strict";

  var API_KEY_LS = "tfdev-analitik-api-key";
  var API_BASE_LS = "tfdev-analitik-api-base";
  var API_MODEL_LS = "tfdev-analitik-api-model";

  var lastSnapshot = null;
  var generating = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function idr(n) {
    if (window.ClubStore && ClubStore.formatIDR) return ClubStore.formatIDR(n);
    var v = Math.round(Number(n) || 0);
    return "Rp " + v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function todayISO() {
    if (window.ClubStore && ClubStore.todayISO) return ClubStore.todayISO();
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function daysBetween(isoA, isoB) {
    var a = new Date(String(isoA).slice(0, 10) + "T12:00:00");
    var b = new Date(String(isoB).slice(0, 10) + "T12:00:00");
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
    return Math.floor((b - a) / 86400000);
  }

  function ymOf(iso) {
    return String(iso || "").slice(0, 7);
  }

  function prevYm(ym) {
    var y = Number(ym.slice(0, 4));
    var m = Number(ym.slice(5, 7));
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
    return y + "-" + String(m).padStart(2, "0");
  }

  function daysInMonth(ym) {
    var y = Number(ym.slice(0, 4));
    var m = Number(ym.slice(5, 7));
    return new Date(y, m, 0).getDate();
  }

  function firstName(full) {
    var s = String(full || "").trim();
    if (!s) return "—";
    return s.split(/\s+/)[0];
  }

  function getApiConfig() {
    var key = "";
    try { key = localStorage.getItem(API_KEY_LS) || ""; } catch (e) { key = ""; }
    var base = "https://generativelanguage.googleapis.com/v1beta/openai";
    var model = "gemini-2.0-flash";
    try {
      base = localStorage.getItem(API_BASE_LS) || base;
      model = localStorage.getItem(API_MODEL_LS) || model;
    } catch (e2) { /* ignore */ }
    return {
      key: key,
      base: String(base).replace(/\/$/, ""),
      model: model
    };
  }

  function computeSnapshot() {
    if (!window.ClubStore) {
      return emptySnapshot("ClubStore belum siap");
    }

    var today = todayISO();
    var ym = ymOf(today);
    var prev = prevYm(ym);
    var dayOfMonth = Number(today.slice(8, 10)) || 1;
    var dim = daysInMonth(ym);
    var daysLeft = Math.max(0, dim - dayOfMonth);

    var members = ClubStore.getMembers({ status: "all" }) || [];
    var invoices = ClubStore.getInvoices({ status: "all" }) || [];
    var payments = ClubStore.getPayments() || [];
    var packages = ClubStore.getPackages(false) || [];

    var invActive = invoices.filter(function (inv) {
      return inv.status !== "batal" && inv.status !== "draft";
    });

    /* --- Collection rate MTD: payments this month vs invoiced this month --- */
    var payMtd = payments
      .filter(function (p) { return ymOf(p.date) === ym; })
      .reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);

    var invoicedMtd = invActive
      .filter(function (inv) {
        var issued = inv.issuedAt || inv.createdAt || inv.dueDate || "";
        return ymOf(issued) === ym || ymOf(inv.dueDate) === ym;
      })
      .reduce(function (s, inv) { return s + (Number(inv.amount) || 0); }, 0);

    /* fallback: if nothing invoiced this month, use outstanding+paid context */
    if (invoicedMtd <= 0) {
      invoicedMtd = invActive.reduce(function (s, inv) {
        var issued = inv.issuedAt || inv.createdAt || "";
        if (ymOf(issued) === ym || ymOf(inv.dueDate) === ym) return s + (Number(inv.amount) || 0);
        return s;
      }, 0);
    }

    var collectionRate = invoicedMtd > 0
      ? Math.round((payMtd / invoicedMtd) * 1000) / 10
      : (payMtd > 0 ? 100 : 0);

    /* --- MoM payments --- */
    var payPrev = payments
      .filter(function (p) { return ymOf(p.date) === prev; })
      .reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);

    var momPct = null;
    if (payPrev > 0) {
      momPct = Math.round(((payMtd - payPrev) / payPrev) * 1000) / 10;
    } else if (payMtd > 0) {
      momPct = 100;
    } else {
      momPct = 0;
    }

    /* --- Forecast month-end --- */
    var dailyAvg = dayOfMonth > 0 ? payMtd / dayOfMonth : 0;
    var forecast = Math.round(payMtd + dailyAvg * daysLeft);

    /* --- Aging buckets on overdue remaining --- */
    var buckets = [
      { key: "0-7", label: "0–7 hari", min: 0, max: 7, amount: 0, count: 0 },
      { key: "8-30", label: "8–30 hari", min: 8, max: 30, amount: 0, count: 0 },
      { key: "31-60", label: "31–60 hari", min: 31, max: 60, amount: 0, count: 0 },
      { key: "60+", label: "60+ hari", min: 61, max: 99999, amount: 0, count: 0 }
    ];

    var overdueInvs = invActive.filter(function (inv) {
      return inv.remaining > 0 && inv.dueDate && inv.dueDate < today;
    });

    overdueInvs.forEach(function (inv) {
      var days = daysBetween(inv.dueDate, today);
      for (var i = 0; i < buckets.length; i++) {
        if (days >= buckets[i].min && days <= buckets[i].max) {
          buckets[i].amount += inv.remaining;
          buckets[i].count += 1;
          break;
        }
      }
    });

    var agingTotal = buckets.reduce(function (s, b) { return s + b.amount; }, 0);

    /* --- Top debtors --- */
    var debtorMap = {};
    overdueInvs.forEach(function (inv) {
      var mid = inv.memberId || "_";
      if (!debtorMap[mid]) {
        var mem = members.find(function (m) { return m.id === mid; });
        debtorMap[mid] = {
          memberId: mid,
          name: mem ? mem.namaAnak : (inv.memberName || "—"),
          firstName: firstName(mem ? mem.namaAnak : inv.memberName),
          wa: mem ? (mem.waOrtu || "") : "",
          ortu: mem ? (mem.namaOrtu || "") : "",
          outstanding: 0,
          maxDaysOverdue: 0,
          invoiceCount: 0
        };
      }
      var d = debtorMap[mid];
      d.outstanding += inv.remaining;
      d.invoiceCount += 1;
      var days = daysBetween(inv.dueDate, today);
      if (days > d.maxDaysOverdue) d.maxDaysOverdue = days;
    });

    var topDebtors = Object.keys(debtorMap).map(function (k) { return debtorMap[k]; })
      .sort(function (a, b) { return b.outstanding - a.outstanding || b.maxDaysOverdue - a.maxDaysOverdue; })
      .slice(0, 8);

    /* --- Risk / churn flags --- */
    var risks = [];
    members.forEach(function (m) {
      if (m.status === "trial") {
        var start = m.startDate || (m.createdAt || "").slice(0, 10);
        var pkg = packages.find(function (p) { return p.id === m.paketId; });
        var dur = (pkg && Number(pkg.durationDays)) || 14;
        var end = ClubStore.addDays ? ClubStore.addDays(start, dur) : start;
        var left = daysBetween(today, end);
        if (left <= 7) {
          risks.push({
            type: "trial_ending",
            severity: left <= 3 ? "high" : "med",
            memberId: m.id,
            name: m.namaAnak,
            firstName: firstName(m.namaAnak),
            detail: left < 0
              ? "Trial sudah lewat " + Math.abs(left) + " hari"
              : "Trial berakhir dalam " + left + " hari",
            daysLeft: left
          });
        }
      }
      if ((m.status === "aktif" || m.status === "trial") && m.tunggakan && m.outstanding > 0) {
        risks.push({
          type: "aktif_overdue",
          severity: "high",
          memberId: m.id,
          name: m.namaAnak,
          firstName: firstName(m.namaAnak),
          detail: "Aktif tapi tunggakan " + idr(m.outstanding),
          outstanding: m.outstanding
        });
      }
    });

    invActive.filter(function (inv) { return inv.status === "sebagian"; }).forEach(function (inv) {
      var age = inv.dueDate ? daysBetween(inv.dueDate, today) : daysBetween((inv.issuedAt || inv.createdAt || today).slice(0, 10), today);
      if (age >= 7 || (inv.dueDate && inv.dueDate < today)) {
        risks.push({
          type: "partial_stuck",
          severity: "med",
          memberId: inv.memberId,
          name: inv.memberName || "—",
          firstName: firstName(inv.memberName),
          detail: "Bayar sebagian macet · sisa " + idr(inv.remaining),
          remaining: inv.remaining
        });
      }
    });

    /* dedupe risks by memberId+type */
    var seenRisk = {};
    risks = risks.filter(function (r) {
      var k = r.type + ":" + r.memberId;
      if (seenRisk[k]) return false;
      seenRisk[k] = true;
      return true;
    }).sort(function (a, b) {
      var sev = { high: 0, med: 1, low: 2 };
      return (sev[a.severity] || 9) - (sev[b.severity] || 9);
    });

    /* --- Package mix (share of active members by package) --- */
    var pkgCounts = {};
    var pkgTotal = 0;
    members.filter(function (m) { return m.status === "aktif" || m.status === "trial"; }).forEach(function (m) {
      var pname = m.packageName || "Tanpa paket";
      if (!m.paketId) pname = "Tanpa paket";
      else {
        var pk = packages.find(function (p) { return p.id === m.paketId; });
        pname = pk ? pk.name : (m.packageName || "Paket lain");
      }
      pkgCounts[pname] = (pkgCounts[pname] || 0) + 1;
      pkgTotal += 1;
    });
    var packageMix = Object.keys(pkgCounts).map(function (name) {
      return {
        name: name,
        count: pkgCounts[name],
        share: pkgTotal > 0 ? Math.round((pkgCounts[name] / pkgTotal) * 1000) / 10 : 0
      };
    }).sort(function (a, b) { return b.count - a.count; });

    /* --- Action queue --- */
    var actions = [];
    var overdueGt14 = topDebtors.filter(function (d) { return d.maxDaysOverdue > 14; });
    if (overdueGt14.length) {
      actions.push({
        id: "wa-overdue-14",
        priority: 1,
        text: "WA " + overdueGt14.length + " debtor overdue >14 hari",
        done: false
      });
    }
    var draftCount = invoices.filter(function (i) { return i.status === "draft"; }).length;
    if (draftCount > 0) {
      actions.push({
        id: "terbit-draft",
        priority: 2,
        text: "Terbitkan " + draftCount + " draft invoice",
        done: false
      });
    }
    var trialRisks = risks.filter(function (r) { return r.type === "trial_ending"; });
    if (trialRisks.length) {
      actions.push({
        id: "convert-trial",
        priority: 3,
        text: "Follow-up convert " + trialRisks.length + " trial yang segera berakhir",
        done: false
      });
    }
    var partials = risks.filter(function (r) { return r.type === "partial_stuck"; });
    if (partials.length) {
      actions.push({
        id: "partial-stuck",
        priority: 4,
        text: "Tagih sisa " + partials.length + " invoice bayar sebagian",
        done: false
      });
    }
    if (collectionRate < 70 && invoicedMtd > 0) {
      actions.push({
        id: "boost-collection",
        priority: 5,
        text: "Collection rate MTD " + collectionRate + "% — dorong penagihan minggu ini",
        done: false
      });
    }
    if (!actions.length) {
      actions.push({
        id: "all-good",
        priority: 9,
        text: "Kondisi sehat — pantau pembayaran harian & perpanjang paket",
        done: false
      });
    }
    actions.sort(function (a, b) { return a.priority - b.priority; });

    var piutang = invActive.reduce(function (s, inv) { return s + (inv.remaining || 0); }, 0);

    return {
      asOf: today,
      ym: ym,
      prevYm: prev,
      collectionRate: collectionRate,
      invoicedMtd: invoicedMtd,
      payMtd: payMtd,
      payPrev: payPrev,
      momPct: momPct,
      forecast: forecast,
      dailyAvg: Math.round(dailyAvg),
      daysLeft: daysLeft,
      dayOfMonth: dayOfMonth,
      aging: buckets,
      agingTotal: agingTotal,
      topDebtors: topDebtors,
      risks: risks,
      packageMix: packageMix,
      packageMixTotal: pkgTotal,
      actions: actions,
      memberAktif: members.filter(function (m) { return m.status === "aktif"; }).length,
      memberTrial: members.filter(function (m) { return m.status === "trial"; }).length,
      overdueCount: overdueInvs.length,
      piutang: piutang,
      hasApiKey: !!getApiConfig().key
    };
  }

  function emptySnapshot(msg) {
    return {
      asOf: todayISO(),
      ym: ymOf(todayISO()),
      prevYm: "",
      collectionRate: 0,
      invoicedMtd: 0,
      payMtd: 0,
      payPrev: 0,
      momPct: 0,
      forecast: 0,
      dailyAvg: 0,
      daysLeft: 0,
      dayOfMonth: 1,
      aging: [],
      agingTotal: 0,
      topDebtors: [],
      risks: [],
      packageMix: [],
      packageMixTotal: 0,
      actions: [{ id: "err", priority: 1, text: msg || "Data belum tersedia", done: false }],
      memberAktif: 0,
      memberTrial: 0,
      overdueCount: 0,
      piutang: 0,
      hasApiKey: false,
      error: msg
    };
  }

  /* ---------- Rule-based Indonesian narrative ---------- */
  function ruleBasedInsight(snap) {
    var lines = [];
    lines.push("📊 Ringkasan Finance " + snap.ym + " (per " + snap.asOf + ")");

    if (snap.collectionRate >= 80) {
      lines.push("• Collection rate MTD " + snap.collectionRate + "% — bagus; pertahankan ritme penagihan.");
    } else if (snap.collectionRate >= 50) {
      lines.push("• Collection rate MTD " + snap.collectionRate + "% — sedang; fokus WA debtor aging 8–30 hari.");
    } else {
      lines.push("• Collection rate MTD " + snap.collectionRate + "% — perlu dorongan; prioritaskan overdue >14 hari.");
    }

    var momLabel = snap.momPct > 0 ? ("+" + snap.momPct + "%") : (snap.momPct + "%");
    lines.push("• Penerimaan MTD " + idr(snap.payMtd) + " vs bulan lalu " + idr(snap.payPrev) + " (" + momLabel + ").");
    lines.push("• Proyeksi akhir bulan ≈ " + idr(snap.forecast) + " (rata-rata harian " + idr(snap.dailyAvg) + " × " + snap.daysLeft + " hari sisa).");

    if (snap.agingTotal > 0) {
      var agingBits = snap.aging.filter(function (b) { return b.count > 0; }).map(function (b) {
        return b.label + ": " + b.count + " (" + idr(b.amount) + ")";
      });
      lines.push("• Aging piutang overdue — " + agingBits.join("; ") + ".");
    } else {
      lines.push("• Tidak ada piutang overdue — kondisi aging bersih.");
    }

    if (snap.topDebtors.length) {
      var top = snap.topDebtors.slice(0, 3).map(function (d, i) {
        return (i + 1) + ") " + d.firstName + " " + idr(d.outstanding) + " (" + d.maxDaysOverdue + "h)";
      });
      lines.push("• Top debtor: " + top.join(", ") + ".");
    }

    if (snap.risks.length) {
      lines.push("• Flag risiko: " + snap.risks.length + " item (trial ending / aktif+overdue / partial stuck).");
    }

    if (snap.packageMix.length) {
      var mix = snap.packageMix.slice(0, 3).map(function (p) {
        return p.name + " " + p.share + "%";
      });
      lines.push("• Mix paket (aktif/trial): " + mix.join(" · ") + ".");
    }

    if (snap.actions.length && snap.actions[0].id !== "all-good") {
      lines.push("• Antrian aksi #1: " + snap.actions[0].text + ".");
    } else {
      lines.push("• Antrian aksi: kondisi relatif sehat — pantau saja.");
    }

    if (!snap.hasApiKey) {
      lines.push("💡 Tip: tempel API key di halaman Analitik untuk insight LLM yang lebih kaya.");
    }

    return lines.join("\n");
  }

  /* ---------- Compact anonymized JSON for LLM ---------- */
  function compactForLlm(snap) {
    return {
      asOf: snap.asOf,
      ym: snap.ym,
      collectionRatePct: snap.collectionRate,
      payMtd: snap.payMtd,
      payPrev: snap.payPrev,
      momPct: snap.momPct,
      forecastMonthEnd: snap.forecast,
      daysLeft: snap.daysLeft,
      piutang: snap.piutang,
      overdueCount: snap.overdueCount,
      memberAktif: snap.memberAktif,
      memberTrial: snap.memberTrial,
      aging: snap.aging.map(function (b) {
        return { bucket: b.key, count: b.count, amount: b.amount };
      }),
      topDebtors: snap.topDebtors.slice(0, 5).map(function (d, i) {
        return {
          rank: i + 1,
          firstName: d.firstName,
          outstanding: d.outstanding,
          daysOverdue: d.maxDaysOverdue
        };
      }),
      risks: snap.risks.slice(0, 8).map(function (r) {
        return { type: r.type, severity: r.severity, firstName: r.firstName, detail: r.detail };
      }),
      packageMix: snap.packageMix.slice(0, 6),
      actions: snap.actions.slice(0, 6).map(function (a) { return a.text; })
    };
  }

  function buildShortReport(snap) {
    var lines = [];
    lines.push("*TFDEV Finance — laporan singkat*");
    lines.push("Per " + snap.asOf);
    lines.push("");
    lines.push("Collection MTD: " + snap.collectionRate + "%");
    lines.push("Penerimaan MTD: " + idr(snap.payMtd) + " (MoM " + (snap.momPct > 0 ? "+" : "") + snap.momPct + "%)");
    lines.push("Forecast akhir bulan: " + idr(snap.forecast));
    lines.push("Piutang outstanding: " + idr(snap.piutang));
    lines.push("Overdue: " + snap.overdueCount + " invoice");
    lines.push("");
    if (snap.aging.length) {
      lines.push("Aging:");
      snap.aging.forEach(function (b) {
        if (b.count) lines.push("· " + b.label + ": " + b.count + " · " + idr(b.amount));
      });
      lines.push("");
    }
    if (snap.topDebtors.length) {
      lines.push("Top debtor:");
      snap.topDebtors.slice(0, 5).forEach(function (d, i) {
        lines.push((i + 1) + ". " + d.name + " — " + idr(d.outstanding) + " (" + d.maxDaysOverdue + " hari)" + (d.wa ? " WA " + d.wa : ""));
      });
      lines.push("");
    }
    lines.push("Aksi:");
    snap.actions.slice(0, 5).forEach(function (a) {
      lines.push("☐ " + a.text);
    });
    lines.push("");
    lines.push("_Generated by TFDEV Finance AI_");
    return lines.join("\n");
  }

  function waFollowUpText(debtor) {
    var nama = debtor.ortu || ("Ortu " + debtor.firstName);
    var anak = debtor.firstName || "anak";
    return (
      "Halo " + nama + ", salam dari TFDEV Soccer 👋\n\n" +
      "Mengingatkan sisa iuran " + anak + " sebesar *" + idr(debtor.outstanding) + "* " +
      "(terlambat ±" + debtor.maxDaysOverdue + " hari). Mohon konfirmasi jika sudah transfer ya.\n\n" +
      "Terima kasih 🙏"
    );
  }

  /* ---------- UI render ---------- */
  function $(id) { return document.getElementById(id); }

  function momClass(pct) {
    if (pct > 0) return "fai-up";
    if (pct < 0) return "fai-down";
    return "fai-flat";
  }

  function renderAging(snap) {
    var el = $("faiAging");
    if (!el) return;
    var maxAmt = Math.max.apply(null, snap.aging.map(function (b) { return b.amount; }).concat([1]));
    if (!snap.aging.length || snap.agingTotal <= 0) {
      el.innerHTML = '<div class="fai-empty">Tidak ada piutang overdue. Aging bersih ✅</div>';
      return;
    }
    el.innerHTML = snap.aging.map(function (b) {
      var pct = Math.round((b.amount / maxAmt) * 100);
      return (
        '<div class="fai-aging-row">' +
          '<div class="fai-aging-label">' + esc(b.label) + '</div>' +
          '<div class="fai-aging-bar-wrap"><div class="fai-aging-bar" style="width:' + pct + '%"></div></div>' +
          '<div class="fai-aging-meta"><strong>' + idr(b.amount) + '</strong><span>' + b.count + ' inv</span></div>' +
        '</div>'
      );
    }).join("");
  }

  function renderDebtors(snap) {
    var el = $("faiDebtors");
    if (!el) return;
    if (!snap.topDebtors.length) {
      el.innerHTML = '<div class="fai-empty">Tidak ada debtor overdue.</div>';
      return;
    }
    el.innerHTML = snap.topDebtors.map(function (d) {
      return (
        '<div class="fai-debtor-card" data-mid="' + esc(d.memberId) + '">' +
          '<div class="fai-debtor-top">' +
            '<strong>' + esc(d.name) + '</strong>' +
            '<span class="club-pill bad">' + d.maxDaysOverdue + 'h</span>' +
          '</div>' +
          '<div class="fai-debtor-amt">' + idr(d.outstanding) + '</div>' +
          '<div class="fai-debtor-meta">' +
            (d.wa ? esc(d.wa) : '<span class="muted">WA tidak ada</span>') +
            ' · ' + d.invoiceCount + ' invoice' +
          '</div>' +
          '<button type="button" class="btn btn-ghost btn-sm fai-copy-wa" data-mid="' + esc(d.memberId) + '">Salin teks WA</button>' +
        '</div>'
      );
    }).join("");

    el.querySelectorAll(".fai-copy-wa").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mid = btn.getAttribute("data-mid");
        var d = (lastSnapshot && lastSnapshot.topDebtors || []).find(function (x) { return x.memberId === mid; });
        if (!d) return;
        var text = waFollowUpText(d);
        copyText(text).then(function () {
          btn.textContent = "Tersalin ✓";
          setTimeout(function () { btn.textContent = "Salin teks WA"; }, 1600);
          toast("Teks WA follow-up disalin");
        }).catch(function () {
          toast("Gagal salin — coba manual");
        });
      });
    });
  }

  function renderActions(snap) {
    var el = $("faiActions");
    if (!el) return;
    el.innerHTML = snap.actions.map(function (a) {
      return (
        '<label class="fai-action-item">' +
          '<input type="checkbox" data-action-id="' + esc(a.id) + '" />' +
          '<span>' + esc(a.text) + '</span>' +
        '</label>'
      );
    }).join("");
  }

  function renderPackageMix(snap) {
    var el = $("faiPkgMix");
    if (!el) return;
    if (!snap.packageMix.length) {
      el.innerHTML = '<div class="fai-empty">Belum ada member aktif/trial.</div>';
      return;
    }
    el.innerHTML = snap.packageMix.map(function (p) {
      return (
        '<div class="fai-mix-row">' +
          '<div class="fai-mix-name">' + esc(p.name) + '</div>' +
          '<div class="fai-mix-bar-wrap"><div class="fai-mix-bar" style="width:' + Math.min(100, p.share) + '%"></div></div>' +
          '<div class="fai-mix-pct">' + p.share + '% <span>(' + p.count + ')</span></div>' +
        '</div>'
      );
    }).join("");
  }

  function renderRisks(snap) {
    var el = $("faiRisks");
    if (!el) return;
    if (!snap.risks.length) {
      el.innerHTML = '<div class="fai-empty">Tidak ada flag risiko saat ini.</div>';
      return;
    }
    el.innerHTML = snap.risks.slice(0, 8).map(function (r) {
      var pill = r.severity === "high" ? "bad" : "warn";
      var label = r.type === "trial_ending" ? "trial" : (r.type === "partial_stuck" ? "partial" : "overdue");
      return (
        '<div class="fai-risk-row">' +
          '<span class="club-pill ' + pill + '">' + esc(label) + '</span>' +
          '<div><strong>' + esc(r.name) + '</strong><div class="meta">' + esc(r.detail) + '</div></div>' +
        '</div>'
      );
    }).join("");
  }

  function setInsightText(text, mode) {
    var el = $("faiInsightBody");
    if (!el) return;
    el.setAttribute("data-mode", mode || "rule");
    var html = String(text || "")
      .split("\n")
      .filter(function (l) { return l.trim(); })
      .map(function (l) {
        var t = l.replace(/^[•\-\*]\s*/, "").replace(/^📊\s*/, "").replace(/^💡\s*/, "");
        if (/^Ringkasan|^TFDEV/i.test(t) || l.indexOf("📊") === 0) {
          return '<div class="fai-insight-title">' + esc(t) + "</div>";
        }
        if (l.indexOf("💡") === 0 || /^Tip:/i.test(t)) {
          return '<div class="fai-insight-tip">' + esc(t) + "</div>";
        }
        return "<li>" + esc(t.replace(/^[•]\s*/, "")) + "</li>";
      })
      .join("");
    /* wrap consecutive li */
    if (html.indexOf("<li>") !== -1) {
      html = html.replace(/(<li>[\s\S]*?<\/li>)+/g, function (block) {
        return "<ul class=\"fai-insight-list\">" + block + "</ul>";
      });
    }
    el.innerHTML = html || '<div class="fai-empty">Belum ada insight.</div>';
  }

  function renderKpis(snap) {
    var set = function (id, text) {
      var el = $(id);
      if (el) el.textContent = text;
    };
    set("faiCollectionRate", snap.collectionRate + "%");
    var momEl = $("faiMom");
    if (momEl) {
      var sign = snap.momPct > 0 ? "+" : "";
      momEl.textContent = sign + snap.momPct + "%";
      momEl.className = "n " + momClass(snap.momPct);
    }
    set("faiForecast", idr(snap.forecast));
    var subCol = $("faiCollectionSub");
    if (subCol) subCol.textContent = idr(snap.payMtd) + " / " + idr(snap.invoicedMtd) + " ditagih";
    var subMom = $("faiMomSub");
    if (subMom) subMom.textContent = "vs " + idr(snap.payPrev) + " bulan lalu";
    var subFc = $("faiForecastSub");
    if (subFc) subFc.textContent = "MTD " + idr(snap.payMtd) + " + " + snap.daysLeft + " hari × avg";
  }

  function toast(msg) {
    if (window.TFDEV && typeof TFDEV.toast === "function") TFDEV.toast(msg);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  }

  function refresh() {
    var snap = computeSnapshot();
    lastSnapshot = snap;
    renderKpis(snap);
    renderAging(snap);
    renderDebtors(snap);
    renderActions(snap);
    renderPackageMix(snap);
    renderRisks(snap);

    var keyHint = $("faiKeyHint");
    if (keyHint) {
      keyHint.textContent = snap.hasApiKey
        ? "API key Analitik terdeteksi — klik Generate untuk insight LLM."
        : "Mode offline: insight rule-based. Tempel API key di Analitik untuk LLM.";
    }

    /* auto-show rule-based if panel empty or was rule mode */
    var body = $("faiInsightBody");
    var mode = body ? body.getAttribute("data-mode") : "";
    if (!body || !body.getAttribute("data-filled") || mode === "rule") {
      setInsightText(ruleBasedInsight(snap), "rule");
      if (body) body.setAttribute("data-filled", "1");
    }

    var btnGen = $("faiGenerateBtn");
    if (btnGen) {
      btnGen.disabled = generating;
      btnGen.textContent = snap.hasApiKey ? "Generate insight" : "Refresh insight (rule-based)";
    }
  }

  async function generateInsight() {
    var snap = lastSnapshot || computeSnapshot();
    lastSnapshot = snap;
    var cfg = getApiConfig();

    if (!cfg.key) {
      setInsightText(ruleBasedInsight(snap), "rule");
      toast("Insight rule-based (tanpa API key)");
      return ruleBasedInsight(snap);
    }

    if (generating) return null;
    generating = true;
    var btn = $("faiGenerateBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Generating…"; }
    var status = $("faiInsightStatus");
    if (status) status.textContent = "Memanggil model…";

    try {
      var payload = compactForLlm(snap);
      var system =
        "Kamu asisten finance untuk akademi sepak bola TFDEV Soccer (Indonesia). " +
        "Berikan 5–8 bullet insight singkat Bahasa Indonesia untuk admin finance club. " +
        "Fokus aksi: penagihan, aging, convert trial, forecast. " +
        "Jangan sebutkan data PII lengkap — hanya first name / agregat. " +
        "Format: bullet points saja, tanpa pembuka panjang.";
      var user =
        "Snapshot metrik finance (JSON):\n" + JSON.stringify(payload) +
        "\n\nTulis insight actionable dalam Bahasa Indonesia.";

      var res = await fetch(cfg.base + "/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + cfg.key
        },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0.4,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        })
      });

      if (!res.ok) {
        var errText = await res.text().catch(function () { return ""; });
        throw new Error("API " + res.status + ": " + (errText.slice(0, 180) || res.statusText));
      }
      var body = await res.json();
      var content =
        (body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content) ||
        body.content ||
        "";
      content = String(content).trim();
      if (!content) throw new Error("Respons kosong dari model");
      setInsightText(content, "llm");
      var el = $("faiInsightBody");
      if (el) el.setAttribute("data-filled", "1");
      if (status) status.textContent = "Insight LLM · " + cfg.model;
      toast("Insight AI siap");
      return content;
    } catch (err) {
      var fallback = ruleBasedInsight(snap);
      setInsightText(fallback + "\n💡 LLM gagal (" + (err && err.message ? err.message : "error") + ") — menampilkan rule-based.", "rule");
      if (status) status.textContent = "Fallback rule-based";
      toast("LLM gagal — pakai insight rule-based");
      return fallback;
    } finally {
      generating = false;
      var btn2 = $("faiGenerateBtn");
      if (btn2) {
        btn2.disabled = false;
        btn2.textContent = getApiConfig().key ? "Generate insight" : "Refresh insight (rule-based)";
      }
    }
  }

  var MONTH_ID = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  function monthLabel(ym) {
    var y = String(ym || "").slice(0, 4);
    var m = Number(String(ym || "").slice(5, 7)) || 0;
    return (MONTH_ID[m] || ym) + " " + y;
  }

  function paymentsByMethod(payments, ym) {
    var map = {};
    (payments || []).forEach(function (p) {
      if (ymOf(p.date) !== ym) return;
      var m = p.method || "lainnya";
      map[m] = (map[m] || 0) + (Number(p.amount) || 0);
    });
    return Object.keys(map).sort().map(function (k) {
      return { method: k, amount: map[k] };
    });
  }

  function mtdPaymentsList(payments, ym) {
    return (payments || []).filter(function (p) {
      return ymOf(p.date) === ym;
    }).slice().sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date));
    });
  }

  /**
   * Full keuangan report (plain text, WA/email ready).
   * @param {string} [period] YYYY-MM — default bulan berjalan
   * @returns {{ text: string, csv: string, meta: object, snap: object }}
   */
  function buildReport(period) {
    var snap = computeSnapshot();
    lastSnapshot = snap;
    var ym = period || snap.ym;
    var payments = (window.ClubStore && ClubStore.getPayments) ? ClubStore.getPayments() : [];
    var byMethod = paymentsByMethod(payments, ym);
    var mtdList = mtdPaymentsList(payments, ym);
    var generatedAt = todayISO();
    var now = new Date();
    var timeLabel = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");

    var insight = "";
    try {
      insight = ruleBasedInsight(snap);
    } catch (e) {
      insight = "";
    }
    // Flatten bullets to one paragraph if multi-line
    var insightPara = String(insight || "")
      .split("\n")
      .map(function (l) { return l.replace(/^[•\-*]\s*/, "").trim(); })
      .filter(Boolean)
      .slice(0, 4)
      .join(" ");

    var lines = [];
    lines.push("══════════════════════════════════════");
    lines.push("TFDEV SOCCER — LAPORAN KEUANGAN");
    lines.push("Periode: " + monthLabel(ym));
    lines.push("Dibuat: " + generatedAt + " " + timeLabel);
    lines.push("══════════════════════════════════════");
    lines.push("");
    lines.push("RINGKASAN");
    lines.push("• Member aktif: " + snap.memberAktif);
    lines.push("• Penerimaan MTD: " + idr(snap.payMtd));
    lines.push("• Piutang outstanding: " + idr(snap.piutang));
    lines.push("• Tagihan overdue: " + snap.overdueCount);
    lines.push("• Collection rate MTD: " + snap.collectionRate + "%");
    lines.push("• Forecast akhir bulan: " + idr(snap.forecast));
    lines.push("");
    lines.push("PENERIMAAN PER METODE (" + monthLabel(ym) + ")");
    if (!byMethod.length) {
      lines.push("• (belum ada pembayaran bulan ini)");
    } else {
      byMethod.forEach(function (row) {
        lines.push("• " + row.method + ": " + idr(row.amount));
      });
    }
    lines.push("");
    lines.push("AGING PIUTANG OVERDUE");
    if (!snap.aging || !snap.agingTotal) {
      lines.push("• Bersih — tidak ada piutang overdue");
    } else {
      snap.aging.forEach(function (b) {
        lines.push("• " + b.label + ": " + b.count + " inv · " + idr(b.amount));
      });
      lines.push("• Total aging: " + idr(snap.agingTotal));
    }
    lines.push("");
    lines.push("TOP DEBTOR");
    if (!snap.topDebtors.length) {
      lines.push("• Tidak ada debtor overdue");
    } else {
      snap.topDebtors.forEach(function (d, i) {
        lines.push(
          (i + 1) + ". " + d.name + " — " + idr(d.outstanding) +
          " (" + d.maxDaysOverdue + " hari)" +
          (d.wa ? " · WA " + d.wa : "")
        );
      });
    }
    lines.push("");
    lines.push("DAFTAR PEMBAYARAN BULAN INI");
    if (!mtdList.length) {
      lines.push("• (kosong)");
    } else {
      mtdList.forEach(function (p) {
        lines.push(
          "• " + p.date + " · " + (p.memberName || "—") + " · " +
          idr(p.amount) + " · " + (p.method || "-") +
          (p.proofNote ? " · " + p.proofNote : "")
        );
      });
    }
    lines.push("");
    if (insightPara) {
      lines.push("INSIGHT");
      lines.push(insightPara);
      lines.push("");
    }
    lines.push("— Generated by TFDEV Finance AI (auto) —");

    // CSV summary
    var csv = [];
    csv.push("section,key,value");
    csv.push("meta,periode," + ym);
    csv.push("meta,dibuat," + generatedAt);
    csv.push("ringkasan,member_aktif," + snap.memberAktif);
    csv.push("ringkasan,penerimaan_mtd," + snap.payMtd);
    csv.push("ringkasan,piutang," + snap.piutang);
    csv.push("ringkasan,overdue_count," + snap.overdueCount);
    csv.push("ringkasan,collection_rate_pct," + snap.collectionRate);
    byMethod.forEach(function (row) {
      csv.push("metode," + row.method + "," + row.amount);
    });
    (snap.aging || []).forEach(function (b) {
      csv.push("aging," + b.label + "," + b.amount);
    });
    snap.topDebtors.forEach(function (d, i) {
      csv.push("debtor," + (i + 1) + "_" + String(d.name).replace(/,/g, " ") + "," + d.outstanding);
    });
    mtdList.forEach(function (p) {
      csv.push(
        "payment," + p.date + "_" + String(p.memberName || "").replace(/,/g, " ") +
        "_" + (p.method || "") + "," + (Number(p.amount) || 0)
      );
    });

    return {
      text: lines.join("\n"),
      csv: csv.join("\n"),
      meta: {
        ym: ym,
        periodLabel: monthLabel(ym),
        generatedAt: generatedAt,
        timeLabel: timeLabel,
        payCount: mtdList.length
      },
      snap: snap
    };
  }

  function downloadBlob(filename, content, mime) {
    var blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  function downloadReport(period, format) {
    var rep = buildReport(period);
    var base = "tfdev-laporan-keuangan-" + (rep.meta.ym || "bulan");
    if (format === "csv") {
      downloadBlob(base + ".csv", rep.csv, "text/csv;charset=utf-8");
    } else {
      downloadBlob(base + ".txt", rep.text, "text/plain;charset=utf-8");
    }
    return rep;
  }

  function getSnapshot() {
    return lastSnapshot || computeSnapshot();
  }


  function bindUi() {
    var gen = $("faiGenerateBtn");
    if (gen && !gen._faiBound) {
      gen._faiBound = true;
      gen.addEventListener("click", function () { generateInsight(); });
    }
    var copyBtn = $("faiCopyReportBtn");
    if (copyBtn && !copyBtn._faiBound) {
      copyBtn._faiBound = true;
      copyBtn.addEventListener("click", function () {
        var snap = getSnapshot();
        copyText(buildShortReport(snap)).then(function () {
          toast("Laporan singkat disalin");
          copyBtn.textContent = "Tersalin ✓";
          setTimeout(function () { copyBtn.textContent = "Salin laporan singkat"; }, 1600);
        }).catch(function () {
          toast("Gagal salin clipboard");
        });
      });
    }
  }

  function init() {
    bindUi();
    if (document.getElementById("page-finance")) {
      refresh();
    }
  }

  window.FinanceAI = {
    refresh: refresh,
    getSnapshot: getSnapshot,
    generateInsight: generateInsight,
    computeSnapshot: computeSnapshot,
    ruleBasedInsight: ruleBasedInsight,
    buildShortReport: buildShortReport,
    buildReport: buildReport,
    downloadReport: downloadReport,
    waFollowUpText: waFollowUpText
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
