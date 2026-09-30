/* herobg.js — the washed clip behind a page's hero. The page ships the poster; this attaches the
   sources and plays the loop only where it is worth it: not on phones, not with reduced motion,
   not with data saver, and paused whenever the hero is off screen. */
(function(){
  var v=document.querySelector('.herobg-v'); if(!v||!v.canPlayType) return;
  var mq=function(s){ try{ return !!(window.matchMedia&&window.matchMedia(s).matches); }catch(e){ return false; } };
  if(mq('(prefers-reduced-motion:reduce)')||mq('(max-width:820px)')||(navigator.connection&&navigator.connection.saveData)) return;
  var w=v.getAttribute('data-webm'), m=v.getAttribute('data-mp4');
  if(w&&v.canPlayType('video/webm')){ var s=document.createElement('source'); s.src=w; s.type='video/webm'; v.appendChild(s); }
  if(m){ var s2=document.createElement('source'); s2.src=m; s2.type='video/mp4'; v.appendChild(s2); }
  v.load();
  function play(){ var p=v.play(); if(p&&p.catch) p.catch(function(){}); }
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting) play(); else v.pause(); }); },{threshold:.05}).observe(v);
  } else play();
})();
