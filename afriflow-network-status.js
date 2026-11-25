// Connectivity indicator only: no automatic replay or page reload.
(function(){
 'use strict';
 let busy=false, last=null, badge;
 function display(available){
  if(last===available)return;last=available;
  if(!badge){
   badge=document.createElement('div');badge.setAttribute('role','status');badge.setAttribute('aria-live','polite');
   badge.id='afriflow-network-status';
   Object.assign(badge.style,{position:'fixed',left:'50%',bottom:'calc(env(safe-area-inset-bottom, 0px) + 82px)',transform:'translateX(-50%)',zIndex:'10000',maxWidth:'calc(100vw - 24px)',padding:'8px 13px',borderRadius:'12px',font:'500 13px system-ui,sans-serif',boxShadow:'0 3px 12px #0002',pointerEvents:'none',textAlign:'center'});
   document.body.appendChild(badge);
  }
  badge.style.background=available?'#1f5d3a':'#80501b';badge.style.color='#fff';
  badge.textContent=available?'Connexion rétablie':'Connexion indisponible — envois non garantis';
  badge.hidden=false;
  if(available)setTimeout(()=>{if(last===true)badge.hidden=true;},3500);
  window.dispatchEvent(new CustomEvent('afriflow:network-status',{detail:{available}}));
 }
 async function probe(){
  if(busy)return;
  if(!navigator.onLine){display(false);return;}
  busy=true;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000);
  try{
   const r=await fetch('./offline-health.txt',{cache:'no-store',credentials:'omit',signal:controller.signal});
   const ok=r.ok&&(await r.text()).trim()==='afriflow-online-v1';
   if(last===null&&ok){last=true;return;}display(ok);
  }catch(_){display(false);}finally{clearTimeout(timer);busy=false;}
 }
 function init(){
  window.addEventListener('online',probe);
  window.addEventListener('offline',()=>display(false));
  window.addEventListener('focus',probe);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)probe();});
  setInterval(()=>{if(!document.hidden)probe();},30000);probe();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
