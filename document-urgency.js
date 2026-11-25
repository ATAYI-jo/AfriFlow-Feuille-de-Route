/* Contextual urgency for Dropbox documents. Supabase policies must restrict write access to administrators. */
(function(){
"use strict";
var KEY="pub:docurgent",busy=false,lastSeen="",lastPath="";
var alertIcon='<svg aria-hidden="true" focusable="false" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 4.7a2 2 0 0 1 3.4 0l8 13.8a2 2 0 0 1-1.7 3H4a2 2 0 0 1-1.7-3z"/><path d="M12 9v5m0 3h.01"/></svg>',knownItems=null;
function renderCardStatus(){
 if(!knownItems)return;
 document.querySelectorAll(".dcard[data-document-path]").forEach(function(card){
   var item=knownItems[card.dataset.documentPath.toLowerCase()];
   var urgent=!!(item&&item.urgent),row=card.querySelector(".af-document-badges");
   if(!row)return;
   card.classList.toggle("af-card-urgent",urgent);
   var badge=row.querySelector(".af-document-status");
   if(!urgent){if(badge)badge.remove();return}
   if(!badge){
     badge=document.createElement("span");
     badge.className="af-document-status";
     badge.innerHTML=alertIcon+"Urgent";
     row.appendChild(badge);
   }
 });
}
document.addEventListener("af-document-cards-rendered",function(){if(knownItems)renderCardStatus();else poll()});
function el(id){return document.getElementById(id)}
function admin(){return window.USER_ROLE==="admin"}
function email(){return String(window.loggedUserEmail||"").trim().toLowerCase()}
function sb(){return window.__sb}
function toast(m){(window.toast||alert)(m)}
function safe(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
async function get(){var r=await sb().from("afriflow_state").select("value").eq("key",KEY).maybeSingle();if(r.error)throw r.error;return r.data&&r.data.value||{items:{}}}
async function save(v){var r=await sb().from("afriflow_state").upsert({key:KEY,value:v,updated_at:new Date().toISOString()});if(r.error)throw r.error}
function style(){
 if(el("afUrgentStyle"))return;
 var s=document.createElement("style");s.id="afUrgentStyle";
 s.textContent='.af-document-badges{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.af-document-status{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:99px;font-size:.8rem;font-weight:650;color:#35483d;background:#f1f5f2}.af-card-urgent .af-document-status{color:#fff;background:#a32222;font-weight:800}.dv-grid .dcard.af-card-urgent{border-inline-start:5px solid #b62626!important}.af-urgent-toggle{display:inline-flex;align-items:center;justify-content:center;gap:.45em;border:1px solid #bd3030!important;color:#a51e1e!important;background:#fff5f5!important}.af-urgent-toggle[aria-pressed="true"]{background:#ba2929!important;color:#fff!important}.af-urgent-tag{color:#a51e1e;background:#fff0f0;border:1px solid #d84c4c;border-radius:99px;padding:4px 10px;font-weight:800;display:inline-block}.af-urgent-banner{margin:12px auto;padding:12px 18px;border-radius:12px;border:1px solid #d84c4c;background:#fff5f5;color:#7c1414;max-width:1100px}';
 document.head.appendChild(s);
}
function stamp(v){return Object.values(v.items||{}).filter(function(x){return x&&x.urgent}).map(function(x){return x.at+":"+x.path}).sort().join("|")}
async function poll(){
 if(busy||!email()||!sb())return;busy=true;
 try{
  var v=await get(),items=v.items||{},urgent=Object.values(items).filter(function(x){return x&&x.urgent});
  knownItems=items;renderCardStatus();
  var key=stamp(v),banner=el("afUrgentBanner");
  if(!banner){banner=document.createElement("aside");banner.id="afUrgentBanner";banner.className="af-urgent-banner";banner.setAttribute("role","status");banner.setAttribute("aria-live","polite");var host=el("viewHost")||document.querySelector(".wrap")||document.body;host.parentNode.insertBefore(banner,host)}
  banner.hidden=!urgent.length;
  banner.textContent=urgent.length?"Documents urgents ("+urgent.length+") : "+urgent.slice(0,4).map(function(x){return x.title||x.path.split("/").pop()}).join(" · ")+(urgent.length>4?"…":""):"";
  var path=window.dvCurrentPath&&window.dvCurrentPath(),bar=el("dvView")?.querySelector(".toolbar .toolbar-actions");
  if(bar&&path){
   var item=items[path.toLowerCase()],active=!!(item&&item.urgent);
   var btn=bar.querySelector("[data-af-urgent]");
   if(admin()){
    if(!btn){btn=document.createElement("button");btn.type="button";btn.className="af-urgent-toggle";btn.dataset.afUrgent="1";btn.innerHTML=alertIcon+'<span></span>';var ref=bar.querySelector("[data-dvp-edit]");if(ref)bar.insertBefore(btn,ref);else bar.prepend(btn)}
    btn.querySelector("span").textContent=active?"Urgent":"Marquer urgent";btn.setAttribute("aria-pressed",String(active));
    btn.onclick=async function(){
      btn.disabled=true;
      try{
        // Read latest value before write so changes to other documents are not silently discarded.
        var fresh=await get(),map=fresh.items||{},id=path.toLowerCase(),was=!!(map[id]&&map[id].urgent);
        map[id]={path:path,title:el("dvView")?.querySelector(".toolbar b")?.textContent||path.split("/").pop(),urgent:!was,at:Date.now(),by:email()};
        fresh.items=map;await save(fresh);toast(was?"Document retiré des urgences.":"Document marqué urgent pour les utilisateurs connectés.");await pollLater();
      }catch(err){toast("Impossible de changer l'urgence : "+(err.message||err))}
      btn.disabled=false;
    };
   }else if(btn)btn.remove();
  }
  if(key!==lastSeen){
    var localKey="afriflow_docurgent_seen_"+email(),already="";
    try{already=localStorage.getItem(localKey)||""}catch(_){}
    if(key&&key!==already&&urgent.length){
      // Browser notifications only when the user has already opted in and granted OS permission.
      if(window.AfriFlowAlerts?.enabled() && "Notification" in window && Notification.permission==="granted"){
        try{new Notification("AfriFlow · document urgent",{body:urgent[0].title||urgent[0].path.split("/").pop(),tag:"afriflow-document-urgent"})}catch(_){}
      }
      try{localStorage.setItem(localKey,key)}catch(_){}
    }
    lastSeen=key;
  }
 }catch(err){/* Offline and RLS errors should not prevent document navigation. */}finally{busy=false}
}
async function pollLater(){setTimeout(poll,100)}
function start(){style();poll();setInterval(poll,30000);document.addEventListener("visibilitychange",function(){if(!document.hidden)poll()});new MutationObserver(function(){if(lastPath!==(window.dvCurrentPath&&window.dvCurrentPath())){lastPath=window.dvCurrentPath&&window.dvCurrentPath();poll()}}).observe(document.body,{subtree:true,childList:true})}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
