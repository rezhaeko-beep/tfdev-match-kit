(function () {
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function idr(n) {
    return window.ClubStore.formatIDR(n);
  }

  function statusPill(st) {
    const map = {
      aktif: "ok", trial: "info", cuti: "warn", nonaktif: "muted",
      draft: "muted", terbit: "info", sebagian: "warn", lunas: "ok",
      overdue: "bad", batal: "muted",
      transfer: "info", cash: "ok", qris: "info", ewallet: "info"
    };
    const cls = map[st] || "muted";
    return '<span class="club-pill ' + cls + '">' + esc(st) + "</span>";
  }

  /* ---------- Finance Dashboard ---------- */
  function renderFinance() {
    const d = ClubStore.getDashboard();
    const set = function (id, text) {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set("finMemberAktif", String(d.memberAktif));
    set("finOverdue", String(d.overdueCount));
    set("finPenerimaan", idr(d.penerimaanBulanIni));
    set("finPiutang", idr(d.piutangOutstanding));

    const list = document.getElementById("finRecentPayments");
    if (!list) return;
    if (!d.recentPayments.length) {
      list.innerHTML = '<div class="empty-state">Belum ada pembayaran.</div>';
      return;
    }
    list.innerHTML = d.recentPayments.map(function (p) {
      return (
        '<div class="club-row">' +
          '<div class="club-row-main">' +
            "<strong>" + esc(p.memberName) + "</strong>" +
            '<div class="meta">' + esc(p.invoiceNote) + " · " + esc(p.method) +
              (p.proofNote ? " · " + esc(p.proofNote) : "") + "</div>" +
          "</div>" +
          '<div class="club-row-side">' +
            "<strong>" + idr(p.amount) + "</strong>" +
            '<div class="meta">' + esc(p.date) + "</div>" +
          "</div>" +
        "</div>"
      );
    }).join("");
  }

  /* ---------- Members ---------- */
  var editingMemberId = null;

  function renderMembers() {
    const q = (document.getElementById("memSearch") || {}).value || "";
    const st = (document.getElementById("memFilter") || {}).value || "all";
    const members = ClubStore.getMembers({ q: q, status: st });
    const body = document.getElementById("memTableBody");
    if (!body) return;
    if (!members.length) {
      body.innerHTML = '<tr><td colspan="6" class="pd-empty">Tidak ada member.</td></tr>';
      return;
    }
    body.innerHTML = members.map(function (m) {
      return (
        '<tr class="club-click-row" data-id="' + esc(m.id) + '">' +
          "<td><strong>" + esc(m.namaAnak) + "</strong><div class=\"meta\">" +
            esc(m.ageGroup || "—") + " · " + esc(m.posisi || "—") + "</div></td>" +
          "<td>" + esc(m.namaOrtu || "—") + "<div class=\"meta\">" + esc(m.waOrtu || "") + "</div></td>" +
          "<td>" + esc(m.packageName) + "</td>" +
          "<td>" + statusPill(m.status) +
            (m.tunggakan ? ' <span class="club-pill bad">tunggakan</span>' : "") + "</td>" +
          "<td>" + idr(m.outstanding) + "</td>" +
          '<td><button type="button" class="btn btn-ghost btn-sm mem-edit" data-id="' + esc(m.id) + '">Edit</button></td>' +
        "</tr>"
      );
    }).join("");

    body.querySelectorAll(".club-click-row, .mem-edit").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        openMemberDrawer(el.dataset.id || el.closest("tr").dataset.id);
      });
    });
  }

  function fillPackageSelect(sel, selected) {
    if (!sel) return;
    const pkgs = ClubStore.getPackages(false);
    sel.innerHTML = '<option value="">— tanpa paket —</option>' +
      pkgs.map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (p.id === selected ? " selected" : "") + ">" +
          esc(p.name) + " (" + idr(p.price) + ")" + (p.active ? "" : " [nonaktif]") + "</option>";
      }).join("");
  }

  function openMemberDrawer(id) {
    editingMemberId = id || null;
    const drawer = document.getElementById("memDrawer");
    const title = document.getElementById("memDrawerTitle");
    const form = document.getElementById("memForm");
    if (!drawer || !form) return;
    form.reset();
    fillPackageSelect(document.getElementById("memPaketId"), "");
    document.getElementById("memId").value = "";
    title.textContent = id ? "Edit Member" : "Tambah Member";

    if (id) {
      const m = ClubStore.getMember(id);
      if (m) {
        document.getElementById("memId").value = m.id;
        document.getElementById("memNamaAnak").value = m.namaAnak || "";
        document.getElementById("memDob").value = m.dob || "";
        document.getElementById("memAgeGroup").value = m.ageGroup || "";
        document.getElementById("memPosisi").value = m.posisi || "";
        document.getElementById("memKaki").value = m.kaki || "";
        document.getElementById("memNamaOrtu").value = m.namaOrtu || "";
        document.getElementById("memWaOrtu").value = m.waOrtu || "";
        document.getElementById("memEmail").value = m.email || "";
        fillPackageSelect(document.getElementById("memPaketId"), m.paketId || "");
        document.getElementById("memStartDate").value = m.startDate || "";
        document.getElementById("memStatus").value = m.status || "aktif";
        document.getElementById("memNotes").value = m.notes || "";
        document.getElementById("memOutstandingHint").textContent =
          "Outstanding: " + idr(m.outstanding) + " · rumus: Σ remaining invoice non-batal";
      }
    } else {
      document.getElementById("memStartDate").value = ClubStore.todayISO();
      document.getElementById("memStatus").value = "aktif";
      document.getElementById("memOutstandingHint").textContent = "";
      fillPackageSelect(document.getElementById("memPaketId"), "");
    }
    drawer.classList.add("open");
    document.getElementById("clubDrawerBackdrop").classList.add("open");
  }

  function closeDrawers() {
    document.querySelectorAll(".club-drawer.open").forEach(function (d) { d.classList.remove("open"); });
    const bd = document.getElementById("clubDrawerBackdrop");
    if (bd) bd.classList.remove("open");
  }

  function saveMemberFromForm(e) {
    e.preventDefault();
    const member = {
      id: document.getElementById("memId").value || undefined,
      namaAnak: document.getElementById("memNamaAnak").value.trim(),
      dob: document.getElementById("memDob").value || "",
      ageGroup: document.getElementById("memAgeGroup").value.trim(),
      posisi: document.getElementById("memPosisi").value.trim(),
      kaki: document.getElementById("memKaki").value,
      namaOrtu: document.getElementById("memNamaOrtu").value.trim(),
      waOrtu: document.getElementById("memWaOrtu").value.trim(),
      email: document.getElementById("memEmail").value.trim(),
      paketId: document.getElementById("memPaketId").value || "",
      startDate: document.getElementById("memStartDate").value || ClubStore.todayISO(),
      status: document.getElementById("memStatus").value || "aktif",
      notes: document.getElementById("memNotes").value.trim()
    };
    if (!member.namaAnak) {
      window.TFDEV.toast("Nama anak wajib");
      return;
    }
    ClubStore.saveMember(member);
    closeDrawers();
    renderMembers();
    renderFinance();
    window.TFDEV.toast("Member disimpan");
  }

  /* ---------- Packages ---------- */
  var editingPkgId = null;

  function renderPackages() {
    const list = document.getElementById("pkgList");
    if (!list) return;
    const pkgs = ClubStore.getPackages(false);
    if (!pkgs.length) {
      list.innerHTML = '<div class="empty-state">Belum ada paket.</div>';
      return;
    }
    list.innerHTML = pkgs.map(function (p) {
      return (
        '<div class="club-row">' +
          '<div class="club-row-main">' +
            "<strong>" + esc(p.name) + "</strong>" +
            '<div class="meta">' + statusPill(p.type) +
              (p.ageGroup ? " · " + esc(p.ageGroup) : "") +
              " · " + esc(String(p.durationDays)) + " hari" +
              (p.active ? "" : " · nonaktif") + "</div>" +
          "</div>" +
          '<div class="club-row-side">' +
            "<strong>" + idr(p.price) + "</strong>" +
            '<div class="btn-row" style="margin:6px 0 0;justify-content:flex-end">' +
              '<button type="button" class="btn btn-ghost btn-sm pkg-edit" data-id="' + esc(p.id) + '">Edit</button>' +
              '<button type="button" class="btn btn-danger btn-sm pkg-del" data-id="' + esc(p.id) + '">Hapus</button>' +
            "</div>" +
          "</div>" +
        "</div>"
      );
    }).join("");

    list.querySelectorAll(".pkg-edit").forEach(function (btn) {
      btn.addEventListener("click", function () { openPkgForm(btn.dataset.id); });
    });
    list.querySelectorAll(".pkg-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("Hapus paket ini?")) return;
        ClubStore.deletePackage(btn.dataset.id);
        renderPackages();
        window.TFDEV.toast("Paket dihapus");
      });
    });
  }

  function openPkgForm(id) {
    editingPkgId = id || null;
    const form = document.getElementById("pkgForm");
    const title = document.getElementById("pkgFormTitle");
    form.reset();
    document.getElementById("pkgId").value = "";
    document.getElementById("pkgActive").checked = true;
    title.textContent = id ? "Edit Paket" : "Tambah Paket";
    if (id) {
      const p = ClubStore.getPackages(false).find(function (x) { return x.id === id; });
      if (p) {
        document.getElementById("pkgId").value = p.id;
        document.getElementById("pkgName").value = p.name;
        document.getElementById("pkgType").value = p.type;
        document.getElementById("pkgPrice").value = p.price;
        document.getElementById("pkgDuration").value = p.durationDays;
        document.getElementById("pkgAgeGroup").value = p.ageGroup || "";
        document.getElementById("pkgActive").checked = !!p.active;
      }
    } else {
      document.getElementById("pkgType").value = "monthly";
      document.getElementById("pkgDuration").value = "30";
    }
    document.getElementById("pkgFormCard").hidden = false;
  }

  function savePackageFromForm(e) {
    e.preventDefault();
    const pkg = {
      id: document.getElementById("pkgId").value || undefined,
      name: document.getElementById("pkgName").value.trim(),
      type: document.getElementById("pkgType").value,
      price: Number(document.getElementById("pkgPrice").value) || 0,
      durationDays: Number(document.getElementById("pkgDuration").value) || 30,
      ageGroup: document.getElementById("pkgAgeGroup").value.trim(),
      active: document.getElementById("pkgActive").checked
    };
    if (!pkg.name) {
      window.TFDEV.toast("Nama paket wajib");
      return;
    }
    ClubStore.savePackage(pkg);
    document.getElementById("pkgFormCard").hidden = true;
    renderPackages();
    window.TFDEV.toast("Paket disimpan");
  }

  /* ---------- Invoices ---------- */
  function renderInvoices() {
    const st = (document.getElementById("invFilter") || {}).value || "all";
    const rows = ClubStore.getInvoices({ status: st });
    const body = document.getElementById("invTableBody");
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7" class="pd-empty">Belum ada tagihan.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function (inv) {
      const actions = [];
      if (inv.status === "draft") {
        actions.push('<button type="button" class="btn btn-sm inv-terbit" data-id="' + esc(inv.id) + '">Tandai terbit</button>');
      }
      if (inv.status !== "batal" && inv.status !== "lunas" && inv.status !== "draft") {
        actions.push('<button type="button" class="btn btn-ghost btn-sm inv-pay" data-id="' + esc(inv.id) + '">Bayar</button>');
      }
      if (inv.status !== "batal" && inv.status !== "lunas") {
        actions.push('<button type="button" class="btn btn-danger btn-sm inv-batal" data-id="' + esc(inv.id) + '">Batal</button>');
      }
      return (
        "<tr>" +
          "<td><strong>" + esc(inv.memberName) + "</strong><div class=\"meta\">" + esc(inv.note || inv.id) + "</div></td>" +
          "<td>" + esc(inv.packageName) + "</td>" +
          "<td>" + idr(inv.amount) + "</td>" +
          "<td>" + idr(inv.remaining) + '<div class="meta rumus-hint">amount − bayar</div></td>' +
          "<td>" + esc(inv.dueDate) + "</td>" +
          "<td>" + statusPill(inv.status) + "</td>" +
          '<td><div class="btn-row" style="margin:0">' + actions.join("") + "</div></td>" +
        "</tr>"
      );
    }).join("");

    body.querySelectorAll(".inv-terbit").forEach(function (btn) {
      btn.addEventListener("click", function () {
        ClubStore.markInvoiceTerbit(btn.dataset.id);
        renderInvoices();
        renderFinance();
        renderMembers();
        window.TFDEV.toast("Invoice diterbitkan");
      });
    });
    body.querySelectorAll(".inv-batal").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("Batalkan invoice?")) return;
        ClubStore.updateInvoice(btn.dataset.id, { status: "batal" });
        renderInvoices();
        renderFinance();
        renderMembers();
        window.TFDEV.toast("Invoice dibatalkan");
      });
    });
    body.querySelectorAll(".inv-pay").forEach(function (btn) {
      btn.addEventListener("click", function () {
        window.TFDEV.showPage("payments");
        setTimeout(function () {
          const sel = document.getElementById("payInvoiceId");
          if (sel) {
            fillPayInvoiceSelect(btn.dataset.id);
            onPayInvoiceChange();
          }
        }, 50);
      });
    });
  }

  function fillInvMemberSelect() {
    const sel = document.getElementById("invMemberId");
    if (!sel) return;
    const members = ClubStore.getMembers({ status: "all" });
    sel.innerHTML = '<option value="">— pilih member —</option>' +
      members.map(function (m) {
        return '<option value="' + esc(m.id) + '">' + esc(m.namaAnak) + " (" + esc(m.status) + ")</option>";
      }).join("");
  }

  function fillInvPackageSelect() {
    const sel = document.getElementById("invPackageId");
    if (!sel) return;
    const pkgs = ClubStore.getPackages(true);
    sel.innerHTML = '<option value="">— custom / tanpa paket —</option>' +
      pkgs.map(function (p) {
        return '<option value="' + esc(p.id) + '" data-price="' + p.price + '" data-days="' + p.durationDays + '">' +
          esc(p.name) + " · " + idr(p.price) + "</option>";
      }).join("");
  }

  function onInvPackageChange() {
    const sel = document.getElementById("invPackageId");
    const amountEl = document.getElementById("invAmount");
    const dueEl = document.getElementById("invDueDate");
    const memId = document.getElementById("invMemberId").value;
    const opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) return;
    const price = Number(opt.getAttribute("data-price")) || 0;
    const days = Number(opt.getAttribute("data-days")) || 30;
    amountEl.value = price;
    const mem = memId ? ClubStore.getMember(memId) : null;
    const start = (mem && mem.startDate) || ClubStore.todayISO();
    dueEl.value = ClubStore.addDays(start, days);
    document.getElementById("invFormulaHint").textContent =
      "Rumus: amount = harga paket (" + idr(price) + "); dueDate = startDate + " + days + " hari (bisa diubah).";
  }

  function openInvForm() {
    fillInvMemberSelect();
    fillInvPackageSelect();
    document.getElementById("invForm").reset();
    document.getElementById("invDueDate").value = ClubStore.addDays(ClubStore.todayISO(), 30);
    document.getElementById("invFormulaHint").textContent =
      "Rumus: dari paket → amount = package.price; dueDate = startDate + durationDays.";
    document.getElementById("invFormCard").hidden = false;
  }

  function saveInvoiceFromForm(e) {
    e.preventDefault();
    const memberId = document.getElementById("invMemberId").value;
    if (!memberId) {
      window.TFDEV.toast("Pilih member");
      return;
    }
    const packageId = document.getElementById("invPackageId").value || "";
    const amountRaw = document.getElementById("invAmount").value;
    const inv = ClubStore.createInvoice({
      memberId: memberId,
      packageId: packageId,
      amount: amountRaw === "" ? undefined : Number(amountRaw),
      dueDate: document.getElementById("invDueDate").value || undefined,
      note: document.getElementById("invNote").value.trim(),
      status: "draft"
    });
    document.getElementById("invFormCard").hidden = true;
    renderInvoices();
    renderFinance();
    window.TFDEV.toast("Invoice draft dibuat · " + idr(inv.amount));
  }

  /* ---------- Payments ---------- */
  function fillPayInvoiceSelect(preferId) {
    const sel = document.getElementById("payInvoiceId");
    if (!sel) return;
    const invs = ClubStore.getInvoices({ status: "all" }).filter(function (i) {
      return i.status !== "batal" && i.status !== "draft" && i.status !== "lunas" && i.remaining > 0;
    });
    sel.innerHTML = '<option value="">— pilih tagihan —</option>' +
      invs.map(function (i) {
        return '<option value="' + esc(i.id) + '"' + (i.id === preferId ? " selected" : "") + ">" +
          esc(i.memberName) + " · sisa " + idr(i.remaining) + " / " + idr(i.amount) +
          " · " + esc(i.status) + "</option>";
      }).join("");
    if (preferId) sel.value = preferId;
  }

  function onPayInvoiceChange() {
    const id = document.getElementById("payInvoiceId").value;
    const hint = document.getElementById("payFormulaHint");
    const amountEl = document.getElementById("payAmount");
    if (!id) {
      hint.textContent = "Rumus: remaining = max(0, amount − Σ payments). Status auto lunas/sebagian/overdue.";
      return;
    }
    const inv = ClubStore.getInvoice(id);
    if (!inv) return;
    amountEl.value = inv.remaining;
    hint.textContent =
      "Sisa tagihan " + idr(inv.remaining) + " dari " + idr(inv.amount) +
      " (sudah bayar " + idr(inv.paidTotal) + "). remaining = max(0, amount − Σ payments).";
  }

  function renderPayments() {
    const list = document.getElementById("payList");
    if (!list) return;
    const rows = ClubStore.getPayments();
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">Belum ada pembayaran.</div>';
      return;
    }
    list.innerHTML = rows.map(function (p) {
      return (
        '<div class="club-row">' +
          '<div class="club-row-main">' +
            "<strong>" + esc(p.memberName) + "</strong>" +
            '<div class="meta">' + esc(p.invoiceNote) + " · " + statusPill(p.method) +
              (p.proofNote ? " · " + esc(p.proofNote) : "") + "</div>" +
            '<div class="meta">Invoice: ' + statusPill(p.invoiceStatus) +
              " · sisa " + idr(p.invoiceRemaining) + "</div>" +
          "</div>" +
          '<div class="club-row-side">' +
            "<strong>" + idr(p.amount) + "</strong>" +
            '<div class="meta">' + esc(p.date) + "</div>" +
          "</div>" +
        "</div>"
      );
    }).join("");
  }

  function savePaymentFromForm(e) {
    e.preventDefault();
    const invoiceId = document.getElementById("payInvoiceId").value;
    if (!invoiceId) {
      window.TFDEV.toast("Pilih tagihan");
      return;
    }
    try {
      const result = ClubStore.recordPayment({
        invoiceId: invoiceId,
        amount: Number(document.getElementById("payAmount").value) || 0,
        method: document.getElementById("payMethod").value,
        date: document.getElementById("payDate").value || ClubStore.todayISO(),
        proofNote: document.getElementById("payProof").value.trim()
      });
      showReceipt(result.receipt);
      document.getElementById("payForm").reset();
      document.getElementById("payDate").value = ClubStore.todayISO();
      fillPayInvoiceSelect();
      renderPayments();
      renderInvoices();
      renderFinance();
      renderMembers();
      window.TFDEV.toast("Pembayaran tercatat · " + result.receipt.amountLabel);
    } catch (err) {
      window.TFDEV.toast(err.message || "Gagal simpan");
    }
  }

  function showReceipt(r) {
    const box = document.getElementById("payReceipt");
    if (!box) return;
    box.hidden = false;
    box.innerHTML =
      '<h3>Kwitansi / Ringkasan</h3>' +
      '<div class="club-receipt">' +
        "<div><span>No</span><strong>" + esc(r.paymentId) + "</strong></div>" +
        "<div><span>Tanggal</span><strong>" + esc(r.date) + "</strong></div>" +
        "<div><span>Member</span><strong>" + esc(r.memberName) + "</strong></div>" +
        "<div><span>Metode</span><strong>" + esc(r.method) + "</strong></div>" +
        "<div><span>Jumlah bayar</span><strong class=\"orange\">" + esc(r.amountLabel) + "</strong></div>" +
        "<div><span>Total invoice</span><strong>" + idr(r.invoiceAmount) + "</strong></div>" +
        "<div><span>Sudah dibayar</span><strong>" + idr(r.paidTotal) + "</strong></div>" +
        "<div><span>Sisa (remaining)</span><strong>" + idr(r.remaining) + "</strong></div>" +
        "<div><span>Status invoice</span><strong>" + statusPill(r.status) + "</strong></div>" +
        (r.proofNote ? "<div><span>Bukti</span><strong>" + esc(r.proofNote) + "</strong></div>" : "") +
        '<p class="rumus-hint">Rumus: remaining = max(0, amount − Σ payments) → status auto.</p>' +
      "</div>";
  }

  /* ---------- Page refresh hooks ---------- */
  function refreshAll() {
    ClubStore.refreshInvoiceStatuses();
    renderFinance();
    renderMembers();
    renderPackages();
    renderInvoices();
    renderPayments();
    fillPayInvoiceSelect();
  }

  window.TFDEV = window.TFDEV || {};
  window.TFDEV.initClub = function () {
    // Finance
    // Members
    const addBtn = document.getElementById("memAddBtn");
    if (addBtn) addBtn.addEventListener("click", function () { openMemberDrawer(null); });
    const memSearch = document.getElementById("memSearch");
    if (memSearch) memSearch.addEventListener("input", renderMembers);
    const memFilter = document.getElementById("memFilter");
    if (memFilter) memFilter.addEventListener("change", renderMembers);
    const memForm = document.getElementById("memForm");
    if (memForm) memForm.addEventListener("submit", saveMemberFromForm);
    document.querySelectorAll("[data-close-drawer]").forEach(function (btn) {
      btn.addEventListener("click", closeDrawers);
    });
    const bd = document.getElementById("clubDrawerBackdrop");
    if (bd) bd.addEventListener("click", closeDrawers);

    // Packages
    const pkgAdd = document.getElementById("pkgAddBtn");
    if (pkgAdd) pkgAdd.addEventListener("click", function () { openPkgForm(null); });
    const pkgForm = document.getElementById("pkgForm");
    if (pkgForm) pkgForm.addEventListener("submit", savePackageFromForm);
    const pkgCancel = document.getElementById("pkgCancelBtn");
    if (pkgCancel) pkgCancel.addEventListener("click", function () {
      document.getElementById("pkgFormCard").hidden = true;
    });

    // Invoices
    const invAdd = document.getElementById("invAddBtn");
    if (invAdd) invAdd.addEventListener("click", openInvForm);
    const invForm = document.getElementById("invForm");
    if (invForm) invForm.addEventListener("submit", saveInvoiceFromForm);
    const invCancel = document.getElementById("invCancelBtn");
    if (invCancel) invCancel.addEventListener("click", function () {
      document.getElementById("invFormCard").hidden = true;
    });
    const invPkg = document.getElementById("invPackageId");
    if (invPkg) invPkg.addEventListener("change", onInvPackageChange);
    const invMem = document.getElementById("invMemberId");
    if (invMem) invMem.addEventListener("change", function () {
      if (document.getElementById("invPackageId").value) onInvPackageChange();
    });
    const invFilter = document.getElementById("invFilter");
    if (invFilter) invFilter.addEventListener("change", renderInvoices);

    // Payments
    const payForm = document.getElementById("payForm");
    if (payForm) payForm.addEventListener("submit", savePaymentFromForm);
    const payInv = document.getElementById("payInvoiceId");
    if (payInv) payInv.addEventListener("change", onPayInvoiceChange);
    const payDate = document.getElementById("payDate");
    if (payDate && !payDate.value) payDate.value = ClubStore.todayISO();

    const resetBtn = document.getElementById("clubResetSeed");
    if (resetBtn) resetBtn.addEventListener("click", function () {
      if (!confirm("Reset data Club ke sample seed?")) return;
      ClubStore.resetSeed();
      refreshAll();
      window.TFDEV.toast("Seed Club di-reset");
    });

    window.TFDEV.onPage = function (id) {
      if (["finance", "members", "packages", "invoices", "payments"].indexOf(id) !== -1) {
        refreshAll();
      }
    };

    refreshAll();
  };
})();
