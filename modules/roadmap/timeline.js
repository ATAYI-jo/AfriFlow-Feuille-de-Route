
(function(){
"use strict";

/* ---------- Contenu de la feuille de route (modifiable ici) ---------- */
var START="2026-11-09", END="2027-02-05";
var PHASES=[
 {n:1,name:"Consolidation des outils et analyse terrain",start:"2026-11-09",end:"2026-12-06",
  goal:"Fiabiliser les informations commerciales et adapter les outils aux deux marchés.",
  seq:[
   {t:"Audit et remontées de prospection",d:"9–15 novembre",a:["Centraliser les retours de Lomé et de Dakar dans un fichier unique","Qualifier chaque prospect : chaud, tiède ou froid","Comparer le Togo et le Sénégal sans mélanger les résultats"],l:"Base prospects, synthèse des objections, tableau comparatif, liste prioritaire"},
   {t:"Supports commerciaux et architecture multi-produits",d:"16–29 novembre",a:["Catalogue PDF léger, lisible sur téléphone et partageable sur WhatsApp","Fiche produit mangue séchée et modèle de fiche pour les futurs produits","Rubrique « Nouveautés à venir » sans annonce non validée"],l:"Catalogue versionné, fiches produits, argumentaire commercial"},
   {t:"Échantillons et traçabilité",d:"30 novembre – 6 décembre",a:["Circuit d'envoi : demande, validation, expédition, réception, relance","Un échantillon = un prospect + une date de relance","Test des QR-codes sur plusieurs téléphones"],l:"Registre des échantillons, fiche de retour, contrôle QR"}]},
 {n:2,name:"Activation digitale et soutien commercial",start:"2026-12-07",end:"2027-01-03",
  goal:"Renforcer la crédibilité B2B et transformer la visibilité en conversations commerciales.",
  seq:[
   {t:"Notoriété B2B et sourcing",d:"7–20 décembre",a:["Publications LinkedIn régulières fondées sur des preuves réelles","Un appel à l'action précis par publication","Contacts générés intégrés à la base prospects sous 48 h"],l:"Calendrier éditorial, publications, suivi des demandes entrantes"},
   {t:"Pré-lancement et qualification des nouveautés",d:"21 décembre – 3 janvier",a:["Distinguer l'intérêt déclaré de l'intention d'achat concrète","FAQ et prix dégressifs seulement après validation coûts et marges","Aucune précommande ferme sans disponibilité, prix et calendrier confirmés"],l:"Synthèse des attentes, FAQ, grille tarifaire validée, registre des intentions"}]},
 {n:3,name:"Optimisation, fidélisation et passage à l'échelle",start:"2027-01-04",end:"2027-02-05",
  goal:"Consolider les ventes, améliorer la rétention et préparer les décisions de lancement.",
  seq:[
   {t:"Bilan des performances régionales",d:"4–17 janvier",a:["Indicateurs par pays, segment et canal","Repérer les étapes où les prospects décrochent","Décider des ajustements prioritaires"],l:"Tableau de bord Togo/Sénégal, bilan de conversion, recommandations"},
   {t:"Point de vente et fidélisation",d:"18–31 janvier",a:["Supports de point de vente validés par les partenaires","Retours des premiers distributeurs sur la rotation et le réassort","Conditions de réassort adaptées à la marge réelle"],l:"Kit PLV, fiche de suivi partenaire, conditions de réassort"},
   {t:"Décision de lancement et trimestre suivant",d:"1er–5 février",a:["Évaluer chaque nouveauté sur 5 critères : demande, marge, fournisseur, conformité, logistique","Classer : lancement préparé, test complémentaire ou différé","Fixer priorités, responsables et échéances du trimestre suivant"],l:"Note de décision par produit, bilan, feuille de route suivante"}]}
];
var JALONS=[
 {date:"2026-12-06",t:"Outils et données prêts",d:"Base prospects, catalogue, fiches produits, registre d'échantillons et contrôle QR prêts.",dec:"Autoriser l'activation commerciale et fixer les cibles chiffrées des KPI."},
 {date:"2027-01-03",t:"Demande marché qualifiée",d:"Bilan LinkedIn, retours prospects, intentions d'achat et grille tarifaire validée.",dec:"Prioriser les nouveautés à étudier ou tester."},
 {date:"2027-01-17",t:"Performance analysée",d:"KPI par pays et canal, analyse des conversions et recommandations.",dec:"Corriger le ciblage et le processus commercial."},
 {date:"2027-02-05",t:"Décision de lancement",d:"Bilan final, décision par produit et feuille de route suivante.",dec:"Lancer, tester davantage ou différer chaque nouveauté."}
];
var KPIS=[
 ["Prospects qualifiés","Prospects dans la cible avec contact et besoin identifiés","Hebdo"],
 ["Taux contact → échantillon","Échantillons remis ÷ prospects qualifiés × 100","Hebdo"],
 ["Taux d'évaluation des échantillons","Retours exploitables ÷ échantillons remis × 100","Hebdo"],
 ["Délai de réponse","Jours entre l'envoi d'une offre et le retour du prospect","Hebdo"],
 ["Taux de conversion","Commandes obtenues ÷ prospects qualifiés × 100","Mensuel"],
 ["Commandes et réassorts","Nombre de commandes, volumes, fréquence de réachat","Mensuel"],
 ["Marge par commande","(Prix de vente − coût complet) ÷ prix de vente","Par commande"],
 ["Engagement LinkedIn B2B","Demandes entrantes et contacts professionnels générés","Hebdo"]
];
var RISKS=[
 ["Retours terrain incomplets","Fiche unique, champs obligatoires, saisie sous 48 h"],
 ["Prix non aligné sur les coûts","Valider coût complet, transport, conditionnement et marge avant tout tarif"],
 ["Rupture ou retard d'approvisionnement","Confirmer stocks et délais avant devis ferme"],
 ["Échantillons sans suivi","Un échantillon = un prospect, une date de relance, une fiche de retour"],
 ["Lancement prématuré d'une nouveauté","Grille de décision et jalon du 5 février"],
 ["Ralentissement de fin d'année","Concentrer les relances avant le 24 décembre, message d'attente, reprise planifiée"]
];

/* ---------- Utilitaires ---------- */
var KEY="pub:deadlines", active=false, cache=[], openSet={};
var MOIS=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
function $(i){return document.getElementById(i)}
function SB(){return window.__sb} function TB(){return window.__TABLE||"afriflow_state"}
function me(){return String(window.loggedUserEmail||"").toLowerCase()}
function isAdmin(){return window.USER_ROLE==="admin"}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function toast(m){(window.toast||alert)(m)}
function today(){var d=new Date();d.setHours(0,0,0,0);return d}
function pd(s){var p=s.split("-");return new Date(+p[0],+p[1]-1,+p[2])}
function fr(s){var p=s.split("-");return p[2]+"/"+p[1]+"/"+p[0]}
function frl(s){var p=s.split("-");return (+p[2]===1?"1er":+p[2])+" "+MOIS[+p[1]-1]+" "+p[0]}
function addDays(n){var d=today();d.setDate(d.getDate()+n);return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2)}
function daysLeft(s){return Math.round((pd(s)-today())/864e5)}
function when(l){return l>1?"dans "+l+" jours":l===1?"demain":l===0?"aujourd'hui":"en retard de "+(-l)+" jour"+(l<-1?"s":"")}
function colorFor(l){return l<=3?"#c0392b":l<=7?"var(--amber)":"var(--green)"}
function uid(){return "e"+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36)}
function sget(k){try{return sessionStorage.getItem(k)}catch(e){return null}}
function sset(k,v){try{sessionStorage.setItem(k,v)}catch(e){}}

/* ---------- Échéances : lecture / écriture ---------- */
async function loadDl(){
  var r=await SB().from(TB()).select("value").eq("key",KEY).maybeSingle();
  if(r.error)throw r.error;
  return (r.data&&r.data.value&&Array.isArray(r.data.value.items))?r.data.value.items:[];
}
async function saveDl(items){
  var r=await SB().from(TB()).upsert({key:KEY,value:{at:Date.now(),by:me(),items:items},updated_at:new Date().toISOString()});
  if(r.error)throw r.error;
  cache=items;
}

/* ---------- Envoi de l'alerte à tous les inscrits (Messagerie) ---------- */
function bodyText(it,l){
  return "Bonjour,\n\nRappel important : « "+it.title+" » doit être clôturé dans "+(l>1?l+" jours":l===1?"1 jour":"les meilleurs délais")+", au plus tard le "+fr(it.due)+".\n"
   +(it.note?"\n"+it.note+"\n":"")
   +"\nMerci de finaliser vos actions avant cette date. Le détail est dans la section « Feuille de route » : "+location.origin+location.pathname+"\n\n— Administration AfriFloW";
}
async function recipients(){
  var U=await window.AFRI.listUsers();
  return U.map(function(u){return String(u.email||"").toLowerCase()}).filter(function(e){return e&&e!==me()});
}
async function notify(it,rec){
  var l=daysLeft(it.due),ts=Date.now(),k=ts+":"+Math.random().toString(36).slice(2,6),now=new Date().toISOString();
  var subject="⏰ « "+it.title+" » doit être clôturé "+when(l);
  var base={from:me(),fromName:window.USER_NAME||"Administration AfriFloW",subject:subject,body:bodyText(it,l),ts:ts,read:false};
  var rows=[{key:"sent:"+me()+":"+k,value:Object.assign({},base,{to:"Tous les inscrits ("+rec.length+")",read:true}),updated_at:now}];
  rec.forEach(function(t){rows.push({key:"msg:"+t+":"+k,value:Object.assign({},base,{to:t}),updated_at:now})});
  for(var i=0;i<rows.length;i+=100){
    var r=await SB().from(TB()).insert(rows.slice(i,i+100));
    if(r.error)throw r.error;
  }
  it.notified=ts;it.notifiedCount=rec.length;
  if(typeof window.recordUserAction==="function")window.recordUserAction("Alerte d'échéance envoyée à "+rec.length+" inscrits : "+it.title);
}

/* ---------- Bandeau de compte à rebours (tous les utilisateurs) ---------- */
function drawBanner(items){
  var host=$("fdrBanner");
  if(!host){
    var br=document.querySelector("#view-home .brand");if(!br)return;
    host=document.createElement("div");host.id="fdrBanner";br.parentNode.insertBefore(host,br);
  }
  if(!me()){host.innerHTML="";return}
  var act=items.filter(function(i){return !i.done&&!sget("fdr_dis_"+i.id)}).sort(function(a,b){return a.due<b.due?-1:1});
  host.innerHTML=act.map(function(i){
    var l=daysLeft(i.due);
    return '<div class="fdr-ban" style="--c:'+colorFor(l)+'" role="status"><span>⏰ <b>'+esc(i.title)+'</b> doit être clôturé '+when(l)+' (le '+fr(i.due)+')</span><span class="fdr-act"><button type="button" data-fdr="open">Voir la feuille de route</button><button type="button" data-fdr="dis" data-id="'+esc(i.id)+'" aria-label="Masquer">✕</button></span></div>';
  }).join("");
}
async function refreshBanner(){
  if(!me()||!SB()){drawBanner([]);return}
  try{cache=await loadDl();drawBanner(cache);if(active&&$("fdrDl"))drawList()}catch(e){}
}
document.addEventListener("click",function(e){
  var b=e.target.closest("[data-fdr]");if(!b||!b.closest("#fdrBanner"))return;
  if(b.dataset.fdr==="open")openPage();
  else if(b.dataset.fdr==="dis"){sset("fdr_dis_"+b.dataset.id,"1");drawBanner(cache)}
});

/* ---------- Barre flottante dépliable ---------- */
function bar(id,title,meta,tag,color,inner,o){
  o=o||{};
  if(!(id in openSet))openSet[id]=!!o.open;
  var op=openSet[id];
  return '<section class="fdr-bar'+(o.sub?' sub':'')+(op?' open':'')+'" id="b-'+id+'" style="--c:'+color+'">'
   +'<button type="button" class="fdr-head" aria-expanded="'+op+'" aria-controls="p-'+id+'">'
   +'<span class="fdr-ttl"><b>'+esc(title)+'</b>'+(meta!=null?'<small'+(o.metaId?' id="'+o.metaId+'"':'')+'>'+esc(meta)+'</small>':'')+'</span>'
   +(o.to?'<span class="fdr-clock" data-from="'+(o.from||"")+'" data-to="'+o.to+'"></span>':'')
   +(tag?'<span class="fdr-tag"'+(o.tagId?' id="'+o.tagId+'"':'')+' style="--c:'+(o.tagColor||color)+'">'+esc(tag)+'</span>':'')
   +'<span class="fdr-chev" aria-hidden="true"></span></button>'
   +'<div class="fdr-panel" id="p-'+id+'" role="region"><div class="fdr-pclip"><div class="fdr-pin">'+inner+'</div></div></div></section>';
}
function dur(ms){ms=Math.max(0,ms);var m=Math.floor(ms/6e4),d=Math.floor(m/1440),h=Math.floor(m%1440/60),mi=m%60;return (d?d+" j ":"")+h+" h "+("0"+mi).slice(-2)+" min"}
function tick(){
  var now=Date.now();
  document.querySelectorAll("#viewHost .fdr-clock").forEach(function(el){
    var f=el.dataset.from?pd(el.dataset.from).getTime():0,t=pd(el.dataset.to).getTime()+864e5-1000,cls,h,s="";
    if(f&&now<f){cls="soon";h="Démarre dans "+dur(f-now)}
    else if(now>t){cls="done";h=f?"Terminée":"Atteint";s="depuis "+dur(now-t)}
    else if(f){cls="";h="Reste "+dur(t-now);s="écoulé : "+dur(now-f)}
    else{cls=(t-now)<=14*864e5?"late":"soon";h="Dans "+dur(t-now)}
    var html='<span>'+h+'</span>'+(s?'<small>'+s+'</small>':'');
    if(el.innerHTML!==html)el.innerHTML=html;
    el.className="fdr-clock"+(cls?" "+cls:"");
  });
}

/* ---------- Liste des échéances (dans la barre « Échéances ») ---------- */
function drawList(){
  var host=$("fdrDl");if(!host)return;
  var L=cache.slice().sort(function(a,b){return a.due<b.due?-1:1});
  host.innerHTML=L.length?L.map(function(i){
    var l=daysLeft(i.due);
    return '<div class="fdr-row'+(i.done?' done':'')+'" style="--c:'+(i.done?'var(--done)':colorFor(l))+'"><div><b>'+esc(i.title)+'</b><br><small>'+(i.start?'Du '+fr(i.start)+' au '+fr(i.due):'Clôture le '+fr(i.due))+(i.notified?' · alerte envoyée à '+i.notifiedCount+' inscrit(s) le '+new Date(i.notified).toLocaleDateString("fr-FR"):'')+(i.note?' · '+esc(i.note):'')+'</small></div>'
     +'<div class="fdr-act"><span class="when">'+(i.done?'Clôturé':when(l))+'</span>'
     +(isAdmin()?'<button type="button" data-a="resend" data-id="'+esc(i.id)+'">Relancer</button><button type="button" data-a="done" data-id="'+esc(i.id)+'">'+(i.done?'Rouvrir':'Marquer clôturé')+'</button><button type="button" class="danger" data-a="del" data-id="'+esc(i.id)+'">Supprimer</button>':'')+'</div></div>';
  }).join(""):'<p style="color:var(--muted);margin-top:12px">Aucune échéance en cours.</p>';
  /* résumé affiché sur la barre fermée */
  var act=L.filter(function(i){return !i.done}),col=act.length?colorFor(daysLeft(act[0].due)):"var(--todo)";
  var m=$("fdrDlMeta"),t=$("fdrDlTag"),b=$("b-dl");
  if(m)m.textContent=act.length?act.length+" échéance"+(act.length>1?"s":"")+" en cours · prochaine : "+act[0].title:"Aucune échéance en cours";
  if(t){t.textContent=act.length?when(daysLeft(act[0].due)):"Aucune";t.style.setProperty("--c",col)}
  if(b)b.style.setProperty("--c",col);
}

/* ---------- Page « Feuille de route » ---------- */
function phaseStatus(p){var t=today();if(t<pd(p.start))return["À venir","var(--todo)"];if(t>pd(p.end))return["Terminée","var(--done)"];return["En cours","var(--doing)"]}
function render(){
  var t=today(),s=pd(START),e=pd(END),pct=Math.max(0,Math.min(100,Math.round((t-s)/(e-s)*100)));
  var wk=t<s?"Démarre dans "+Math.round((s-t)/864e5)+" jour(s)":t>e?"Période terminée":"Semaine "+Math.min(13,Math.floor((t-s)/(7*864e5))+1)+" sur 13";
  var h='<div class="fdr">'
  +'<div class="fdr-hero"><h2>Feuille de route marketing et développement commercial</h2><p>9 novembre 2026 – 5 février 2027 · Togo (Lomé) et Sénégal (Dakar) · Mangue séchée et gamme multi-produits</p>'
  +'<div class="fdr-prog"><div class="fdr-prog-top"><span>'+wk+'</span><span>'+pct+' % de la période écoulée</span></div><div class="fdr-barline"><i style="width:'+pct+'%"></i></div></div></div>'
  +'<div class="fdr-ctl"><button type="button" data-fdr-all="1">Tout déplier</button><button type="button" data-fdr-all="0">Tout replier</button></div>';

  /* Échéances et alertes */
  var form=isAdmin()?'<p style="margin:6px 0 4px"><b>Nouvelle échéance</b><br><small>Choisissez tout le monde ou des personnes précises : elles reçoivent l’alerte dans leur Messagerie.</small></p>'
    +'<div class="fdr-form"><label>Élément à clôturer<input id="fdrT" maxlength="120" placeholder="Ex. Base prospects consolidée" autocomplete="off"></label>'
    +'<label>Date de début<input type="date" id="fdrS" value="'+addDays(0)+'"></label><label>Date de clôture<input type="date" id="fdrD" value="'+addDays(15)+'"></label>'
    +'<label class="full">Destinataires<select id="fdrTarget"><option value="all">Tout le monde</option><option value="selected">Personnes précises</option></select><input id="fdrPeople" maxlength="1000" placeholder="Emails séparés par des virgules" autocomplete="off" style="display:none;margin-top:8px"></label>'
    +'<label class="full">Précision (facultatif)<textarea id="fdrN" rows="2" maxlength="400" placeholder="Ce qui est attendu, qui est concerné…"></textarea></label></div>'
    +'<div id="fdrErr" role="alert" style="color:#c0392b;min-height:1.2em;font-size:.88rem"></div>'
    +'<button type="button" class="p" id="fdrGo">Créer l\'échéance et alerter les inscrits</button>':'';
  var urgent=cache.some(function(i){return !i.done&&daysLeft(i.due)<=7});
  h+='<h3>Échéances et alertes</h3>'+bar("dl","Échéances et alertes","…","…","var(--todo)",form+'<div id="fdrDl"></div>',{open:urgent,metaId:"fdrDlMeta",tagId:"fdrDlTag"});

  /* Jalons */
  h+='<h3>Jalons</h3>'+JALONS.map(function(j,i){
    var l=daysLeft(j.date),c=l<0?"var(--done)":l<=14?"var(--doing)":"var(--todo)";
    return bar("j"+i,j.t,"Exécution : "+frl(j.date),"",c,'<p>'+esc(j.d)+'</p><p><b>Décision attendue :</b> '+esc(j.dec)+'</p>',{to:j.date});
  }).join("");

  /* Phases, avec séquences en sous-barres */
  h+='<h3>Déploiement par phase</h3>'+PHASES.map(function(p){
    var st=phaseStatus(p);
    var inner='<p>'+esc(p.goal)+'</p>'+p.seq.map(function(q,k){
      return bar("ph"+p.n+"s"+k,q.t,"Exécution : "+q.d,"",st[1],'<ul>'+q.a.map(function(x){return '<li>'+esc(x)+'</li>'}).join("")+'</ul><small><b>Livrables :</b> '+esc(q.l)+'</small>',{sub:true});
    }).join("");
    return bar("ph"+p.n,"Phase "+p.n+" · "+p.name,"Exécution : du "+frl(p.start)+" au "+frl(p.end),"",st[1],inner,{open:st[0]==="En cours",from:p.start,to:p.end});
  }).join("");

  /* Indicateurs et risques */
  h+='<h3>Pilotage et risques</h3>'
  +bar("kpi","Indicateurs de pilotage",KPIS.length+" indicateurs suivis par pays, segment et canal","",'var(--green)',
     '<div class="fdr-tbl"><table><thead><tr><th>Indicateur</th><th>Mode de calcul</th><th>Fréquence</th></tr></thead><tbody>'+KPIS.map(function(k){return '<tr><td><b>'+esc(k[0])+'</b></td><td>'+esc(k[1])+'</td><td>'+esc(k[2])+'</td></tr>'}).join("")+'</tbody></table></div><p class="fdr-note">Les cibles chiffrées sont fixées au jalon du 6 décembre 2026, à partir de la situation de départ réelle. Données ventilées par pays, jamais agrégées.</p>')
  +bar("risk","Risques et mesures de maîtrise",RISKS.length+" risques identifiés","",'var(--amber)',
     '<div class="fdr-tbl"><table><thead><tr><th>Risque</th><th>Mesure de maîtrise</th></tr></thead><tbody>'+RISKS.map(function(r){return '<tr><td><b>'+esc(r[0])+'</b></td><td>'+esc(r[1])+'</td></tr>'}).join("")+'</tbody></table></div>')
  +'</div>';
  var host=$("viewHost");host.innerHTML=h;host.onclick=onClick;
  var target=$("fdrTarget"), people=$("fdrPeople");
  if(target&&people)target.onchange=function(){people.style.display=target.value==="selected"?"":"none";if(target.value==="selected")people.focus();};
  drawBanner(cache);drawList();tick();
}

async function onClick(e){
  /* déplier / replier une barre */
  var hd=e.target.closest(".fdr-head");
  if(hd){
    var br=hd.parentNode,op=br.classList.toggle("open");
    hd.setAttribute("aria-expanded",op);openSet[br.id.slice(2)]=op;return;
  }
  var all=e.target.closest("[data-fdr-all]");
  if(all){
    var o=all.dataset.fdrAll==="1";
    $("viewHost").querySelectorAll(".fdr-bar").forEach(function(b){b.classList.toggle("open",o);b.querySelector(".fdr-head").setAttribute("aria-expanded",o);openSet[b.id.slice(2)]=o});
    return;
  }
  var b=e.target.closest("button");if(!b)return;
  if(b.dataset.fdr==="dis"){sset("fdr_dis_"+b.dataset.id,"1");drawBanner(cache);return}
  if(!isAdmin())return;
  try{
    if(b.id==="fdrGo"){
      var title=$("fdrT").value.trim(),start=$("fdrS").value,due=$("fdrD").value,note=$("fdrN").value.trim(),err=$("fdrErr");
      if(!title||!due){err.textContent="Indiquez l'élément à clôturer et la date de clôture.";return}
      if(daysLeft(due)<0){err.textContent="La date de clôture est déjà passée.";return}
      if(start&&start>due){err.textContent="La date de début doit être avant la date de clôture.";return}
      err.textContent="";b.disabled=true;
      var all=await recipients(),mode=$("fdrTarget").value,entered=$("fdrPeople").value.trim().toLowerCase();
      var requested=entered?entered.split(",").map(function(v){return v.trim()}).filter(Boolean):[];
      var rec=mode==="all"?all:all.filter(function(email){return requested.indexOf(email)>=0});
      if(mode==="selected"&&(!requested.length||rec.length!==requested.length)){err.textContent="Indiquez uniquement les adresses de comptes AfriFloW inscrits.";b.disabled=false;return}
      if(!rec.length){err.textContent="Aucun autre compte inscrit pour le moment.";b.disabled=false;return}
      if(!confirm("Envoyer l'alerte « "+title+" » (clôture "+when(daysLeft(due))+") à "+rec.length+" inscrit(s) ?")){b.disabled=false;return}
      var it={id:uid(),title:title,start:start,due:due,note:note,created:Date.now()};
      await notify(it,rec);
      await saveDl(cache.concat([it]));
      toast("Alerte envoyée à "+rec.length+" inscrit(s).");
      render();
      return;
    }
    var id=b.dataset.id,a=b.dataset.a,it2=cache.filter(function(x){return x.id===id})[0];if(!it2)return;
    if(a==="resend"){
      var r2=await recipients();
      if(r2.length&&confirm("Relancer « "+it2.title+" » auprès de "+r2.length+" inscrit(s) ?")){await notify(it2,r2);await saveDl(cache.slice());toast("Relance envoyée.");drawList()}
    }else if(a==="done"){it2.done=!it2.done;await saveDl(cache.slice());drawBanner(cache);drawList()}
    else if(a==="del"&&confirm("Supprimer cette échéance ? Les messages déjà envoyés restent dans les boîtes de réception.")){await saveDl(cache.filter(function(x){return x.id!==id}));drawBanner(cache);drawList()}
  }catch(x){
    toast("Action impossible : "+(x&&x.message||x));
    var g=$("fdrGo");if(g)g.disabled=false;
  }
}

/* ---------- Ouverture de la page + entrée de menu ---------- */
function renderDeadlinePage(){
  var form=isAdmin()?'<p style="margin:6px 0 4px"><b>Nouvelle échéance</b><br><small>Choisissez tout le monde ou des personnes précises : elles reçoivent l’alerte dans leur Messagerie.</small></p>'
    +'<div class="fdr-form"><label>Élément à clôturer<input id="fdrT" maxlength="120" placeholder="Ex. Base prospects consolidée" autocomplete="off"></label>'
    +'<label>Date de début<input type="date" id="fdrS" value="'+addDays(0)+'"></label><label>Date de clôture<input type="date" id="fdrD" value="'+addDays(15)+'"></label>'
    +'<label class="full">Destinataires<select id="fdrTarget"><option value="all">Tout le monde</option><option value="selected">Personnes précises</option></select><input id="fdrPeople" maxlength="1000" placeholder="Emails séparés par des virgules" autocomplete="off" style="display:none;margin-top:8px"></label>'
    +'<label class="full">Précision (facultatif)<textarea id="fdrN" rows="2" maxlength="400" placeholder="Ce qui est attendu, qui est concerné…"></textarea></label></div>'
    +'<div id="fdrErr" role="alert" style="color:#c0392b;min-height:1.2em;font-size:.88rem"></div>'
    +'<button type="button" class="p" id="fdrGo">Créer l\'échéance et alerter les inscrits</button>':'';
  var urgent=cache.some(function(i){return !i.done&&daysLeft(i.due)<=7});
  $("viewHost").innerHTML='<div class="fdr"><div class="fdr-hero"><h2>Échéances et alertes</h2><p>Suivez les actions à venir et les rappels AfriFloW.</p></div>'+bar("dl","Échéances et alertes","…","…","var(--todo)",form+'<div id="fdrDl"></div>',{open:urgent,metaId:"fdrDlMeta",tagId:"fdrDlTag"})+'</div>';
  $("viewHost").onclick=onClick;
  var target=$("fdrTarget"),people=$("fdrPeople");if(target&&people)target.onchange=function(){people.style.display=target.value==="selected"?"":"none";if(target.value==="selected")people.focus();};
  drawBanner(cache);drawList();tick();
}
async function openPage(){
  var home=document.querySelector('#navList .nv[data-id="home"]');
  if(home)home.click();            /* laisse le site nettoyer la vue précédente */
  active=true;
  $("view-home").style.display="none";$("viewHost").style.display="";
  var sc=$("scrim");if(sc&&sc.classList.contains("on"))sc.click();
  renderDeadlinePage();window.scrollTo(0,0);markNav();
  if(window.AFRI)window.AFRI.page("Échéances et alertes");
  refreshBanner();
}
function markNav(){
  var nl=$("navList");if(!nl)return;
  nl.querySelectorAll(".nv").forEach(function(b){b.classList.toggle("on",active?b.hasAttribute("data-fdr-nav"):b.classList.contains("on"))});
}
function inject(){
  var nl=$("navList");if(!nl||nl.querySelector("[data-fdr-nav]")||!nl.firstElementChild)return;
  var row=document.createElement("div");row.className="nvr";
  row.innerHTML='<button type="button" class="nv" data-fdr-nav="1">Échéances et alertes</button>';
  /* Marketplace reste premier, puis Accueil ; les alertes suivent dans le menu. */
  var homeRow=nl.querySelector('.nv[data-id="home"]');
  (homeRow?homeRow.parentNode:nl.firstElementChild).after(row);
  markNav();
}
var nl0=$("navList");
if(nl0){
  new MutationObserver(inject).observe(nl0,{childList:true});
  nl0.addEventListener("click",function(e){
    var b=e.target.closest("button");if(!b)return;
    if(b.hasAttribute("data-fdr-nav"))openPage();else if(!b.hasAttribute("data-fdr-ren"))active=false;
  });
  inject();
}

/* ---------- Démarrage : à chaque connexion + rafraîchissement ---------- */
var prev=window.onRole;
window.onRole=function(){if(prev)prev();setTimeout(refreshBanner,1200)};
setInterval(function(){if(me())refreshBanner();else drawBanner([])},90000);
setInterval(tick,20000);
if(me())setTimeout(refreshBanner,1500);
})();
