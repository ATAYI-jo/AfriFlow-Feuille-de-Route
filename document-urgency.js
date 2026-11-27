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
 s.textContent='.af-document-badges{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.af-document-status{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:99px;font-size:.8rem;font-weight:650;color:#35483d;background:#f1f5f2}.af-card-urgent .af-document-status{color:#fff;background:#a32222;font-weight:800}.dv-grid .dcard.af-card-urgent{border-inline-start:5px solid #b62626!important}.af-urgent-toggle{display:inline-flex;align-items:center;justify-content:center;gap:.45em;border:1px solid #bd3030!important;color:#a51e1e!important;background:#fff5f5!important}.af-urgent-toggle[aria-pressed="true"]{background:#ba2929!important;color:#fff!important}.af-urgent-tag{color:#a51e1e;background:#fff0f0;border:1px solid #d84c4c;border-radius:99px;padding:4px 10px;font-weight:800;display:inline-block}#view-home .brand>#afHomeUrgent{position:absolute;top:16px;left:16px;z-index:4;display:inline-flex;align-items:center;gap:8px;min-height:44px;max-width:calc(100% - 32px);padding:9px 13px;border:1px solid rgba(164,38,38,.25);border-radius:14px;background:rgba(255,247,247,.90);color:#942323;font-size:.83rem;font-weight:750;line-height:1.25;box-shadow:0 4px 16px rgba(75,36,36,.10);backdrop-filter:blur(12px);cursor:pointer;text-align:left;transition:background .2s,box-shadow .2s}#view-home .brand>#afHomeUrgent[hidden]{display:none!important}#afHomeUrgent svg{flex:none}#afHomeUrgent .af-home-urgent-bell{transform-origin:50% 12%;animation:afUrgentBellRing 6s ease-in-out infinite}#view-home .brand>#afHomeUrgent:not([hidden]){animation:afUrgentHalo 6s ease-out infinite}@keyframes afUrgentBellRing{0%,18%,100%{transform:rotate(0)}3%,9%,15%{transform:rotate(14deg)}6%,12%{transform:rotate(-14deg)}}@keyframes afUrgentHalo{0%,100%{box-shadow:0 4px 16px rgba(75,36,36,.10),0 0 0 0 rgba(164,38,38,0)}3%{box-shadow:0 4px 16px rgba(75,36,36,.10),0 0 0 2px rgba(164,38,38,.20)}19%,99%{box-shadow:0 4px 16px rgba(75,36,36,.10),0 0 0 9px rgba(164,38,38,0)}}@media(prefers-reduced-motion:reduce){#afHomeUrgent .af-home-urgent-bell,#view-home .brand>#afHomeUrgent:not([hidden]){animation:none!important;transition:none!important}}#afHomeUrgent:focus-visible{outline:2px solid #942323;outline-offset:3px}@media(hover:hover){#view-home .brand>#afHomeUrgent:hover{background:#fff;box-shadow:0 5px 18px rgba(75,36,36,.17)}}@media(max-width:850px){#view-home .brand.af-has-home-urgent{padding-top:76px!important}#view-home .brand>#afHomeUrgent{top:12px;left:12px;max-width:calc(100% - 24px)}}';
 document.head.appendChild(s);
}
function renderHomeUrgency(count){
 var button=el("afHomeUrgent"),label=el("afHomeUrgentLabel");
 if(!button||!label)return;
 var visible=!!email()&&count>0;
 button.hidden=!visible;
 button.parentElement.classList.toggle("af-has-home-urgent",visible);
 label.textContent=visible?count+(count===1?" document urgent":" documents urgents"):"";
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
