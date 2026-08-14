/* ============================================================================
   Shared site chrome.
   1. Theme: unifies on the cf-theme key + data-theme attribute (pages do their
      own pre-paint; this only adds a floating toggle where none exists).
   2. Geneva skyline: the procedural scene extracted from the home page —
      Salève and Jura ridges, sparse shore city, St-Pierre, Lac Léman band,
      Jet d'Eau with particle spray. One fixed full-viewport canvas per page.
      Animated only where the including <script> carries data-sky="live";
      everywhere else the scene is pre-warmed and drawn once (and redrawn on
      resize or theme change), so subpages pay no animation cost.
   ========================================================================== */
(function(){
  var LIVE=false;
  try{ LIVE=(document.currentScript&&document.currentScript.dataset.sky)==='live'; }catch(e){}

  /* ---- theme -------------------------------------------------------------- */
  function themeNow(){ return document.documentElement.getAttribute('data-theme')==='light'?'light':'dark'; }
  function setTheme(v){
    document.documentElement.setAttribute('data-theme',v);
    try{ localStorage.setItem('cf-theme',v); }catch(e){}
    var m=document.getElementById('themeColor'); if(m) m.content=(v==='light'?'#f4f1ec':'#0b0f17');
  }

  /* ---- skyline (shared implementation; theme-change redraw hooks) --------- */
  var _tokCache=null,_redraws=[];
  function _tokInvalidate(){ _tokCache=null; _redraws.forEach(function(f){ try{f();}catch(e){} }); }
  try{ new MutationObserver(_tokInvalidate).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']}); }catch(e){}
  try{ matchMedia('(prefers-color-scheme: light)').addEventListener('change',_tokInvalidate); }catch(e){}
  function tokens(){
    if(_tokCache) return _tokCache;
    var cs=getComputedStyle(document.documentElement);
    function v(n,f){ var x=cs.getPropertyValue(n).trim(); return x||f; }
    _tokCache={ line:v('--line','#26304a'), ink:v('--muted','#7c87a3'), accent:v('--accent','#43b3a6'),
                light:document.documentElement.getAttribute('data-theme')==='light' };
    return _tokCache;
  }

  function initSkyline(cvs,live){
    var ctx=cvs.getContext('2d'); if(!ctx) return;
    var w=0,h=0, particles=[], clouds=[];
    var reduce=(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || !live;
    function resize(){ w=cvs.width=cvs.clientWidth; h=cvs.height=cvs.clientHeight; if(reduce&&w&&h){ prewarm(); draw(); } }
    window.addEventListener('resize',resize);
    if(window.ResizeObserver){ try{ new ResizeObserver(resize).observe(cvs); }catch(e){} }
    function P(){ this.reset(); }
    P.prototype.reset=function(){ this.x=w*0.74+(Math.random()*8-4); this.y=h-18; this.vx=(Math.random()-0.5)*0.4; this.vy=-(Math.random()*3+4); this.life=Math.random()*0.6+0.4; this.age=0; this.size=Math.random()*1.5+0.5; };
    P.prototype.update=function(){ this.x+=this.vx; this.y+=this.vy; this.vy+=0.08; this.vx+=(Math.random()-0.5)*0.1; this.age+=0.01; };
    P.prototype.draw=function(color){ ctx.globalAlpha=Math.max(0,1-(this.age/this.life)); ctx.fillStyle=color; ctx.beginPath(); ctx.arc(this.x,this.y,this.size,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1; };
    for(var i=0;i<150;i++) particles.push(new P());
    clouds=[{x:0.1,y:58,s:0.05,sc:1},{x:0.5,y:94,s:0.08,sc:0.8},{x:0.8,y:38,s:0.03,sc:1.2},{x:0.33,y:30,s:0.06,sc:0.65}];
    function cloud(x,y,sc,color){ ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,y,20*sc,Math.PI*0.5,Math.PI*1.5); ctx.arc(x+20*sc,y-10*sc,20*sc,Math.PI,Math.PI*2); ctx.arc(x+45*sc,y,20*sc,Math.PI*1.5,Math.PI*0.5); ctx.fill(); }
    function ry(x,y0,a1,a2,ph){ return y0 - a1*Math.sin(x/150+ph) - a2*Math.cos(x/80+ph); }
    function ridge(y0,a1,a2,ph){ ctx.beginPath(); ctx.moveTo(0,h);
      for(var x=0;x<=w;x+=8){ ctx.lineTo(x, ry(x,y0,a1,a2,ph)); }
      ctx.lineTo(w, ry(w,y0,a1,a2,ph)); ctx.lineTo(w,h); ctx.closePath(); ctx.fill(); }
    var BX=[0.10,0.15,0.25,0.40,0.45,0.55,0.65,0.85,0.90],
        BH=[24,40,20,56,28,46,22,50,30],
        BW=[28,38,24,34,30,40,26,36,30];
    function city(color){ var base=h-33; ctx.fillStyle=color;
      ctx.fillRect(0,base,w,33);
      for(var i=0;i<BX.length;i++){ ctx.fillRect(w*BX[i], base-BH[i], BW[i], BH[i]); }
      ctx.fillRect(w*0.55+18, base-53, 2, 7);
      var cx=w*0.30;
      ctx.fillRect(cx,h-73,40,40);
      ctx.fillRect(cx-10,h-98,15,65); ctx.fillRect(cx+35,h-98,15,65);
      ctx.beginPath(); ctx.moveTo(cx+10,h-73); ctx.lineTo(cx+20,h-118); ctx.lineTo(cx+30,h-73); ctx.closePath(); ctx.fill();
      ctx.fillRect(cx+19,h-124,2,6); }
    function draw(){ if(!w||!h) return; var T=tokens();
      ctx.clearRect(0,0,w,h);
      ctx.globalAlpha=T.light?0.32:0.10; ctx.fillStyle=T.light?'#b8bcae':T.ink; ridge(h-118,16,0,2.6);
      ctx.globalAlpha=T.light?0.75:0.24; ctx.fillStyle=T.light?'#a3a896':T.ink; ridge(h-92,30,20,0);
      ctx.globalAlpha=T.light?0.10:0.14;
      for(var c=0;c<clouds.length;c++){ var cl=clouds[c]; if(!reduce){ cl.x+=cl.s/1000; if(cl.x>1.15) cl.x=-0.2; } cloud(cl.x*w, cl.y, cl.sc, T.ink); }
      ctx.globalAlpha=T.light?0.85:0.36; city(T.light?'#8b8f7f':T.ink);
      ctx.globalAlpha=0.18; ctx.fillStyle=T.accent; ctx.fillRect(0,h-18,w,18);
      var jx=w*0.74; ctx.globalAlpha=0.4; ctx.strokeStyle=T.accent; ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.moveTo(jx,h-16); ctx.quadraticCurveTo(jx+2,h-72,jx+5,h-120); ctx.stroke();
      ctx.globalAlpha=0.14; ctx.beginPath(); ctx.moveTo(jx,h-14); ctx.lineTo(jx,h-4); ctx.stroke();
      ctx.globalAlpha=1;
      for(var i=0;i<particles.length;i++){ var p=particles[i]; if(!reduce){ p.update(); if(p.age>=p.life||p.y>h-14) p.reset(); } p.draw(T.accent); }
      ctx.globalAlpha=1; }
    function prewarm(){ for(var s=0;s<40;s++){ for(var i2=0;i2<particles.length;i2++){ var q=particles[i2]; q.update(); if(q.age>=q.life||q.y>h-14) q.reset(); } } }
    function loop(){ if(!document.hidden) draw(); requestAnimationFrame(loop); }
    _redraws.push(function(){ if(reduce) draw(); });
    resize();
    if(reduce){ prewarm(); draw(); }
    else requestAnimationFrame(loop);
  }

  /* ---- assembly ----------------------------------------------------------- */
  function boot(){
    /* the fixed backdrop — one per page, behind everything */
    var cvs=document.querySelector('.skyline-canvas');
    if(!cvs){
      cvs=document.createElement('canvas');
      cvs.className='skyline-canvas cf-fixed';
      cvs.setAttribute('aria-hidden','true');
      document.body.appendChild(cvs);
    }else if(!cvs.classList.contains('cf-fixed')){
      cvs.classList.add('cf-fixed');
    }
    initSkyline(cvs,LIVE);

    /* floating toggle only where the page has no theme control */
    if(!document.querySelector('#theme,#themeBtn,.cftheme,[data-cf-toggle]')){
      var b=document.createElement('button');
      b.className='cf-toggle'; b.setAttribute('data-cf-toggle','');
      b.title='Toggle theme'; b.setAttribute('aria-label','Toggle light or dark theme');
      b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
      b.addEventListener('click',function(){ setTheme(themeNow()==='light'?'dark':'light'); });
      document.body.appendChild(b);
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
