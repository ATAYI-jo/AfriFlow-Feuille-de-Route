
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
async function getBlob(path,view){
  var actual=afResolvedDropboxPaths[path]||path;
  if(cur===view)view.path=actual;
  if(cache[actual])return cache[actual];
  var d;
  try{d=await call({action:"stream",path:actual})}
  catch(err){
    if(/not_found/i.test(String(err.message||err))){
      actual=await resolveDropboxPath(path);
      d=await call({action:"stream",path:actual});
      if(cur===view)cur.path=actual;
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
  
function onDetach(host,dispose){
  var observer=new MutationObserver(function(){
    if(host.isConnected)return;
    observer.disconnect();
    dispose();
  });
  observer.observe(host.parentNode,{childList:true});
  observer.observe(host.parentNode.parentNode,{childList:true});
  return observer;
}
function createPager(host,stageClass,draw){
  host.setAttribute("role","region");
  host.setAttribute("aria-label","Aperçu du document");
  host.innerHTML='<div class="dvp-nav" hidden>'
    +'<button type="button" aria-label="Page précédente"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg></button>'
    +'<span role="status"></span>'
    +'<button type="button" aria-label="Page suivante"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button></div>'
    +'<div class="dvp-stage '+stageClass+'" tabindex="0" aria-label="Page du document"></div>';
  var stage=host.querySelector(".dvp-stage"),status=host.querySelector("[role=status]");
  var buttons=host.querySelectorAll("button"),nav=host.querySelector(".dvp-nav");
  var expand=document.createElement("button");
  expand.type="button";
  expand.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24"><path/></svg>';
  nav.appendChild(expand);
  var dialog=null;
  function syncFullscreen(){
    var active=document.fullscreenElement===host||Boolean(dialog&&dialog.open);
    var label=active?"Quitter le plein écran":"Afficher en plein écran";
    expand.title=label;
    expand.setAttribute("aria-label",label);
    expand.setAttribute("aria-pressed",String(active));
    expand.querySelector("path").setAttribute("d",active
      ?"M3 9h6V3m6 0v6h6m0 6h-6v6m-6 0v-6H3"
      :"M9 3H3v6m12-6h6v6m0 6v6h-6m-6 0H3v-6");
  }
  function openDialog(){
    if(!host.isConnected||dialog)return;
    dialog=document.createElement("dialog");
    dialog.className="dvp-full-dialog";
    dialog.setAttribute("aria-label","Document en plein écran");
    host.appendChild(dialog);
    dialog.append(nav,stage);
    dialog.addEventListener("close",function(){
      host.append(nav,stage);
      dialog.remove();
      dialog=null;
      syncFullscreen();
      expand.focus({preventScroll:true});
    },{once:true});
    dialog.showModal();
    expand.focus();
    syncFullscreen();
  }
  expand.onclick=async function(){
    if(dialog){dialog.close();return}
    if(document.fullscreenElement===host){await document.exitFullscreen();return}
    if(host.requestFullscreen){
      try{await host.requestFullscreen();return}catch(error){}
    }
    openDialog();
  };
  document.addEventListener("fullscreenchange",syncFullscreen);
  onDetach(host,function(){document.removeEventListener("fullscreenchange",syncFullscreen)});
  syncFullscreen();
  var current=0,total=0,touch;
  function go(page){
    if(page===current||page<1||page>total||!host.isConnected)return;
    var direction=current?Math.sign(page-current):0;
    current=page;
    status.textContent="Page "+page+" sur "+total;
    buttons[0].setAttribute("aria-disabled",String(page===1));
    buttons[1].setAttribute("aria-disabled",String(page===total));
    return draw(stage,page,direction);
  }
  buttons[0].onclick=function(){go(current-1)};
  buttons[1].onclick=function(){go(current+1)};
  host.addEventListener("keydown",function(event){
    if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
    if(event.key!=="ArrowRight"&&event.key!=="ArrowLeft")return;
    event.preventDefault();
    go(current+(event.key==="ArrowRight"?1:-1));
  });
  stage.addEventListener("touchstart",function(event){
    touch=event.touches.length===1?event.touches[0]:null;
  },{passive:true});
  stage.addEventListener("touchcancel",function(){touch=null},{passive:true});
  stage.addEventListener("touchend",function(event){
    if(!touch)return;
    var end=Array.from(event.changedTouches).find(function(point){return point.identifier===touch.identifier});
    if(end){
      var dx=end.clientX-touch.clientX,dy=end.clientY-touch.clientY;
      if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5)go(current+(dx<0?1:-1));
    }
    touch=null;
  },{passive:true});
  return {
    stage:stage,
    setTotal:function(pages){
      total=pages;
      nav.hidden=false;
      buttons[0].hidden=buttons[1].hidden=pages<2;
      var page=Math.min(current||1,pages);
      current=0;
      return go(page);
    }
  };
}
async function renderPdf(blob,host,my){
  await lib("pdf");
  var data=new Uint8Array(await blob.arrayBuffer());
  if(my!==token||!host.isConnected)return;
  var task=window.pdfjsLib.getDocument({data:data,isEvalSupported:false});
  function dispose(){task.destroy().catch(function(){})}
  var observer=onDetach(host,dispose);
  var pdf;
  try{pdf=await task.promise}catch(error){
    observer.disconnect();
    dispose();
    throw error;
  }
  if(my!==token||!host.isConnected)return;
  var drawId=0,rendering;
  var pager=createPager(host,"dvp-pdf",async function(stage,page,direction){
    var id=++drawId;
    if(rendering){rendering.cancel();rendering=null}
    stage.setAttribute("aria-busy","true");
    try{
      var pg=await pdf.getPage(page);
      if(id!==drawId||my!==token||!host.isConnected)return;
      var size=pg.getViewport({scale:1}),dpr=Math.min(window.devicePixelRatio||1,2);
      var scale=Math.min(stage.clientWidth/size.width,stage.clientHeight/size.height);
      var viewport=pg.getViewport({scale:Math.max(scale,.1)*dpr});
      var canvas=document.createElement("canvas");
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      canvas.setAttribute("role","img");
      canvas.setAttribute("aria-label","Page "+page);
      rendering=pg.render({canvasContext:canvas.getContext("2d"),viewport:viewport});
      await rendering.promise;
      if(id!==drawId||my!==token||!host.isConnected)return;
      stage.replaceChildren(canvas);
      if(direction&&canvas.animate&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
        canvas.animate([{transform:"translateX("+(direction*36)+"px)",opacity:.55},{transform:"translateX(0)",opacity:1}],{duration:180,easing:"ease-out"});
    }catch(error){
      if(error.name!=="RenderingCancelledException"&&id===drawId&&my===token&&host.isConnected)
        stage.textContent="Impossible d’afficher cette page. Utilisez « Télécharger » pour consulter le fichier.";
    }finally{
      if(id===drawId){rendering=null;stage.removeAttribute("aria-busy")}
    }
  });
  await pager.setTotal(pdf.numPages);
}
function renderWord(html,host){
  var stride=0;
  var pager=createPager(host,"dvp-word",function(stage,page,direction){
    stage.setAttribute("aria-label","Page "+page+" du document Word");
    columns.classList.toggle("dvp-sliding",Boolean(direction));
    columns.style.transform="translateX("+(-stride*(page-1))+"px)";
  });
  pager.stage.innerHTML='<div class="dvp-word-viewport"><div class="wpage dvp-word-columns">'+html+'</div></div>';
  var columns=pager.stage.querySelector(".dvp-word-columns");
  function measure(){
    if(!columns.clientWidth)return;
    var gap=parseFloat(getComputedStyle(columns).columnGap);
    stride=columns.clientWidth+gap;
    pager.setTotal(Math.max(1,Math.ceil((columns.scrollWidth+gap-1)/stride)));
  }
  var resize=new ResizeObserver(measure);
  resize.observe(columns);
  onDetach(host,function(){resize.disconnect()});
  columns.querySelectorAll("img").forEach(function(img){
    if(!img.complete){
      img.addEventListener("load",measure,{once:true});
      img.addEventListener("error",measure,{once:true});
    }
  });
  measure();
}
var wordSource;
function wordHtml(source){
  if(!source.html)source.html=(async function(){
    await lib("mammoth");
    var result=await window.mammoth.convertToHtml({arrayBuffer:await source.blob.arrayBuffer()});
    return clean(result.value);
  })().catch(function(error){source.html=null;throw error});
  return source.html;
}
window.dvWordSource=async function(path){
  var source=wordSource;
  if(!source||source.path!==path||!source.box.isConnected)return null;
  var html=await wordHtml(source);
  return source===wordSource&&source.box.isConnected?html:null;
};
async function show(i){
  wordSource=null;
  var my=++token,box=$("dvView");if(!box)return;
  freeUrls();
  box.innerHTML='<p style="color:var(--muted)">Chargement du document… (un gros fichier peut prendre quelques secondes)</p>';
  box.scrollIntoView({behavior:"smooth",block:"start"});
  var it=(await getItems())[i];if(my!==token||!box.isConnected)return;
  if(!it)throw new Error("Document introuvable : rechargez la page.");
  var view=cur={i:i,path:it.path};
  var e=ext(it.path),name=esc(it.title||it.path),fname=esc(String(it.path).split("/").pop());
  if(e==="pptx"||e==="ppt"){
    var l;
    try{l=await call({action:"link",path:it.path})}
    catch(error){
      if(!/not_found/i.test(String(error.message||error)))throw error;
      var replacement=await resolveDropboxPath(it.path);
      view.path=replacement;
      l=await call({action:"link",path:replacement});
    }
    if(my!==token||!box.isConnected)return;
    box.innerHTML='<div class="toolbar"><b>'+name+'</b><div class="toolbar-actions"><button type="button" data-dvp-edit="1">Modifier</button><a href="'+esc(l.link)+'" target="_blank" rel="noopener noreferrer"><button type="button">Télécharger</button></a></div></div><iframe src="https://view.officeapps.live.com/op/embed.aspx?src='+encodeURIComponent(l.link)+'" title="'+name+'"></iframe>';
    return;
  }
  var blob=await getBlob(it.path,view);if(my!==token||!box.isConnected)return;
  var dlu=mkUrl(blob);
  var edBtn=/^(docx|xlsx|pdf)$/.test(e)?'<button type="button" class="p" data-dvp-edit="1">Modifier</button>':'';
var bar='<div class="toolbar"><b>'+name+'</b><div class="toolbar-actions">'+edBtn+'<a href="'+dlu+'" download="'+fname+'"><button type="button">Télécharger</button></a><button type="button" data-dvp-refresh="1">Actualiser</button></div></div>';
  if(e==="pdf"){
    box.innerHTML=bar+'<div class="dvp" id="dvpBox"></div>';
    try{await renderPdf(blob,$("dvpBox"),my)}catch(x){if(my===token&&box.isConnected)$("dvpBox").innerHTML='<p style="color:#c0392b">Lecture du PDF impossible : '+esc(x.message||x)+'. Utilisez « Télécharger ».</p>'}
  }else if(/^(png|jpe?g|gif|webp|svg)$/.test(e))box.innerHTML=bar+'<img src="'+mkUrl(new Blob([blob],{type:MIME[e]}))+'" alt="'+name+'">';
  else if(/^(mp4|webm)$/.test(e))box.innerHTML=bar+'<video src="'+mkUrl(new Blob([blob],{type:MIME[e]}))+'" controls></video>';
  else if(e==="mp3")box.innerHTML=bar+'<audio src="'+mkUrl(new Blob([blob],{type:MIME[e]}))+'" controls style="width:100%"></audio>';
  else if(e==="docx"){
    box.innerHTML=bar+'<div class="dvp dvp-word-reader"><p>Mise en page…</p></div>';
    var word=box.querySelector(".dvp");
    var source=wordSource={path:view.path,blob:blob,box:box};
    try{
      var preview=await call({action:"preview",path:view.path});
      if(!(preview instanceof Blob))throw new Error("Aperçu Dropbox indisponible");
      await renderPdf(preview,word,my);
    }catch(error){
      if(my!==token||!word.isConnected)return;
      var html=await wordHtml(source);
      if(my!==token||!word.isConnected)return;
      renderWord(html,word);
      var notice=document.createElement("p");
      notice.textContent="Aperçu Dropbox indisponible. La pagination est adaptée à votre écran.";
      word.before(notice);
    }
  }else if(/^(xlsx|xls|csv)$/.test(e)){
    await lib("xlsx");var wb=window.XLSX.read(await blob.arrayBuffer(),{type:"array"});if(my!==token)return;window.__dvWorkbook=wb;
    box.innerHTML=bar+'<div class="auth-tabs" id="dvTabs" style="max-width:none;flex-wrap:wrap">'+wb.SheetNames.map(function(n,k){return '<button type="button" data-sh="'+k+'" class="'+(k?'':'on')+'">'+esc(n)+'</button>'}).join("")+'</div><div class="dv-sheet" id="dvSheet"></div>';
    var showS=function(k){$("dvSheet").innerHTML=window.XLSX.utils.sheet_to_html(wb.Sheets[wb.SheetNames[k]]);$("dvTabs").querySelectorAll("button").forEach(function(b){b.classList.toggle("on",+b.dataset.sh===k)})};
    showS(0);$("dvTabs").onclick=function(ev){var b=ev.target.closest("[data-sh]");if(b)showS(+b.dataset.sh)};
  }else if(/^(txt|md|json|html|xml)$/.test(e)){
    box.innerHTML=bar+'<div class="dv-txt" id="dvTx"></div>';$("dvTx").textContent=await blob.text();
  }else box.innerHTML=bar+'<p>Aperçu indisponible pour ce format : utilisez « Télécharger ».</p>';
}
function open(i){
  var box=$("dvView"),opening=show(i),my=token;
  opening.catch(function(error){if(my===token&&box&&box.isConnected)fail(error)});
}
function fail(x){var b=$("dvView");if(!b)return;var message=String(x&&x.message||x);if(/not_found|introuvable/i.test(message))message="Ce document n'est plus disponible à son ancien emplacement Dropbox. Réassociez le fichier depuis votre Dropbox.";else if(/Connexion requise|401|403/.test(message))message="Votre session a expiré ou vous n'avez pas accès à ce fichier.";else if(message.length>280)message="Erreur de lecture Dropbox. Réessayez ou réassociez le fichier.";b.innerHTML='<div class="dv-error" role="alert"><p>Impossible de prévisualiser : '+esc(message)+'</p><button type="button" data-dvp-refresh="1">Réessayer</button><button type="button" data-dvp-dl-fail="1">Télécharger</button>'+(window.USER_ROLE==="admin"?'<button type="button" data-dvp-relink="1">Réassocier depuis Dropbox</button>':'')+'</div>'}
document.addEventListener("click",function(e){
  var relink=e.target.closest("button[data-dvp-relink]");
  if(relink){e.preventDefault();e.stopPropagation();if(window.afRelinkDropbox)window.afRelinkDropbox(cur.i);return}
  var ed=e.target.closest("button[data-dvp-edit]");
  if(ed){e.preventDefault();e.stopPropagation();if(window.dvRequestEdit)window.dvRequestEdit(cur.path);return}
  var download=e.target.closest("[data-dvp-dl-fail]");if(download){e.preventDefault();getBlob(cur.path).then(function(b){var u=mkUrl(b),a=document.createElement("a");a.href=u;a.download=cur.path.split("/").pop()||"document";a.click()}).catch(function(x){fail(x)});return}
   var r=e.target.closest("button[data-dvp-refresh]");
  if(r){e.preventDefault();e.stopPropagation();delete cache[cur.path];open(cur.i);return}
  var b=e.target.closest("[data-dvopen]"),control=e.target.closest("button,a,input,textarea,select,[data-dvrm]");
  if(!b||(control&&control!==b))return;
  e.preventDefault();e.stopPropagation();open(+b.dataset.dvopen);
},true);
document.addEventListener("keydown",function(e){
  if(e.key!=="Enter"&&e.key!==" ")return;
  var card=e.target.closest(".dcard[data-dvopen]");
  if(e.target!==card)return;
  e.preventDefault();e.stopPropagation();
  if(!e.repeat)open(+card.dataset.dvopen);
},true);
window.dvReload=function(){delete cache[cur.path];open(cur.i)};
})();
