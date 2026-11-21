
/* ===== Messagerie interne : envoi groupé, pièces jointes, archivage Dropbox ===== */
(function(){
var tab="in",unread=0,first=true,W=[],$=function(i){return document.getElementById(i)};
var MAX_FILES=5,MAX_TOTAL=2.5*1024*1024;
function T(){return window.__TABLE||"afriflow_state"} function S(){return window.__sb}
function me(){return String(loggedUserEmail||"").toLowerCase()}
function isAdm(){return window.USER_ROLE==="admin"}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function fdt(t){return new Date(t).toLocaleString("fr-FR",{dateStyle:"short",timeStyle:"short"})}
function fsz(n){return n>=1048576?(n/1048576).toFixed(1).replace(".",",")+" Mo":Math.max(1,Math.round(n/1024))+" Ko"}
function dataBlob(d){var p=d.split(","),m=/data:([^;]*)/.exec(p[0]),b=atob(p[1]),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return new Blob([a],{type:(m&&m[1])||"application/octet-stream"})}
function readFile(f){return new Promise(function(ok,ko){var r=new FileReader();r.onload=function(){ok({n:f.name,t:f.type||"application/octet-stream",s:f.size,d:r.result})};r.onerror=function(){ko(new Error("Lecture impossible : "+f.name))};r.readAsDataURL(f)})}
function safeFile(f){return !!(f&&typeof f.d==="string"&&/^data:[^,]+,/.test(f.d))}
function previewable(f){return safeFile(f)&&(/^(image\/|text\/|application\/pdf$)/.test(f.t||"")||/\.(png|jpe?g|gif|webp|svg|pdf|txt|md|csv|json|xml)$/i.test(f.n||""))}
function downloadAttachment(f){
  if(!safeFile(f))throw new Error("Fichier indisponible.");
  var a=document.createElement("a");a.href=URL.createObjectURL(dataBlob(f.d));a.download=String(f.n||"piece-jointe");document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},3000);
}
function closePreview(){var p=document.getElementById("mPreview");if(p)p.remove()}
async function previewAttachment(f){
  if(!previewable(f))throw new Error("Aperçu non disponible pour ce format.");
  closePreview();var p=document.createElement("section");p.id="mPreview";p.className="m-preview";p.setAttribute("role","dialog");p.setAttribute("aria-modal","true");
  p.innerHTML='<div class="m-preview-card"><div class="m-preview-head"><b>'+esc(f.n||"Pièce jointe")+'</b><button type="button" id="mPreviewClose" aria-label="Fermer l’aperçu">Fermer</button></div><div id="mPreviewBody" class="m-preview-body"></div><div class="m-preview-actions"><button type="button" class="p" id="mPreviewDl">Télécharger</button></div></div>';
  document.body.appendChild(p);var body=document.getElementById("mPreviewBody"),type=String(f.t||"").toLowerCase();
  if(/^image\//.test(type)||/\.(png|jpe?g|gif|webp|svg)$/i.test(f.n||"")){var im=document.createElement("img");im.src=f.d;im.alt=f.n||"Aperçu de la pièce jointe";body.appendChild(im)}
  else if(type==="application/pdf"||/\.pdf$/i.test(f.n||"")){var fr=document.createElement("iframe");fr.src=f.d;fr.title=f.n||"Aperçu PDF";fr.setAttribute("sandbox","");body.appendChild(fr)}
  else {var pre=document.createElement("pre");pre.textContent=await dataBlob(f.d).text();body.appendChild(pre)}
  document.getElementById("mPreviewClose").onclick=closePreview;document.getElementById("mPreviewDl").onclick=function(){try{downloadAttachment(f)}catch(e){if(window.toast)toast(e.message)}};
  p.addEventListener("click",function(e){if(e.target===p)closePreview()});
}
async function rows(p){
  var r=await S().from(T()).select("key,value").like("key",p+me()+":%").order("key",{ascending:false}).limit(200);
  if(r.error)throw r.error;
  return (r.data||[]).filter(function(x){return x.value&&(p==="msg:"?x.value.to===me():x.value.from===me())});
}
async function poll(){
  if(!me()||!S()){first=true;unread=0;return}
  try{
    var n=(await rows("msg:")).filter(function(x){return !x.value.read}).length;
    if(n>unread&&!first&&window.toast)toast("Nouveau message reçu");
    first=false;unread=n;window.MSG_UNREAD=n;
    var b=document.querySelector('.nv[data-id="messages"]');if(b)b.textContent="Messagerie"+(n?" ("+n+")":"");
    if($("msgList"))window.renMsg(true);
  }catch(e){}
}
function msgHost(){var h=$("msgBox");if(!h){h=document.createElement("section");h.id="msgBox";h.className="msg-box";h.setAttribute("role","dialog");h.setAttribute("aria-modal","true");h.setAttribute("aria-label","Messagerie AfriFloW");document.body.appendChild(h)}return h}
function closeMessages(){var h=$("msgBox");if(h)h.remove()}
function shell(){
  var h=msgHost();
  h.innerHTML='<div class="toolbar"><b>Messagerie</b><div class="toolbar-actions">'+(isAdm()&&window.DBX?'<button type="button" id="mDbx">Dropbox : '+(DBX.ready()?"connecté":"à connecter")+'</button>':'')+'<button type="button" class="p" id="mNew">Nouveau message</button><button type="button" id="mClose" aria-label="Fermer la messagerie">Fermer</button></div></div><div class="auth-tabs" style="max-width:380px"><button type="button" id="mIn" class="'+(tab==="in"?"on":"")+'">Réception</button><button type="button" id="mOut" class="'+(tab==="out"?"on":"")+'">Envoyés</button></div><div class="dgrid" id="msgList"><p style="color:var(--muted)">Chargement…</p></div>';
  h.onclick=function(e){
    var b=e.target.closest("button"),c=e.target.closest(".dcard");
    if(b&&b.id==="mClose")closeMessages();
    else if(b&&b.id==="mNew")compose();
    else if(b&&b.id==="mDbx"&&window.DBX)DBX.dialog();
    else if(b&&(b.id==="mIn"||b.id==="mOut")){tab=b.id==="mIn"?"in":"out";window.renMsg()}
    else if(c&&$("msgList"))openMsg(+c.dataset.i);
  };
}
async function fill(){
  var L;
  try{L=await rows(tab==="in"?"msg:":"sent:")}catch(e){if($("msgList"))$("msgList").textContent="Lecture impossible : "+(e.message||e);return}
  var box=$("msgList");if(!box)return;W=L;
  box.innerHTML=L.length?L.map(function(x,i){var v=x.value,who=tab==="in"?(v.fromName||v.from):v.to;
    return '<div class="dcard" data-i="'+i+'" style="cursor:pointer"><b>'+(tab==="in"&&!v.read?"Non lu · ":"")+esc(v.subject||"(sans objet)")+'</b><small>'+(tab==="in"?"De : ":"À : ")+esc(who)+' · '+fdt(v.ts)+'</small><small>'+(v.nf?"Pièce jointe · ":"")+esc(String(v.body||"").slice(0,90))+'</small></div>'}).join(""):'<p style="color:var(--muted)">Aucun message.</p>';
}
window.renMsg=function(silent){if(!silent||!$("msgList"))shell();fill()};

async function showAtt(v,x){
  var box=$("mAtt");if(!box||!v.att)return;
  var r=await S().from(T()).select("value").eq("key","att:"+v.att).maybeSingle();
  box=$("mAtt");if(!box)return;
  var fs=(r.data&&r.data.value&&r.data.value.files)||[];
  if(r.error||!fs.length){box.innerHTML='<small style="color:var(--muted)">Pièces jointes indisponibles.</small>';return}
  box.innerHTML='<h4 style="margin:14px 0 6px;font-family:var(--font-family)">Pièces jointes ('+fs.length+')</h4>'+fs.map(function(f,i){return '<div class="file-row"><div><b>'+esc(f.n||"Fichier")+'</b><small style="color:var(--muted)"> · '+fsz(f.s)+'</small></div><div class="file-actions">'+(previewable(f)?'<button type="button" data-mpreview="'+i+'">Aperçu</button>':'')+'<button type="button" data-mdownload="'+i+'">Télécharger</button></div></div>'}).join("")+'<div id="mDbxNote" style="font-size:.85rem;color:var(--muted);margin-top:6px"></div>';
  box.onclick=function(e){var b=e.target.closest("button");if(!b)return;var i=+(b.dataset.mpreview||b.dataset.mdownload);try{if(b.dataset.mpreview!==undefined)previewAttachment(fs[i]).catch(function(x){if(window.toast)toast(x.message||String(x))});else downloadAttachment(fs[i])}catch(x){if(window.toast)toast(x.message||String(x))}};
  if(tab==="in"&&isAdm()&&window.DBX){
    var nt=$("mDbxNote");
    if(!DBX.ready()){nt.textContent="Dropbox non connecté : utilisez le bouton « ☁ Dropbox » pour archiver automatiquement les pièces jointes.";return}
    if(v.dbxAt){nt.textContent="✔ Déjà archivées dans Dropbox ("+fdt(v.dbxAt)+").";return}
    try{
      nt.textContent="Envoi dans Dropbox…";
      for(var i=0;i<fs.length;i++)await DBX.upload("Messagerie/"+(v.fromName||v.from),fs[i].n,dataBlob(fs[i].d));
      v.dbxAt=Date.now();S().from(T()).update({value:v}).eq("key",x.key);
      if($("mDbxNote"))$("mDbxNote").textContent="✔ Archivées dans Dropbox (dossier Messagerie).";
    }catch(e){if($("mDbxNote"))$("mDbxNote").textContent="Archivage Dropbox impossible : "+(e.message||e)}
  }
}
function openMsg(i){
  var x=W[i];if(!x)return;var v=x.value,h=msgHost();
  var grp=v.group&&v.group.length>1?'<p style="color:var(--muted);margin:0 0 8px;font-size:.9rem">Envoyé à '+v.group.length+' personnes : '+esc(v.group.join(", "))+'</p>':'';
  h.innerHTML='<div class="toolbar"><b>'+esc(v.subject||"(sans objet)")+'</b><div class="toolbar-actions"><button type="button" id="mBack">← Retour</button>'+(tab==="in"?'<button type="button" class="p" id="mRep">Répondre</button>':'')+'</div></div><div class="journal-article" id="mRead"><p style="color:var(--muted);margin-top:0">'+(tab==="in"?"De : "+esc(v.fromName||v.from)+" ("+esc(v.from)+")":"À : "+esc(v.to))+' · '+fdt(v.ts)+'</p>'+grp+'<div style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(v.body)+'</div>'+(v.att?'<div id="mAtt"><small style="color:var(--muted)">Chargement des pièces jointes…</small></div>':'')+'</div>';
  $("mBack").onclick=function(){window.renMsg()};
  if($("mRep"))$("mRep").onclick=function(){compose(v.from,"Re : "+String(v.subject||"").replace(/^Re : /,""))};
  if(tab==="in"&&!v.read){v.read=true;S().from(T()).update({value:v}).eq("key",x.key).then(function(){poll()})}
  if(v.att)showAtt(v,x).catch(function(){if($("mAtt"))$("mAtt").textContent="Pièces jointes indisponibles."});
}
async function compose(to,subj){
  var h=msgHost(),U=[],F=[],sel={};
  try{U=await AFRI.listMembers()}catch(e){if(window.toast)toast("Annuaire indisponible : "+(e.message||e))}
  U=U.filter(function(u){return u.email&&u.email!==me()});
  if(to)sel[to]=1;
  h.innerHTML='<div class="toolbar"><b>Nouveau message</b><div class="toolbar-actions"><button type="button" id="mBack">← Annuler</button></div></div><div class="journal-article"><div class="fm">'
  +'<label>Destinataires <span id="mCnt" style="font-weight:400"></span></label>'
  +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px"><input id="mQ" placeholder="Rechercher un nom ou un email…" style="flex:1;min-width:160px" autocomplete="off"><button type="button" id="mAll">Tout sélectionner</button><button type="button" id="mNone">Aucun</button></div>'
  +'<div id="mList" style="max-height:210px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:8px"></div>'
  +'<label for="mSubj">Objet</label><input id="mSubj" maxlength="120">'
  +'<label for="mBody">Message</label><textarea id="mBody" rows="8" maxlength="5000"></textarea>'
  +'<label for="mFiles">Pièces jointes <span style="font-weight:400">(5 max · 2,5 Mo au total)</span></label><input type="file" id="mFiles" multiple><div id="mFl" style="margin-top:6px"></div>'
  +'<div id="mErr" role="alert" style="color:#c0392b;min-height:1.2em"></div><button type="button" class="p" id="mSend">Envoyer</button></div></div>';
  if(subj)$("mSubj").value=subj;
  function drawList(){
    var q=$("mQ").value.trim().toLowerCase();
    var L=U.filter(function(u){return !q||(String(u.name||"")+" "+u.email).toLowerCase().indexOf(q)>-1});
    $("mList").innerHTML=L.length?L.map(function(u){return '<label class="rq"><input type="checkbox" value="'+esc(u.email)+'"'+(sel[u.email]?' checked':'')+'> '+esc(u.name||u.email)+' · '+esc(u.email)+'</label>'}).join(""):'<small style="color:var(--muted)">'+(U.length?"Aucun résultat.":"Aucun autre compte inscrit pour le moment.")+'</small>';
    cnt();
  }
  function cnt(){var n=Object.keys(sel).length;$("mCnt").textContent=n?"· "+n+" sélectionné"+(n>1?"s":""):""}
  $("mList").onchange=function(e){var c=e.target;if(c.type!=="checkbox")return;if(c.checked)sel[c.value]=1;else delete sel[c.value];cnt()};
  $("mQ").oninput=drawList;
  $("mAll").onclick=function(){var q=$("mQ").value.trim().toLowerCase();U.forEach(function(u){if(!q||(String(u.name||"")+" "+u.email).toLowerCase().indexOf(q)>-1)sel[u.email]=1});drawList()};
  $("mNone").onclick=function(){sel={};drawList()};
  drawList();
  function drawFiles(){
    var tot=F.reduce(function(a,f){return a+f.size},0);
    $("mFl").innerHTML=F.map(function(f,i){return '<div class="file-row"><div>'+esc(f.name)+' <small style="color:var(--muted)">'+fsz(f.size)+'</small></div><button type="button" class="danger" data-rf="'+i+'">Retirer</button></div>'}).join("")+(F.length?'<small style="color:var(--muted)">Total : '+fsz(tot)+' / 2,5 Mo</small>':'');
  }
  $("mFl").onclick=function(e){var b=e.target.closest("button[data-rf]");if(b){F.splice(+b.dataset.rf,1);drawFiles()}};
  $("mFiles").onchange=function(){
    var err="";
    Array.prototype.slice.call(this.files).forEach(function(f){
      var tot=F.reduce(function(a,g){return a+g.size},0);
      if(F.length>=MAX_FILES)err="5 fichiers maximum par message.";
      else if(tot+f.size>MAX_TOTAL)err="« "+f.name+" » dépasse la limite de 2,5 Mo au total. Pour un gros fichier, déposez-le dans Dropbox et collez le lien dans le message.";
      else F.push(f);
    });
    this.value="";$("mErr").textContent=err;drawFiles();
  };
  $("mBack").onclick=function(){window.renMsg()};
  $("mSend").onclick=async function(){
    var rec=Object.keys(sel),s=$("mSubj").value.trim().slice(0,120),b=$("mBody").value.trim().slice(0,5000),btn=this;
    if(!rec.length||!b){$("mErr").textContent="Choisissez au moins un destinataire et écrivez un message.";return}
    btn.disabled=true;$("mErr").textContent="";
    try{
      var files=await Promise.all(F.map(readFile));
      var ts=Date.now(),k=ts+":"+Math.random().toString(36).slice(2,6),now=new Date().toISOString();
      var base={from:me(),fromName:USER_NAME||me(),subject:s,body:b,ts:ts,read:false};
      if(files.length){base.att=k;base.nf=files.length}
      var out=[{key:"sent:"+me()+":"+k,value:Object.assign({},base,{to:rec.join(", "),read:true,group:rec.length>1?rec:undefined}),updated_at:now}];
      rec.forEach(function(t){out.push({key:"msg:"+t+":"+k,value:Object.assign({},base,{to:t,group:rec.length>1?rec:undefined}),updated_at:now})});
      if(files.length)out.push({key:"att:"+k,value:{files:files,from:me(),to:rec,ts:ts},updated_at:now});
      var r=await S().from(T()).insert(out);
      if(r.error)throw r.error;
      if(window.AfriFlowPush&&window.AfriFlowPush.notifyMessage)window.AfriFlowPush.notifyMessage(k).catch(function(){});
      if(files.length&&isAdm()&&window.DBX&&DBX.ready()){
        try{for(var i=0;i<files.length;i++)await DBX.upload("Messagerie/Envoyés",files[i].n,dataBlob(files[i].d));if(window.toast)toast("Pièces jointes archivées dans Dropbox")}catch(e){if(window.toast)toast("Archivage Dropbox impossible : "+(e.message||e))}
      }
      if(window.toast)toast(rec.length>1?"Message envoyé à "+rec.length+" personnes":"Message envoyé");
      tab="out";window.renMsg();
    }catch(e){btn.disabled=false;$("mErr").textContent="Envoi impossible : "+(e.message||e)}
  };
}
var prev=window.onRole;
window.onRole=function(){if(prev)prev();setTimeout(poll,1500)};
setInterval(poll,25000);
if(loggedUserEmail)setTimeout(poll,1500);
})();
