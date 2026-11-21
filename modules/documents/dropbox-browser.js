
(function(){
"use strict";
var KEY="pub:dbxshow",$=function(i){return document.getElementById(i)},vh=$("viewHost"),items=[],active=false,cwd="";
function SB(){return window.__sb} function TB(){return window.__TABLE||"afriflow_state"}
function adm(){return window.USER_ROLE==="admin"}
function toast(m){(window.toast||alert)(m)}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function ext(n){var m=/\.([a-z0-9]+)$/i.exec(n||"");return m?m[1].toLowerCase():""}

async function call(body){
  var r=await SB().functions.invoke("dropbox-view",{body:body});
  if(r.error){var m=r.error.message||"Erreur";try{var j=await r.error.context.json();if(j&&j.error)m=j.error}catch(e){}throw new Error(m)}
  if(r.data&&r.data.error)throw new Error(r.data.error);
  return r.data;
}
async function loadItems(){
  var r=await SB().from(TB()).select("value").eq("key",KEY).maybeSingle();
  items=(r.data&&r.data.value&&Array.isArray(r.data.value.items))?r.data.value.items:[];
}
async function saveItems(){
  var r=await SB().from(TB()).upsert({key:KEY,value:{items:items,at:Date.now(),by:String(window.loggedUserEmail||"")},updated_at:new Date().toISOString()});
  if(r.error)throw r.error;
}

/* ---------- Affichage d'un fichier ---------- */
async function openFile(i){
  var it=items[i],box=$("dvView");if(!it||!box)return;
  box.innerHTML='<p style="color:var(--muted)">Chargement…</p>';
  try{
    var d=await call({action:"link",path:it.path}),u=esc(d.link),e=ext(it.path),h;
    if(/^(png|jpe?g|gif|webp|svg)$/.test(e))h='<img src="'+u+'" alt="'+esc(it.title)+'">';
    else if(e==="pdf")h='<iframe src="'+u+'" title="'+esc(it.title)+'"></iframe>';
    else if(/^(mp4|webm|mov)$/.test(e))h='<video src="'+u+'" controls></video>';
    else if(/^(docx?|xlsx?|pptx?)$/.test(e))h='<iframe src="https://view.officeapps.live.com/op/embed.aspx?src='+encodeURIComponent(d.link)+'" title="'+esc(it.title)+'"></iframe>';
    else h='<p>Aperçu indisponible pour ce format. <a href="'+u+'" target="_blank" rel="noopener noreferrer">Ouvrir le fichier</a></p>';
    box.innerHTML='<div class="toolbar"><b>'+esc(it.title)+'</b><div class="toolbar-actions"><a href="'+u+'" target="_blank" rel="noopener noreferrer"><button type="button">Ouvrir dans un onglet</button></a></div></div>'+h;
    box.scrollIntoView({behavior:"smooth",block:"start"});
  }catch(x){box.innerHTML='<p style="color:#c0392b">Impossible d\'afficher : '+esc(x.message||x)+'</p>'}
}

/* ---------- Page ---------- */
function render(){
  if(!active)return;
  var h='<div class="toolbar"><b>Documents</b></div>';
  h+=items.length?'<div class="dv-grid">'+items.map(function(it,i){
    return '<div class="dcard af-clickable" data-dvopen="'+i+'" role="button" tabindex="0"><div class="dtype">'+esc((ext(it.path)||"fichier").toUpperCase())+'</div><b>'+esc(it.title)+'</b><div class="dact">'
      +(adm()?'<button type="button" class="danger" data-dvrm="'+i+'">Retirer</button>':'')+'</div></div>';
  }).join("")+'</div>':'<p style="color:var(--muted)">Aucun document n\'est affiché pour le moment.</p>';
  h+='<div class="dv-view" id="dvView"></div>';
  h+='<div class="mt-box" style="margin-top:34px"><h3>'+(adm()?"Choisir les fichiers à afficher":"Parcourir les fichiers partagés")+'</h3>'
    +'<p style="color:var(--muted);font-size:.9rem;margin-top:0">'+(adm()?"Seuls les fichiers cochés ici sont visibles par les utilisateurs. Le reste de la Dropbox reste privé.":"Vous pouvez parcourir et ouvrir uniquement les fichiers publiés pour les membres. Les autres fichiers Dropbox restent privés.")+'</p>'
    +'<div class="dact" style="margin:0 0 14px"><button type="button" id="dvBrowse">'+(adm()?"Parcourir ma Dropbox":"Parcourir les fichiers partagés")+'</button></div><div id="dvBrowser"></div></div>';
  vh.innerHTML=h;vh.onclick=onClick;vh.onkeydown=function(e){var c=e.target.closest("[data-dvopen],[data-dvdir]");if(c&&(e.key==="Enter"||e.key===" ")&&!e.target.closest("button")){e.preventDefault();if(c.dataset.dvopen!=null)openFile(+c.dataset.dvopen);else browse(c.dataset.dvdir)}};
}
async function browse(p){
  cwd=p;var b=$("dvBrowser");if(!b)return;b.innerHTML='<p style="color:var(--muted)">Chargement…</p>';
  try{
    var d=await call({action:"list",path:p||"/"}),parts=p.split("/").filter(Boolean),acc="";
    var crumb='<button type="button" data-dvdir="">Racine</button>'+parts.map(function(s){acc+="/"+s;return ' › <button type="button" data-dvdir="'+esc(acc)+'">'+esc(s)+'</button>'}).join("");
    b.innerHTML='<div class="dact" style="margin:0 0 10px">'+crumb+'</div>'+(d.entries.length?d.entries.map(function(e){
      var shown=items.findIndex(function(x){return String(x.path).toLowerCase()===e.path.toLowerCase()});
      return '<div class="dv-row '+(e.dir?"af-clickable":"")+'" '+(e.dir?'data-dvdir="'+esc(e.path)+'" role="button" tabindex="0"':"")+'><span class="af-file-name">'+ic(e.dir?"folder":"file")+' '+esc(e.name)+'</span>'+(e.dir?'<span aria-hidden="true">›</span>':(!adm()&&shown>=0?'<button type="button" class="p" data-dvopen="'+shown+'">Ouvrir</button>':(shown>=0&&window.__afRelinkIndex==null?'<small style="color:var(--muted)">Déjà affiché</small>':'<button type="button" class="p" data-dvadd="'+esc(e.path)+'" data-dvid="'+esc(e.id||"")+'" data-n="'+esc(e.name)+'">'+(window.__afRelinkIndex!=null?'Réassocier ce fichier':'Afficher sur le site')+'</button>')))+'</div>';
    }).join(""):'<p style="color:var(--muted)">Dossier vide.</p>');
  }catch(x){b.innerHTML='<p style="color:#c0392b">'+esc(x.message||x)+'<br><small>Vérifiez que la fonction « dropbox-view » est déployée et que les secrets DROPBOX_APP_KEY / DROPBOX_REFRESH_TOKEN sont définis.</small></p>'}
}
async function onClick(e){
  var b=e.target.closest("button,[data-dvopen],[data-dvdir]");if(!b)return;var d=b.dataset;
  try{
    if(d.dvopen!=null)openFile(+d.dvopen);
    else if(d.dvrm!=null){if(confirm("Retirer ce fichier de l'affichage du site ? (il reste dans la Dropbox)")){items.splice(+d.dvrm,1);await saveItems();render()}}
    else if(b.id==="dvBrowse")browse("");
    else if(d.dvdir!=null)browse(d.dvdir);
    else if(d.dvadd){
      var path=d.dvadd,name=d.n;
      if(window.__afRelinkIndex!=null){
        var index=window.__afRelinkIndex,previous=items[index];
        if(!previous){window.__afRelinkIndex=null;throw new Error("Document non retrouvé dans la liste.")}
        if(!confirm("Réassocier « "+previous.title+" » au fichier Dropbox « "+name+" » ?"))return;
        items[index]=Object.assign({},previous,{path:path,id:d.dvid||null});
        try{await saveItems();window.__afRelinkIndex=null;toast("Fichier réassocié. Ouvrez-le à nouveau.");render()}
        catch(err){items[index]=previous;throw err}
        return;
      }
      window.askDlg("Afficher ce fichier",[{id:"t",l:"Titre affiché sur le site"}],function(v){
        items.push({path:path,id:d.dvid||null,title:v.t||name,at:Date.now()});
        saveItems().then(function(){toast("Fichier affiché sur le site.");render();browse(cwd)}).catch(function(x){items.pop();toast("Échec : "+(x.message||x))});
      });
      var f=$("xf_t");if(f){f.value=name.replace(/\.[^.]+$/,"");f.select()}
    }
  }catch(x){toast("Action impossible : "+(x.message||x))}
}
async function openPage(){
  var home=document.querySelector('#navList .nv[data-id="home"]');if(home)home.click();
  active=true;$("view-home").style.display="none";vh.style.display="";
  var sc=$("scrim");if(sc&&sc.classList.contains("on"))sc.click();
  vh.innerHTML='<div class="toolbar"><b>Documents</b></div><p style="color:var(--muted)">Chargement…</p>';
  mark();window.scrollTo(0,0);if(window.AFRI)window.AFRI.page("Documents");
  try{await loadItems()}catch(e){}
  render();
}
function mark(){var nl=$("navList");if(nl)nl.querySelectorAll(".nv").forEach(function(b){b.classList.toggle("on",active&&b.hasAttribute("data-dv-nav"))})}
function inject(){
  var nl=$("navList");if(!nl||!nl.firstElementChild||nl.querySelector("[data-dv-nav]")||!window.loggedUserEmail)return;
  var row=document.createElement("div");row.className="nvr";
  row.innerHTML='<button type="button" class="nv" data-dv-nav="1">Documents</button>';
  nl.firstElementChild.after(row);mark();
}
var nl0=$("navList");
if(nl0){
  new MutationObserver(inject).observe(nl0,{childList:true});
  nl0.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;if(b.hasAttribute("data-dv-nav"))openPage();else if(!b.hasAttribute("data-fdr-ren"))active=false});
}
var prev=window.onRole;window.onRole=function(){if(prev)prev();setTimeout(inject,600)};
inject();
})();
