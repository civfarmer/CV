/* ============================================================================
   Consent-gated Google Analytics 4 (Consent Mode v2).
   Nothing is loaded and nothing is stored until the visitor chooses. The choice
   ('granted' | 'denied') lives in localStorage under cf-consent; the bar is shown
   once, on the first first-party page a visitor lands on, and never inside an
   embedded frame (the parent page carries the bar; the choice is shared).

   Measurement ID: set data-ga="G-…" on <html>, or fill in CF_GA_ID below. While
   the placeholder is in place the script is inert — no bar, no request — so the
   site never asks consent for analytics that are not configured.
   window.cfConsentReset() clears the stored choice and shows the bar again
   (the "Change cookie choice" link on the privacy page).
   ========================================================================== */
window.CF_GA_ID = window.CF_GA_ID || 'G-48E4YLWR81';
(function(){
  'use strict';
  var KEY='cf-consent';
  var ID=(document.documentElement.dataset&&document.documentElement.dataset.ga)||window.CF_GA_ID||'';
  var CONFIGURED=/^G-[A-Z0-9]{4,}$/.test(ID)&&ID!=='G-XXXXXXXXXX';
  var loaded=false, bar=null;

  /* path of privacy.html relative to the page — derived from this script's own src */
  var ROOT='';
  try{ var s=document.currentScript&&document.currentScript.getAttribute('src'); if(s) ROOT=s.replace(/assets\/consent\.js.*$/,''); }catch(e){}

  window.dataLayer=window.dataLayer||[];
  function gtag(){ window.dataLayer.push(arguments); }
  if(typeof window.gtag!=='function') window.gtag=gtag;

  function read(){ try{ return localStorage.getItem(KEY); }catch(e){ return null; } }
  function write(v){ try{ localStorage.setItem(KEY,v); }catch(e){} }

  function loadGtag(){
    if(loaded||!CONFIGURED) return; loaded=true;
    var sc=document.createElement('script'); sc.async=true;
    sc.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(ID);
    document.head.appendChild(sc);
    window.gtag('js',new Date());
    window.gtag('config',ID,{anonymize_ip:true,send_page_view:true});
  }
  function grant(){ window.gtag('consent','update',{analytics_storage:'granted'}); loadGtag(); }
  /* Decline after an earlier Allow: expire the _ga / _ga_<id> cookies so nothing lingers */
  function clearGaCookies(){
    try{
      var names=document.cookie.split(';').map(function(c){ return c.split('=')[0].trim(); }).filter(function(n){ return n.indexOf('_ga')===0; });
      var paths=['/','/CV/',location.pathname.replace(/[^/]*$/,'')];
      names.forEach(function(n){ paths.forEach(function(p){ document.cookie=n+'=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path='+p; document.cookie=n+'=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path='+p+'; domain='+location.hostname; }); });
    }catch(e){}
  }

  function css(){
    if(document.getElementById('cf-consent-css')) return;
    var st=document.createElement('style'); st.id='cf-consent-css';
    st.textContent=
      '.cf-consent{position:fixed;left:12px;right:12px;bottom:12px;z-index:60;margin:0 auto;max-width:640px;'+
      'display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;padding:12px 16px;'+
      'border:1px solid var(--line2,#2c3d54);border-radius:12px;background:var(--surface,#131b2a);color:var(--ink,#e9eef7);'+
      'box-shadow:0 18px 50px -20px rgba(0,0,0,.7);font:14px/1.5 var(--font-body,Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif)}'+
      '.cf-consent p{margin:0;flex:1 1 300px;color:var(--ink2,#aab7cc)}'+
      '.cf-consent a{color:var(--accent-ink,#84d6ca);text-decoration:underline;text-underline-offset:2px}'+
      '.cf-consent .acts{display:flex;gap:8px;flex:0 0 auto}'+
      '.cf-consent button{font-family:inherit;font-size:13px;font-weight:600;line-height:1;padding:9px 14px;border-radius:9px;cursor:pointer;'+
      'border:1px solid var(--line2,#2c3d54);background:var(--surface2,#182133);color:var(--ink,#e9eef7)}'+
      '.cf-consent button.allow{background:var(--accent,#43b3a6);border-color:var(--accent,#43b3a6);color:#fff}'+
      'html[data-theme="dark"] .cf-consent button.allow{background:#0b655b;border-color:#0b655b}'+
      '.cf-consent button:hover{filter:brightness(1.08)}'+
      '.cf-consent button:focus-visible{outline:2px solid var(--accent,#43b3a6);outline-offset:2px}'+
      '@media (prefers-color-scheme: light){html:not([data-theme]) .cf-consent{background:#fff;color:#221e18;border-color:#d9d2c5;box-shadow:0 18px 44px -24px rgba(15,30,60,.35)}'+
      'html:not([data-theme]) .cf-consent p{color:#4c473e}html:not([data-theme]) .cf-consent a{color:#0a463f}'+
      'html:not([data-theme]) .cf-consent button{background:#faf7f2;color:#221e18;border-color:#d9d2c5}'+
      'html:not([data-theme]) .cf-consent button.allow{background:#0d5f57;border-color:#0d5f57;color:#fff}}'+
      '@media print{.cf-consent{display:none!important}}';
    document.head.appendChild(st);
  }

  function show(){
    if(bar||!CONFIGURED) return; css();
    bar=document.createElement('div');
    bar.className='cf-consent'; bar.id='cf-consent';
    bar.setAttribute('role','region'); bar.setAttribute('aria-label','Cookie choice'); bar.setAttribute('aria-live','polite');
    bar.innerHTML='<p>This site counts visits with Google Analytics only if you allow it. <a href="'+ROOT+'privacy.html">Privacy</a></p>'+
      '<div class="acts"><button type="button" class="allow">Allow</button><button type="button" class="decline">Decline</button></div>';
    bar.querySelector('.allow').addEventListener('click',function(){ write('granted'); hide(); grant(); });
    bar.querySelector('.decline').addEventListener('click',function(){ write('denied'); hide(); clearGaCookies(); });
    document.body.appendChild(bar);
  }
  function hide(){ if(bar&&bar.parentNode) bar.parentNode.removeChild(bar); bar=null; }

  window.cfConsentReset=function(){
    try{ localStorage.removeItem(KEY); }catch(e){}
    hide(); if(document.body) show(); else document.addEventListener('DOMContentLoaded',show);
  };

  /* Consent default goes on the dataLayer before gtag.js could ever load */
  window.gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500});

  function boot(){
    var c=read();
    if(c==='granted'){ grant(); return; }
    if(c==='denied') return;
    var embedded=false; try{ embedded=(window.self!==window.top); }catch(e){ embedded=true; }
    if(!embedded) show();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
