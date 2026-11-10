(function(){
"use strict";
function sb(){return window.__sb}
function notify(s){(window.toast||alert)(s)}
function admin(){return window.USER_ROLE==="admin"}
function me(){return String(window.loggedUserEmail||"").toLowerCase()}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
async function read(k){if(!sb())throw Error("Connexion indisponible");var r=await sb().from("afriflow_state").select("value").eq("key",k).maybeSingle();if(r.error)throw r.error;return r.data&&r.data.value||{}}
async function write(k,v){var r=await sb().from("afriflow_state").upsert({key:k,value:v,updated_at:new Date().toISOString()});if(r.error)throw r.error}
async function allowed(path){
 if(admin())return true;
 var v=await read("pub:dbxperm"),users=v.users||{},list=users[path.toLowerCase()]||[];
 return Array.isArray(list)&&list.some(function(e){return String(e).toLowerCase()===me()});
}
window.dvRequestEdit=async function(path){
 if(!sb()||!me()){notify("Connecte-toi avant de modifier.");return}
 var ext=(String(path).split(".").pop()||"").toLowerCase();
 if(ext!=="docx"&&ext!=="xlsx"){
   notify("L'édition directe de ce format n'est pas disponible. Télécharge le fichier dans une application compatible.");return;
 }
 try{
   if(!await allowed(path)){
     if(confirm("Demander à l'administrateur l'autorisation de modifier ce document ?")){
       if(!window.AFRI||!window.AFRI.sendDocRequest)throw Error("Service de demande indisponible");
       await window.AFRI.sendDocRequest(path);notify("Demande envoyée à l'administrateur.");
     }return;
   }
   if(ext==="docx"){
     if(!window.dvWordEdit)throw Error("Éditeur Word indisponible");
     window.dvWordEdit(path,null);
   }else{
     if(!window.dvExcelEdit)throw Error("Éditeur Excel indisponible");
     window.dvExcelEdit(path);
   }
 }catch(e){notify("Édition : "+(e.message||e))}
};
async function openPermissions(path){
 if(!admin())return;
 if(!path){notify("Ouvre d'abord le document concerné.");return}
 var previous=document.getElementById("afPermOverlay");if(previous)previous.remove();
 var root=document.createElement("div");root.id="afPermOverlay";
 root.innerHTML='<section class="afPermBox" role="dialog" aria-modal="true" aria-label="Permissions documentaires"><header><h2>Permissions du document</h2><button type="button" id="afPermClose">Fermer</button></header><p id="afPermPath" style="overflow-wrap:anywhere"></p><div id="afPermList">Chargement…</div><footer><button type="button" id="afPermSave">Enregistrer les permissions</button></footer></section>';
 document.body.appendChild(root);
 document.getElementById("afPermPath").textContent=path;
 document.getElementById("afPermClose").onclick=function(){root.remove()};
 root.addEventListener("keydown",function(e){if(e.key==="Escape")root.remove()});
 try{
   if(!window.AFRI||!window.AFRI.listUsers)throw Error("Annuaire des utilisateurs indisponible");
   var all=await Promise.all([read("pub:dbxperm"),window.AFRI.listUsers()]);
   if(!root.isConnected)return;
   var cfg=all[0],users=all[1]||[],per=(cfg.users||{})[path.toLowerCase()]||[];
   var host=document.getElementById("afPermList");
   host.innerHTML=users.map(function(u){
     var em=String(u.email||"").toLowerCase();
     return '<label class="afPermFile" style="display:flex;align-items:center;gap:12px"><input type="checkbox" value="'+esc(em)+'"'+(per.includes(em)?" checked":"")+'><span>'+esc(u.name||em)+' · '+esc(em)+'</span></label>';
   }).join("")||"<p>Aucun utilisateur trouvé.</p>";
   document.getElementById("afPermSave").onclick=async function(){
     this.disabled=true;
     try{
       var value=await read("pub:dbxperm"),map=value.users||{};
       map[path.toLowerCase()]=Array.from(host.querySelectorAll('input[type="checkbox"]:checked')).map(function(x){return x.value});
       value.users=map;value.at=Date.now();value.by=me();
       await write("pub:dbxperm",value);notify("Permissions enregistrées pour ce document.");root.remove();
     }catch(e){notify("Erreur : "+(e.message||e));this.disabled=false}
   };
 }catch(e){document.getElementById("afPermList").textContent="Impossible de charger les permissions : "+(e.message||e)}
}
window.dvOpenPermissions=openPermissions;
function attach(){
 var old=document.getElementById("afPermAdmin");if(old)old.remove();
 var toolbar=document.querySelector("#dvView .toolbar .toolbar-actions");
 if(!toolbar||!admin()||!window.dvCurrentPath)return;
 var path=window.dvCurrentPath();
 if(!path)return;
 var edit=toolbar.querySelector("[data-dvp-edit]");
 var button=toolbar.querySelector("[data-dvp-permission]");
 if(!button){button=document.createElement("button");button.type="button";button.dataset.dvpPermission="1";button.textContent="Permissions";button.title="Gérer les droits sur ce document";button.onclick=function(){openPermissions(window.dvCurrentPath())};if(edit)toolbar.insertBefore(button,edit);else toolbar.prepend(button)}
}
var pending=false;
new MutationObserver(function(){if(pending)return;pending=true;queueMicrotask(function(){pending=false;attach()})}).observe(document.body,{subtree:true,childList:true});
attach();
})();