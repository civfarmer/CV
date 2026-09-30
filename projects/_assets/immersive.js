/* immersive.js — one full-screen mode for the 3D tools.
   On a phone the canvas is a window onto a scene whose controls sit above and below it, so half of
   what you can press is off screen while you look at the thing it changes. This gives the scene the
   whole display: tap the scene (or the ⛶ button) and the stage becomes fixed and full-viewport, the
   browser is asked for real full screen where it offers it, the screen is asked to turn landscape
   where it can (Android), and the panels that lived outside the stage come along in a drawer.
   ✕, Escape or the phone's back button put everything back exactly where it was.

   Usage (after the tool's own script):
     cfImmersive({ stage: '.viewbox', canvas: '#scene',
                   drawers: [{ title: 'Subsystems', el: '.panel' }],   // panels outside the stage (optional)
                   resize: function(){ ... },                          // called after the box changes (optional)
                   button: '(max-width: 700px)' | true | false });      // when the ⛶ button shows (default true)
   Returns { enter, exit, toggle, active }. */
(function () {
  'use strict';
  var CSS = [
    'html.cfimm-open,html.cfimm-open body{overflow:hidden!important;overscroll-behavior:none}',
    '.cfimm-stage{position:fixed!important;inset:0!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;height:100dvh!important;max-width:none!important;max-height:none!important;margin:0!important;border:0!important;border-radius:0!important;z-index:2147483000!important;box-sizing:border-box;background:#04060c;overflow:hidden!important;transition:none!important}',
    '.cfimm-stage>canvas,.cfimm-stage #scene{width:100%!important;height:100%!important;max-height:none!important;border:0!important;border-radius:0!important;display:block}',
    /* the side/bottom drawer takes its space from the stage's padding box, so the canvas (in flow)
       shrinks and the scene stays fully visible while the drawer is open */
    '.cfimm-stage.cfimm-drawer-open{padding-bottom:min(52vh,52dvh)!important}',
    '@media (orientation:landscape){.cfimm-stage.cfimm-drawer-open{padding-bottom:0!important;padding-right:min(46vw,400px)!important}}',
    '.cfimm-drawer{display:none;position:absolute;z-index:2147483002;background:var(--surface,#0f1522);color:var(--ink,#e8edf6);border:1px solid var(--line,#26304a);box-sizing:border-box;overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:10px 12px calc(12px + env(safe-area-inset-bottom,0px))}',
    '.cfimm-stage.cfimm-drawer-open .cfimm-drawer{display:block}',
    '.cfimm-drawer{left:0;right:0;bottom:0;height:min(52vh,52dvh);border-radius:14px 14px 0 0;border-bottom:0}',
    '@media (orientation:landscape){.cfimm-drawer{left:auto;top:0;right:0;bottom:0;height:auto;width:min(46vw,400px);border-radius:0;border-top:0;border-right:0;border-bottom:0;padding-right:calc(12px + env(safe-area-inset-right,0px))}}',
    '.cfimm-drawer>.cfimm-dh{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 8px;font:600 12px/1.2 var(--font-mono,ui-monospace,monospace);letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#7d8ba3)}',
    '.cfimm-drawer>.cfimm-dh button{font:600 12px/1 var(--font-mono,ui-monospace,monospace);padding:7px 10px;border-radius:999px;border:1px solid var(--line,#26304a);background:var(--bg2,#0f1522);color:var(--ink,#e8edf6);cursor:pointer}',
    '.cfimm-drawer .cfimm-dsec{margin:0 0 14px}',
    '.cfimm-drawer .cfimm-dsec>.cfimm-dt{font:600 11px/1.2 var(--font-mono,ui-monospace,monospace);letter-spacing:.14em;text-transform:uppercase;color:var(--accent,#43b3a6);margin:0 0 8px}',
    /* panels moved into the drawer keep their own styling; only the outer chrome is flattened */
    '.cfimm-drawer .cfimm-dsec>*:not(.cfimm-dt){background:transparent!important;border:0!important;border-radius:0!important;padding:0!important;margin:0!important;box-shadow:none!important;max-height:none!important}',
    /* the right-edge cluster: enter/exit, drawer, and nothing else — the tools own the corners */
    '.cfimm-cluster{position:absolute;right:calc(8px + env(safe-area-inset-right,0px));top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:8px;z-index:2147483003;pointer-events:none}',
    '.cfimm-cluster button{pointer-events:auto;width:44px;height:44px;border-radius:50%;border:1px solid var(--line,#26304a);background:color-mix(in oklab,var(--bg2,#0f1522) 82%,transparent);color:var(--ink,#e8edf6);font:600 16px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);box-shadow:0 2px 10px rgba(0,0,0,.35);-webkit-tap-highlight-color:transparent}',
    '.cfimm-cluster button:hover{border-color:var(--accent,#43b3a6)}',
    '.cfimm-cluster button.cfimm-drawerbtn{font-size:15px}',
    '.cfimm-stage.cfimm-drawer-open .cfimm-cluster{display:none}',
    '.cfimm-cluster.cfimm-hidden{display:none}',
    /* hint pills */
    '.cfimm-hint{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483003;pointer-events:none;font:600 12px/1.2 var(--font-mono,ui-monospace,monospace);padding:9px 13px;border-radius:999px;border:1px solid var(--line,#26304a);background:color-mix(in oklab,var(--bg2,#0f1522) 88%,transparent);color:var(--ink,#e8edf6);white-space:nowrap;max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity .35s ease}',
    '.cfimm-hint.cfimm-show{opacity:1}',
    '@media (prefers-reduced-motion:reduce){.cfimm-hint{transition:none}}'
  ].join('\n');

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function q(sel, root) { return typeof sel === 'string' ? (root || document).querySelector(sel) : sel; }
  function mq(s) { try { return !!(window.matchMedia && window.matchMedia(s).matches); } catch (e) { return false; } }
  function isPhone() { return mq('(pointer:coarse)') && (mq('(max-width:820px)') || mq('(max-height:520px)')); }
  var installed = false;
  function installCSS() { if (installed) return; installed = true; var s = el('style'); s.id = 'cfimm-css'; s.textContent = CSS; document.head.appendChild(s); }

  window.cfImmersive = function (opts) {
    opts = opts || {};
    var stage = q(opts.stage || '.viewbox'); if (!stage) return null;
    var canvas = q(opts.canvas || 'canvas', stage) || stage;
    var drawers = (opts.drawers || []).map(function (d) { var e = q(d.el); return e ? { title: d.title || '', el: e, ph: null } : null; }).filter(Boolean);
    installCSS();
    var on = false, pushed = false, askedFS = false, hintT = null, ph = null;
    var html = document.documentElement;

    /* --- chrome --- */
    var cluster = el('div', 'cfimm-cluster');
    var mainBtn = el('button', 'cfimm-mainbtn', '⛶'); mainBtn.type = 'button'; mainBtn.title = 'Full screen'; mainBtn.setAttribute('aria-label', 'Open the 3D view full screen');
    cluster.appendChild(mainBtn);
    var drawerBtn = null;
    if (drawers.length) { drawerBtn = el('button', 'cfimm-drawerbtn', '☰'); drawerBtn.type = 'button'; drawerBtn.title = 'Controls'; drawerBtn.setAttribute('aria-label', 'Show the controls'); drawerBtn.hidden = true; cluster.appendChild(drawerBtn); }
    stage.appendChild(cluster);
    var hint = el('div', 'cfimm-hint'); hint.setAttribute('aria-hidden', 'true'); stage.appendChild(hint);
    var drawer = null;
    if (drawers.length) {
      drawer = el('div', 'cfimm-drawer'); drawer.hidden = true;
      var dh = el('div', 'cfimm-dh'); dh.appendChild(el('span', '', 'Controls'));
      var closeB = el('button', '', '✕ Close'); closeB.type = 'button'; dh.appendChild(closeB); drawer.appendChild(dh);
      closeB.addEventListener('click', function () { setDrawer(false); });
      drawers.forEach(function (d) { d.sec = el('div', 'cfimm-dsec'); if (d.title) d.sec.appendChild(el('div', 'cfimm-dt', d.title)); drawer.appendChild(d.sec); });
      stage.appendChild(drawer);
    }
    function showButton() {
      var b = opts.button === undefined ? true : opts.button;
      var show = b === true || (typeof b === 'string' && mq(b));
      cluster.classList.toggle('cfimm-hidden', !show && !on);
    }
    function showHint(text, ms) {
      hint.textContent = text; hint.classList.add('cfimm-show'); clearTimeout(hintT);
      hintT = setTimeout(function () { hint.classList.remove('cfimm-show'); }, ms || 3200);
    }
    function relayout() {
      var fire = function () { try { if (opts.resize) opts.resize(); } catch (e) {} try { window.dispatchEvent(new Event('resize')); } catch (e) {} };
      requestAnimationFrame(function () { requestAnimationFrame(fire); });
      setTimeout(fire, 350); setTimeout(fire, 900);
    }
    function setDrawer(open) {
      if (!drawer) return;
      stage.classList.toggle('cfimm-drawer-open', open);
      drawer.hidden = !open;
      if (drawerBtn) drawerBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      relayout();
    }

    /* --- enter / exit --- */
    function enter() {
      if (on) return; on = true;
      ph = document.createComment('cfimm-stage'); stage.parentNode.insertBefore(ph, stage);
      document.body.appendChild(stage);
      stage.classList.add('cfimm-stage'); html.classList.add('cfimm-open');
      drawers.forEach(function (d) { d.ph = document.createComment('cfimm-drawer'); d.el.parentNode.insertBefore(d.ph, d.el); d.sec.appendChild(d.el); });
      if (drawer) drawer.hidden = true;
      mainBtn.innerHTML = '✕'; mainBtn.title = 'Exit full screen'; mainBtn.setAttribute('aria-label', 'Exit full screen');
      if (drawerBtn) drawerBtn.hidden = false;
      cluster.classList.remove('cfimm-hidden');
      try { history.pushState({ cfimm: 1 }, ''); pushed = true; } catch (e) { pushed = false; }
      var req = stage.requestFullscreen || stage.webkitRequestFullscreen;
      askedFS = false;
      if (req) {
        try {
          var p = req.call(stage, { navigationUI: 'hide' });
          askedFS = true;
          var lock = function () { if (isPhone() && screen.orientation && screen.orientation.lock) { try { var l = screen.orientation.lock('landscape'); if (l && l.catch) l.catch(function () {}); } catch (e) {} } };
          if (p && p.then) p.then(lock, function () { askedFS = false; }); else lock();
        } catch (e) { askedFS = false; }
      }
      if (isPhone()) {
        setTimeout(function () { if (on && mq('(orientation:portrait)')) showHint('Turn your phone sideways for the wide view', 4200); }, 900);
      }
      if (opts.onEnter) { try { opts.onEnter(); } catch (e) {} }
      relayout();
    }
    function exit(fromHistory) {
      if (!on) return; on = false;
      setDrawer(false);
      drawers.forEach(function (d) { if (d.ph && d.ph.parentNode) { d.ph.parentNode.insertBefore(d.el, d.ph); d.ph.parentNode.removeChild(d.ph); } d.ph = null; });
      if (ph && ph.parentNode) { ph.parentNode.insertBefore(stage, ph); ph.parentNode.removeChild(ph); } ph = null;
      stage.classList.remove('cfimm-stage'); html.classList.remove('cfimm-open');
      mainBtn.innerHTML = '⛶'; mainBtn.title = 'Full screen'; mainBtn.setAttribute('aria-label', 'Open the 3D view full screen');
      if (drawerBtn) drawerBtn.hidden = true;
      hint.classList.remove('cfimm-show');
      if (document.fullscreenElement || document.webkitFullscreenElement) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} }
      try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
      if (pushed && !fromHistory) { pushed = false; try { history.back(); } catch (e) {} } else pushed = false;
      showButton();
      if (opts.onExit) { try { opts.onExit(); } catch (e) {} }
      relayout();
    }
    function toggle() { on ? exit(false) : enter(); }

    /* --- wiring --- */
    mainBtn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
    if (drawerBtn) drawerBtn.addEventListener('click', function (e) { e.stopPropagation(); setDrawer(!stage.classList.contains('cfimm-drawer-open')); });
    window.addEventListener('popstate', function () { if (on) exit(true); });
    document.addEventListener('keydown', function (e) { if (on && (e.key === 'Escape' || e.key === 'Esc')) { e.preventDefault(); exit(false); } });
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
      document.addEventListener(ev, function () {
        var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (on && askedFS && !fsEl) { askedFS = false; exit(false); }   // Esc / back left real full screen: leave the mode with it
        relayout();
      });
    });
    /* phones: a tap on the scene (no drag) opens it full screen; drags still orbit. */
    if (opts.tap !== false) {
      var t0 = 0, tx = 0, ty = 0, moved = false, pid = null;
      canvas.addEventListener('pointerdown', function (e) { if (on || !isPhone() || e.pointerType === 'mouse') { pid = null; return; } pid = e.pointerId; t0 = Date.now(); tx = e.clientX; ty = e.clientY; moved = false; }, true);
      canvas.addEventListener('pointermove', function (e) { if (pid !== e.pointerId) return; if (Math.abs(e.clientX - tx) > 10 || Math.abs(e.clientY - ty) > 10) moved = true; }, true);
      canvas.addEventListener('pointerup', function (e) { if (pid !== e.pointerId) return; pid = null; if (!moved && Date.now() - t0 < 450 && !on && isPhone()) { enter(); } }, true);
      canvas.addEventListener('pointercancel', function () { pid = null; }, true);
      if (isPhone()) { setTimeout(function () { if (!on) showHint('Tap the scene to open it full screen ⛶', 5000); }, 1200); }
    }
    window.addEventListener('resize', showButton);
    showButton();
    return { enter: enter, exit: function () { exit(false); }, toggle: toggle, active: function () { return on; } };
  };
})();
