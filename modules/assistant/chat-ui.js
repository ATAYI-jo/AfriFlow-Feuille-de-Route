
(function(){
"use strict";
var $g=function(i){return document.getElementById(i)};
var H=[],busy=false,atts=[],voice=false,autoRead=true,rec=null,listening=false,speaking=false,greeted=false;
var MAX_FILES=4,MAX_B64=5*1024*1024;

/* ---------- Icônes (SVG intégrés) ---------- */
var P={
 attach:'<path d="M21.4 11.1l-9.2 9.2a5.5 5.5 0 0 1-7.8-7.8l9.2-9.2a3.7 3.7 0 0 1 5.2 5.2l-9.2 9.2a1.8 1.8 0 0 1-2.6-2.6l8.5-8.5"/>',
 mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
 wave:'<path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/>',
 speaker:'<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
 down:'<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
 send:'<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>'
};
function ic(n){return '<svg class="aiic" viewBox="0 0 24 24" aria-hidden="true">'+P[n]+'</svg>'}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function toast(m){(window.toast||alert)(m)}
function isAdm(){return typeof USER_ROLE!=="undefined"&&USER_ROLE==="admin"}
function logged(){return typeof loggedUserEmail!=="undefined"&&!!loggedUserEmail}

/* ---------- Interface ---------- */
var btn=document.createElement("button");
btn.type="button";btn.id="aiBtn";btn.className="p";btn.textContent="Assistance";
btn.style.cssText="position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:900;display:none;box-shadow:0 4px 14px rgba(0,0,0,.25)";

var box=document.createElement("div");
box.id="aiBox";box.setAttribute("role","dialog");box.setAttribute("aria-label","Assistance AfriFlow");
box.style.cssText="position:fixed;right:12px;bottom:calc(64px + env(safe-area-inset-bottom,0px));z-index:900;width:min(480px,94vw);height:min(78vh,700px);display:none;flex-direction:column;gap:8px;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:16px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.3)";
box.innerHTML=
 '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'+
   '<b id="aiTitle" style="color:var(--green)">AfriFlow</b>'+
   '<span><button type="button" id="aiClear" style="padding:4px 10px;font-size:.8rem">Effacer</button> '+
   '<button type="button" id="aiClose" aria-label="Fermer" style="padding:4px 10px;font-size:.8rem">'+'<svg class="aiic" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M18 6L6 18M6 6l12 12"/></svg>'+'</button></span>'+
 '</div>'+
 '<div id="aiLog" style="flex:1;overflow-y:auto;font-size:.92rem;line-height:1.45"></div>'+
   '<div id="aiStat" aria-live="polite" style="font-size:.8rem;color:var(--muted);min-height:1.1em"></div>'+
 '<div id="aiFiles" class="aichips"></div>'+
 '<textarea id="aiIn" rows="2" style="width:100%;resize:vertical"></textarea>'+
 '<div class="aibar">'+
   '<button type="button" id="aiAtt" title="Joindre un fichier (image, PDF, texte)" aria-label="Joindre un fichier">'+ic("attach")+'</button>'+
   '<input type="file" id="aiFile" multiple hidden accept="image/*,application/pdf,.txt,.md,.csv,.json,.html,.xml">'+
   '<button type="button" id="aiMic" title="Dicter un message" aria-label="Dicter un message">'+ic("mic")+'</button>'+
   '<button type="button" id="aiVoice" title="Conversation vocale mains libres" aria-label="Conversation vocale">'+ic("wave")+'</button>'+
   '<button type="button" id="aiRead" title="Lire les réponses à voix haute" aria-label="Lecture à voix haute">'+ic("speaker")+'</button>'+
   '<span style="flex:1"></span>'+
   '<button type="button" class="p" id="aiGo">'+ic("send")+' Envoyer</button>'+
 '</div>';
document.body.appendChild(btn);document.body.appendChild(box);

/* ---------- Rendu des messages ---------- */
function md(s){
  var h=esc(s),blocks=[];
  h=h.replace(/```(?:\w+)?\n([\s\S]*?)```/g,function(_,c){blocks.push(c);return "\u0001"+(blocks.length-1)+"\u0001"});
  h=h.replace(/`([^`\n]+)`/g,"<code>$1</code>")
     .replace(/\*\*([^*\n]+)\*\*/g,"<b>$1</b>")
     .replace(/(^|[\s(])\*([^*\n]+)\*/g,"$1<i>$2</i>")
     .replace(/^#{1,3} +(.+)$/gm,'<b style="display:block;margin-top:6px">$1</b>')
     .replace(/^[-*] +(.+)$/gm,"• $1")
     .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--green);font-weight:700">$1</a>');
  return h.replace(/\u0001(\d+)\u0001/g,function(_,i){return "<pre>"+blocks[+i]+"</pre>"});
}
function add(who,text,o){
  o=o||{};
  var d=document.createElement("div");
  d.style.cssText="margin:6px 0;padding:8px 10px;border-radius:10px;overflow-wrap:anywhere;white-space:pre-wrap;background:"+
    (who==="Vous"?"color-mix(in srgb,var(--green) 12%,var(--card))":"color-mix(in srgb,var(--ink) 6%,var(--card))");
  var b=document.createElement("b");b.textContent=who+" : ";d.appendChild(b);
  var s=document.createElement("span");
  if(o.md)s.innerHTML=md(text||"");else s.textContent=text||"";
  d.appendChild(s);
  (o.prs||[]).forEach(function(p){
    var a=document.createElement("a");a.href=/^https:\/\/github\.com\//.test(p.url)?p.url:"#";a.target="_blank";a.rel="noopener noreferrer";
    a.style.cssText="display:block;margin-top:8px;color:var(--green);font-weight:700";
    a.textContent="Ouvrir la Pull Request sur GitHub : "+(p.title||"");d.appendChild(a);
  });
  (o.files||[]).forEach(function(f){
    var bt=document.createElement("button");bt.type="button";bt.className="aifile";
    bt.innerHTML=ic("down")+" "+esc(f.name);
    bt.onclick=function(){bt.disabled=true;dlFile(f).catch(function(e){toast("Téléchargement impossible : "+(e.message||e))}).then(function(){bt.disabled=false})};
    d.appendChild(document.createElement("br"));d.appendChild(bt);
  });
  var log=$g("aiLog");log.appendChild(d);log.scrollTop=log.scrollHeight;return d;
}

/* ---------- Génération de fichiers ---------- */
var LIBS={
 docx:["https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js",function(){return window.htmlDocx}],
 xlsx:["https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",function(){return window.XLSX}],
 pdf:["https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",function(){return window.jspdf}]},lp={};
function lib(n){
  var l=LIBS[n];if(l[1]())return Promise.resolve();
  return lp[n]||(lp[n]=new Promise(function(ok,ko){var s=document.createElement("script");s.src=l[0];s.onload=ok;s.onerror=function(){delete lp[n];ko(new Error("Module "+n+" indisponible (connexion ?)"))};document.head.appendChild(s)}));
}
async function buildBlob(f){
  var t=f.type,c=String(f.content||"");
  if(t==="docx"){
    await lib("docx");
    return window.htmlDocx.asBlob('<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px}</style></head><body>'+c+'</body></html>');
  }
  if(t==="xlsx"){
    await lib("xlsx");var X=window.XLSX,rows=null,ws;
    try{rows=JSON.parse(c)}catch(e){}
    if(Array.isArray(rows))ws=X.utils.aoa_to_sheet(rows);
    else{var tmp=X.read(c,{type:"string"});ws=tmp.Sheets[tmp.SheetNames[0]]}
    var wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,"Feuille1");
    return new Blob([X.write(wb,{bookType:"xlsx",type:"array"})],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  }
  if(t==="pdf"){
    await lib("pdf");var d=new window.jspdf.jsPDF({unit:"mm",format:"a4"}),y=20;
    c.split(/\r?\n/).forEach(function(line){
      var big=/^#{1,3} /.test(line),txt=line.replace(/^#{1,3} /,"").replace(/\*\*/g,"");
      d.setFont("helvetica",big?"bold":"normal").setFontSize(big?15:11);
      d.splitTextToSize(txt||" ",174).forEach(function(l){if(y>278){d.addPage();y=20}d.text(l,18,y);y+=big?8:6});
      if(big)y+=2;
    });
    return d.output("blob");
  }
  var mime={md:"text/markdown",txt:"text/plain",csv:"text/csv",json:"application/json",html:"text/html"}[t]||"text/plain";
  return new Blob([(t==="csv"?"\uFEFF":"")+c],{type:mime+";charset=utf-8"});
}
async function dlFile(f){
  var b=await buildBlob(f),a=document.createElement("a");
  a.href=URL.createObjectURL(b);a.download=f.name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(a.href)},3000);
}

/* ---------- Pièces jointes ---------- */
function readData(f){return new Promise(function(ok,ko){var r=new FileReader();r.onload=function(){ok(r.result)};r.onerror=function(){ko(new Error("Lecture impossible : "+f.name))};r.readAsDataURL(f)})}
function readText(f){return new Promise(function(ok,ko){var r=new FileReader();r.onload=function(){ok(r.result)};r.onerror=function(){ko(new Error("Lecture impossible : "+f.name))};r.readAsText(f)})}
function shrink(f){
  return readData(f).then(function(url){return new Promise(function(ok,ko){
    var im=new Image();
    im.onload=function(){
      var k=Math.min(1,1568/Math.max(im.width,im.height)),c=document.createElement("canvas");
      c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);
      var x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);
      ok(c.toDataURL("image/jpeg",.85).split(",")[1]);
    };
    im.onerror=function(){ko(new Error("Image illisible : "+f.name))};im.src=url;
  })});
}
async function addFiles(list){
  var arr=[].slice.call(list||[]);
  for(var i=0;i<arr.length;i++){
    var f=arr[i];
    if(atts.length>=MAX_FILES){toast(MAX_FILES+" fichiers maximum par message.");break}
    try{
      var blk;
      if(/^image\//.test(f.type)){blk={type:"image",source:{type:"base64",media_type:"image/jpeg",data:await shrink(f)}}}
      else if(f.type==="application/pdf"||/\.pdf$/i.test(f.name)){
        var u=await readData(f);blk={type:"document",source:{type:"base64",media_type:"application/pdf",data:u.split(",")[1]}};
      }else if(/\.(txt|md|csv|json|html|xml)$/i.test(f.name)||/^text\//.test(f.type)){
        blk={type:"text",text:"[Fichier joint : "+f.name+"]\n"+(await readText(f)).slice(0,100000)};
      }else{toast("Format non pris en charge : "+f.name);continue}
      var size=JSON.stringify(blk).length+atts.reduce(function(a,x){return a+JSON.stringify(x.block).length},0);
      if(size>MAX_B64){toast("Fichiers trop volumineux (5 Mo au total) : « "+f.name+" » ignoré.");continue}
      atts.push({name:f.name,block:blk});
    }catch(e){toast(e.message||String(e))}
  }
  drawChips();
}
function drawChips(){
  var c=$g("aiFiles");c.textContent="";
  atts.forEach(function(a,i){
    var s=document.createElement("span");s.className="aichip";s.appendChild(document.createTextNode(a.name));
    var x=document.createElement("button");x.type="button";x.setAttribute("aria-label","Retirer "+a.name);x.textContent="×";
    x.onclick=function(){atts.splice(i,1);drawChips()};s.appendChild(x);c.appendChild(s);
  });
}

/* ---------- Voix : lecture ---------- */
function frVoice(){
  var v=(window.speechSynthesis&&speechSynthesis.getVoices())||[];
  return v.filter(function(x){return /^fr/i.test(x.lang)}).sort(function(a,b){return (/google|natural|premium/i.test(b.name)?1:0)-(/google|natural|premium/i.test(a.name)?1:0)})[0]||null;
}
function plain(s){
  return String(s).replace(/```[\s\S]*?```/g," (bloc de code) ").replace(/`([^`]*)`/g,"$1").replace(/\[([^\]]+)\]\([^)]*\)/g,"$1")
    .replace(/https?:\/\/\S+/g," lien ").replace(/[*#_>|]/g,"").replace(/^[-•] +/gm,"").replace(/\s+/g," ").trim();
}
var keep=[];
function setStat(t,icon){var s=$g("aiStat");if(!s)return;s.innerHTML=(t&&icon?ic(icon)+" ":"")+esc(t||"")}
function stopSpeak(){speaking=false;keep=[];try{if(window.speechSynthesis)speechSynthesis.cancel()}catch(e){}}
function speak(text){
  if(!window.speechSynthesis){after();return}
  stopSpeak();
  var parts=(plain(text).match(/[^.!?;:\n]+[.!?;:]*\s*/g)||[]).reduce(function(a,p){
    if(a.length&&(a[a.length-1]+p).length<220)a[a.length-1]+=p;else a.push(p);return a;
  },[]);
  if(!parts.length){after();return}
  speaking=true;setStat("Je parle…","speaker");
  setTimeout(function(){
    var v=frVoice();
    parts.forEach(function(p,i){
      var u=new SpeechSynthesisUtterance(p);u.lang="fr-FR";if(v)u.voice=v;u.rate=1;
      keep.push(u);
      var fin=function(){if(i===parts.length-1&&speaking){speaking=false;keep=[];setStat("");after()}};
      u.onend=fin;
      u.onerror=function(e){if(e&&(e.error==="canceled"||e.error==="interrupted"))return;fin()};
      speechSynthesis.speak(u);
    });
    try{speechSynthesis.resume()}catch(e){}
  },120);
}
function after(){if(voice&&box.style.display==="flex"&&!busy)setTimeout(startListen,350)}

/* ---------- Voix : écoute ---------- */
var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
function paint(){
  $g("aiMic").classList.toggle("on",listening);
  $g("aiVoice").classList.toggle("on",voice);
  $g("aiRead").classList.toggle("on",autoRead||voice);
}
function startListen(){
  if(!SR){toast("La dictée vocale n'est pas disponible sur ce navigateur (essayez Chrome, Edge ou Safari).");voice=false;paint();return}
  if(listening||busy)return;
  stopSpeak();
  var inp=$g("aiIn"),base=inp.value.trim(),fin="";
  rec=new SR();rec.lang="fr-FR";rec.interimResults=true;rec.continuous=false;
  rec.onresult=function(e){
    var it="";
    for(var i=e.resultIndex;i<e.results.length;i++){var r=e.results[i];if(r.isFinal)fin+=r[0].transcript;else it+=r[0].transcript}
    inp.value=(base?base+" ":"")+fin+it;
  };
   rec.onstart=function(){setStat("Je vous écoute…","mic")};
  rec.onerror=function(e){
    listening=false;setStat("");
    var M={"not-allowed":"Micro refusé : autorisez-le dans le navigateur (site en https).","service-not-allowed":"Micro refusé par le navigateur.","audio-capture":"Aucun micro détecté.","network":"Reconnaissance vocale indisponible (réseau, ou navigateur non compatible comme Brave ou Firefox)."};
    if(M[e.error]){voice=false;toast(M[e.error])}
    paint();
  };
  rec.onend=function(){
    listening=false;setStat("");paint();
    if(voice&&box.style.display==="flex"){
      if(inp.value.trim()&&!busy)send();
      else if(!busy&&!speaking)setTimeout(startListen,500);
    }
  };
  try{rec.start();listening=true;paint()}catch(e){listening=false;paint()}
}
function stopListen(){try{if(rec)rec.stop()}catch(e){}listening=false}

/* ---------- Envoi ---------- */
function slim(m){
  if(!Array.isArray(m.content))return;
  var t=m.content.filter(function(b){return b.type==="text"}).map(function(b){return b.text}).join("\n");
  var dropped=m.content.some(function(b){return b.type!=="text"});
  m.content=(t||"")+(dropped?"\n[image ou PDF d'un message précédent retiré]":"");
  if(!m.content.trim())m.content="[pièce jointe d'un message précédent]";
}
async function send(){
  if(busy)return;
  var inp=$g("aiIn"),t=inp.value.trim();
  if(!t&&!atts.length)return;
  if(!window.__sb){add("Erreur","Service indisponible.");return}
  stopListen();stopSpeak();
  H.forEach(slim);
  var names=atts.map(function(a){return a.name});
  var content=atts.length?atts.map(function(a){return a.block}).concat([{type:"text",text:t||"Voici mes fichiers. Analyse-les."}]):t;
  atts=[];drawChips();
  busy=true;$g("aiGo").disabled=true;inp.value="";
  add("Vous",(t||"")+(names.length?"\n["+names.join(", ")+"]":""));
  H.push({role:"user",content:content});
  var wait=add("AfriFlow","je réfléchis… (cela peut prendre un moment)");
  try{
    var body={messages:H.slice(-16),mode:isAdm()?"admin":"help",tz:new Date().getTimezoneOffset()},r,last;
    for(var attempt=0;attempt<2;attempt++){
      r=await window.__sb.functions.invoke("admin-ai",{body:body});
      if(!r.error)break;
      last=r.error;
      if(attempt===0&&/fetch|network|timeout|temporarily|5\d\d/i.test(String(last.message||last))){
        $g("aiStat").textContent="Nouvel essai de l’assistance…";
        await new Promise(function(resolve){setTimeout(resolve,900)});continue;
      }
      break;
    }
    if(r.error){
      var m=r.error.message||"Erreur";
      try{var j=await r.error.context.json();if(j&&j.error)m=j.error}catch(e){}
      throw new Error(m);
    }
    var d=r.data||{},reply=d.reply||d.error||"(réponse vide)";
    wait.remove();
    var fl=d.files||[];
    H.push({role:"assistant",content:reply+(fl.length?"\n[Fichiers générés : "+fl.map(function(f){return f.name}).join(", ")+"]":"")});
    add("AfriFlow",reply,{md:true,files:fl,prs:d.prs||[]});
    if(autoRead||voice)speak(reply);else after();
  }catch(e){
    wait.remove();H.pop();
    add("Erreur",e.message||String(e));
    inp.value=t;
    $g("aiStat").textContent="Votre message a été conservé : vous pouvez le renvoyer.";
    after();
  }
  busy=false;$g("aiGo").disabled=false;if(!voice&&!window.matchMedia("(pointer:coarse)").matches)inp.focus();
}

/* ---------- Événements ---------- */
function hello(){
  if(greeted)return;greeted=true;
  add("AfriFlow",isAdm()
    ?"Bonjour, je suis AfriFlow. Je peux répondre à vos questions, analyser vos fichiers, créer des documents (Word, Excel, PDF…) et, en tant qu'administrateur, corriger ou modifier le site : je prépare alors une Pull Request que vous validez sur GitHub. Vous pouvez aussi me parler avec le micro."
    :"Bonjour, je suis AfriFlow. Posez-moi vos questions, joignez un fichier à analyser, demandez-moi un document à télécharger, ou parlez-moi avec le micro.");
}
function closeBox(){box.style.display="none";voice=false;stopListen();stopSpeak();paint()}
btn.onclick=function(){if(box.style.display==="flex")closeBox();else{box.style.display="flex";hello();if(!window.matchMedia("(pointer:coarse)").matches)$g("aiIn").focus()}};
$g("aiClose").onclick=closeBox;
$g("aiClear").onclick=function(){H=[];atts=[];drawChips();stopListen();stopSpeak();voice=false;paint();$g("aiLog").textContent="";greeted=false;hello()};
$g("aiGo").onclick=send;
$g("aiAtt").onclick=function(){$g("aiFile").click()};
$g("aiFile").onchange=function(){var f=this.files;addFiles(f).then(function(){$g("aiFile").value=""})};
$g("aiMic").onclick=function(){if(listening)stopListen();else{voice=false;paint();startListen()}};
$g("aiVoice").onclick=function(){
  voice=!voice;
  if(voice){autoRead=true;paint();startListen()}else{stopListen();stopSpeak();paint()}
};
$g("aiRead").onclick=function(){autoRead=!autoRead;if(!autoRead){voice=false;stopSpeak();stopListen()}paint()};
$g("aiIn").addEventListener("keydown",function(e){
  if(e.key==="Enter"&&(e.ctrlKey||e.metaKey||(!e.shiftKey&&window.matchMedia&&matchMedia("(pointer:fine)").matches))){e.preventDefault();send()}
});
$g("aiIn").addEventListener("paste",function(e){
  var fs=e.clipboardData&&e.clipboardData.files;if(fs&&fs.length){e.preventDefault();addFiles(fs)}
});
["dragenter","dragover"].forEach(function(n){box.addEventListener(n,function(e){e.preventDefault();box.classList.add("aidrop")})});
["dragleave","drop"].forEach(function(n){box.addEventListener(n,function(e){e.preventDefault();box.classList.remove("aidrop")})});
box.addEventListener("drop",function(e){if(e.dataTransfer&&e.dataTransfer.files.length)addFiles(e.dataTransfer.files)});
if(window.speechSynthesis)speechSynthesis.onvoiceschanged=function(){};
if(!SR)$g("aiMic").title=$g("aiVoice").title="Dictée indisponible sur ce navigateur";
paint();

/* Visible pour tout utilisateur connecté ; le serveur applique les droits (mode "help" = aucune modification du site). */
setInterval(function(){
  var lg=logged(),adm=lg&&isAdm();
  btn.style.display=lg?"":"none";
  var t=$g("aiTitle"),inp=$g("aiIn");
  if(t)t.textContent=adm?"AfriFlow · administrateur (modification du site)":"AfriFlow";
  if(inp)inp.placeholder=adm?"Posez une question, joignez un fichier, ou demandez une modification du site…":"Écrivez votre message à AfriFlow…";
  if(!lg){closeBox();if(H.length||atts.length){H=[];atts=[];drawChips();$g("aiLog").textContent="";greeted=false}}
},1000);
})();
