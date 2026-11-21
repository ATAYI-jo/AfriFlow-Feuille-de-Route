
(function(){
"use strict";
var $=function(i){return document.getElementById(i)};
var U={pdf:"https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",worker:"https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
 mammoth:"https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js",xlsx:"https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"};
var MIME={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",svg:"image/svg+xml",mp4:"video/mp4",webm:"video/webm",mp3:"audio/mpeg",pdf:"application/pdf"};
var cache={},keys=[],urls=[],token=0,libs={},cur={i:-1,path:""};
window.dvCurrentPath=function(){return cur.path||""};
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function ext(p){var m=/\.([a-z0-9]+)$/i.exec(p||"");return m?m[1].toLowerCase():""}
function freeUrls(){urls.forEach(function(u){URL.revokeObjectURL(u)});urls=[]}
function mkUrl(b){var u=URL.createObjectURL(b);urls.push(u);return u}
function script(u){return new Promise(function(ok,ko){var s=document.createElement("script");s.src=u;s.onload=ok;s.onerror=function(){ko(new Error("Module indisponible : "+u))};document.head.appendChild(s)})}
function lib(n){
  if(libs[n])return libs[n];
  return libs[n]=(async function(){
    if(n==="pdf"){
      if(!window.pdfjsLib)await script(U.pdf);
      var t=await (await fetch(U.worker)).text();
      window.pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([t],{type:"text/javascript"}));
    }else if(n==="mammoth"){if(!window.mammoth)await script(U.mammoth)}
    else if(!window.XLSX)await script(U.xlsx);
  })().catch(function(e){delete libs[n];throw e});
}
function clean(html){
  var t=document.createElement("template");t.innerHTML=html;
  t.content.querySelectorAll("script,iframe,object,embed,link,meta,style,form,base").forEach(function(n){n.remove()});
  t.content.querySelectorAll("*").forEach(function(el){[].slice.call(el.attributes).forEach(function(a){if(/^on/i.test(a.name)||(/^(href|src)$/i.test(a.name)&&/^\s*javascript:/i.test(a.value)))el.removeAttribute(a.name)})});
  return t.innerHTML;
}
async function call(body){
  var r=await window.__sb.functions.invoke("dropbox-view",{body:body});
  if(r.error){var m=r.error.message||"Erreur";try{var j=await r.error.context.json();if(j&&j.error)m=j.error}catch(e){}throw new Error(m)}
  if(r.data&&r.data.error)throw new Error(r.data.error);
  return r.data;
}
async function getItems(){
  var r=await window.__sb.from(window.__TABLE||"afriflow_state").select("value").eq("key","pub:dbxshow").maybeSingle();
  return (r.data&&r.data.value&&Array.isArray(r.data.value.items))?r.data.value.items:[];
}
function nrm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
async function relocate(path){
  var i=path.lastIndexOf("/"),dir=path.slice(0,i)||"/",name=nrm(path.slice(i+1)),dirs=[dir],seen={},count=0;
  while(dirs.length&&count<60){var folder=dirs.shift(),key=nrm(folder);if(seen[key])continue;seen[key]=1;count++;
    try{var d=await call({action:"list",path:folder}),entries=d.entries||[];
      var match=entries.find(function(x){return !x.dir&&nrm(x.name)===name});if(match)return match.path;
      entries.filter(function(x){return x.dir}).forEach(function(x){if(dirs.length<100)dirs.push(x.path)});
    }catch(e){}
  }
  return null;
}
var afResolvedDropboxPaths={};
async function resolveDropboxPath(path){
  if(afResolvedDropboxPaths[path])return afResolvedDropboxPaths[path];
  try{
    var hit=await call({action:"resolve",path:path});
    if(hit&&hit.path){afResolvedDropboxPaths[path]=hit.path;return hit.path}
  }catch(error){
    if(/plusieurs|ambiguous/i.test(String(error.message||error)))throw error;
  }
  var old=await relocate(path);
  if(old){afResolvedDropboxPaths[path]=old;return old}
  throw new Error("Fichier Dropbox introuvable : vérifiez son nom ou réassociez-le dans « Parcourir ma Dropbox ».");
}
async function getBlob(path){
  var actual=afResolvedDropboxPaths[path]||path;
  if(cache[actual])return cache[actual];
  var d;
  try{d=await call({action:"stream",path:actual})}
  catch(err){
    if(/not_found/i.test(String(err.message||err))){
      actual=await resolveDropboxPath(path);
      d=await call({action:"stream",path:actual});
      cur.path=actual;
      if(window.toast)window.toast("Fichier retrouvé dans Dropbox : chemin actualisé pour cette session.");
    }else{
      /* Certaines passerelles interrompent le flux binaire : le lien temporaire Dropbox offre un second chemin d’actualisation. */
      try{var temporary=await call({action:"link",path:actual}),response=await fetch(temporary.link,{cache:"no-store"});if(!response.ok)throw new Error("Lien Dropbox indisponible");d=await response.blob()}catch(fallback){throw err}
    }
  }
  if(!(d instanceof Blob))throw new Error("Réponse Dropbox inattendue : réessayez.");
  cache[actual]=d;keys.push(actual);while(keys.length>4)delete cache[keys.shift()];
  return d;
}
  
async function renderPdf(blob,host,my){
  await lib("pdf");
  var pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;
  if(my!==token)return;
  var W=Math.min(host.clientWidth||900,1000),dpr=Math.min(window.devicePixelRatio||1,2);
  var v1=(await pdf.getPage(1)).getViewport({scale:1}),ratio=v1.height/v1.width,slots=[];
  for(var p=1;p<=pdf.numPages;p++){var d=document.createElement("div");d.className="dvp-pg";d.style.height=Math.round(W*ratio)+"px";d.dataset.p=p;host.appendChild(d);slots.push(d)}
  async function draw(d){
    if(my!==token||d.dataset.done)return;d.dataset.done="1";
    try{
      var pg=await pdf.getPage(+d.dataset.p),v=pg.getViewport({scale:1}),vp=pg.getViewport({scale:(W/v.width)*dpr}),c=document.createElement("canvas");
      c.width=Math.floor(vp.width);c.height=Math.floor(vp.height);
      await pg.render({canvasContext:c.getContext("2d"),viewport:vp}).promise;
      if(my!==token)return;d.style.height="auto";d.appendChild(c);
    }catch(x){d.style.height="auto";d.innerHTML='<p style="padding:16px;color:#c0392b">Page '+d.dataset.p+' : '+esc(x.message||x)+'</p>'}
  }
  var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){io.unobserve(en.target);draw(en.target)}})},{rootMargin:"700px 0px"});
  slots.forEach(function(d){io.observe(d)});
}
async function show(i){
  var my=++token,box=$("dvView");if(!box)return;
  freeUrls();
  box.innerHTML='<p style="color:var(--muted)">Chargement du document… (un gros fichier peut prendre quelques secondes)</p>';
  box.scrollIntoView({behavior:"smooth",block:"start"});
  var it=(await getItems())[i];if(!it)throw new Error("Document introuvable : rechargez la page.");
  cur={i:i,path:it.path};
  var e=ext(it.path),name=esc(it.title||it.path),fname=esc(String(it.path).split("/").pop());
  if(e==="pptx"||e==="ppt"){
    var l;
    try{l=await call({action:"link",path:it.path})}
    catch(error){
      if(!/not_found/i.test(String(error.message||error)))throw error;
      var replacement=await resolveDropboxPath(it.path);
      cur.path=replacement;
      l=await call({action:"link",path:replacement});
    }
    if(my!==token)return;
    box.innerHTML='<div class="toolbar"><b>'+name+'</b><div class="toolbar-actions"><button type="button" data-dvp-edit="1">Modifier</button><a href="'+esc(l.link)+'" target="_blank" rel="noopener noreferrer"><button type="button">Télécharger</button></a></div></div><iframe src="https://view.officeapps.live.com/op/embed.aspx?src='+encodeURIComponent(l.link)+'" title="'+name+'"></iframe>';
    return;
  }
  var blob=await getBlob(it.path);if(my!==token)return;
  var dlu=mkUrl(blob);
  var edBtn=/^(docx|xlsx|pdf)$/.test(e)?'<button type="button" class="p" data-dvp-edit="1">Modifier</button>':'';
var bar='<div class="toolbar"><b>'+name+'</b><div class="toolbar-actions">'+edBtn+'<a href="'+dlu+'" download="'+fname+'"><button type="button">Télécharger</button></a><button type="button" data-dvp-refresh="1">Actualiser</button></div></div>';
  if(e==="pdf"){
    box.innerHTML=bar+'<div class="dvp" id="dvpBox"></div>';
    try{await renderPdf(blob,$("dvpBox"),my)}catch(x){if(my===token)$("dvpBox").innerHTML='<p style="color:#c0392b">Lecture du PDF impossible : '+esc(x.message||x)+'. Utilisez « Télécharger ».</p>'}
  }else if(/^(png|jpe?g|gif|webp|svg)$/.test(e))box.innerHTML=bar+'<img src="'+mkUrl(new Blob([blob],{type:MIME[e]}))+'" alt="'+name+'">';
  else if(/^(mp4|webm)$/.test(e))box.innerHTML=bar+'<video src="'+mkUrl(new Blob([blob],{type:MIME[e]}))+'" controls></video>';
  else if(e==="mp3")box.innerHTML=bar+'<audio src="'+mkUrl(new Blob([blob],{type:MIME[e]}))+'" controls style="width:100%"></audio>';
  else if(e==="docx"){
    box.innerHTML=bar+'<p style="color:var(--muted)">Mise en page…</p>';
    await lib("mammoth");var r=await window.mammoth.convertToHtml({arrayBuffer:await blob.arrayBuffer()});if(my!==token)return;
    box.innerHTML=bar+'<div class="wpage">'+clean(r.value)+'</div>';
  }else if(/^(xlsx|xls|csv)$/.test(e)){
    await lib("xlsx");var wb=window.XLSX.read(await blob.arrayBuffer(),{type:"array"});if(my!==token)return;window.__dvWorkbook=wb;
    box.innerHTML=bar+'<div class="auth-tabs" id="dvTabs" style="max-width:none;flex-wrap:wrap">'+wb.SheetNames.map(function(n,k){return '<button type="button" data-sh="'+k+'" class="'+(k?'':'on')+'">'+esc(n)+'</button>'}).join("")+'</div><div class="dv-sheet" id="dvSheet"></div>';
    var showS=function(k){$("dvSheet").innerHTML=window.XLSX.utils.sheet_to_html(wb.Sheets[wb.SheetNames[k]]);$("dvTabs").querySelectorAll("button").forEach(function(b){b.classList.toggle("on",+b.dataset.sh===k)})};
    showS(0);$("dvTabs").onclick=function(ev){var b=ev.target.closest("[data-sh]");if(b)showS(+b.dataset.sh)};
  }else if(/^(txt|md|json|html|xml)$/.test(e)){
    box.innerHTML=bar+'<div class="dv-txt" id="dvTx"></div>';$("dvTx").textContent=await blob.text();
  }else box.innerHTML=bar+'<p>Aperçu indisponible pour ce format : utilisez « Télécharger ».</p>';
}
function fail(x){var b=$("dvView");if(!b)return;var message=String(x&&x.message||x);if(/not_found|introuvable/i.test(message))message="Ce document n'est plus disponible à son ancien emplacement Dropbox. Réassociez le fichier depuis votre Dropbox.";else if(/Connexion requise|401|403/.test(message))message="Votre session a expiré ou vous n'avez pas accès à ce fichier.";else if(message.length>280)message="Erreur de lecture Dropbox. Réessayez ou réassociez le fichier.";b.innerHTML='<div class="dv-error" role="alert"><p>Impossible de prévisualiser : '+esc(message)+'</p><button type="button" data-dvp-refresh="1">Réessayer</button><button type="button" data-dvp-dl-fail="1">Télécharger</button>'+(window.USER_ROLE==="admin"?'<button type="button" data-dvp-relink="1">Réassocier depuis Dropbox</button>':'')+'</div>'}
document.addEventListener("click",function(e){
  var relink=e.target.closest("button[data-dvp-relink]");
  if(relink){e.preventDefault();e.stopPropagation();if(window.afRelinkDropbox)window.afRelinkDropbox(cur.i);return}
  var ed=e.target.closest("button[data-dvp-edit]");
  if(ed){e.preventDefault();e.stopPropagation();if(window.dvRequestEdit)window.dvRequestEdit(cur.path);return}
  var download=e.target.closest("[data-dvp-dl-fail]");if(download){e.preventDefault();getBlob(cur.path).then(function(b){var u=mkUrl(b),a=document.createElement("a");a.href=u;a.download=cur.path.split("/").pop()||"document";a.click()}).catch(function(x){fail(x)});return}
   var r=e.target.closest("button[data-dvp-refresh]");
  if(r){e.preventDefault();e.stopPropagation();delete cache[cur.path];show(cur.i).catch(fail);return}
  if(e.target.closest("button,a,input,textarea,select,[data-dvrm]"))return;var b=e.target.closest("[data-dvopen]");if(!b)return;
  e.preventDefault();e.stopPropagation();show(+b.dataset.dvopen).catch(fail);
},true); window.dvReload=function(){delete cache[cur.path];show(cur.i).catch(fail)};
})();
