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
