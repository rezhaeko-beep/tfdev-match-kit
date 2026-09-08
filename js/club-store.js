/**
 * ClubStore — Member + Finance offline store (localStorage)
 * Formulas (otomatis):
 * 1) invoice.remaining = max(0, amount - sum(payments))
 * 2) invoice.status auto: lunas / sebagian / overdue / keep draft|terbit|batal
 * 3) member.outstanding = sum(remaining non-batal invoices)
 * 4) Dashboard: penerimaanBulanIni, piutangOutstanding, overdueCount, memberAktif
 * 5) Invoice from package: amount = package.price (override OK)
 * 6) dueDate default = startDate + durationDays (or +30 monthly)
 */
(function () {
  const KEY = "tfdev-club-v1";

  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function addDays(iso, days) {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + Number(days || 0));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function formatIDR(n) {
    const v = Math.round(Number(n) || 0);
    return "Rp " + v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function seedData() {
    const pkgMonthly = {
      id: "pkg-monthly-u8",
      name: "Bulanan U8 Regular",
      type: "monthly",
      price: 450000,
      durationDays: 30,
      ageGroup: "U8",
      active: true
    };
    const pkgTrial = {
      id: "pkg-trial",
      name: "Trial 2 Sesi",
      type: "trial",
      price: 150000,
      durationDays: 14,
      ageGroup: "",
      active: true
    };
    const pkgTerm = {
      id: "pkg-term-u10",
      name: "Term U10 (3 bulan)",
      type: "term",
      price: 1200000,
      durationDays: 90,
      ageGroup: "U10",
      active: true
    };

    const m1 = {
      id: "mem-rafi",
      namaAnak: "Rafi Pratama",
      dob: "2017-03-12",
      ageGroup: "U8",
      posisi: "Midfielder",
      kaki: "Kanan",
      namaOrtu: "Budi Pratama",
      waOrtu: "081234567890",
      email: "budi.pratama@email.com",
      paketId: pkgMonthly.id,
      startDate: "2026-08-01",
      status: "aktif",
      notes: "Sample TFS · favorit drill passing",
      createdAt: "2026-08-01T08:00:00.000Z"
    };
    const m2 = {
      id: "mem-akira",
      namaAnak: "Akira Wijaya",
      dob: "2016-11-05",
      ageGroup: "U10",
      posisi: "Forward",
      kaki: "Kiri",
      namaOrtu: "Sari Wijaya",
      waOrtu: "081298765432",
      email: "sari.wijaya@email.com",
      paketId: pkgTerm.id,
      startDate: "2026-07-15",
      status: "aktif",
      notes: "Kit orange #9",
      createdAt: "2026-07-15T08:00:00.000Z"
    };
    const m3 = {
      id: "mem-dimas",
      namaAnak: "Dimas Nugraha",
      dob: "2018-01-20",
      ageGroup: "U8",
      posisi: "Defender",
      kaki: "Kanan",
      namaOrtu: "Andi Nugraha",
      waOrtu: "082112223333",
      email: "andi.nugraha@email.com",
      paketId: pkgTrial.id,
      startDate: "2026-09-01",
      status: "trial",
      notes: "Trial convert target",
      createdAt: "2026-09-01T08:00:00.000Z"
    };

    // Invoice 1: Rafi monthly — partially paid (sebagian), due in past → will auto overdue if remaining
    const inv1 = {
      id: "inv-rafi-aug",
      memberId: m1.id,
      packageId: pkgMonthly.id,
      amount: 450000,
      dueDate: "2026-08-31",
      note: "Iuran Agustus 2026",
      status: "terbit",
      createdAt: "2026-08-05T10:00:00.000Z",
      issuedAt: "2026-08-05T10:00:00.000Z"
    };
    // Invoice 2: Akira term — unpaid overdue
    const inv2 = {
      id: "inv-akira-term",
      memberId: m2.id,
      packageId: pkgTerm.id,
      amount: 1200000,
      dueDate: "2026-08-15",
      note: "Term U10 cicilan awal",
      status: "terbit",
      createdAt: "2026-07-20T10:00:00.000Z",
      issuedAt: "2026-07-20T10:00:00.000Z"
    };

    const pay1 = {
      id: "pay-rafi-1",
      invoiceId: inv1.id,
      amount: 200000,
      method: "transfer",
      date: "2026-09-02",
      proofNote: "BCA · transfer ortu Budi",
      createdAt: "2026-09-02T14:00:00.000Z"
    };

    return {
      members: [m1, m2, m3],
      packages: [pkgMonthly, pkgTrial, pkgTerm],
      invoices: [inv1, inv2],
      payments: [pay1]
    };
  }

  function loadRaw() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        const seeded = seedData();
        localStorage.setItem(KEY, JSON.stringify(seeded));
        return seeded;
      }
      const data = JSON.parse(raw);
      if (!data.members) data.members = [];
      if (!data.packages) data.packages = [];
      if (!data.invoices) data.invoices = [];
      if (!data.payments) data.payments = [];
      return data;
    } catch (e) {
      const seeded = seedData();
      localStorage.setItem(KEY, JSON.stringify(seeded));
      return seeded;
    }
  }

  function saveRaw(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  /** Sum payments for one invoice */
  function sumPayments(data, invoiceId) {
    return (data.payments || [])
      .filter(function (p) { return p.invoiceId === invoiceId; })
      .reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);
  }

  /**
   * remaining = max(0, amount - sum(payments))
   */
  function invoiceRemaining(inv, data) {
    const paid = sumPayments(data || loadRaw(), inv.id);
    return Math.max(0, (Number(inv.amount) || 0) - paid);
  }

  /**
   * Auto status:
   * - batal / draft stay unless paid fully while draft? keep draft/batal as set
   * - lunas if remaining === 0 && amount > 0
   * - sebagian if 0 < remaining < amount
   * - overdue if remaining > 0 && dueDate < today && not batal/draft
   * - else terbit (or keep terbit)
   */
  function deriveInvoiceStatus(inv, data) {
    const base = inv.status || "draft";
    if (base === "batal") return "batal";
    if (base === "draft") return "draft";

    const amount = Number(inv.amount) || 0;
    const rem = invoiceRemaining(inv, data);
    const today = todayISO();

    if (amount > 0 && rem === 0) return "lunas";
    if (rem > 0 && rem < amount) {
      // sebagian, but may also be overdue
      if (inv.dueDate && inv.dueDate < today) return "overdue";
      return "sebagian";
    }
    if (rem > 0 && inv.dueDate && inv.dueDate < today) return "overdue";
    // remaining === amount (unpaid) or amount === 0
    return base === "terbit" || base === "sebagian" || base === "overdue" || base === "lunas"
      ? (rem === amount ? "terbit" : base)
      : "terbit";
  }

  /** Enrich invoice with remaining, paidTotal, derived status */
  function enrichInvoice(inv, data) {
    data = data || loadRaw();
    const paidTotal = sumPayments(data, inv.id);
    const remaining = Math.max(0, (Number(inv.amount) || 0) - paidTotal);
    const status = deriveInvoiceStatus(inv, data);
    return Object.assign({}, inv, { paidTotal: paidTotal, remaining: remaining, status: status });
  }

  /** Recompute & persist derived statuses for all invoices (except draft/batal kept) */
  function refreshInvoiceStatuses(data) {
    data = data || loadRaw();
    let changed = false;
    data.invoices = (data.invoices || []).map(function (inv) {
      if (inv.status === "batal" || inv.status === "draft") return inv;
      const next = deriveInvoiceStatus(inv, data);
      if (next !== inv.status) {
        changed = true;
        return Object.assign({}, inv, { status: next });
      }
      return inv;
    });
    if (changed) saveRaw(data);
    return data;
  }

  function memberOutstanding(memberId, data) {
    data = data || loadRaw();
    return (data.invoices || [])
      .filter(function (inv) {
        return inv.memberId === memberId && inv.status !== "batal" && inv.status !== "draft";
      })
      .reduce(function (s, inv) {
        return s + invoiceRemaining(inv, data);
      }, 0);
  }

  function memberHasTunggakan(memberId, data) {
    data = data || loadRaw();
    return (data.invoices || []).some(function (inv) {
      if (inv.memberId !== memberId) return false;
      if (inv.status === "batal" || inv.status === "draft") return false;
      const en = enrichInvoice(inv, data);
      return en.status === "overdue" || en.status === "sebagian";
    });
  }

  function getDashboard(data) {
    data = refreshInvoiceStatuses(data || loadRaw());
    const today = todayISO();
    const ym = today.slice(0, 7); // YYYY-MM

    const memberAktif = (data.members || []).filter(function (m) { return m.status === "aktif"; }).length;

    const enriched = (data.invoices || []).map(function (inv) { return enrichInvoice(inv, data); });

    const overdueCount = enriched.filter(function (inv) { return inv.status === "overdue"; }).length;

    const penerimaanBulanIni = (data.payments || [])
      .filter(function (p) { return String(p.date || "").slice(0, 7) === ym; })
      .reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);

    const piutangOutstanding = enriched
      .filter(function (inv) { return inv.status !== "batal" && inv.status !== "draft"; })
      .reduce(function (s, inv) { return s + inv.remaining; }, 0);

    const recentPayments = (data.payments || [])
      .slice()
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })
      .slice(0, 8)
      .map(function (p) {
        const inv = (data.invoices || []).find(function (i) { return i.id === p.invoiceId; });
        const mem = inv ? (data.members || []).find(function (m) { return m.id === inv.memberId; }) : null;
        return Object.assign({}, p, {
          memberName: mem ? mem.namaAnak : "—",
          invoiceNote: inv ? (inv.note || inv.id) : "—"
        });
      });

    return {
      memberAktif: memberAktif,
      overdueCount: overdueCount,
      penerimaanBulanIni: penerimaanBulanIni,
      piutangOutstanding: piutangOutstanding,
      recentPayments: recentPayments,
      formulas: {
        remaining: "remaining = max(0, amount − Σ payments)",
        status: "lunas / sebagian / overdue otomatis; draft & batal manual",
        outstanding: "member.outstanding = Σ remaining (non-batal, non-draft)",
        penerimaan: "Σ payments di bulan berjalan (by payment.date)",
        piutang: "Σ remaining semua invoice non-batal (non-draft)"
      }
    };
  }

  function defaultDueDate(startDate, pkg) {
    const base = startDate || todayISO();
    if (!pkg) return addDays(base, 30);
    var days = Number(pkg.durationDays);
    if (!days || days <= 0) {
      days = pkg.type === "monthly" ? 30 : 30;
    }
    return addDays(base, days);
  }

  function getAll() {
    return refreshInvoiceStatuses(loadRaw());
  }

  function getMembers(filter) {
    const data = getAll();
    let list = data.members.slice();
    if (filter && filter.status && filter.status !== "all") {
      if (filter.status === "tunggakan") {
        list = list.filter(function (m) { return memberHasTunggakan(m.id, data); });
      } else {
        list = list.filter(function (m) { return m.status === filter.status; });
      }
    }
    if (filter && filter.q) {
      const q = String(filter.q).toLowerCase().trim();
      list = list.filter(function (m) {
        return [m.namaAnak, m.namaOrtu, m.waOrtu, m.email, m.ageGroup, m.posisi]
          .join(" ").toLowerCase().indexOf(q) !== -1;
      });
    }
    return list.map(function (m) {
      return Object.assign({}, m, {
        outstanding: memberOutstanding(m.id, data),
        tunggakan: memberHasTunggakan(m.id, data),
        packageName: (data.packages.find(function (p) { return p.id === m.paketId; }) || {}).name || "—"
      });
    });
  }

  function getMember(id) {
    const data = getAll();
    const m = data.members.find(function (x) { return x.id === id; });
    if (!m) return null;
    return Object.assign({}, m, {
      outstanding: memberOutstanding(m.id, data),
      tunggakan: memberHasTunggakan(m.id, data)
    });
  }

  function saveMember(member) {
    const data = loadRaw();
    if (!member.id) {
      member.id = uid("mem");
      member.createdAt = new Date().toISOString();
      data.members.push(member);
    } else {
      const i = data.members.findIndex(function (m) { return m.id === member.id; });
      if (i >= 0) data.members[i] = Object.assign({}, data.members[i], member);
      else data.members.push(member);
    }
    saveRaw(data);
    return getMember(member.id);
  }

  function getPackages(activeOnly) {
    const data = loadRaw();
    let list = data.packages.slice();
    if (activeOnly) list = list.filter(function (p) { return p.active; });
    return list;
  }

  function savePackage(pkg) {
    const data = loadRaw();
    if (!pkg.id) {
      pkg.id = uid("pkg");
      data.packages.push(pkg);
    } else {
      const i = data.packages.findIndex(function (p) { return p.id === pkg.id; });
      if (i >= 0) data.packages[i] = Object.assign({}, data.packages[i], pkg);
      else data.packages.push(pkg);
    }
    saveRaw(data);
    return pkg;
  }

  function deletePackage(id) {
    const data = loadRaw();
    data.packages = data.packages.filter(function (p) { return p.id !== id; });
    saveRaw(data);
  }

  function getInvoices(filter) {
    const data = getAll();
    let list = data.invoices.map(function (inv) { return enrichInvoice(inv, data); });
    if (filter && filter.status && filter.status !== "all") {
      list = list.filter(function (i) { return i.status === filter.status; });
    }
    if (filter && filter.memberId) {
      list = list.filter(function (i) { return i.memberId === filter.memberId; });
    }
    return list.map(function (inv) {
      const mem = data.members.find(function (m) { return m.id === inv.memberId; });
      const pkg = data.packages.find(function (p) { return p.id === inv.packageId; });
      return Object.assign({}, inv, {
        memberName: mem ? mem.namaAnak : "—",
        packageName: pkg ? pkg.name : (inv.packageId ? "—" : "Custom")
      });
    }).sort(function (a, b) { return String(b.dueDate).localeCompare(String(a.dueDate)); });
  }

  function getInvoice(id) {
    const data = getAll();
    const inv = data.invoices.find(function (i) { return i.id === id; });
    if (!inv) return null;
    const en = enrichInvoice(inv, data);
    const mem = data.members.find(function (m) { return m.id === inv.memberId; });
    return Object.assign({}, en, { memberName: mem ? mem.namaAnak : "—" });
  }

  /**
   * Create invoice. If packageId set: amount defaults to package.price;
   * dueDate defaults to member.startDate + durationDays (monthly → 30).
   */
  function createInvoice(opts) {
    const data = loadRaw();
    const member = data.members.find(function (m) { return m.id === opts.memberId; });
    const pkg = opts.packageId
      ? data.packages.find(function (p) { return p.id === opts.packageId; })
      : null;

    var amount = opts.amount != null && opts.amount !== ""
      ? Number(opts.amount)
      : (pkg ? Number(pkg.price) : 0);

    var dueDate = opts.dueDate;
    if (!dueDate) {
      const start = (member && member.startDate) || todayISO();
      dueDate = defaultDueDate(start, pkg);
    }

    const inv = {
      id: uid("inv"),
      memberId: opts.memberId,
      packageId: opts.packageId || "",
      amount: amount,
      dueDate: dueDate,
      note: opts.note || "",
      status: opts.status || "draft",
      createdAt: new Date().toISOString(),
      issuedAt: null
    };
    data.invoices.push(inv);
    saveRaw(data);
    return enrichInvoice(inv, data);
  }

  function updateInvoice(id, patch) {
    const data = loadRaw();
    const i = data.invoices.findIndex(function (inv) { return inv.id === id; });
    if (i < 0) return null;
    data.invoices[i] = Object.assign({}, data.invoices[i], patch);
    saveRaw(data);
    return enrichInvoice(data.invoices[i], refreshInvoiceStatuses(data));
  }

  function markInvoiceTerbit(id) {
    return updateInvoice(id, {
      status: "terbit",
      issuedAt: new Date().toISOString()
    });
  }

  function getPayments() {
    const data = getAll();
    return data.payments
      .slice()
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })
      .map(function (p) {
        const inv = data.invoices.find(function (i) { return i.id === p.invoiceId; });
        const mem = inv ? data.members.find(function (m) { return m.id === inv.memberId; }) : null;
        const en = inv ? enrichInvoice(inv, data) : null;
        return Object.assign({}, p, {
          memberName: mem ? mem.namaAnak : "—",
          invoiceAmount: en ? en.amount : 0,
          invoiceRemaining: en ? en.remaining : 0,
          invoiceStatus: en ? en.status : "—",
          invoiceNote: inv ? (inv.note || inv.id) : "—"
        });
      });
  }

  /**
   * Record payment → update invoice status via refresh (lunas/sebagian/overdue)
   */
  function recordPayment(opts) {
    const data = loadRaw();
    const inv = data.invoices.find(function (i) { return i.id === opts.invoiceId; });
    if (!inv) throw new Error("Invoice tidak ditemukan");
    if (inv.status === "batal") throw new Error("Invoice batal — tidak bisa bayar");
    if (inv.status === "draft") throw new Error("Terbitkan invoice dulu sebelum menerima pembayaran");

    const pay = {
      id: uid("pay"),
      invoiceId: opts.invoiceId,
      amount: Number(opts.amount) || 0,
      method: opts.method || "transfer",
      date: opts.date || todayISO(),
      proofNote: opts.proofNote || "",
      createdAt: new Date().toISOString()
    };
    data.payments.push(pay);
    saveRaw(data);
    refreshInvoiceStatuses(data);

    const en = enrichInvoice(
      loadRaw().invoices.find(function (i) { return i.id === opts.invoiceId; }),
      loadRaw()
    );
    const mem = loadRaw().members.find(function (m) { return m.id === inv.memberId; });

    return {
      payment: pay,
      invoice: en,
      receipt: {
        paymentId: pay.id,
        date: pay.date,
        method: pay.method,
        amount: pay.amount,
        amountLabel: formatIDR(pay.amount),
        memberName: mem ? mem.namaAnak : "—",
        invoiceId: inv.id,
        invoiceNote: inv.note || "",
        invoiceAmount: en.amount,
        paidTotal: en.paidTotal,
        remaining: en.remaining,
        status: en.status,
        proofNote: pay.proofNote
      }
    };
  }

  function resetSeed() {
    const seeded = seedData();
    saveRaw(seeded);
    return seeded;
  }

  window.ClubStore = {
    KEY: KEY,
    formatIDR: formatIDR,
    todayISO: todayISO,
    addDays: addDays,
    defaultDueDate: defaultDueDate,
    getAll: getAll,
    getDashboard: getDashboard,
    getMembers: getMembers,
    getMember: getMember,
    saveMember: saveMember,
    getPackages: getPackages,
    savePackage: savePackage,
    deletePackage: deletePackage,
    getInvoices: getInvoices,
    getInvoice: getInvoice,
    createInvoice: createInvoice,
    updateInvoice: updateInvoice,
    markInvoiceTerbit: markInvoiceTerbit,
    enrichInvoice: enrichInvoice,
    invoiceRemaining: invoiceRemaining,
    memberOutstanding: memberOutstanding,
    memberHasTunggakan: memberHasTunggakan,
    getPayments: getPayments,
    recordPayment: recordPayment,
    refreshInvoiceStatuses: refreshInvoiceStatuses,
    resetSeed: resetSeed,
    FORMULAS: {
      remaining: "invoice.remaining = max(0, amount − Σ payments)",
      status: "lunas jika remaining=0; sebagian jika 0<remaining<amount; overdue jika remaining>0 & dueDate<hari ini (bukan draft/batal)",
      outstanding: "member.outstanding = Σ remaining invoice non-batal/non-draft",
      penerimaanBulanIni: "Σ payments dengan date di bulan berjalan",
      piutangOutstanding: "Σ remaining invoice status ≠ batal & ≠ draft",
      fromPackage: "amount = package.price; dueDate = startDate + durationDays (monthly default 30)"
    }
  };
})();
