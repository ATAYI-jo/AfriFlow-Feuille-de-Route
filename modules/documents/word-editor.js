
(function(){
"use strict";
var $=function(i){return document.getElementById(i)};
function toast(m){(window.toast||alert)(m)}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function pad(n){return ("0"+n).slice(-2)}

/* ---------- Bibliothèque d'export Word ---------- */
var LIB="https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js",lp=null;
function lib(){
  if(window.htmlDocx)return Promise.resolve();
  return lp||(lp=new Promise(function(ok,ko){var s=document.createElement("script");s.src=LIB;s.onload=ok;s.onerror=function(){lp=null;ko(new Error("Module Word indisponible (connexion ?)"))};document.head.appendChild(s)}));
}
function clean(html){
  var t=document.createElement("template");t.innerHTML=html;
  t.content.querySelectorAll("script,iframe,object,embed,link,meta,style,form,base").forEach(function(n){n.remove()});
  t.content.querySelectorAll("*").forEach(function(el){[].slice.call(el.attributes).forEach(function(a){if(/^on/i.test(a.name)||(/^(href|src|xlink:href)$/i.test(a.name)&&/^\s*javascript:/i.test(a.value)))el.removeAttribute(a.name)})});
  return t.innerHTML;
}
function wrap(h){return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px}</style></head><body>'+h+'</body></html>'}

/* ---------- Icônes ---------- */
function al(m){var w=[14,9,14,7],s="";w.forEach(function(v,i){var x=m==="c"?(14-v)/2:m==="r"?14-v:0;if(m==="j")v=14;s+='<rect x="'+(x+1)+'" y="'+(1+i*3.4)+'" width="'+v+'" height="1.6" fill="currentColor" stroke="none"/>'});return '<svg viewBox="0 0 16 16" style="width:16px;height:16px">'+s+'</svg>'}
var SV={
 save:'<svg viewBox="0 0 24 24"><path d="M5 3h11l4 4v14H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></svg>',
 dl:'<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
 close:'<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>',
 table:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/></svg>',
 image:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>',
 link:'<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
 hr:'<svg viewBox="0 0 24 24"><path d="M4 12h16"/></svg>',
 pb:'<svg viewBox="0 0 24 24"><path d="M6 3h12v6H6zM6 15h12v6H6z"/><path d="M3 12h3M9 12h2M13 12h2M18 12h3" stroke-dasharray="2 2"/></svg>',
 date:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>'
};
function b(c,h,t,x){return '<span class="dw-b'+(x?" "+x:"")+'" role="button" tabindex="0" data-c="'+c+'" title="'+esc(t||"")+'">'+h+'</span>'}
function big(c,ic,label){return b(c,SV[ic]+'<span>'+label+'</span>',label,"big")}
function g(label,inner){return '<div class="dw-g"><div class="dw-gb">'+inner+'</div><div class="dw-gl">'+label+'</div></div>'}
function row(h){return '<div class="dw-row">'+h+'</div>'}
var FONTS=["Calibri","Arial","Times New Roman","Georgia","Courier New","Verdana","Tahoma","Trebuchet MS","Cambria","Garamond"],
    SIZES=[8,9,10,11,12,14,16,18,20,24,28,36,48,72];

var APP=null;
function build(path,orig,html,title){
  if($("dwApp"))$("dwApp").remove();
  var st={dirty:false,saved:false,backed:false,busy:false,rng:null,zoom:1};
  var app=document.createElement("section");app.id="dwApp";app.setAttribute("aria-label","Éditeur AfriFloW intégré");APP=app;
  app.innerHTML=
   '<div class="dw-top">'+b("save",SV.save,"Enregistrer (Ctrl+S)","dw-q")+b("undo","↶","Annuler","dw-q")+b("redo","↷","Rétablir","dw-q")
    +'<span class="dw-name">'+esc(title)+' — Dropbox</span><span class="dw-st" id="dwSt"></span>'+b("close",SV.close,"Fermer","dw-q")+'</div>'
   +'<div class="dw-tabs"><span class="dw-tab" data-t="f" role="button" tabindex="0">Fichier</span><span class="dw-tab on" data-t="a" role="button" tabindex="0">Accueil</span><span class="dw-tab" data-t="i" role="button" tabindex="0">Insertion</span><span class="dw-tab" data-t="v" role="button" tabindex="0">Affichage</span><span class="dw-tab" data-t="r" role="button" tabindex="0">Révision</span></div>'
   +'<div class="dw-shortcut-strip"><strong>⌨ Raccourcis actifs</strong><span>Ctrl+B Gras</span><span>Ctrl+I Italique</span><span>Ctrl+U Souligné</span><span>Ctrl+S Enregistrer</span><span>Ctrl+Z Annuler</span><span>Ctrl+Alt+J Justifier</span><span>Ctrl+F Rechercher</span><button type="button" id="dwHelpBtn">Tous les raccourcis</button></div>'
   +'<div class="dw-find" id="dwFind" hidden><label>Rechercher <input type="search" id="dwFindText" placeholder="Mot ou expression"></label><button type="button" id="dwFindNext">Suivant</button><label id="dwReplaceBox" hidden>Remplacer par <input id="dwReplaceText" type="text"></label><button type="button" id="dwReplaceBtn" hidden>Remplacer</button><button type="button" id="dwFindClose" aria-label="Fermer la recherche">✕</button></div>'
   +'<div class="dw-rib">'
    +'<div class="dw-pane" data-p="f">'+g("Fichier",row(big("save","save","Enregistrer")+big("dl","dl","Télécharger")+big("close","close","Fermer")))+'</div>'
    +'<div class="dw-pane on" data-p="a">'
      +g("Annuler",row(b("undo","↶","Annuler")+b("redo","↷","Rétablir")))
      +g("Presse-papiers",row(b("cut","Couper","Couper")+b("copy","Copier","Copier")))
      +g("Style",row('<select data-s="style" aria-label="Style" style="width:120px"><option value="p">Normal</option><option value="h1">Titre 1</option><option value="h2">Titre 2</option><option value="h3">Titre 3</option></select>'))
      +g("Police",
         row('<select data-s="font" aria-label="Police" style="width:130px"><option value="">Police</option>'+FONTS.map(function(f){return '<option>'+f+'</option>'}).join("")+'</select><select data-s="size" aria-label="Taille" style="width:56px"><option value="">pt</option>'+SIZES.map(function(s){return '<option>'+s+'</option>'}).join("")+'</select>')
        +row(b("bold","<b>G</b>","Gras (Ctrl+B)")+b("italic","<i>I</i>","Italique (Ctrl+I)")+b("underline","<u>S</u>","Souligné (Ctrl+U)")+b("strikeThrough","<s>ab</s>","Barré")+b("subscript","x<sub>2</sub>","Indice")+b("superscript","x<sup>2</sup>","Exposant")
          +'<input type="color" data-k="foreColor" value="#000000" title="Couleur de police"><input type="color" data-k="hiliteColor" value="#ffff00" title="Surlignage">'+b("removeFormat","Effacer","Effacer la mise en forme")))
      +g("Paragraphe",
         row(b("insertUnorderedList","•≡","Puces")+b("insertOrderedList","1≡","Numérotation")+b("outdent","⇤","Diminuer le retrait")+b("indent","⇥","Augmenter le retrait")+'<select data-s="lh" aria-label="Interligne" style="width:64px"><option value="">Interl.</option><option>1</option><option>1.15</option><option>1.5</option><option>2</option></select>')
        +row(b("justifyLeft",al("l"),"Aligner à gauche")+b("justifyCenter",al("c"),"Centrer")+b("justifyRight",al("r"),"Aligner à droite")+b("justifyFull",al("j"),"Justifier")))
    +'</div>'
    +'<div class="dw-pane" data-p="i">'+g("Insertion",row(big("table","table","Tableau")+big("image","image","Image")+big("link","link","Lien")+big("insertHorizontalRule","hr","Ligne")+big("pagebreak","pb","Saut de page")+big("date","date","Date")))+'</div>'
    +'<div class="dw-pane" data-p="v">'+g("Zoom",row(b("zoomout","−","Zoom arrière")+'<select data-s="zoom" aria-label="Zoom" style="width:80px"><option>50</option><option>75</option><option>90</option><option selected>100</option><option>125</option><option>150</option><option>200</option></select>'+b("zoomin","+","Zoom avant")+b("zoom100","100 %","Zoom 100 %")))+'</div>'
    +'<div class="dw-pane" data-p="r">'+g("Rechercher",row(b("find","🔍 Rechercher","Rechercher dans le document (Ctrl+F)")+b("replace","↔ Remplacer","Rechercher et remplacer")))+g("Document",row(b("selectAll","Tout sélectionner","Sélectionner le document (Ctrl+A)")+b("print","⎙ Imprimer","Imprimer le document")+b("shortcuts","⌨ Raccourcis","Liste des raccourcis")))+'</div>'
   +'</div>'
   +'<div class="dw-canvas" id="dwCv"><div class="dw-page" id="dwPage" contenteditable="true" spellcheck="true" lang="fr"></div></div>'
   +'<div class="dw-status"><span id="dwPg">Page 1 sur 1</span><span id="dwWc">0 mot</span><span>Français (France)</span><span class="sp"></span><span id="dwZl">100 %</span></div>'
   +'<input type="file" id="dwImg" accept="image/*" hidden>';
  var host=$("dvView");
  if(!host){toast("Zone des documents indisponible.");return}
  host.replaceChildren(app);
  document.body.classList.add("af-editor-mode");
  app.scrollIntoView({behavior:"smooth",block:"start"});
  var page=$("dwPage");page.innerHTML=html||"<p><br></p>";
  function setSt(t){var e=$("dwSt");if(e)e.textContent=t||""}
  function dirty(){st.dirty=true;setSt("Modifié, non enregistré");stats()}

  /* ----- sélection ----- */
  function onSel(){
    var s=window.getSelection();
    if(s.rangeCount&&page.contains(s.anchorNode)){st.rng=s.getRangeAt(0).cloneRange();state()}
  }
  document.addEventListener("selectionchange",onSel);
  function ex(c,v){
    page.focus();
    if(st.rng){var s=window.getSelection();s.removeAllRanges();s.addRange(st.rng)}
    try{document.execCommand("styleWithCSS",false,true)}catch(e){}
    document.execCommand(c,false,v);onSel();dirty();
  }
  function state(){
    ["bold","italic","underline","strikeThrough","subscript","superscript","insertUnorderedList","insertOrderedList","justifyLeft","justifyCenter","justifyRight","justifyFull"].forEach(function(c){
      var el=app.querySelector('.dw-b[data-c="'+c+'"]');if(!el)return;var on=false;try{on=document.queryCommandState(c)}catch(e){}el.classList.toggle("on",!!on);
    });
    var s=window.getSelection(),n=s.anchorNode;if(n&&n.nodeType===3)n=n.parentNode;
    if(n&&page.contains(n)){
      var cs=getComputedStyle(n),ff=(cs.fontFamily||"").split(",")[0].replace(/["']/g,"").trim(),pt=Math.round(parseFloat(cs.fontSize)*.75);
      var sf=app.querySelector('[data-s="font"]'),ss=app.querySelector('[data-s="size"]');
      if(sf)sf.value=FONTS.indexOf(ff)>-1?ff:"";if(ss)ss.value=SIZES.indexOf(pt)>-1?String(pt):"";
    }
  }
  function stats(){
    var t=(page.innerText||"").trim(),n=t?t.split(/\s+/).length:0;
    $("dwWc").textContent=n+" mot"+(n>1?"s":"");
    $("dwPg").textContent="Page 1 sur "+Math.max(1,Math.ceil(page.scrollHeight/1123));
  }
  function zoom(z){
    z=Math.max(.5,Math.min(2,z));st.zoom=z;page.style.zoom=z;
    $("dwZl").textContent=Math.round(z*100)+" %";
    var sel=app.querySelector('[data-s="zoom"]');if(sel){var o=String(Math.round(z*100));if([].some.call(sel.options,function(x){return x.value===o}))sel.value=o}
  }
  function blocks(){
    var s=window.getSelection(),out=[];if(!s.rangeCount)return out;var r=s.getRangeAt(0);
    page.querySelectorAll("p,h1,h2,h3,h4,li").forEach(function(x){if(r.intersectsNode(x))out.push(x)});
    return out;
  }
  function setSize(pt){
    ex("fontSize","7");
    page.querySelectorAll("font[size='7'],span").forEach(function(n){
      if(n.tagName==="FONT"){var s=document.createElement("span");s.style.fontSize=pt+"pt";while(n.firstChild)s.appendChild(n.firstChild);n.replaceWith(s)}
      else if(/xxx-large/.test(n.style.fontSize))n.style.fontSize=pt+"pt";
    });
    st.rng=null;
  }

  /* ----- enregistrement dans la Dropbox ----- */
  function stamp(){var d=new Date();return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+"-"+pad(d.getHours())+pad(d.getMinutes())}
  async function docBlob(){await lib();return window.htmlDocx.asBlob(wrap(clean(page.innerHTML)))}
  function toB64(bl){return new Promise(function(ok,ko){var r=new FileReader();r.onload=function(){ok(String(r.result).split(",")[1])};r.onerror=function(){ko(new Error("Lecture impossible"))};r.readAsDataURL(bl)})}
  async function save(){
    if(st.busy)return;
    st.busy=true;setSt("Enregistrement dans Dropbox…");
    try{
      var blob=await docBlob(),data=await toB64(blob);
      var r=await window.__sb.functions.invoke("dropbox-save",{body:{path:path,data:data,backup:!st.backed}});
      if(r.error){var m=r.error.message||"Erreur";try{var j=await r.error.context.json();if(j&&j.error)m=j.error}catch(x){}throw new Error(m)}
      if(r.data&&r.data.error)throw new Error(r.data.error);
      st.backed=true;
      st.dirty=false;st.saved=true;
      var d=new Date();setSt("Enregistré dans Dropbox à "+pad(d.getHours())+":"+pad(d.getMinutes()));toast("Document enregistré dans Dropbox.");
    }catch(e){setSt("Échec de l'enregistrement");toast("Enregistrement impossible : "+(e.message||e))}
    st.busy=false;
  }
  async function dl(){
    try{
      var bl=await docBlob(),a=document.createElement("a");a.href=URL.createObjectURL(bl);a.download=String(path).split("/").pop();
      document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},2000);
    }catch(e){toast(e.message||e)}
  }
  function close(){
    if(st.dirty&&!confirm("Fermer sans enregistrer ? Les modifications seront perdues."))return;
    document.removeEventListener("selectionchange",onSel);document.removeEventListener("keydown",onKey,true);
    app.remove();APP=null;document.body.classList.remove("af-editor-mode");
    if(window.dvReload)window.dvReload();
  }
  /* Raccourcis traités en capture uniquement pendant l'édition.
     Certains raccourcis restent réservés au navigateur selon sa configuration. */
  function onKey(e){
    if(!$("dwApp")||!app.isConnected)return;
    var key=String(e.key||"").toLowerCase(),mod=e.ctrlKey||e.metaKey;
    if(key==="escape"&&(!$("dwFind").hidden)){e.preventDefault();e.stopImmediatePropagation();$("dwFind").hidden=true;page.focus();return}
    if(!mod||e.shiftKey||e.repeat&&key==="s")return;
    var action=null;
    if(e.altKey){
      if(key==="j")action=function(){ex("justifyFull")};
    }else{
      switch(key){
        case "s":action=save;break;
        case "b":action=function(){ex("bold")};break;
        case "i":action=function(){ex("italic")};break;
        case "u":action=function(){ex("underline")};break;
        case "z":action=function(){ex("undo")};break;
        case "y":action=function(){ex("redo")};break;
        case "l":action=function(){ex("justifyLeft")};break;
        case "e":action=function(){ex("justifyCenter")};break;
        case "r":action=function(){ex("justifyRight")};break;
        case "j":action=function(){ex("justifyFull")};break;
        case "f":action=function(){act("find")};break;
        case "h":action=function(){act("replace")};break;
        case "a":if(page.contains(document.activeElement))action=function(){ex("selectAll")};break;
      }
    }
    if(action){e.preventDefault();e.stopImmediatePropagation();action()}
  }
  document.addEventListener("keydown",onKey,true);
  $("dwHelpBtn").onclick=function(){act("shortcuts")};
  function searchPanel(replace){
    $("dwFind").hidden=false;
    $("dwReplaceBox").hidden=!replace;
    $("dwReplaceBtn").hidden=!replace;
    $("dwFindText").focus();$("dwFindText").select();
  }
  function findNext(){
    var search=$("dwFindText").value;if(!search)return;
    var walker=document.createTreeWalker(page,NodeFilter.SHOW_TEXT),nodes=[],node;
    while((node=walker.nextNode()))if(node.nodeValue)nodes.push(node);
    var selection=window.getSelection(),end=selection.rangeCount?selection.getRangeAt(0).endContainer:null;
    var endOffset=selection.rangeCount?selection.getRangeAt(0).endOffset:0;
    var cursor=nodes.indexOf(end),match=null;
    for(var pass=0;pass<2&&!match;pass++){
      for(var k=(pass===0?Math.max(0,cursor):0);k<nodes.length;k++){
        var start=pass===0&&k===cursor?endOffset:0;
        var at=nodes[k].nodeValue.toLowerCase().indexOf(search.toLowerCase(),start);
        if(at!==-1){match={node:nodes[k],at:at};break}
      }
    }
    if(!match){setSt("Texte introuvable");return}
    var range=document.createRange();range.setStart(match.node,match.at);range.setEnd(match.node,match.at+search.length);
    selection.removeAllRanges();selection.addRange(range);
    match.node.parentElement.scrollIntoView({behavior:"smooth",block:"nearest"});setSt("Résultat trouvé");
  }
  $("dwFindNext").onclick=findNext;
  $("dwFindText").onkeydown=function(e){if(e.key==="Enter"){e.preventDefault();findNext()}};
  $("dwFindClose").onclick=function(){$("dwFind").hidden=true;page.focus()};
  $("dwReplaceBtn").onclick=function(){
    var sel=window.getSelection(),query=$("dwFindText").value;
    if(!sel||!sel.rangeCount||!query)return findNext();
    var r=sel.getRangeAt(0);
    if(!page.contains(r.commonAncestorContainer)||r.toString().toLowerCase()!==query.toLowerCase())return findNext();
    r.deleteContents();var replacement=document.createTextNode($("dwReplaceText").value);r.insertNode(replacement);
    sel.removeAllRanges();dirty();findNext();
  };

  /* ----- actions ----- */
  function act(c){
    switch(c){
      case "save":return save();
      case "dl":return dl();
      case "close":return close();
      case "cut":case "copy":ex(c);return;
      case "find":searchPanel(false);return;
      case "replace":searchPanel(true);return;
      case "selectAll":{page.focus();var rg=document.createRange();rg.selectNodeContents(page);var sl=window.getSelection();sl.removeAllRanges();sl.addRange(rg);return}
      case "print":window.print();return;
      case "shortcuts":alert("Raccourcis de l'éditeur AfriFloW (éditeur actif) :\nCtrl+S — Enregistrer\nCtrl+B — Gras\nCtrl+I — Italique\nCtrl+U — Souligné\nCtrl+Z / Ctrl+Y — Annuler / Rétablir\nCtrl+L / Ctrl+E / Ctrl+R — Alignements\nCtrl+J ou Ctrl+Alt+J — Justifier (Ctrl+J peut être réservé aux téléchargements du navigateur)\nCtrl+F — Rechercher\nCtrl+H — Rechercher et remplacer\nCtrl+A — Tout sélectionner dans le document");return;
      case "table":{
        var p=(prompt("Lignes, colonnes ?","3,3")||"").split(",").map(Number),r=p[0],k=p[1];if(!(r>0&&k>0))return;
        r=Math.min(r,30);k=Math.min(k,12);var t="<table><tbody>";
        for(var i=0;i<r;i++){t+="<tr>";for(var j=0;j<k;j++)t+="<td><br></td>";t+="</tr>"}
        ex("insertHTML",t+"</tbody></table><p><br></p>");return}
      case "image":$("dwImg").click();return;
      case "link":{var u=prompt("Adresse du lien (https://…)");if(u&&/^https?:\/\//i.test(u))ex("createLink",u);return}
      case "pagebreak":ex("insertHTML",'<hr class="dw-pb" style="page-break-after:always"><p><br></p>');return;
      case "date":ex("insertText",new Date().toLocaleDateString("fr-FR"));return;
      case "zoomin":zoom(st.zoom+.1);return;
      case "zoomout":zoom(st.zoom-.1);return;
      case "zoom100":zoom(1);return;
      default:ex(c);
    }
  }
  app.addEventListener("mousedown",function(e){if(e.target.closest(".dw-b,.dw-q,.dw-tab"))e.preventDefault()});
  app.addEventListener("click",function(e){
    var t=e.target.closest(".dw-tab");
    if(t){app.querySelectorAll(".dw-tab").forEach(function(x){x.classList.toggle("on",x===t)});app.querySelectorAll(".dw-pane").forEach(function(p){p.classList.toggle("on",p.dataset.p===t.dataset.t)});return}
    var b2=e.target.closest("[data-c]");if(b2)act(b2.dataset.c);
  });
  app.addEventListener("keydown",function(e){
    if((e.key==="Enter"||e.key===" ")&&e.target.matches&&e.target.matches(".dw-b,.dw-q,.dw-tab")){e.preventDefault();e.target.click()}
  });
  app.addEventListener("change",function(e){
    var t=e.target,s=t.dataset.s;if(!s)return;
    if(s==="style")ex("formatBlock","<"+t.value+">");
    else if(s==="font"&&t.value)ex("fontName",t.value);
    else if(s==="size"&&t.value)setSize(+t.value);
    else if(s==="lh"&&t.value){page.focus();if(st.rng){var se=window.getSelection();se.removeAllRanges();se.addRange(st.rng)}blocks().forEach(function(x){x.style.lineHeight=t.value});dirty()}
    else if(s==="zoom")zoom(+t.value/100);
  });
  app.addEventListener("input",function(e){var t=e.target;if(t.dataset&&t.dataset.k)ex(t.dataset.k,t.value)});
  $("dwImg").onchange=function(){
    var f=this.files[0];this.value="";if(!f)return;var r=new FileReader();
    r.onload=function(){var im=new Image();im.onload=function(){
      var k=Math.min(1,900/Math.max(im.width,im.height)),c=document.createElement("canvas");
      c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext("2d").drawImage(im,0,0,c.width,c.height);
      ex("insertImage",c.toDataURL("image/jpeg",.85));
    };im.src=r.result};r.readAsDataURL(f);
  };
  page.addEventListener("input",dirty);
  page.addEventListener("paste",function(e){
    var h=e.clipboardData&&e.clipboardData.getData("text/html");
    if(h){e.preventDefault();ex("insertHTML",clean(h))}
  });
  stats();setSt("Prêt");page.focus();
}

/* ---------- Permission : l'administrateur autorise (ou non) les autres à modifier ---------- */
var PK="pub:dbxperm";
function pkey(p){return String(p||"").toLowerCase()}
async function readPerm(){
  var r=await window.__sb.from(window.__TABLE||"afriflow_state").select("value").eq("key",PK).maybeSingle();
  return (r.data&&r.data.value&&r.data.value.open)||{};
}
window.dvPerm=async function(p){try{return !!(await readPerm())[pkey(p)]}catch(e){return false}};
window.dvTogglePerm=async function(p){
  if(window.USER_ROLE!=="admin")return;
  try{
    var o=await readPerm(),k=pkey(p);
    if(o[k])delete o[k];else o[k]=true;
    var r=await window.__sb.from(window.__TABLE||"afriflow_state").upsert({key:PK,value:{open:o,at:Date.now(),by:String(window.loggedUserEmail||"")},updated_at:new Date().toISOString()});
    if(r.error)throw r.error;
    toast(o[k]?"Modification autorisée pour les autres utilisateurs.":"Modification réservée à l'administrateur.");
  }catch(e){toast("Impossible de changer la permission : "+(e.message||e))}
};

/* Point d'entrée appelé par le bouton « Modifier » du lecteur de documents */
window.dvWordEdit=function(path,orig){
  var src=document.querySelector("#dvView .wpage");
  if(!src){toast("Document non chargé : patientez puis réessayez.");return}
  var t=document.querySelector("#dvView .toolbar b");
  build(String(path),orig||null,clean(src.innerHTML),t?t.textContent:String(path).split("/").pop());
};
})();
