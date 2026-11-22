
/* ===== Menu latéral · Trésorerie · Direction ===== */
(function(){
var KEY="afriflow_extra_v1", $=function(i){return document.getElementById(i)};
var X={nav:[],tre:{open:0,cur:"XOF",rows:[]},pages:{},docs:{},pubAt:{},chg:{},del:{}}; window.EXTRA=X;
var BASE=[{id:"market",n:"Marketplace",e:"🛍️"},{id:"home",n:"Accueil",e:"🏠"},{id:"treasury",n:"Trésorerie",e:"💰"},{id:"direction",n:"Direction",e:"🧭"}];
var CURW={XOF:"francs CFA",EUR:"euros",USD:"dollars"}, CUR={XOF:"FCFA",EUR:"EUR",USD:"USD"}, admin=false, cur="home", sel=null, tm;
var NAV_BACKUP_KEY="afriflow_extra_nav_recovery_v1";
function backupNav(){
  // Préserve les noms et identifiants des onglets sur cet appareil avant toute synchronisation.
  if(!Array.isArray(X.nav)||!X.nav.length)return;
  try{localStorage.setItem(NAV_BACKUP_KEY,JSON.stringify({nav:X.nav,at:Date.now()}))}catch(e){}
}
function restoreLocalNavBackup(){
  if(X.nav.length)return;
  try{
    var b=JSON.parse(localStorage.getItem(NAV_BACKUP_KEY)||"null");
    if(b&&Array.isArray(b.nav)&&b.nav.length)X.nav=b.nav;
  }catch(e){}
}
function merge(s){
  // Une liste vide venant du cloud ne doit pas effacer la navigation existante.
  if(Array.isArray(s.nav)&&s.nav.length){
    backupNav();
    if(!X.nav.length)X.nav=s.nav;
    else{
      var known={};X.nav.forEach(function(n){known[n.id]=true});
      s.nav.forEach(function(n){if(n&&n.id&&!known[n.id]){X.nav.push(n);known[n.id]=true}});
    }
    backupNav();
  }
  if(s.tre)X.tre=s.tre;
  if(s.pages)X.pages=s.pages;
  mergeDocs(s);mergeAbs("pubAt",s);mergeAbs("chg",s);
}
try{ var s0=JSON.parse(localStorage.getItem(KEY)||"null"); if(s0)merge(s0);restoreLocalNavBackup();backupNav(); }catch(e){}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function editing(){var a=document.activeElement;return !!(a&&a.isContentEditable)}
function save(){
  backupNav();
  try{localStorage.setItem(KEY,JSON.stringify(X))}catch(e){alert("Stockage du navigateur plein : image trop lourde ? Supprimez-en ou utilisez des images plus petites.")}
  clearTimeout(tm); tm=setTimeout(pushExtra,900);
}
window.hasExtra=function(){return !!(X.nav.length||X.tre.rows.length||Object.keys(X.pages).length||Object.keys(X.docs).length)};
window.applyExtra=function(v){
  if(editing()||W.open)return false;
  merge(v);setTimeout(syncPending,800);
  try{localStorage.setItem(KEY,JSON.stringify(X))}catch(e){}
  buildNav();
  // Cloud synchronization must not unexpectedly send the user back to top.
  // Only refresh data-backed pages while keeping their current scroll position.
  if(cur==="treasury"||cur==="direction"||X.nav.some(function(n){return n.id===cur})){
    var y=window.scrollY||0;
    show(cur,{restore:true});
    [100,500].forEach(function(ms){setTimeout(function(){
      if(cur!=="home")window.scrollTo(0,y);
    },ms)});
  }
  return true;
};

/* ---------- Dialogue ---------- */
function ask(title,fields,ok){
  var b=$("xmBox");
  b.innerHTML='<h2 style="margin-top:0">'+title+'</h2>'+fields.map(function(f){return '<div class="fm"><label for="xf_'+f.id+'">'+f.l+'</label><input id="xf_'+f.id+'" type="'+(f.t||"text")+'" autocomplete="'+(f.t==="password"?"new-password":"off")+'" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="'+(f.p||"")+'"></div>'}).join("")+(fields.some(function(f){return f.t==="password"})?'<label style="font-size:.85rem;color:var(--muted);display:flex;gap:8px;align-items:center"><input type="checkbox" id="xshow" style="width:auto"> Afficher le mot de passe</label>':'')+'<div id="xerr" role="alert" style="color:#c0392b;min-height:1.2em;font-size:.85rem"></div><div style="display:flex;gap:10px;margin-top:10px"><button type="button" class="p" id="xok" style="flex:1">Valider</button><button type="button" id="xno">Annuler</button></div>';
  $("xm").classList.add("on"); b.querySelector("input").focus();
  var pw=b.querySelector("input[type=password]");
  if(pw){ pw.addEventListener("keydown",function(){pw.dataset.t="1"}); [60,250].forEach(function(t){setTimeout(function(){if(!pw.dataset.t)pw.value=""},t)}); $("xshow").onchange=function(){pw.type=this.checked?"text":"password"}; }
  function close(){$("xm").classList.remove("on")}
  $("xno").onclick=close;
  $("xok").onclick=function(){var v={};fields.forEach(function(f){v[f.id]=$("xf_"+f.id).value.trim()});var e=ok(v);if(e)$("xerr").textContent=e;else close()};
  b.onkeydown=function(e){if(e.key==="Enter")$("xok").click()};
}

/* ---------- Navigation ---------- */
/* Conserver la dernière rubrique dans cet onglet, uniquement pour ce compte. */
var LAST_VIEW_KEY="afriflow_last_view_v1",viewRestored=false;
function rememberView(id){
  if(!window.loggedUserEmail)return;
  try{
    var old=previousView(),same=old&&old.id===id;
    sessionStorage.setItem(LAST_VIEW_KEY,JSON.stringify({
      email:String(window.loggedUserEmail).toLowerCase(),id:id,
      y:same?Math.max(0,Number(old.y)||0):0
    }));
  }catch(ignore){}
}
function previousView(){
  try{
    var v=JSON.parse(sessionStorage.getItem(LAST_VIEW_KEY)||"null");
    return v&&v.email===String(window.loggedUserEmail||"").toLowerCase()?v:null;
  }catch(ignore){return null}
}
function restorePreviousView(){
  if(viewRestored||!window.loggedUserEmail)return;
  viewRestored=true;
  var saved=previousView();
  if(!saved||saved.id==="home")return;
  function restoreScroll(){
    if(saved.y>0){
      [350,1000].forEach(function(ms){setTimeout(function(){
        var current=previousView();
        if(current&&current.id===saved.id)window.scrollTo(0,saved.y);
      },ms)});
    }
  }
  if(saved.id==="personal"){
    if(typeof window.AfriOpenPersonal==="function"){
      window.AfriOpenPersonal();
      restoreScroll();
    }
    return;
  }
  var ids=BASE.concat(X.nav,[{id:"messages"},{id:"partners"},{id:"admin"}]).map(function(x){return x.id});
  if(ids.indexOf(saved.id)===-1)return;
  if((saved.id==="admin"||saved.id==="partners")&&!isAdmin())return;
  if(saved.id==="market"&&!window.AfriMarket)return;
  show(saved.id,{restore:true});
  restoreScroll();
}
window.AfriNav={
  remember:rememberView,
  clear:function(){try{sessionStorage.removeItem(LAST_VIEW_KEY)}catch(ignore){}},
  saved:previousView
};
function saveScrollPosition(){
  var v=previousView();
  if(!v)return;
  v.y=Math.max(0,Math.floor(window.scrollY||0));
  try{sessionStorage.setItem(LAST_VIEW_KEY,JSON.stringify(v))}catch(ignore){}
}
var scrollSaveId=null;
window.addEventListener("scroll",function(){
  if(scrollSaveId!==null)return;
  scrollSaveId=setTimeout(function(){scrollSaveId=null;saveScrollPosition()},180);
},{passive:true});
window.addEventListener("pagehide",saveScrollPosition);
function isAdmin(){return window.USER_ROLE==="admin"}
// Marketplace : texte, trois icônes, puis répétition en continu.
// Le libellé accessible reste constant même pendant les rotations.
var marketplaceCycle=[
  {kind:"text"},
  {kind:"icon",paths:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/>'},
  {kind:"text"},
  {kind:"icon",paths:'<path d="M3 10h18l-2-6H5l-2 6Z"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/><path d="M3 10c1.5 2 3.5 2 5 0s3.5 2 4 0 3.5 2 4 0 3.5 2 5 0"/>'},
  {kind:"text"},
  {kind:"icon",paths:'<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>'}
],marketplaceStep=0;
function renderMarketplaceLabel(){
  var b=$("navList")&&$("navList").querySelector('.nv[data-id="market"]');
  if(!b)return;
  var reduced=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var frame=reduced?marketplaceCycle[0]:marketplaceCycle[marketplaceStep%marketplaceCycle.length];
  if(frame.kind==="text"){
    b.innerHTML='<span class="af-market-text">Marketplace</span>';
  }else{
    b.innerHTML='<span class="af-market-rotator" aria-hidden="true"><svg class="af-market-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round" focusable="false">'+frame.paths+'</svg></span>';
  }
  b.setAttribute("aria-label","Marketplace");
  b.setAttribute("title","Marketplace");
}
setInterval(function(){
  if(document.hidden)return;
  marketplaceStep=(marketplaceStep+1)%marketplaceCycle.length;
  renderMarketplaceLabel();
},3000);
function buildNav(){
  var base=BASE.slice(); base.push({id:"messages",n:"Messagerie"}); if(isAdmin()){base.push({id:"partners",n:"Partenaires"});base.push({id:"admin",n:"Administration"})}
  var nb=base.length,h=""; base.concat(X.nav).forEach(function(it,i){
    var badge=(it.id==="admin"&&AF_PEND)?' ('+AF_PEND+')':''; if(it.id==="messages"&&window.MSG_UNREAD)badge=' ('+window.MSG_UNREAD+')';
    h+='<div class="nvr'+(it.id==="home"?' nvr-home':'')+'"><button type="button" class="nv'+(it.id===cur?' on':'')+'" data-id="'+esc(it.id)+'">'+esc(it.n)+badge+'</button>'+(i>=nb&&isAdmin()?'<button type="button" class="nx" data-del="'+esc(it.id)+'" aria-label="Supprimer '+esc(it.n)+'">✕</button>':'')+'</div>';
  });
  $("navList").innerHTML=h;
  renderMarketplaceLabel();
  $("admBox").innerHTML=isAdmin()?'<button type="button" class="p" id="addNav">＋ Ajouter un élément</button>':'';
}
function openNav(){$("side").classList.add("on");$("scrim").classList.add("on");$("menuBtn").setAttribute("aria-expanded","true")}
function closeNav(){$("side").classList.remove("on");$("scrim").classList.remove("on");$("menuBtn").setAttribute("aria-expanded","false")}
function show(id,options){
  options=options||{};
  var preserving=!!options.restore;
  wkClean(); cur=id; sel=null; W.tv=null; W.pv=null; W.tvAt=0;
  if(id==="market"&&window.AfriMarket){rememberView("market");window.AfriMarket.open({kind:"workspace",market:{access_mode:"collaborator"}});buildNav();closeNav();return}
  if((id==="admin"||id==="partners")&&!isAdmin())cur=id="home";
  rememberView(id);
  $("view-home").style.display=id==="home"?"":"none";
  $("viewHost").style.display=id==="home"?"none":"";
  if(id==="admin")renAdmin();else if(id==="partners")renPartners();else if(id==="messages"){if(window.renMsg)window.renMsg()}
  else if(id!=="home"){
    var run=function(){ if(id==="treasury")renTre(); else renEd(id) };
    if(cep(id))run(); else viewPub(id,function(p){ W.tvAt=p.at; if(id==="treasury")W.tv=p.tre; else W.pv=p; run() });
  }
  buildNav(); closeNav();
  if(!preserving)window.scrollTo(0,0);
  if(window.AFRI)AFRI.page(pageName(id));
}
$("menuBtn").onclick=openNav; $("scrim").onclick=closeNav; $("sideClose").onclick=closeNav;
document.addEventListener("keydown",function(e){
  if(e.key==="Escape"){closeNav();$("xm").classList.remove("on")}
});
$("side").addEventListener("click",function(e){
  var b=e.target.closest("button"); if(!b)return;
  if(b.dataset.id) show(b.dataset.id);
  else if(b.dataset.del){ if(isAdmin()&&confirm("Supprimer cet élément du menu et son contenu ?")){ var id=b.dataset.del; X.nav=X.nav.filter(function(n){return n.id!==id}); delete X.pages[id]; save(); if(cur===id)show("home"); else buildNav(); } }
  else if(b.id==="addNav"&&isAdmin()) ask("Nouvel élément du menu",[{id:"n",l:"Nom"}],function(v){ if(!v.n)return "Donnez un nom à l'élément."; X.nav.push({id:"p"+Date.now().toString(36),n:v.n,e:""}); save(); buildNav(); });
});
var _lo=window.logout; if(typeof _lo==="function") window.logout=function(m){window.AfriNav.clear();show("home");_lo(m)};

/* ---------- Trésorerie ---------- */
function fd(d){return d?d.split("-").reverse().join("/"):""}
function fmt(n,pdf){var d=TD().cur==="XOF"?0:2,s=new Intl.NumberFormat("fr-FR",{minimumFractionDigits:d,maximumFractionDigits:d}).format(n);return pdf?s.replace(/[\u202f\u00a0]/g," "):s}
function calc(){
  var bal=Number(TD().open)||0,ti=0,to=0;
  var rows=TD().rows.map(function(r){return Object.assign({},r)}).sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:a.id-b.id});
  rows.forEach(function(r){ if(r.type==="in"){bal+=r.amount;ti+=r.amount}else{bal-=r.amount;to+=r.amount} r.bal=bal });
  return {rows:rows,ti:ti,to:to,bal:bal};
}
function renTre(){
  var C=calc(),T=TD(),cu=CUR[T.cur],rs=C.rows;
  var per=rs.length?fd(rs[0].date)+" au "+fd(rs[rs.length-1].date):"—";
  var body='<tr><td>—</td><td><b>Solde initial</b></td><td></td><td></td><td></td><td class="n"><b>'+fmt(T.open)+'</b></td><td></td></tr>';
  rs.forEach(function(r){body+='<tr><td>'+fd(r.date)+'</td><td>'+esc(r.label)+'</td><td>'+esc(r.ref||"")+'</td><td class="n in">'+(r.type==="in"?fmt(r.amount):"")+'</td><td class="n out">'+(r.type==="out"?fmt(r.amount):"")+'</td><td class="n">'+fmt(r.bal)+'</td><td><button type="button" class="danger" data-rm="'+esc(r.id)+'" aria-label="Supprimer la ligne">✕</button></td></tr>'});
  if(!rs.length)body+='<tr><td colspan="7" style="color:var(--muted)">Aucune opération. Ajoutez une entrée ou une sortie ci-dessous.</td></tr>';
  var today=new Date().toISOString().slice(0,10);
  $("viewHost").innerHTML='<div class="toolbar"><b>Trésorerie · entrées et sorties de fonds</b><div class="toolbar-actions"><button type="button" class="p" id="pdfBtn">⬇ Télécharger le relevé (PDF)</button></div></div>'+pubBar("treasury")
  +'<div class="stm"><div class="stm-head"><img src="logo.png" alt="Logo AfriFloW" onerror="this.onerror=null;this.src=\'https://placehold.co/64x64/ffffff/1f5d3a?text=A\'"><div><h2>Relevé de compte</h2><p>AfriFloW · Compte de trésorerie<br>Période : '+per+' · Devise : '+cu+'</p></div></div>'
  +'<div class="stm-sum"><div><small>Solde initial</small><input type="number" step="any" id="tOpen" value="'+(Number(T.open)||0)+'" aria-label="Solde initial"></div><div><small>Total des entrées</small><b class="in">+ '+fmt(C.ti)+' '+cu+'</b></div><div><small>Total des sorties</small><b class="out">− '+fmt(C.to)+' '+cu+'</b></div><div><small>Solde final</small><b'+(C.bal<0?' class="out"':'')+'>'+fmt(C.bal)+' '+cu+'</b></div><div><small>Titulaire (en-tête du PDF)</small><textarea id="tHol" rows="2" style="width:100%" aria-label="Titulaire"></textarea></div><div><small>Devise</small><select id="tCur"><option value="XOF">FCFA</option><option value="EUR">Euro</option><option value="USD">Dollar US</option></select></div></div>'
  +'<div style="overflow-x:auto"><table class="t"><thead><tr><th>Date</th><th>Libellé</th><th>Réf.</th><th class="n">Entrée</th><th class="n">Sortie</th><th class="n">Solde</th><th></th></tr></thead><tbody>'+body+'</tbody></table></div></div>'
  +'<div class="addrow"><label>Date<input type="date" id="aD" value="'+today+'"></label><label>Libellé<input id="aL" placeholder="Ex. Vente de karité"></label><label>Référence<input id="aR" placeholder="Facultatif"></label><label>Type<select id="aT"><option value="in">Entrée de fonds</option><option value="out">Sortie de fonds</option></select></label><label>Montant ('+cu+')<input type="number" step="any" min="0" id="aM"></label><label>&nbsp;<button type="button" class="p" id="aB">Ajouter la ligne</button></label><div id="aErr" role="alert" style="grid-column:1/-1;color:#c0392b;font-size:.85rem"></div></div>';
  if(!cep("treasury")){var ar=document.querySelector("#viewHost .addrow");if(ar)ar.remove();document.querySelectorAll("#viewHost [data-rm]").forEach(function(x){x.remove()});["tOpen","tCur","tHol"].forEach(function(i){$(i).disabled=true})}
  $("tCur").value=T.cur; $("tHol").value=T.holder||"AfriFloW"; $("tHol").onchange=function(){T.holder=this.value;touch("treasury");save()};
  $("tCur").onchange=function(){T.cur=this.value;touch("treasury");save();renTre()};
  $("tOpen").onchange=function(){T.open=parseFloat(this.value)||0;touch("treasury");save();renTre()};
  $("pdfBtn").onclick=pdf; bindPub("treasury");
  if($("aB"))$("aB").onclick=function(){
    var d=$("aD").value,l=$("aL").value.trim(),m=parseFloat(String($("aM").value).replace(",","."));
    if(!d||!l||!(m>0)){$("aErr").textContent="Renseignez la date, le libellé et un montant supérieur à 0.";return}
    T.rows.push({id:Date.now()*1000+Math.floor(Math.random()*1000),date:d,label:l,ref:$("aR").value.trim(),type:$("aT").value,amount:m}); touch("treasury"); save(); renTre();
  };
  $("viewHost").querySelectorAll("[data-rm]").forEach(function(b){b.onclick=function(){ if(confirm("Supprimer cette ligne ?")){T.rows=T.rows.filter(function(r){return String(r.id)!==b.dataset.rm});touch("treasury");save();renTre()} }});
}
function loadJs(u){return new Promise(function(ok,ko){var s=document.createElement("script");s.src=u;s.onload=ok;s.onerror=ko;document.head.appendChild(s)})}
function logoData(){return new Promise(function(ok){var i=new Image();i.onload=function(){try{var c=document.createElement("canvas");c.width=i.naturalWidth;c.height=i.naturalHeight;c.getContext("2d").drawImage(i,0,0);ok({d:c.toDataURL("image/png"),w:i.naturalWidth,h:i.naturalHeight})}catch(e){ok(null)}};i.onerror=function(){ok(null)};i.src="logo.png"})}
async function pdf(){
  try{ if(!window.jspdf){ await loadJs("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"); await loadJs("https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"); } }
  catch(e){ alert("Module PDF indisponible (connexion ?). Dans la fenêtre d'impression, choisissez « Enregistrer au format PDF »."); window.print(); return; }
  var C=calc(),T=TD(),cu=CUR[T.cur],cw=CURW[T.cur],rs=C.rows,L=14,R=196;
  var d=new window.jspdf.jsPDF({unit:"mm",format:"a4"}),lg=await logoData();
  var t0=new Date(),now=t0.toLocaleDateString("fr-FR"),iso=t0.toISOString().slice(0,10);
  var first=rs.length?rs[0].date:iso,last=rs.length?rs[rs.length-1].date:iso;
  var pv=new Date(first+"T00:00:00");pv.setDate(pv.getDate()-1);
  var prevIso=pv.getFullYear()+"-"+String(pv.getMonth()+1).padStart(2,"0")+"-"+String(pv.getDate()).padStart(2,"0");
  var open=Number(T.open)||0,bal=C.bal;
  d.setTextColor(0).setDrawColor(0);
  /* bloc gauche */
  d.setFont("helvetica","bold").setFontSize(12).text("INFORMATIONS DU COMPTE",L,56);
  d.setLineWidth(.6).line(L,58.5,100,58.5);
  d.setFontSize(9.5).text("Titulaire du compte",L,65);
  d.setFont("helvetica","normal").setFontSize(8.5).text(["AfriFloW","Compte de trésorerie - "+cu,rs.length+" opération"+(rs.length>1?"s":"")+" sur la période"],L,69.5);
  /* adresse (police machine, comme sur un relevé bancaire) */
  d.setFont("courier","normal").setFontSize(9).text((T.holder||"AfriFloW").toUpperCase().split("\n"),112,58);
  /* phrase solde */
  var y=90; d.setFillColor(0).triangle(L,y-2.6,L,y+.2,L+1.8,y-1.2,"F");
  d.setFont("helvetica","normal").setFontSize(9).text("Nous vous informons qu'au "+fd(last)+", votre solde est "+(bal<0?"débiteur de - ":"créditeur de ")+fmt(Math.abs(bal),1)+" "+cw+".",L+4,y);
  d.setFont("helvetica","bold").setFontSize(11).text("RELEVÉ DES OPÉRATIONS",L,102);
  /* tableau */
  var B=function(c){return {content:c,styles:{fontStyle:"bold",halign:"right"}}};
  var body=[[{content:"SOLDE PRÉCÉDENT AU "+fd(prevIso),colSpan:3,styles:{halign:"right",fontStyle:"bold"}},B(open<0?fmt(-open,1):""),B(open>=0?fmt(open,1):"")]];
  rs.forEach(function(r){body.push([fd(r.date),r.ref||"",r.label,r.type==="out"?fmt(r.amount,1):"",r.type==="in"?fmt(r.amount,1):""])});
  body.push([{content:"TOTAUX DES MOUVEMENTS",colSpan:3,styles:{halign:"right",fontStyle:"bold"}},B(fmt(C.to,1)),B(fmt(C.ti,1))]);
  body.push([{content:"NOUVEAU SOLDE AU "+fd(last),colSpan:3,styles:{halign:"right",fontStyle:"bold",fontSize:9.5}},B(bal<0?"- "+fmt(-bal,1):""),B(bal>=0?fmt(bal,1):"")]);
  d.autoTable({startY:104,margin:{top:50,bottom:26,left:L,right:14},theme:"grid",
    head:[["Date","Réf.","Nature de l'opération",{content:"Débit",styles:{halign:"right"}},{content:"Crédit",styles:{halign:"right"}}]],body:body,
    styles:{font:"helvetica",fontSize:8.5,cellPadding:1.8,lineColor:[110,110,110],lineWidth:.2,textColor:0,valign:"middle"},
    headStyles:{fillColor:255,textColor:0,fontStyle:"bold",fontSize:9.5,lineWidth:0},
    columnStyles:{0:{cellWidth:26},1:{cellWidth:26},3:{cellWidth:30},4:{cellWidth:30}}});
  var tp=d.internal.getCurrentPageInfo().pageNumber,fy=d.lastAutoTable.finalY; y=fy+8;
  function note(t){
    var ls=d.splitTextToSize(t,R-L-5);
    if(y+ls.length*4+4>268){d.addPage();y=54}
    d.setFillColor(0).triangle(L,y-2.6,L,y+.2,L+1.8,y-1.2,"F");
    d.setFont("helvetica","normal").setFontSize(8.5).setTextColor(0).text(ls,L+4,y); y+=ls.length*4+3;
  }
  note("Sur la période du "+fd(first)+" au "+fd(last)+", le total des sorties de fonds est de "+fmt(C.to,1)+" "+cw+" et celui des entrées de fonds est de "+fmt(C.ti,1)+" "+cw+".");
  note("Relevé établi à partir des opérations enregistrées dans l'espace Trésorerie d'AfriFloW.");
  /* filets épais du tableau */
  d.setPage(1); d.setDrawColor(0).setLineWidth(.8).line(L,104,R,104);
  d.setPage(tp); d.setDrawColor(0).setLineWidth(.8).line(L,fy,R,fy);
  /* en-tête et pied de chaque page */
  var n=d.getNumberOfPages();
  for(var i=1;i<=n;i++){
    d.setPage(i);
    if(lg){var hh=17;d.addImage(lg.d,"PNG",L,10,hh*lg.w/lg.h,hh)}else{d.setFont("helvetica","bold").setFontSize(18).setTextColor(0).text("AfriFloW",L,20)}
    d.setTextColor(0).setFont("helvetica","bold").setFontSize(15).text("RELEVÉ DE COMPTE",R,17,{align:"right"});
    var eb="en "+cw; d.setFontSize(10); var wb=d.getTextWidth(eb);
    d.text(eb,R,23,{align:"right"}); d.setFont("helvetica","normal").text("COMPTE DE TRÉSORERIE - ",R-wb,23,{align:"right"});
    d.setDrawColor(0).setLineWidth(.9).line(L,31,R,31);
    d.setFont("helvetica","bold").setFontSize(9.5).text("du "+fd(first)+" au "+fd(last),R,37,{align:"right"}).text("Page "+i+"/"+n,R,42,{align:"right"});
    d.setLineWidth(.6).line(L,282,R,282);
    d.setFont("helvetica","normal").setFontSize(6.5).setTextColor(60).text(["AfriFloW - Compte de trésorerie","Relevé édité le "+now],L,286);
  }
  d.save("releve-afriflow-"+iso+".pdf");
}

/* ---------- Espace documents (Word / Excel) + envoi Dropbox ---------- */
var W={open:false,id:null,page:null,sl:null,S:null,D:null,kd:null,tv:null,pv:null,tvAt:0}, DK="afriflow_dbx_v1", libs={}, LIBS={
  docx:["https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js",function(){return window.htmlDocx}],
  xlsx:["https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",function(){return window.XLSX}],
  mammoth:["https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js",function(){return window.mammoth}]};
function lib(n){ var l=LIBS[n]; if(l[1]())return Promise.resolve(); return libs[n]||(libs[n]=loadJs(l[0]).catch(function(e){delete libs[n];throw new Error("Module "+n+" indisponible (connexion ?)")})); }
function toast(m){var t=document.createElement("div");t.textContent=m;t.setAttribute("role","status");t.style.cssText="position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--green);color:#fff;padding:10px 18px;border-radius:12px;z-index:1200;max-width:90vw;box-shadow:0 8px 24px rgba(0,0,0,.25)";document.body.appendChild(t);setTimeout(function(){t.remove()},5000)}
function pageName(id){return (BASE.concat(X.nav,[{id:"admin",n:"Administration"},{id:"partners",n:"Partenaires"},{id:"messages",n:"Messagerie"}]).filter(function(x){return x.id===id})[0]||{n:"Direction"}).n}
function safeName(s){return String(s||"").replace(/[<>:"\/\\|?*\u0000-\u001f]/g,"-").trim().slice(0,80)||"Sans titre"}
function fdt(t){return new Date(t).toLocaleString("fr-FR",{dateStyle:"short",timeStyle:"short"})}
function uid(){return "d"+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36)}
function docs(){return W.pv?W.pv.docs:(X.docs[W.page]||(X.docs[W.page]=[]))}
function getDoc(id){return docs().filter(function(x){return x.id===id})[0]}
function clean(html){
  var t=document.createElement("template"); t.innerHTML=html;
  t.content.querySelectorAll("script,iframe,object,embed,link,meta,style,form,base").forEach(function(n){n.remove()});
  t.content.querySelectorAll("*").forEach(function(el){Array.prototype.slice.call(el.attributes).forEach(function(a){if(/^on/i.test(a.name)||(/^(href|src|xlink:href)$/i.test(a.name)&&/^\s*javascript:/i.test(a.value)))el.removeAttribute(a.name)})});
  return t.innerHTML;
}
function wkClean(){ if(W.sl){document.removeEventListener("selectionchange",W.sl);W.sl=null} if(W.kd){document.removeEventListener("keydown",W.kd);W.kd=null} W.open=false; W.S=null; W.D=null; }
document.addEventListener("keydown",function(e){ if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==="s"&&W.open&&cep(W.page)){e.preventDefault();saveDoc()} });

/* ----- Dropbox (OAuth PKCE : aucune clé secrète dans la page) ----- */
/* Dropbox server connection: NO OAuth refresh/access tokens or app keys on the device. */
try{localStorage.removeItem(DK);sessionStorage.removeItem("afriflow_pkce")}catch(e){}
var afDbxServerRoot="/AfriFlow";
function dbxReady(){return window.USER_ROLE==="admin" && !!window.__sb}
async function dbxBackend(action,body){
  if(!window.__sb)throw new Error("Connectez-vous à AfriFloW.");
  var r=await window.__sb.functions.invoke("afriflow-dropbox-admin",{body:Object.assign({action:action},body||{})});
  if(r.error){var message=r.error.message||"Service indisponible";try{var details=await r.error.context.json();if(details.error)message=details.error}catch(e){}throw new Error(message)}
  if(r.data&&r.data.error)throw new Error(r.data.error);
  return r.data;
}
function dbxB64(blob){return new Promise(function(ok,fail){var r=new FileReader();r.onload=function(){ok(String(r.result).split(",")[1])};r.onerror=fail;r.readAsDataURL(blob)})}
async function dbxUpload(path,blob){
  if(!dbxReady())throw new Error("Accès administrateur requis.");
  await dbxBackend("upload",{path:path,data:await dbxB64(blob)});
}
function dbxPath(d,pg){return afDbxServerRoot+"/"+safeName(pageName(pg||W.page))+"/"+safeName(d.name)+extOf(d)}
async function dbxDialog(){
 if(!dbxReady()){toast("Réservé à l'administrateur connecté.");return}
 var b=$("xmBox");
 b.innerHTML='<h2 style="margin-top:0">Dropbox · Connexion sécurisée</h2>'
  +'<p>La connexion Dropbox est centralisée dans Supabase. Aucune clé ni aucun jeton n’est enregistré sur cet appareil.</p>'
  +'<p>Pour consulter les réglages, confirmez le mot de passe de votre compte administrateur AfriFloW.</p>'
  +'<div class="fm"><label for="dkPassword">Mot de passe administrateur</label><input id="dkPassword" type="password" autocomplete="current-password"></div>'
  +'<div id="xerr" role="alert" style="color:#c0392b;min-height:1.5em"></div>'
  +'<div id="dkStatus" aria-live="polite"></div>'
  +'<div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="p" id="dkGo">Déverrouiller</button><button type="button" id="xno">Fermer</button></div>';
 $("xm").classList.add("on");
 $("xno").onclick=function(){$("dkPassword").value="";$("xm").classList.remove("on")};
 $("dkGo").onclick=async function(){
   var password=$("dkPassword").value,btn=this;
   if(!password){$("xerr").textContent="Saisissez votre mot de passe AfriFloW.";return}
   btn.disabled=true;$("xerr").textContent="";
   try{
     var me=await window.__sb.auth.getUser();
     var address=me.data&&me.data.user&&me.data.user.email;
     if(!address)throw new Error("Session administrateur expirée.");
     var check=await window.__sb.auth.signInWithPassword({email:address,password:password});
     if(check.error)throw new Error("Mot de passe incorrect ou vérification refusée.");
     if(window.USER_ROLE!=="admin")throw new Error("Accès réservé à l’administrateur.");
     var state=await dbxBackend("status");
     afDbxServerRoot=(state.root&&state.root!=="/")?state.root:afDbxServerRoot;
     $("dkStatus").textContent=state.connected?"Dropbox centralisé : configuration enregistrée sur le serveur. Accessible depuis vos appareils après connexion administrateur.":"Dropbox serveur non configuré : les secrets doivent être renseignés dans Supabase.";
     $("dkPassword").value="";
   }catch(e){$("xerr").textContent=e.message||String(e);$("dkPassword").value=""}
   finally{btn.disabled=false}
 };
}
window.DBX={ready:dbxReady,dialog:dbxDialog,put:dbxUpload,upload:async function(sub,name,blob){
  var path=afDbxServerRoot+"/"+String(sub).split("/").filter(Boolean).map(safeName).join("/")+"/"+safeName(name);
  await dbxUpload(path,blob);
}};

/* ----- Tableur : formules simples ----- */
function colName(i){var s="";i++;while(i>0){var m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s}
function fmtv(v){return typeof v==="number"?String(+v.toFixed(8)).replace(".",","):String(v)}
function evalSheet(D){
  var cache={},busy={};
  function ref(a){var m=/^([A-Z]+)(\d+)$/.exec(a);if(!m)throw new Error("Référence invalide");var c=0;for(var i=0;i<m[1].length;i++)c=c*26+m[1].charCodeAt(i)-64;return [parseInt(m[2],10)-1,c-1]}
  function val(r,c){
    var k=r+","+c; if(k in cache)return cache[k]; if(busy[k])return "#CYCLE";
    var raw=String((D[r]&&D[r][c])==null?"":D[r][c]).trim(),v; busy[k]=1;
    if(raw[0]==="=")v=calc(raw.slice(1)); else if(/^-?\d+([.,]\d+)?$/.test(raw))v=parseFloat(raw.replace(",",".")); else v=raw;
    busy[k]=0; cache[k]=v; return v;
  }
  function range(a,b){var p=ref(a),q=ref(b),o=[];for(var r=Math.min(p[0],q[0]);r<=Math.max(p[0],q[0]);r++)for(var c=Math.min(p[1],q[1]);c<=Math.max(p[1],q[1]);c++){var x=val(r,c);if(typeof x==="number")o.push(x)}return o}
  function args(s){
    return String(s).split(/[;,]/).reduce(function(out,x){x=x.trim();if(!x)return out;var rg=/^([A-Z]+\d+):([A-Z]+\d+)$/.exec(x);if(rg)return out.concat(range(rg[1],rg[2]));var rf=/^[A-Z]+\d+$/.test(x);if(rf){var p=ref(x),v=val(p[0],p[1]);if(typeof v==="number")out.push(v);return out}var n=Number(x);if(isFinite(n))out.push(n);return out},[]);
  }
  function calc(f){
    try{
      f=f.toUpperCase().replace(/(\d),(\d)/g,"$1.$2");
      f=f.replace(/\b(SUM|SOMME|AVERAGE|AVG|MOYENNE|MIN|MAX|COUNT|NB)\(([^()]*)\)/g,function(_,fn,raw){
        var v=args(raw),s=v.reduce(function(x,y){return x+y},0),o=(fn==="SUM"||fn==="SOMME")?s:(fn==="COUNT"||fn==="NB")?v.length:fn==="MIN"?(v.length?Math.min.apply(null,v):0):fn==="MAX"?(v.length?Math.max.apply(null,v):0):(v.length?s/v.length:0);
        return "("+o+")";
      });
      f=f.replace(/\b([A-Z]+\d+)\b/g,function(_,a){var p=ref(a),x=val(p[0],p[1]);return typeof x==="number"?"("+x+")":(x===""?"(0)":"NaN")});
      if(!/^[\d+\-*\/().\sE]*$/.test(f))return "#ERREUR";
      var r=Function('"use strict";return ('+f+')')(); return isFinite(r)?r:"#ERREUR";
    }catch(e){return "#ERREUR"}
  }
  return {val:val};
}
function gridHtml(S,ro){
  var h='<div class="xlw"><table class="xl"><thead><tr><th></th>';
  for(var c=0;c<S.cols;c++)h+='<th>'+colName(c)+'</th>'; h+='</tr></thead><tbody>';
  for(var r=0;r<S.rows;r++){h+='<tr><th>'+(r+1)+'</th>';for(c=0;c<S.cols;c++)h+='<td><input data-r="'+r+'" data-c="'+c+'" autocomplete="off"'+(ro?' readonly':'')+'></td>';h+='</tr>'}
  return h+'</tbody></table></div>';
}
function gridFill(){
  var S=W.S,E=evalSheet(S.cells);
  $("wGrid").querySelectorAll("input").forEach(function(i){
    if(i===document.activeElement)return;
    var r=+i.dataset.r,c=+i.dataset.c,raw=String((S.cells[r]&&S.cells[r][c])==null?"":S.cells[r][c]),v=E.val(r,c);
    i.value=raw[0]==="="?fmtv(v):raw; i.title=raw[0]==="="?raw:""; i.classList.toggle("num",typeof v==="number");
  });
}
function cellRaw(r,c){var x=W.S.cells[r]&&W.S.cells[r][c];return x==null?"":String(x)}

/* ----- Fichiers : liste ----- */
function renEd(id){
  wkClean(); W.page=id; W.id=null;
  var L=docs(),ad=cep(id);
  var cards=L.slice().sort(function(a,b){return b.at-a.at}).map(function(d){
    return '<div class="dcard af-clickable" data-doc-open="'+esc(d.id)+'" role="button" tabindex="0"><div class="dtype">'+typeLabel(d)+'</div><b>'+esc(d.name)+'</b><small>Modifié le '+fdt(d.at)+'</small>'+(ad?'<small>'+(d.dbx?'Envoyé dans Dropbox le '+fdt(d.dbx):(d.dbxPending?'En attente d\'envoi dans Dropbox':'Pas encore envoyé dans Dropbox'))+'</small>':'')+'<div class="dact"><button type="button" data-dl="'+esc(d.id)+'">Télécharger</button>'+(ad?'<button type="button" class="danger" data-x="'+esc(d.id)+'">Supprimer</button>':'')+'</div></div>';
  }).join("");
  $("viewHost").innerHTML='<div class="toolbar"><b>'+esc(pageName(id))+'</b><div class="toolbar-actions">'+(ad?'<button type="button" class="p" id="nDoc">+ Document Word</button><button type="button" id="nSh">+ Tableur Excel</button><button type="button" id="nDs">+ Design</button><button type="button" id="nImp">Importer un fichier</button><input type="file" id="nFile" accept=".docx,.xlsx,.xls,.csv" hidden>'+(isAdmin()?'<button type="button" id="nDbx">Dropbox : '+(dbxReady()?"connecté":"à connecter")+'</button>':'')+'':'')+'</div></div>'
  +pubBar(id)+(cards?'<div class="dgrid">'+cards+'</div>':'<p style="color:var(--muted)">'+(ad?'Aucun fichier. Créez un document Word ou un tableur Excel, ou importez-en un.':'Aucun fichier pour le moment.')+'</p>');
  var h=$("viewHost"); bindPub(id);
  h.onclick=function(e){
    var b=e.target.closest("button");if(!b){var card=e.target.closest("[data-doc-open]");if(card)openDoc(card.dataset.docOpen);return}var d=b.dataset;
    if(d.o)openDoc(d.o);
    else if(d.dl){var f=getDoc(d.dl);if(f)dl(f).catch(function(x){toast(x.message)})}
    else if(d.x){if(cep(W.page)&&confirm("Supprimer ce fichier du site ? (la copie déjà envoyée dans Dropbox n'est pas supprimée)")){(X.del=X.del||{})[d.x]=Date.now();X.docs[W.page]=docs().filter(function(f){return f.id!==d.x});touch(W.page);save();renEd(W.page)}}
    else if(b.id==="nDoc"&&ad)newDoc("doc"); else if(b.id==="nSh"&&ad)newDoc("sheet"); else if(b.id==="nDs"&&ad)newDoc("design");
    else if(b.id==="nImp"&&ad)$("nFile").click(); else if(b.id==="nDbx"&&isAdmin())dbxDialog();
  };
  h.onkeydown=function(e){var c=e.target.closest("[data-doc-open]");if(c&&(e.key==="Enter"||e.key===" ")&&!e.target.closest("button")){e.preventDefault();openDoc(c.dataset.docOpen)}};
   if($("nFile"))$("nFile").onchange=function(){var f=this.files[0];this.value="";if(f&&cep(W.page))importFile(f).catch(function(x){toast("Import impossible : "+x.message)})};
}
function newDoc(t){
  ask("Nouveau "+typeNew(t),[{id:"n",l:"Nom du fichier"}],function(v){
    if(!v.n)return "Donnez un nom au fichier.";
    var d={id:uid(),name:v.n,t:t,at:Date.now()}; if(t==="doc")d.html="<p><br></p>"; else if(t==="design"){d.bg="#ffffff";d.els=[]} else{d.cells=[];d.rows=30;d.cols=10}
    docs().push(d); touch(W.page); save(); openDoc(d.id);
  });
}
async function importFile(f){
  var ext=(f.name.split(".").pop()||"").toLowerCase(),name=f.name.replace(/\.[^.]+$/,""),d={id:uid(),name:name,at:Date.now()};
  if(ext==="docx"){await lib("mammoth");var r=await window.mammoth.convertToHtml({arrayBuffer:await f.arrayBuffer()});d.t="doc";d.html=clean(r.value)||"<p><br></p>"}
  else if(/^(xlsx|xls|csv)$/.test(ext)){
    await lib("xlsx");var X2=window.XLSX,wb=ext==="csv"?X2.read(await f.text(),{type:"string"}):X2.read(await f.arrayBuffer(),{type:"array"}),ws=wb.Sheets[wb.SheetNames[0]],rg=X2.utils.decode_range(ws["!ref"]||"A1:A1"),cells=[];
    var nr=Math.min(rg.e.r+1,300),nc=Math.min(rg.e.c+1,52);
    for(var r=0;r<nr;r++){cells[r]=[];for(var c=0;c<nc;c++){var x=ws[X2.utils.encode_cell({r:r,c:c})];cells[r][c]=x?(x.f?"="+x.f:String(x.v==null?"":x.v)):""}}
    d.t="sheet";d.cells=cells;d.rows=Math.max(30,nr+5);d.cols=Math.max(10,nc+2);
  } else throw new Error("format non pris en charge");
  docs().push(d); touch(W.page); save(); toast("Fichier importé : "+d.name); renEd(W.page);
}

/* ----- Export Word / Excel ----- */
async function toBlob(d){
  if(d.t==="design")return designBlob(d);
  if(d.t==="doc"){
    await lib("docx");
    return window.htmlDocx.asBlob('<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px}</style></head><body>'+(d.html||"")+'</body></html>');
  }
  await lib("xlsx"); var X2=window.XLSX,E=evalSheet(d.cells||[]),ws={},mr=0,mc=0;
  (d.cells||[]).forEach(function(row,r){(row||[]).forEach(function(raw,c){
    raw=String(raw==null?"":raw).trim(); if(raw==="")return; var a=X2.utils.encode_cell({r:r,c:c}),v=E.val(r,c); mr=Math.max(mr,r);mc=Math.max(mc,c);
    if(raw[0]==="=")ws[a]={t:typeof v==="number"?"n":"s",v:typeof v==="number"?v:String(v),f:raw.slice(1).replace(/\bAVG\(/gi,"AVERAGE(")};
    else if(typeof v==="number")ws[a]={t:"n",v:v}; else ws[a]={t:"s",v:raw};
  })});
  ws["!ref"]=X2.utils.encode_range({s:{r:0,c:0},e:{r:mr,c:mc}});
  var wb=X2.utils.book_new(); X2.utils.book_append_sheet(wb,ws,"Feuille1");
  return new Blob([X2.write(wb,{bookType:"xlsx",type:"array"})],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
async function dl(d){
  var b=await toBlob(d),a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=safeName(d.name)+extOf(d);
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(a.href)},2000);
}

/* ----- Éditeur ----- */
function commit(d){
  var n=$("wName"); if(n&&cep(W.page))d.name=n.value.trim()||"Sans titre";
  if(d.t==="doc")d.html=$("wDoc").innerHTML;
  else if(d.t==="design"){d.els=W.D.els;d.bg=W.D.bg}
  else{ if(document.activeElement&&document.activeElement.blur)document.activeElement.blur(); d.cells=W.S.cells;d.rows=W.S.rows;d.cols=W.S.cols }
}
function st(m){var e=$("wSt");if(e)e.textContent=m}
async function saveDoc(){
  var d=getDoc(W.id); if(!d||!cep(W.page))return;
  commit(d); d.at=Date.now(); touch(W.page); st("Enregistrement…");
  var direct=isAdmin()&&dbxReady();
  if(!direct)d.dbxPending=true;
  save();
  if(!direct){
    var m=isAdmin()?"Enregistré sur le site. Dropbox non connecté : envoi en attente.":"Enregistré. Le fichier partira dans Dropbox dès que l'administrateur sera connecté.";
    st(m); toast("Enregistré"); return;
  }
  try{
    await dbxUpload(dbxPath(d,W.page),await toBlob(d)); d.dbx=Date.now(); delete d.dbxPending; save();
    st("Enregistré et envoyé dans Dropbox à "+new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})); toast("Enregistré et envoyé dans Dropbox");
  }catch(e){ d.dbxPending=true; save(); st("Enregistré sur le site, mais l'envoi Dropbox a échoué : "+e.message+" (nouvel essai automatique)"); toast("Envoi Dropbox échoué : "+e.message) }
}
function openDoc(id){
  var d=getDoc(id); if(!d)return; wkClean(); W.open=true; W.id=id; var ad=cep(W.page),h=$("viewHost"),body;
  var FN=[["Calibri","Calibri,Arial,sans-serif"],["Arial","Arial,sans-serif"],["Times New Roman","'Times New Roman',serif"],["Georgia","Georgia,serif"],["Courier New","'Courier New',monospace"],["Verdana","Verdana,sans-serif"]];
  var head='<div class="toolbar"><div class="toolbar-actions"><button type="button" id="wBack">← Fichiers</button><input id="wName" value="'+esc(d.name)+'"'+(ad?'':' readonly')+' style="min-width:220px" aria-label="Nom du fichier"></div><div class="toolbar-actions"><span id="wSt" style="color:var(--muted);font-size:.85rem;max-width:340px"></span>'+(ad?'<button type="button" class="p" id="wSave">Enregistrer</button>':'')+'<button type="button" id="wDl">Télécharger</button></div></div>';
  if(d.t==="doc"){
    body=(ad?'<div class="ed-bar" id="wBar"><select data-s="formatBlock" aria-label="Style"><option value="p">Texte</option><option value="h1">Titre 1</option><option value="h2">Titre 2</option><option value="h3">Titre 3</option></select><select data-s="fontName" aria-label="Police">'+FN.map(function(f){return '<option value="'+esc(f[0])+'">'+f[0]+'</option>'}).join("")+'</select><select data-s="fontSize" aria-label="Taille"><option value="2">Petit</option><option value="3" selected>Normal</option><option value="5">Grand</option><option value="6">Très grand</option></select><span class="sep"></span>'
    +'<button type="button" data-c="bold"><b>G</b></button><button type="button" data-c="italic"><i>I</i></button><button type="button" data-c="underline"><u>S</u></button><button type="button" data-c="strikeThrough"><s>B</s></button><label>Couleur<input type="color" data-k="foreColor" value="#000000"></label><label>Surlignage<input type="color" data-k="hiliteColor" value="#ffff00"></label><span class="sep"></span>'
    +'<button type="button" data-c="justifyLeft">Gauche</button><button type="button" data-c="justifyCenter">Centré</button><button type="button" data-c="justifyRight">Droite</button><button type="button" data-c="justifyFull">Justifié</button><span class="sep"></span>'
    +'<button type="button" data-c="insertUnorderedList">Puces</button><button type="button" data-c="insertOrderedList">Numéros</button><button type="button" data-c="outdent">Retrait −</button><button type="button" data-c="indent">Retrait +</button><span class="sep"></span>'
    +'<button type="button" data-c="table">Tableau</button><button type="button" data-c="image">Image</button><input type="file" id="wImg" accept="image/*" hidden><button type="button" data-c="link">Lien</button><button type="button" data-c="insertHorizontalRule">Ligne</button><span class="sep"></span><button type="button" data-c="undo">Annuler</button><button type="button" data-c="redo">Rétablir</button></div>':'')
    +'<div class="ed-scroll"><div class="wpage" id="wDoc"'+(ad?' contenteditable="true"':'')+' spellcheck="true" lang="fr"></div></div>';
    h.innerHTML=head+body; $("wDoc").innerHTML=clean(d.html||"<p><br></p>");
    if(ad){
      var ed=$("wDoc"),rng=null,bar=$("wBar");
      try{document.execCommand("styleWithCSS",false,true)}catch(e){}
      W.sl=function(){var s=window.getSelection();if(s.rangeCount&&ed.contains(s.anchorNode))rng=s.getRangeAt(0).cloneRange()}; document.addEventListener("selectionchange",W.sl);
      var ex=function(c,v){ed.focus();if(rng){var s=window.getSelection();s.removeAllRanges();s.addRange(rng)}document.execCommand(c,false,v);W.sl()};
      bar.addEventListener("mousedown",function(e){if(e.target.closest("button"))e.preventDefault()});
      bar.addEventListener("click",function(e){
        var b=e.target.closest("button");if(!b)return;var c=b.dataset.c;
        if(c==="table"){var p=(prompt("Lignes, colonnes ?","3,3")||"").split(",").map(Number),r=p[0],k=p[1];if(!(r>0&&k>0))return;r=Math.min(r,30);k=Math.min(k,12);var t='<table style="border-collapse:collapse;width:100%">';for(var i=0;i<r;i++){t+="<tr>";for(var j=0;j<k;j++)t+='<td style="border:1px solid #999;padding:4px 8px"><br></td>';t+="</tr>"}ex("insertHTML",t+"</table><p><br></p>")}
        else if(c==="image")$("wImg").click();
        else if(c==="link"){var u=prompt("Adresse du lien (https://…)");if(u&&/^https?:\/\//i.test(u))ex("createLink",u)}
        else ex(c);
      });
      bar.addEventListener("change",function(e){var t=e.target;if(t.dataset.s)ex(t.dataset.s,t.dataset.s==="formatBlock"?"<"+t.value+">":(t.dataset.s==="fontName"?(FN.filter(function(f){return f[0]===t.value})[0]||[0,t.value])[1]:t.value))});
      bar.addEventListener("input",function(e){var t=e.target;if(t.dataset.k)ex(t.dataset.k,t.value)});
      $("wImg").onchange=function(){
        var f=this.files[0];this.value="";if(!f)return;var r=new FileReader();
        r.onload=function(){var im=new Image();im.onload=function(){var k=Math.min(1,700/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext("2d").drawImage(im,0,0,c.width,c.height);ex("insertImage",c.toDataURL("image/jpeg",.8))};im.src=r.result};r.readAsDataURL(f);
      };
    }
  } else if(d.t==="design"){
    openDesign(d,head,ad,h);
  } else {
    W.S={cells:JSON.parse(JSON.stringify(d.cells||[])),rows:d.rows||30,cols:d.cols||10};
    body=(ad?'<div class="ed-bar"><button type="button" id="gRow">+ Ligne</button><button type="button" id="gCol">+ Colonne</button><span style="font-size:.82rem;color:var(--muted)">Formules : =A1+B1, =SUM(A1:A10), =AVERAGE(B2:B9), =MIN(…), =MAX(…), =COUNT(…)</span></div>':'')+'<div id="wGrid">'+gridHtml(W.S,!ad)+'</div>';
    h.innerHTML=head+body; gridFill();
    var g=$("wGrid");
    g.addEventListener("focusin",function(e){var i=e.target;if(i.tagName==="INPUT"&&!i.readOnly)i.value=cellRaw(+i.dataset.r,+i.dataset.c)});
    g.addEventListener("focusout",function(e){var i=e.target;if(i.tagName!=="INPUT"||i.readOnly)return;var r=+i.dataset.r,c=+i.dataset.c;(W.S.cells[r]=W.S.cells[r]||[])[c]=i.value;setTimeout(gridFill,0)});
    g.addEventListener("keydown",function(e){
      var i=e.target;if(i.tagName!=="INPUT")return;var dr=e.key==="Enter"||e.key==="ArrowDown"?1:e.key==="ArrowUp"?-1:0;if(!dr)return;e.preventDefault();
      var n=g.querySelector('[data-r="'+(+i.dataset.r+dr)+'"][data-c="'+i.dataset.c+'"]');if(n)n.focus();
    });
    if(ad){
      var grow=function(k){if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();setTimeout(function(){if(k==="r")W.S.rows=Math.min(300,W.S.rows+10);else W.S.cols=Math.min(52,W.S.cols+2);g.innerHTML=gridHtml(W.S,false);gridFill()},0)};
      $("gRow").onclick=function(){grow("r")}; $("gCol").onclick=function(){grow("c")};
    }
  }
  $("wBack").onclick=function(){if(ad&&!confirm("Quitter ce fichier ? Les modifications non enregistrées seront perdues."))return;renEd(W.page)};
  $("wDl").onclick=function(){if(ad)commit(d);dl(d).catch(function(x){toast(x.message)})};
  if($("wSave"))$("wSave").onclick=saveDoc;
  h.onclick=null;
  if(!ad)st("Lecture seule");
}

/* ---------- Publication (brouillon / publié) ---------- */
var AF_PEND=0;
function cep(id){return !!(window.canEditPage&&window.canEditPage(id))}
function touch(id){(X.chg=X.chg||{})[id]=Date.now()}
function TD(){return W.tv||X.tre}
function typeLabel(d){return d.t==="doc"?"Word":d.t==="sheet"?"Excel":"Design"}
function typeNew(t){return t==="doc"?"document Word":t==="sheet"?"tableur Excel":"design"}
function extOf(d){return d.t==="doc"?".docx":d.t==="sheet"?".xlsx":".png"}
function mergeDocs(r){
  X.del=Object.assign({},X.del||{},r.del||{});
  var ps={}; Object.keys(X.docs).concat(Object.keys(r.docs||{})).forEach(function(p){ps[p]=1});
  Object.keys(ps).forEach(function(p){
    var m={}; (X.docs[p]||[]).concat((r.docs&&r.docs[p])||[]).forEach(function(d){var o=m[d.id];if(!o||(d.at||0)>(o.at||0)||((d.at||0)===(o.at||0)&&(d.dbx||0)>(o.dbx||0)))m[d.id]=d});
    X.docs[p]=Object.keys(m).map(function(k){return m[k]}).filter(function(d){return !X.del[d.id]});
  });
}
function mergeAbs(k,r){ var a=X[k]=X[k]||{},b=r[k]||{}; Object.keys(b).forEach(function(i){if(!(i in a)||Math.abs(b[i])>Math.abs(a[i]))a[i]=b[i]}) }
async function pushExtra(){
  // Relit et fusionne la navigation distante AVANT l'enregistrement, pour éviter son écrasement.
  try{
    var s=window.__sb;
    if(s){
      var r=await s.from(window.__TABLE).select("value").eq("key","extra").maybeSingle();
      if(r.error)throw r.error;
      if(r.data&&r.data.value&&typeof r.data.value==="object"){
        merge(r.data.value);
        backupNav();
        try{localStorage.setItem(KEY,JSON.stringify(X))}catch(e){}
      }
    }
  }catch(e){console.warn("Vérification sauvegarde onglets échouée :",e);return}
  if(window.cloudSave)await window.cloudSave("extra");
}
function inProg(){return '<div class="wip" role="status"><div class="spin"></div><h2>En cours...</h2><div class="bar"><i></i></div><p>Cette page est en cours de préparation. Elle sera visible dès sa publication.</p></div>'}
async function fetchPub(id){var s=window.__sb;if(!s)return null;var r=await s.from(window.__TABLE).select("value").eq("key","pub:"+id).maybeSingle();if(r.error)throw r.error;return r.data?r.data.value:null}
function viewPub(id,fn){
  var host=$("viewHost"),t='<div class="toolbar"><b>'+esc(pageName(id))+'</b></div>';
  host.innerHTML=t+'<div class="wip"><div class="spin"></div><h2>Chargement…</h2></div>';
  fetchPub(id).then(function(p){if(cur!==id)return;if(p)fn(p);else host.innerHTML=t+inProg()}).catch(function(){if(cur===id)host.innerHTML=t+inProg()});
}
function pubBar(id){
  if(!cep(id)||id==="home")return "";
  var at=(X.pubAt&&X.pubAt[id]>0)?X.pubAt[id]:0,ch=(X.chg&&X.chg[id])||0,ad=isAdmin();
  var s=!at?'Brouillon : les autres utilisateurs voient « En cours... »':(ch>at?'Publié le '+fdt(at)+' · <b>modifications non publiées</b>':'Publié le '+fdt(at)+' · à jour');
  return '<div class="pubbar"><span>'+s+'</span>'+(ad?'<button type="button" class="p" id="pubBtn">Publier</button>'+(at?'<button type="button" id="unpubBtn">Dépublier</button>':''):'<small>Seul l\'administrateur peut publier.</small>')+'</div>';
}
function bindPub(id){var b=$("pubBtn");if(b)b.onclick=function(){publish(id)};var u=$("unpubBtn");if(u)u.onclick=function(){unpublish(id)}}
async function publish(id){
  if(!isAdmin())return; var s=window.__sb; if(!s){toast("Service indisponible");return}
  var snap={at:Date.now(),by:loggedUserEmail,docs:JSON.parse(JSON.stringify(X.docs[id]||[])),tre:id==="treasury"?JSON.parse(JSON.stringify(X.tre)):null};
  snap.docs.forEach(function(d){delete d.dbxPending});
  var r=await s.from(window.__TABLE).upsert({key:"pub:"+id,value:snap,updated_at:new Date().toISOString()});
  if(r.error){toast("Publication impossible : "+r.error.message);return}
  X.pubAt[id]=snap.at; save(); toast("Publié : les autres utilisateurs voient maintenant « "+pageName(id)+" »."); show(id);
}
async function unpublish(id){
  if(!isAdmin()||!confirm("Retirer la publication ? Les autres utilisateurs verront de nouveau « En cours... »."))return;
  var r=await window.__sb.from(window.__TABLE).delete().eq("key","pub:"+id);
  if(r.error){toast("Échec : "+r.error.message);return}
  X.pubAt[id]=-Date.now(); save(); show(id);
}
setInterval(function(){
  if(cur==="home"||cur==="admin"||cep(cur)||W.open)return;
  fetchPub(cur).then(function(p){var at=p?p.at:0,have=cur==="treasury"?(W.tvAt||0):(W.pv?W.pv.at:0);if(at!==have)show(cur)}).catch(function(){});
},30000);

/* ---------- Envoi Dropbox différé (fichiers enregistrés par un éditeur) ---------- */
var syncing=false;
async function syncPending(){
  if(syncing||!isAdmin()||!dbxReady())return; syncing=true;
  try{
    var ps=Object.keys(X.docs),n=0;
    for(var i=0;i<ps.length;i++){var L=X.docs[ps[i]];for(var j=0;j<L.length;j++){var d=L[j];if(!d.dbxPending||(W.open&&W.id===d.id))continue;
      try{await dbxUpload(dbxPath(d,ps[i]),await toBlob(d));d.dbx=Date.now();delete d.dbxPending;n++}catch(e){break}}}
    if(n){save();toast(n+" fichier(s) envoyé(s) dans Dropbox")}
  }finally{syncing=false}
}
setInterval(syncPending,45000);

/* ---------- Design (type Canva) ---------- */
var FONTS=[["Sans","system-ui,-apple-system,sans-serif"],["Serif","Georgia,'Times New Roman',serif"],["Machine","'Courier New',monospace"],["Impact","Impact,Haettenschweiler,sans-serif"],["Trebuchet","'Trebuchet MS',sans-serif"],["Manuscrit","'Comic Sans MS',cursive"]];
function nodeOf(e){return $("board").querySelector('[data-id="'+e.id+'"]')}
function paintE(n,e){
  var s=n.style;s.left=e.x+"px";s.top=e.y+"px";s.width=e.w+"px";s.height=e.h+"px";
  if(e.t==="img")return;
  s.background=e.fill||"transparent";s.borderRadius=e.t==="ellipse"?"50%":"0";
  if(e.t==="text"){s.color=e.color;s.fontSize=e.fs+"px";s.fontFamily=e.ff;s.fontWeight=e.b?"700":"400";s.fontStyle=e.i?"italic":"normal";s.lineHeight="1.2";s.padding="4px"}
}
function mkE(e){
  var n=document.createElement("div");n.className="el";n.dataset.id=e.id;
  if(e.t==="text")n.textContent=e.text;
  if(e.t==="img"){var im=document.createElement("img");im.src=e.src;im.alt="";n.appendChild(im)}
  paintE(n,e);return n;
}
function selE(e){
  var b=$("board");b.querySelectorAll(".el").forEach(function(n){n.classList.remove("sel")});b.querySelectorAll(".hd").forEach(function(h){h.remove()});
  sel=e;if(!e)return;
  var n=nodeOf(e);n.classList.add("sel");var h=document.createElement("div");h.className="hd";n.appendChild(h);
  if($("cFill")&&e.t!=="img")$("cFill").value=/^#/.test(e.fill||"")?e.fill:"#ffffff";
  if($("cTxt")&&e.t==="text"){$("cTxt").value=e.color;$("nFs").value=e.fs;$("sFf").value=e.ff}
}
function updE(fn){if(!sel)return;fn(sel);paintE(nodeOf(sel),sel)}
function delE(){if(!sel)return;W.D.els=W.D.els.filter(function(e){return e!==sel});var n=nodeOf(sel);if(n)n.remove();sel=null}
function addE(e){e.id="e"+Date.now().toString(36)+Math.floor(Math.random()*999);W.D.els.push(e);$("board").appendChild(mkE(e));selE(e)}
function openDesign(d,head,ad,h){
  W.D={bg:d.bg||"#ffffff",els:JSON.parse(JSON.stringify(d.els||[]))};var P=W.D;
  var bar=ad?'<div class="ed-bar"><button type="button" id="bT">T Texte</button><button type="button" id="bH">Titre</button><button type="button" id="bR">▭ Rectangle</button><button type="button" id="bC">◯ Cercle</button><button type="button" id="bI">Image</button><input type="file" id="fI" accept="image/*" hidden><span class="sep"></span>'
  +'<label>Fond<input type="color" id="cFill" value="#ffffff"></label><label>Texte<input type="color" id="cTxt" value="#1d2a22"></label><input type="number" id="nFs" min="8" max="200" value="24" style="width:66px" aria-label="Taille du texte"><select id="sFf" aria-label="Police">'+FONTS.map(function(f){return '<option value="'+esc(f[1])+'">'+f[0]+'</option>'}).join("")+'</select><button type="button" id="bB"><b>G</b></button><button type="button" id="bIt"><i>I</i></button><span class="sep"></span>'
  +'<button type="button" id="bFr">Premier plan</button><button type="button" id="bBk">Arrière-plan</button><button type="button" id="bDp">Dupliquer</button><button type="button" class="danger" id="bDl">Supprimer</button><span class="sep"></span><label>Fond de page<input type="color" id="cBg" value="'+P.bg+'"></label></div>':'';
  h.innerHTML=head+bar+'<div class="ed-scroll"><div class="board" id="board" style="background:'+P.bg+'"></div></div>';
  var b=$("board");P.els.forEach(function(e){b.appendChild(mkE(e))});
  if(!ad)return;
  $("bT").onclick=function(){addE({t:"text",x:80,y:80,w:320,h:50,text:"Votre texte",color:"#1d2a22",fs:24,ff:FONTS[0][1]})};
  $("bH").onclick=function(){addE({t:"text",x:60,y:50,w:680,h:80,text:"Votre titre",color:"#1f5d3a",fs:52,b:1,ff:FONTS[1][1]})};
  $("bR").onclick=function(){addE({t:"rect",x:120,y:160,w:220,h:130,fill:"#1f5d3a"})};
  $("bC").onclick=function(){addE({t:"ellipse",x:420,y:160,w:150,h:150,fill:"#d98a1b"})};
  $("bI").onclick=function(){$("fI").click()};
  $("fI").onchange=function(){
    var f=this.files[0];this.value="";if(!f)return;var r=new FileReader();
    r.onload=function(){var i=new Image();i.onload=function(){var k=Math.min(1,800/Math.max(i.width,i.height)),c=document.createElement("canvas");c.width=Math.round(i.width*k);c.height=Math.round(i.height*k);c.getContext("2d").drawImage(i,0,0,c.width,c.height);var w=Math.min(360,c.width);addE({t:"img",x:100,y:100,w:w,h:Math.round(w*c.height/c.width),src:c.toDataURL("image/jpeg",.82)})};i.src=r.result};r.readAsDataURL(f);
  };
  $("cFill").oninput=function(){var v=this.value;updE(function(e){if(e.t!=="img")e.fill=v})};
  $("cTxt").oninput=function(){var v=this.value;updE(function(e){if(e.t==="text")e.color=v})};
  $("nFs").oninput=function(){var v=Math.max(8,parseInt(this.value)||24);updE(function(e){if(e.t==="text")e.fs=v})};
  $("sFf").onchange=function(){var v=this.value;updE(function(e){if(e.t==="text")e.ff=v})};
  $("bB").onclick=function(){updE(function(e){if(e.t==="text")e.b=e.b?0:1})};
  $("bIt").onclick=function(){updE(function(e){if(e.t==="text")e.i=e.i?0:1})};
  $("bFr").onclick=function(){if(!sel)return;var a=P.els;a.splice(a.indexOf(sel),1);a.push(sel);b.appendChild(nodeOf(sel))};
  $("bBk").onclick=function(){if(!sel)return;var a=P.els;a.splice(a.indexOf(sel),1);a.unshift(sel);b.insertBefore(nodeOf(sel),b.firstChild)};
  $("bDp").onclick=function(){if(!sel)return;var c=Object.assign({},sel);c.x+=20;c.y+=20;addE(c)};
  $("bDl").onclick=delE;
  $("cBg").oninput=function(){P.bg=this.value;b.style.background=this.value};
  W.kd=function(e){if(e.key==="Delete"&&sel&&!editing()&&!/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))delE()};document.addEventListener("keydown",W.kd);
  b.addEventListener("pointerdown",function(ev){
    var n=ev.target.closest(".el");if(!n){selE(null);return}if(n.isContentEditable)return;
    var e=P.els.filter(function(x){return x.id===n.dataset.id})[0];if(!e)return;selE(e);
    var rs=ev.target.classList.contains("hd"),sx=ev.clientX,sy=ev.clientY,ox=e.x,oy=e.y,ow=e.w,oh=e.h;
    try{n.setPointerCapture(ev.pointerId)}catch(x){}
    function mv(m){var dx=m.clientX-sx,dy=m.clientY-sy;if(rs){e.w=Math.max(20,ow+dx);e.h=Math.max(20,oh+dy)}else{e.x=ox+dx;e.y=oy+dy}paintE(n,e)}
    function up(){n.removeEventListener("pointermove",mv);n.removeEventListener("pointerup",up);n.removeEventListener("pointercancel",up)}
    n.addEventListener("pointermove",mv);n.addEventListener("pointerup",up);n.addEventListener("pointercancel",up);
  });
  b.addEventListener("dblclick",function(ev){
    var n=ev.target.closest(".el");if(!n)return;var e=P.els.filter(function(x){return x.id===n.dataset.id})[0];if(!e||e.t!=="text")return;
    n.querySelectorAll(".hd").forEach(function(x){x.remove()});n.contentEditable="true";n.focus();document.getSelection().selectAllChildren(n);
    n.onblur=function(){e.text=n.innerText;n.contentEditable="false";n.onblur=null;selE(e)};
  });
}
async function designBlob(d){
  var c=document.createElement("canvas"),sc=2;c.width=960*sc;c.height=560*sc;var x=c.getContext("2d");x.scale(sc,sc);x.fillStyle=d.bg||"#ffffff";x.fillRect(0,0,960,560);
  var els=d.els||[];
  for(var i=0;i<els.length;i++){
    var e=els[i];
    if(e.t==="img"){
      var im=await new Promise(function(ok){var m=new Image();m.onload=function(){ok(m)};m.onerror=function(){ok(null)};m.src=e.src});
      if(!im)continue; x.save();x.beginPath();x.rect(e.x,e.y,e.w,e.h);x.clip();var k=Math.max(e.w/im.width,e.h/im.height),dw=im.width*k,dh=im.height*k;x.drawImage(im,e.x+(e.w-dw)/2,e.y+(e.h-dh)/2,dw,dh);x.restore();continue;
    }
    if(e.fill){x.fillStyle=e.fill;if(e.t==="ellipse"){x.beginPath();x.ellipse(e.x+e.w/2,e.y+e.h/2,e.w/2,e.h/2,0,0,Math.PI*2);x.fill()}else x.fillRect(e.x,e.y,e.w,e.h)}
    if(e.t==="text"){
      x.fillStyle=e.color||"#000";x.textBaseline="top";x.font=(e.i?"italic ":"")+(e.b?"700 ":"400 ")+e.fs+"px "+e.ff;
      var lh=e.fs*1.2,yy=e.y+4;
      String(e.text||"").split("\n").forEach(function(par){var line="";par.split(" ").forEach(function(w){var t=line?line+" "+w:w;if(x.measureText(t).width>e.w-8&&line){x.fillText(line,e.x+4,yy);yy+=lh;line=w}else line=t});x.fillText(line,e.x+4,yy);yy+=lh});
    }
  }
  return new Promise(function(ok){c.toBlob(ok,"image/png")});
}

/* ---------- Espace d'administration ---------- */
function pn(id){return id==="all"?"Tout":(BASE.concat(X.nav).filter(function(x){return x.id===id})[0]||{n:id}).n}
function gtxt(g){g=g||[];return g.length?(g.indexOf("all")>-1?"Tout (modification complète)":g.map(pn).join(", ")):"Lecture seule"}
function drawOnline(){
  var el=$("adOn");if(!el)return;var L=window.AFRI?AFRI.onlineList():[];
  el.innerHTML='<h3>En ligne maintenant ('+L.length+')</h3>'+(L.length?'<div class="xlw"><table class="t"><thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Page consultée</th><th>Connecté depuis</th></tr></thead><tbody>'+L.map(function(u){return '<tr><td>'+esc(u.name||"—")+'</td><td>'+esc(u.email)+(u.email===loggedUserEmail?' (vous)':'')+'</td><td>'+(u.role==="admin"?"Administrateur":u.role==="editor"?"Éditeur":"Lecteur")+'</td><td>'+esc(u.page||"")+'</td><td>'+new Date(u.since).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})+'</td></tr>'}).join("")+'</tbody></table></div>':'<p style="color:var(--muted)">Connexion au canal en temps réel en cours…</p>');
}
async function renPartners(){
  if(!isAdmin()){show("home");return}
  var host=$("viewHost");
  host.innerHTML='<div class="toolbar"><b>Partenaires · Suivi des marchés</b><div class="toolbar-actions"><button type="button" id="partnersRefresh">Actualiser</button></div></div>'
    +'<section class="mt-box"><h3>Partenaires par marché commercial</h3><p>Attribuez un marché à chaque partenaire et suivez ses allocations, déclarations de ventes et contestations. Les marchés non attribués restent explicitement non renseignés.</p><div id="partnersBoard">Chargement des partenaires…</div></section>'
    +'<section class="mt-box" style="margin-top:18px"><h3>Demandes de partenariat et accès</h3><div id="partnersAccess">Chargement des demandes…</div></section>'
    +'<section class="mt-box" style="margin-top:18px"><h3>Conditions commerciales</h3><div id="partnersTerms">Chargement des conditions…</div></section>'
    +'<section class="mt-box" style="margin-top:18px"><h3>Contestations</h3><div id="partnersDisputes">Chargement des contestations…</div></section>';
  if(window.AfriMarket){
    if(window.AfriMarket.renderPartnerManagement)window.AfriMarket.renderPartnerManagement("partnersBoard");
    if(window.AfriMarket.renderAccessAdmin)window.AfriMarket.renderAccessAdmin("partnersAccess");
    if(window.AfriMarket.renderPartnerTermsAdmin)window.AfriMarket.renderPartnerTermsAdmin("partnersTerms");
    if(window.AfriMarket.renderDisputesAdmin)window.AfriMarket.renderDisputesAdmin("partnersDisputes");
  }else{$("partnersBoard").textContent="Module Marketplace indisponible."}
  $("partnersRefresh").onclick=renPartners;
}
async function renAdmin(){
  var h=$("viewHost");
  h.innerHTML='<div class="toolbar"><b>Administration</b><div class="toolbar-actions"><button type="button" id="adRef">Actualiser</button></div></div>'
    +'<section class="mt-box" aria-label="Validation des partenaires" style="margin-bottom:22px"><h3>Demandes de partenariat et accès Marketplace</h3><p>Approuvez les partenaires en attente et consultez l’historique des décisions, sans quitter Administration.</p><div id="adMarketAccess" class="af-partner-admin"><p>Chargement des demandes partenaires…</p></div><div id="adPartnerTerms" class="af-partner-admin" style="margin-top:24px"><p>Chargement des conditions commerciales…</p></div><div id="adDisputes" class="af-partner-admin" style="margin-top:24px"><p>Chargement des contestations…</p></div></section>'
    +'<div id="adOn"></div><div id="adBody"><p style="color:var(--muted)">Chargement des comptes…</p></div>';
  if(window.AfriMarket&&window.AfriMarket.renderAccessAdmin){
    window.AfriMarket.renderAccessAdmin("adMarketAccess");
    if(window.AfriMarket.renderPartnerTermsAdmin)window.AfriMarket.renderPartnerTermsAdmin("adPartnerTerms");
    if(window.AfriMarket.renderDisputesAdmin)window.AfriMarket.renderDisputesAdmin("adDisputes");
  }else{
    $("adMarketAccess").textContent="Module Marketplace non disponible.";
    $("adPartnerTerms").textContent="Module Marketplace non disponible.";
  }
  drawOnline(); $("adRef").onclick=renAdmin; if(window.AFRI)AFRI.onPresence=function(){if(cur==="admin")drawOnline()};
  var U,R;
  try{U=await AFRI.listUsers();R=await AFRI.listRequests()}catch(e){if(cur==="admin")$("adBody").innerHTML='<p style="color:#c0392b">Lecture impossible : '+esc(e.message||e)+'</p>';return}
  if(cur!=="admin")return; W.U=U; var P=R.filter(function(r){return r.status==="pending"});
  $("adBody").innerHTML='<h3>Demandes de modification ('+P.length+')</h3>'+(P.length?'<div class="dgrid">'+P.map(function(r){return '<div class="dcard"><b>'+esc(r.name||r.email)+'</b><small>'+esc(r.email)+' · '+fdt(r.at)+'</small><small>Souhaite modifier : <b>'+esc(r.docPath?String(r.docPath).split("/").pop():(r.pages||[]).map(pn).join(", "))+'</b></small>'+(r.msg?'<small>« '+esc(r.msg)+' »</small>':'')+'<div class="dact"><button type="button" class="p" data-ok="'+esc(r.email)+'">Accepter</button><button type="button" data-no="'+esc(r.email)+'">Refuser</button></div></div>'}).join("")+'</div>':'<p style="color:var(--muted)">Aucune demande en attente.</p>')
  +'<h3>Comptes inscrits ('+U.length+')</h3>'+(U.length?'<div class="xlw"><table class="t"><thead><tr><th>Nom</th><th>Email</th><th>Droits de modification</th><th>Inscrit le</th><th></th></tr></thead><tbody>'+U.map(function(u){return '<tr><td>'+esc(u.name)+'</td><td>'+esc(u.email)+'</td><td>'+esc(gtxt(u.grants))+'</td><td>'+fdt(u.created)+'</td><td><button type="button" data-dg="'+esc(u.email)+'">Droits</button> <button type="button" class="danger" data-du="'+esc(u.email)+'">Supprimer</button></td></tr>'}).join("")+'</tbody></table></div>':'<p style="color:var(--muted)">Aucun compte pour le moment.</p>');
  h.onclick=function(e){
    var b=e.target.closest("button");if(!b)return;var d=b.dataset;
    if(d.ok||d.no)AFRI.resolve(d.ok||d.no,!!d.ok).then(function(){toast(d.ok?"Droits accordés":"Demande refusée");AFRI.pollReq();renAdmin()}).catch(function(x){toast(x.message)});
    else if(d.dg)grantsDialog(d.dg);
    else if(d.du&&confirm("Supprimer le compte "+d.du+" ? La personne devra s'inscrire à nouveau."))AFRI.deleteUser(d.du).then(renAdmin).catch(function(x){toast(x.message)});
  };
}
function grantsDialog(email){
  var u=(W.U||[]).filter(function(x){return x.email===email})[0];if(!u)return;var g=u.grants||[],b=$("xmBox");
  b.innerHTML='<h2 style="margin-top:0">Droits de modification</h2><p style="font-size:.85rem;color:var(--muted);margin-top:0">'+esc(u.name)+' · '+esc(u.email)+'</p>'+[{id:"all",n:"Tout (toute la plateforme)"}].concat(BASE.concat(X.nav)).map(function(p){return '<label class="rq"><input type="checkbox" value="'+esc(p.id)+'"'+(g.indexOf(p.id)>-1?' checked':'')+'> '+esc(p.n)+'</label>'}).join("")+'<div class="dact"><button type="button" class="p" id="gOk">Enregistrer</button><button type="button" id="gNo">Annuler</button></div>';
  b.onkeydown=null;$("xm").classList.add("on");
  $("gNo").onclick=function(){$("xm").classList.remove("on")};
  $("gOk").onclick=function(){var v=[].slice.call(b.querySelectorAll("input:checked")).map(function(i){return i.value});if(v.indexOf("all")>-1)v=["all"];AFRI.setGrants(email,v).then(function(){$("xm").classList.remove("on");toast("Droits mis à jour");renAdmin()}).catch(function(x){toast(x.message)})};
}
window.getPages=function(){return BASE.concat(X.nav)};
window.askDlg=ask;window.toast=toast;
window.onPending=function(n){AF_PEND=n;buildNav()};

window.onRole=function(){
  buildNav();
  if(!viewRestored)restorePreviousView();
  // Refreshing user permissions must not force navigation or reset scroll.
};
buildNav();
})();
