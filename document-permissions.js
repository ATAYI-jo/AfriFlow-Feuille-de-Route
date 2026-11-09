(function(){
"use strict";
function $(id){return document.getElementById(id)}
function sb(){return window.__sb}
function notify(s){(window.toast||alert)(s)}
function admin(){return window.USER_ROLE==="admin"}
function me(){return String(window.loggedUserEmail||"").toLowerCase()}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]})}
async function read(k){var r=await sb().from("afriflow_state").select("value").eq("key",k).maybeSingle();if(r.error)throw r.error;return r.data&&r.data.value||{}}
async function write(k,v){var r=await sb().from("afriflow_state").upsert({key:k,value:v,updated_at:new Date().toISOString()});if(r.error)throw r.error}
async function allowed(path){
 if(admin())return true;
 var v=await read("pub:dbxperm"),users=v.users||{},list=users[path.toLowerCase()]||[];
 return Array.isArray(list)&&list.map(function(e){return String(e).toLowerCase()}).includes(me());
}
window.dvRequestEdit=async function(path){
 if(!sb()||!me()){notify("Connecte-toi avant de modifier.");return}
 var ext=(String(path).split(".").pop()||"").toLowerCase();
 if(ext!=="docx"&&ext!=="xlsx"){
   notify("L'édition directe de ce format n'est pas encore disponible. Télécharge le fichier pour le modifier dans une application compatible.");return;
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
async function openPermissions(){
 if(!admin())return;
 var root=document.createElement("div");root.id="afPermOverlay";
 root.innerHTML='<section class="afPermBox" role="dialog" aria-modal="true" aria-label="Permissions documentaires"><header><h2>Permission · Documents</h2><button type="button" id="afPermClose">Fermer</button></header><p>Sélectionne les personnes autorisées à modifier chaque fichier publié.</p><div id="afPermList">Chargement…</div><footer><button type="button" id="afPermSave">Enregistrer les permissions</button></footer></section>';
 document.body.appendChild(root);
 $("afPermClose").onclick=function(){root.remove()};
 try{
   var all=await Promise.all([read("pub:dbxperm"),read("pub:dbxshow"),window.AFRI.listUsers()]);
   var cfg=all[0],files=all[1].items||[],users=all[2]||[],host=$("afPermList");
   if(!files.length){host.textContent="Aucun document publié.";return}
   host.innerHTML=files.map(function(f,i){
     var path=String(f.path||""),per=(cfg.users||{})[path.toLowerCase()]||[];
     return '<div class="afPermFile"><h3>'+esc(f.title||path.split("/").pop())+'</h3><small>'+esc(path)+'</small>'+users.map(function(u){
       var em=String(u.email||"").toLowerCase();
       return '<label><input type="checkbox" data-file="'+i+'" value="'+esc(em)+'"'+(per.includes(em)?" checked":"")+'>'+esc(u.name||em)+' · '+esc(em)+'</label>';
     }).join("")+'</div>';
   }).join("");
   $("afPermSave").onclick=async function(){
     this.disabled=true;
     try{
       var value=await read("pub:dbxperm"),map=value.users||{};
       files.forEach(function(f,i){
         map[String(f.path).toLowerCase()]=Array.from(host.querySelectorAll('input[data-file="'+i+'"]:checked')).map(function(x){return x.value});
       });
       value.users=map;value.at=Date.now();value.by=me();
       await write("pub:dbxperm",value);notify("Permissions enregistrées.");root.remove();
     }catch(e){notify("Erreur : "+(e.message||e));$("afPermSave").disabled=false}
   };
 }catch(e){$("afPermList").textContent="Impossible de charger les permissions : "+(e.message||e)}
}
function attach(){
 if(!admin()||!$("adBody")||$("afPermAdmin"))return;
 var d=document.createElement("section");d.id="afPermAdmin";d.innerHTML='<h3>Permission</h3><p>Accès à la modification des fichiers, utilisateur par utilisateur.</p><button type="button" id="afPermOpen">Gérer les permissions des documents</button>';
 $("adBody").prepend(d);$("afPermOpen").onclick=openPermissions;
}
new MutationObserver(function(){if(admin()&&$("adBody")&&!$("afPermAdmin"))attach()}).observe(document.body,{childList:true,subtree:true});
attach();
})();