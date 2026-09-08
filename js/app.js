(function () {
  const pages = document.querySelectorAll(".page");
  const links = document.querySelectorAll(".nav-link");
  const navLinks = document.getElementById("navLinks");
  const navToggle = document.getElementById("navToggle");
  const toastEl = document.getElementById("toast");

  function showPage(id) {
    pages.forEach((p) => p.classList.toggle("active", p.id === "page-" + id));
    links.forEach((l) => l.classList.toggle("active", l.dataset.page === id));
    navLinks.classList.remove("open");
    window.scrollTo({ top: 0, behavior: "smooth" });
    history.replaceState(null, "", "#" + id);
    if (typeof window.TFDEV.onPage === "function") window.TFDEV.onPage(id);
  }

  window.TFDEV = window.TFDEV || {};
  window.TFDEV.toast = function (msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(window.TFDEV._toastT);
    window.TFDEV._toastT = setTimeout(() => toastEl.classList.remove("show"), 2200);
  };
  window.TFDEV.showPage = showPage;

  links.forEach((l) => l.addEventListener("click", () => window.TFDEV.showPage(l.dataset.page)));
  document.querySelectorAll("[data-go]").forEach((el) => {
    el.addEventListener("click", () => window.TFDEV.showPage(el.dataset.go));
  });
  navToggle.addEventListener("click", () => navLinks.classList.toggle("open"));

  if (window.TFDEV.initEvents) window.TFDEV.initEvents();
  if (window.TFDEV.initMatchCentre) window.TFDEV.initMatchCentre();
  if (window.TFDEV.initReport) window.TFDEV.initReport();
  if (window.TFDEV.initGenerate) window.TFDEV.initGenerate();
  if (window.TFDEV.initAnalitik) window.TFDEV.initAnalitik();
  if (window.TFDEV.initHighlights) window.TFDEV.initHighlights();
  if (window.TFDEV.initCoachDesk) window.TFDEV.initCoachDesk();
  if (window.TFDEV.initPlayer) window.TFDEV.initPlayer();
  if (window.TFDEV.initClub) window.TFDEV.initClub();

  const hash = (location.hash || "#home").replace("#", "");
  if (document.getElementById("page-" + hash)) showPage(hash);
  else showPage("home");
})();
