/* Contextual urgency for Dropbox documents. Supabase policies must restrict write access to administrators. */
(function(){
"use strict";
var KEY="pub:docurgent",busy=false,lastSeen="",lastPath="",loadedFor="";
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
 s.textContent='.af-document-badges{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.af-document-status{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:99px;font-size:.8rem;font-weight:650;color:#35483d;background:#f1f5f2}.af-card-urgent .af-document-status{color:#fff;background:#a32222;font-weight:800}.dv-grid .dcard.af-card-urgent{border-inline-start:5px solid #b62626!important}.af-urgent-toggle{display:inline-flex;align-items:center;justify-content:center;gap:.45em;border:1px solid #bd3030!important;color:#a51e1e!important;background:#fff5f5!important}.af-urgent-toggle[aria-pressed="true"]{background:#ba2929!important;color:#fff!important}.af-urgent-tag{color:#a51e1e;background:#fff0f0;border:1px solid #d84c4c;border-radius:99px;padding:4px 10px;font-weight:800;display:inline-block}#view-home .brand::after{background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 1200 120%27 preserveAspectRatio=%27none%27%3E%3Cpath fill=%27%232e8b36%27 fill-opacity=%27.48%27 d=%27M0 46 Q220 8 480 77 T1200 30 V120 H0Z%27/%3E%3Cpath fill=%27%23ff9700%27 fill-opacity=%27.78%27 d=%27M0 95 Q220 30 470 98 T1200 49 V120 Q900 125 620 113 T0 120Z%27/%3E%3Cpath fill=%27%2356b735%27 fill-opacity=%27.8%27 d=%27M0 105 Q250 65 500 112 T1200 85 V120 H0Z%27/%3E%3C/svg%3E")!important;background-size:100% 27%!important;background-position:bottom!important;background-repeat:no-repeat!important;pointer-events:none}#view-home .brand>#afHomeUrgent{position:absolute;top:16px;left:16px;z-index:4;display:inline-flex;align-items:center;gap:10px;min-height:48px;max-width:calc(100% - 32px);padding:6px 13px 6px 7px;border:2px solid transparent!important;border-radius:999px;background:linear-gradient(115deg,#fffdf4,#f0f9f1) padding-box,linear-gradient(110deg,#78bd38,#27852b 45%,#ff9700 85%) border-box!important;color:#185b28!important;font-size:.84rem;font-weight:750;line-height:1.25;box-shadow:0 5px 18px #286b3026;cursor:pointer;text-align:left;transition:filter .2s}#view-home .brand>#afHomeUrgent[hidden]{display:none!important}#afHomeUrgent svg{flex:none}#afHomeUrgent>svg{color:#d86e00}#afHomeUrgentLabel{border-left:1px solid #edb65e;padding-left:10px}#afHomeUrgent .af-urgent-bell-disc{position:relative;display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:50%;background:radial-gradient(circle,#fff8cf,#ffe0a0);color:#237a29;box-shadow:0 0 8px #f4ae4d66}#afHomeUrgentCount{position:absolute;top:-7px;right:-5px;min-width:19px;height:19px;padding:0 4px;border:1px solid white;border-radius:999px;display:grid;place-items:center;background:#c83222;color:white;font-size:11px;font-weight:800}#afHomeUrgent .af-home-urgent-bell{fill:#2d8c32;stroke:#236c27;transform-origin:50% 12%;animation:afUrgentBellRing 6s ease-in-out infinite}#afHomeUrgent .af-urgent-bell-disc{animation:afUrgentHalo 6s ease-out infinite}@keyframes afUrgentBellRing{0%,18%,100%{transform:rotate(0)}3%,9%,15%{transform:rotate(14deg)}6%,12%{transform:rotate(-14deg)}}@keyframes afUrgentHalo{0%,100%{box-shadow:0 0 8px #f4ae4d66,0 0 0 0 #ffa00000}3%{box-shadow:0 0 8px #f4ae4d66,0 0 0 3px #ffa00055}19%,99%{box-shadow:0 0 8px #f4ae4d66,0 0 0 10px #ffa00000}}@media(prefers-reduced-motion:reduce){#afHomeUrgent .af-home-urgent-bell,#afHomeUrgent .af-urgent-bell-disc{animation:none!important;transition:none!important}}#afHomeUrgent:focus-visible{outline:2px solid #236c27;outline-offset:3px}@media(hover:hover){#view-home .brand>#afHomeUrgent:hover{filter:brightness(1.04)}}@media(max-width:850px){#view-home .brand.af-has-home-urgent{padding-top:82px!important}#view-home .brand>#afHomeUrgent{top:12px;left:12px;max-width:calc(100% - 24px)}}';
 document.head.appendChild(s);
}
function renderHomeUrgency(count){
 var button=el("afHomeUrgent"),label=el("afHomeUrgentLabel");
 if(!button||!label)return;
 var visible=!!email()&&count>0;
 button.hidden=!visible;
 button.parentElement.classList.toggle("af-has-home-urgent",visible);
 label.textContent=visible?count+(count===1?" document urgent":" documents urgents"):"";
 var badge=el("afHomeUrgentCount");if(badge)badge.textContent=visible?String(count):"";
}
function openUrgentDocuments(){
 if(email()&&typeof window.AfriOpenDocuments==="function")window.AfriOpenDocuments();
}
function stamp(v){return Object.values(v.items||{}).filter(function(x){return x&&x.urgent}).map(function(x){return x.at+":"+x.path}).sort().join("|")}
async function poll(){
 var account=email();
 if(!account||!sb()){renderHomeUrgency(0);return;}
 if(busy)return;busy=true;
 try{
  var v=await get();if(account!==email())return;
  var items=v.items||{},urgent=Object.values(items).filter(function(x){return x&&x.urgent});
  loadedFor=account;knownItems=items;renderCardStatus();renderHomeUrgency(urgent.length);
  var key=stamp(v);
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
 }catch(err){/* Offline and RLS errors should not prevent document navigation. */}finally{busy=false;if(account!==email())pollLater()}
}
async function pollLater(){setTimeout(poll,100)}
function start(){style();var button=el("afHomeUrgent");if(button)button.addEventListener("click",openUrgentDocuments);
 window.addEventListener("afriflow:verified-role",function(){if(loadedFor!==email()||!email()){knownItems=null;lastSeen="";renderHomeUrgency(0);}poll();});
 poll();setInterval(poll,30000);document.addEventListener("visibilitychange",function(){if(!document.hidden)poll()});new MutationObserver(function(){if(lastPath!==(window.dvCurrentPath&&window.dvCurrentPath())){lastPath=window.dvCurrentPath&&window.dvCurrentPath();poll()}}).observe(document.body,{subtree:true,childList:true})}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
