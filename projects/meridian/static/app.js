// Theme toggle (persisted) + PWA service-worker registration. No trackers.
(function () {
  var KEY = "meridian-theme";
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  var btn = document.getElementById("theme-toggle");
  if (btn) btn.addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme");
    var next = cur === "dark" ? "light" : "dark";
    if (!cur) {
      next = window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark";
    }
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(KEY, next); } catch (e) {}
  });
})();

// Portfolio copy of the static export. The exporter baked three things into every
// page that read wrongly on a public site: a "private review" banner, four sidenav
// links to pages outside the snapshot, and server-side filter forms that submit to
// nothing. Rather than re-export 6,600 pages, each is corrected here at load.
(function () {
  var banner = document.querySelector(".static-banner");
  if (banner) {
    banner.textContent = "Static export of Meridian — Christopher Farmer’s regulatory-impact market tracker — frozen at the 2026-07-19 snapshot; a demonstration, not a live service.";
  }

  // The sidenav's four admin pages, and the match-detail pages the exporter trimmed
  // for size, all point at "#not-in-snapshot": make them plain, titled text.
  var dead = document.querySelectorAll('a[href="#not-in-snapshot"]');
  for (var i = 0; i < dead.length; i++) {
    var inNav = !!dead[i].closest(".sidenav");
    dead[i].removeAttribute("href");
    dead[i].setAttribute("aria-disabled", "true");
    dead[i].setAttribute("title", inNav ? "Not included in the static export" : "Match detail not included in the static export");
    dead[i].className += inNav ? " nav-off" : " link-off";
  }

  // Filter forms: the search box (and any free-text field) now filters the rows of
  // the tables on the page, client-side; selects need the server and are disabled.
  var forms = document.querySelectorAll("form.filters");
  for (var f = 0; f < forms.length; f++) wire(forms[f]);

  function wire(form) {
    var rows = document.querySelectorAll("main table tbody tr");
    var fields = [];
    var inputs = form.querySelectorAll("input, select");
    for (var j = 0; j < inputs.length; j++) {
      var el = inputs[j];
      if (el.type === "hidden") continue;
      if (el.tagName === "SELECT") {
        el.disabled = true;
        el.title = "Inactive in the static export";
      } else {
        fields.push(el);
        el.addEventListener("input", apply);
      }
    }
    var note = document.createElement("small");
    note.className = "filters-note";
    note.textContent = rows.length
      ? "Search filters the table below; the other controls are inactive in this static copy."
      : "Filters are inactive in this static copy.";
    form.appendChild(note);
    var count = document.createElement("span");
    count.className = "filters-count";
    count.setAttribute("aria-live", "polite");
    note.appendChild(count);
    form.addEventListener("submit", function (e) { e.preventDefault(); apply(); });

    function apply() {
      var terms = [];
      for (var k = 0; k < fields.length; k++) {
        var v = fields[k].value.trim().toLowerCase();
        if (v) terms.push(v);
      }
      var shown = 0;
      for (var r = 0; r < rows.length; r++) {
        var text = rows[r].textContent.toLowerCase();
        var hit = true;
        for (var t = 0; t < terms.length; t++) { if (text.indexOf(terms[t]) < 0) { hit = false; break; } }
        rows[r].hidden = !hit;
        if (hit) shown++;
      }
      count.textContent = terms.length ? " — " + shown + " of " + rows.length + " rows match." : "";
    }
  }
})();
