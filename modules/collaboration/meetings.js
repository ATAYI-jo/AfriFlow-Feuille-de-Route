
(function(){
"use strict";
var CFG="pub:meetcfg", PRE="meet:", ATT="att:", OPEN_BEFORE=15*6e4;
var cfg={link:"",censeurs:[]}, meets=[], atts={}, active=false;

function $(i){return document.getElementById(i)}
function SB(){return window.__sb} function TB(){return window.__TABLE||"afriflow_state"}
function me(){return String(window.loggedUserEmail||"").toLowerCase()}
function isAdmin(){return window.USER_ROLE==="admin"}
function isCens(){return isAdmin()||(cfg.censeurs||[]).indexOf(me())>-1}
function invited(m,email){
  if(!m||!Array.isArray(m.invitees))return true; // Older/all-member meetings.
  return m.invitees.some(function(v){return String(v).trim().toLowerCase()===String(email).trim().toLowerCase()});
}
function visibleMeeting(m){return isAdmin()||isCens()||invited(m,me())}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function inviteeAvatar(u){
  var value=String(u.avatar_value||""),src="";
  if(u.avatar_kind==="photo"&&/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(value))src=value;
  else{
    var c={seed:value||u.user_id||u.email||"afriflow"};
    try{var obj=JSON.parse(value);if(obj&&typeof obj.seed==="string")c=obj}catch(e){}
    var q=new URLSearchParams();q.set("seed",String(c.seed||"afriflow"));
    if(c.v===1){
      if(/^variant\d{2}$/.test(c.hairVariant||""))q.set("hairVariant",c.hairVariant);
      ["hairColor","skinColor","backgroundColor"].forEach(function(k){
        if(/^[0-9a-f]{6}$/i.test(String(c[k]||"")))q.set(k,c[k]);
      });
      if(c.glasses){q.set("glassesProbability","100");q.set("glassesVariant","variant01")}
      if(c.earrings){q.set("earringsProbability","100");q.set("earringsVariant","variant01")}
      if(c.flowers){q.set("hairAccessoriesProbability","100");q.set("hairAccessoriesVariant","flowers")}
      if(c.flip)q.set("flip","horizontal");
    }
    src="https://api.dicebear.com/10.x/lorelei/svg?"+q.toString();
  }
  return '<img src="'+esc(src)+'" alt="" loading="lazy" referrerpolicy="no-referrer" style="width:48px;height:48px;border-radius:50%;object-fit:cover;flex:none;background:#e8f2ec;border:1px solid rgba(20,75,51,.18)">';
}
function inviteeCard(u){
  var name=u.name||u.display_name||[u.first_name,u.last_name].filter(Boolean).join(" ")||u.email;
  var role=[u.job_title,u.department].filter(Boolean).join(" · ")||"Poste non renseigné";
  return '<label style="display:flex;align-items:center;gap:11px;padding:12px;border:1px solid rgba(20,75,51,.2);border-radius:14px;background:rgba(255,255,255,.76);min-width:0;cursor:pointer">'
    +'<input type="checkbox" data-cs-invite="'+esc(String(u.email).toLowerCase())+'" style="width:18px;height:18px;flex:none;accent-color:#14633f">'
    +inviteeAvatar(u)
    +'<span style="min-width:0;display:flex;flex-direction:column;gap:3px"><strong style="font-size:.91rem;overflow-wrap:anywhere;color:#193d2b">'+esc(name)+'</strong>'
    +'<small style="font-size:.79rem;color:#456152;overflow-wrap:anywhere">'+esc(role)+'</small></span></label>';
}
function toast(m){(window.toast||alert)(m)}
function okUrl(u){return /^https:\/\/[^\s"'<>]+$/i.test(u||"")}
function uid(){return "m"+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36)}
function fdt(ms){return new Date(ms).toLocaleString("fr-FR",{weekday:"long",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"})}
function fh(ms){return new Date(ms).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}
function pad(n){return ("0"+n).slice(-2)}

/* ---------- Lecture des données ---------- */
async function load(){
  if(!SB()||!me())return;
  var a=await SB().from(TB()).select("value").eq("key",CFG).maybeSingle();
  if(!a.error&&a.data&&a.data.value){cfg=a.data.value;cfg.censeurs=(cfg.censeurs||[]).map(function(x){return String(x).toLowerCase()})}
  var r=await SB().from(TB()).select("key,value").like("key",PRE+"%").limit(300);
  if(!r.error)meets=(r.data||[]).map(function(x){return x.value}).filter(function(v){return v&&v.start&&visibleMeeting(v)}).sort(function(x,y){return x.start-y.start});
  var q=SB().from(TB()).select("key,value").like("key",isCens()?ATT+"m%":ATT+"m%:"+me()).limit(5000);
  var t=await q; atts={};
  if(!t.error)(t.data||[]).forEach(function(x){atts[x.key]=x.value});
}

/* ---------- Réunion en cours / prochaine ---------- */
function pick(){
  var n=Date.now();
  var cur=meets.filter(function(m){return n>=m.start-OPEN_BEFORE&&n<=m.start+m.dur*6e4});
  if(cur.length)return {m:cur[0],live:true};
  var nx=meets.filter(function(m){return m.start>n})[0];
  return nx?{m:nx,live:false}:null;
}
function statut(m,rec){
  var n=Date.now(),end=m.start+m.dur*6e4;
  if(rec){
    if(rec.at<=m.start+m.grace*6e4)return {k:"ok",t:"Présent"};
    return {k:"late",t:"Retard (+"+Math.max(1,Math.round((rec.at-m.start)/6e4))+" min)"};
  }
  if(n>end)return {k:"abs",t:"Absent"};
  return {k:"wait",t:n<m.start?"À venir":"En attente"};
}

/* ---------- Carte « Réunion » sur l'accueil ---------- */
var ICON='<svg viewBox="0 0 48 48" width="54" height="54" aria-hidden="true"><defs><linearGradient id="mtg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7b83eb"/><stop offset="1" stop-color="#4b53bc"/></linearGradient></defs><rect width="48" height="48" rx="13" fill="url(#mtg)"/><rect x="8" y="15" width="21" height="18" rx="4" fill="#fff"/><path d="M31 21.5l9-5v15l-9-5z" fill="#fff" opacity=".92"/><circle cx="18.5" cy="21.4" r="2.7" fill="#5b5fc7"/><path d="M13 30a5.5 5.5 0 0 1 11 0z" fill="#5b5fc7"/></svg>';
function drawCard(){
  var host=$("meetCard");
  if(!host){
    var br=document.querySelector("#view-home .brand");if(!br)return;
    host=document.createElement("div");host.id="meetCard";br.after(host);
  }
  if(!me()){host.innerHTML="";return}
  var p=pick(),link=(p&&p.m.link)||cfg.link,sub;
  if(p&&p.live)sub='<span class="mt-dot"></span>En cours : '+esc(p.m.title)+' · '+fh(p.m.start)+' – '+fh(p.m.start+p.m.dur*6e4)+(atts[ATT+p.m.id+":"+me()]?' · votre présence est enregistrée':'');
  else if(p)sub='Prochaine réunion : '+esc(p.m.title)+' · '+fdt(p.m.start);
  else sub=cfg.link?'Aucune réunion programmée · lien disponible':'Aucune réunion programmée';
  host.innerHTML='<a class="mt-card'+(p&&p.live?' live':'')+'" id="meetGo" href="'+(okUrl(link)?esc(link):'#')+'" target="_blank" rel="noopener noreferrer">'
    +ICON+'<span class="mt-txt"><b>Réunion en ligne</b><small>'+sub+'</small></span><span class="mt-btn">Rejoindre</span></a>';
}
document.addEventListener("click",async function(e){
  var a=e.target.closest("#meetGo");if(!a)return;
  e.preventDefault();
  if(!okUrl(a.getAttribute("href"))){
    toast(isAdmin()?"Aucun lien : renseignez-le dans Administration › Réunion en ligne.":"Le lien de la réunion n'a pas encore été configuré.");
    return;
  }
  // Open synchronously within the user gesture. Waiting for Supabase first
  // would make Safari/Chrome mobile block the Teams tab as a popup.
  var target=a.href,tab=window.open("about:blank","_blank");
  if(!tab){toast("Autorisez l’ouverture des fenêtres pour rejoindre Teams.");return;}
  try{tab.opener=null;}catch(ignore){}
  var p=pick();
  if(p&&p.live){
    var saved=await mark(p.m);
    if(!saved){try{tab.close()}catch(ignore){}return}
  }else if(p){toast("La présence sera comptabilisée à partir de 15 minutes avant le début de la réunion.");}
  try{tab.location.replace(target)}catch(error){
    try{tab.close()}catch(ignore){}
    toast("Impossible d’ouvrir Teams. Réessayez depuis le lien de la réunion.");
  }
});
async function mark(m){
  if(!me()||!SB()||!invited(m,me())&&!isAdmin())return false;
  var k=ATT+m.id+":"+me();
  if(atts[k])return true; // First attendance is permanent.
  try{
    var result=await SB().functions.invoke("afriflow-meeting-checkin",{body:{meetingId:m.id}});
    if(result.error){
      var message=result.error.message||"Pointage impossible";
      try{var details=await result.error.context.json();message=details.error||message}catch(ignore){}
      toast("Présence non enregistrée : "+message);return false;
    }
    if(!result.data||!result.data.ok||!result.data.record)return false;
    atts[k]=result.data.record;
    if(typeof window.recordUserAction==="function")window.recordUserAction("Premier clic d'accès à la réunion : "+m.title);
    drawCard();toast("Premier clic enregistré. La participation réelle à Teams doit être vérifiée séparément.");
    return true;
  }catch(error){toast("Présence non enregistrée : "+(error.message||error));return false}
}

/* ---------- Réglage admin (dans la page Administration) ---------- */
function injectAdmin(){
  var ad=$("adOn");if(!isAdmin()||!ad||$("mtAdmin"))return;
  var b=document.createElement("div");b.id="mtAdmin";b.className="mt-adm";
  b.innerHTML='<h3>Réunion en ligne (Teams)</h3>'
   +'<div class="mt-grid" style="grid-template-columns:1fr"><label>Lien de la réunion (https://…)<input id="mtLink" placeholder="https://teams.microsoft.com/l/meetup-join/…" autocomplete="off"></label>'
   +'<label>Censeur(s) — adresses email séparées par des virgules<input id="mtCens" placeholder="prenom@exemple.com, autre@exemple.com" autocomplete="off"></label></div>'
   +'<div class="mt-err" id="mtAErr" role="alert"></div><button type="button" class="p" id="mtASave">Enregistrer</button>';
  ad.before(b);
  $("mtLink").value=cfg.link||"";$("mtCens").value=(cfg.censeurs||[]).join(", ");
  $("mtASave").onclick=async function(){
    var l=$("mtLink").value.trim(),c=$("mtCens").value.split(/[,;\s]+/).map(function(x){return x.trim().toLowerCase()}).filter(Boolean),er=$("mtAErr");
    if(l&&!okUrl(l)){er.textContent="Le lien doit commencer par https://";return}
    er.textContent="";
    var r=await SB().from(TB()).upsert({key:CFG,value:{link:l,censeurs:c,at:Date.now(),by:me()},updated_at:new Date().toISOString()});
    if(r.error){er.textContent="Enregistrement impossible : "+(r.error.message||r.error);return}
    cfg={link:l,censeurs:c};toast("Réunion en ligne enregistrée.");drawCard();inject();
  };
}

/* ---------- Page « Censeur » ---------- */
function mark2(){var nl=$("navList");if(nl)nl.querySelectorAll(".nv").forEach(function(b){b.classList.toggle("on",b.hasAttribute("data-cs-nav"))})}
window.afRelinkDropbox=async function(index){
 if(window.USER_ROLE!=="admin"){toast("Seul l'administrateur peut réassocier un fichier.");return}
 window.__afRelinkIndex=index;
 await openPage();
 browse("");
 setTimeout(function(){var b=$("dvBrowser");if(b)b.scrollIntoView({behavior:"smooth",block:"start"})},300);
};
async function openPage(){
  var home=document.querySelector('#navList .nv[data-id="home"]');if(home)home.click();
  active=true;$("view-home").style.display="none";$("viewHost").style.display="";
  var sc=$("scrim");if(sc&&sc.classList.contains("on"))sc.click();
  $("viewHost").innerHTML='<div class="toolbar"><b>Censeur</b></div><p style="color:var(--muted)">Chargement…</p>';
  mark2();window.scrollTo(0,0);if(window.AFRI)window.AFRI.page("Censeur");
  try{await load()}catch(e){}
  if(active)render();
}
async function render(){
  var host=$("viewHost");if(!active||!host)return;
  var U=[],memberLoadError="";
  try{
    // Directory records can outlive membership. Use current registrations
    // as the source of truth for meeting invitations and attendance.
    var registered=window.AFRI?(await window.AFRI.listUsers()):[];
    var allowed=new Map();
    (registered||[]).forEach(function(u){
      if(u&&u.email)allowed.set(String(u.email).trim().toLowerCase(),u);
    });
    var directory=window.AFRI?(await window.AFRI.listMembers()):[];
    var seen=new Set();
    (directory||[]).forEach(function(u){
      var email=u&&u.email&&String(u.email).trim().toLowerCase();
      if(email&&allowed.has(email)&&!seen.has(email)){U.push(u);seen.add(email)}
    });
    // Include registered users who have not completed their profile yet.
    allowed.forEach(function(u,email){
      if(!seen.has(email)){U.push(u);seen.add(email)}
    });
  }catch(e){
    memberLoadError="Impossible de vérifier les comptes inscrits. Actualisez avant de programmer une réunion.";
  }
  if(!active)return;
  var d=new Date(),dd=d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
  var h='<div class="toolbar"><b>Censeur</b><div class="toolbar-actions"><button type="button" id="csRef">Actualiser</button></div></div>'
   +'<div class="mt-box"><h3>Programmer une réunion</h3><div class="mt-grid">'
   +'<label class="full">Intitulé<input id="csT" maxlength="100" placeholder="Ex. Point hebdomadaire" autocomplete="off"></label>'
   +'<label>Date<input type="date" id="csD" value="'+dd+'"></label><label>Heure de début<input type="time" id="csH" value="14:00"></label>'
   +'<label>Durée (min)<input type="number" id="csU" value="60" min="5" max="600"></label>'
   +'<label>Tolérance avant « retard » (min)<input type="number" id="csG" value="5" min="0" max="120"></label>'
   +'<label class="full">Lien propre à cette réunion (facultatif, sinon lien général)<input id="csL" placeholder="https://…" autocomplete="off"></label>'
   +'<label class="full">Destinataires<select id="csAudience"><option value="all">Tous les membres du Journal de Bord</option><option value="selected">Membres sélectionnés uniquement</option></select></label>'
   +'<div class="full" id="csPeople" hidden><p>Choisissez les personnes invitées. Seuls leurs comptes pourront pointer leur présence.</p>'
   +'<div class="mt-grid" style="max-height:300px;overflow:auto;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:10px;padding:4px">'+U.filter(function(u){return u&&u.email}).map(inviteeCard).join("")+'</div></div></div>'
   +'<div class="mt-err" id="csErr" role="alert"></div><button type="button" class="p" id="csGo">Programmer</button>'
   +'<p style="color:var(--muted);font-size:.85rem;margin:12px 0 0">Le premier clic sur « Rejoindre » est enregistré côté serveur de 15 min avant le début à la fin de la réunion. Cela mesure le pointage, et non la durée de participation à Teams.</p></div>';
  var L=meets.slice().sort(function(a,b){return b.start-a.start});
  h+='<h3 style="color:var(--green)">Réunions et présences</h3>'+(L.length?L.map(function(m){
    var emails={};U.forEach(function(u){if(u&&u.email)emails[String(u.email).toLowerCase()]=u.name||""});
    Object.keys(atts).forEach(function(k){var v=atts[k];if(v&&v.meet===m.id&&v.email&&!(v.email in emails))emails[v.email]=v.name||""});
    var rows=Object.keys(emails).filter(function(em){return invited(m,em)}).sort().map(function(em){var rec=atts[ATT+m.id+":"+em],s=statut(m,rec);return {em:em,nm:emails[em],rec:rec,s:s}});
    var c={ok:0,late:0,abs:0,wait:0};rows.forEach(function(r){c[r.s.k]++});
    return '<details class="mt-m"><summary><b>'+esc(m.title)+'</b><small>'+fdt(m.start)+' · '+m.dur+' min</small>'
     +'<span class="mt-sum"><span class="mt-pill mt-ok">'+c.ok+' présent(s)</span><span class="mt-pill mt-late">'+c.late+' retard(s)</span><span class="mt-pill mt-abs">'+c.abs+' absent(s)</span>'+(c.wait?'<span class="mt-pill mt-wait">'+c.wait+' en attente</span>':'')+'</span></summary>'
     +'<div class="mt-body"><div class="mt-tw"><table><thead><tr><th>Nom</th><th>Email</th><th>Statut</th><th>Clic à</th></tr></thead><tbody>'
     +(rows.length?rows.map(function(r){return '<tr><td>'+esc(r.nm||"—")+'</td><td>'+esc(r.em)+'</td><td><span class="mt-pill mt-'+(r.s.k==="ok"?"ok":r.s.k==="late"?"late":r.s.k==="abs"?"abs":"wait")+'">'+esc(r.s.t)+'</span></td><td>'+(r.rec?fh(r.rec.at):"—")+'</td></tr>'}).join(""):'<tr><td colspan="4" style="color:var(--muted)">Aucun compte à afficher.</td></tr>')
     +'</tbody></table></div><p style="margin:14px 0 0"><button type="button" class="danger" data-csdel="'+esc(m.id)+'">Supprimer cette réunion</button></p></div></details>';
  }).join(""):'<p style="color:var(--muted)">Aucune réunion programmée.</p>');
  if(memberLoadError)h='<p role="alert" class="mt-err">'+esc(memberLoadError)+'</p>'+h;
  host.innerHTML=h;host.onclick=onClick;
  var createButton=$("csGo");if(createButton&&memberLoadError)createButton.disabled=true;
  var audience=$("csAudience"),people=$("csPeople");
  if(audience&&people)audience.onchange=function(){people.hidden=audience.value!=="selected"};
}
async function onClick(e){
  var b=e.target.closest("button");if(!b)return;
  try{
    if(b.id==="csRef"){await load();render();return}
    if(b.id==="csGo"){
      var t=$("csT").value.trim(),d=$("csD").value,hh=$("csH").value,du=+$("csU").value,g=+$("csG").value,l=$("csL").value.trim(),er=$("csErr");
      if(!t||!d||!hh){er.textContent="Indiquez l'intitulé, la date et l'heure.";return}
      if(!(du>=5)){er.textContent="Durée invalide.";return}
      if(l&&!okUrl(l)){er.textContent="Le lien doit commencer par https://";return}
      var st=new Date(d+"T"+hh).getTime();if(isNaN(st)){er.textContent="Date ou heure invalide.";return}
      if(st+du*6e4<Date.now()){er.textContent="Cette réunion est déjà terminée.";return}
      er.textContent="";b.disabled=true;
      var selected=$("csAudience")&&$("csAudience").value==="selected";
      var invitees=selected?Array.from(document.querySelectorAll("[data-cs-invite]:checked")).map(function(x){return x.dataset.csInvite}):null;
      if(selected&&!invitees.length){er.textContent="Sélectionnez au moins une personne invitée.";return}
      var m={id:uid(),title:t,start:st,dur:du,grace:g>=0?g:5,link:l,invitees:invitees,by:me(),created:Date.now()};
      var r=await SB().from(TB()).upsert({key:PRE+m.id,value:m,updated_at:new Date().toISOString()});
      b.disabled=false;
      if(r.error){er.textContent="Enregistrement impossible : "+(r.error.message||r.error);return}
      meets.push(m);meets.sort(function(x,y){return x.start-y.start});toast("Réunion programmée.");drawCard();render();return;
    }
    if(b.dataset.csdel&&confirm("Supprimer cette réunion et ses présences ?")){
      var id=b.dataset.csdel;
      await SB().from(TB()).delete().eq("key",PRE+id);
      try{await SB().from(TB()).delete().like("key",ATT+id+":%")}catch(x){}
      meets=meets.filter(function(x){return x.id!==id});Object.keys(atts).forEach(function(k){if(k.indexOf(ATT+id+":")===0)delete atts[k]});
      drawCard();render();
    }
  }catch(x){toast("Action impossible : "+(x&&x.message||x))}
}

/* ---------- Onglet « Censeur » dans le menu ---------- */
function inject(){
  var nl=$("navList");if(!nl||!nl.firstElementChild)return;
  var has=nl.querySelector("[data-cs-nav]");
  if(!isCens()){if(has)has.parentNode.remove();return}
  if(has)return;
  var row=document.createElement("div");row.className="nvr";
  row.innerHTML='<button type="button" class="nv" data-cs-nav="1">Censeur</button>';
  var f=nl.querySelector("[data-fdr-nav]");(f?f.parentNode:nl.firstElementChild).after(row);
  if(active)mark2();
}
var nl0=$("navList");
if(nl0){
  new MutationObserver(inject).observe(nl0,{childList:true});
  nl0.addEventListener("click",function(e){
    var b=e.target.closest("button");if(!b)return;
    if(b.hasAttribute("data-cs-nav"))openPage();else if(!b.hasAttribute("data-fdr-ren"))active=false;
  });
}
var vh=$("viewHost");if(vh)new MutationObserver(injectAdmin).observe(vh,{childList:true});

/* ---------- Démarrage ---------- */
function refresh(){if(!me()){drawCard();return}load().then(function(){inject();drawCard();injectAdmin();if(active)render()}).catch(function(){})}
var prev=window.onRole;
window.onRole=function(){if(prev)prev();setTimeout(refresh,1300)};
setInterval(function(){if(me())refresh();else drawCard()},60000);
setInterval(function(){if(me())drawCard()},30000);
if(me())setTimeout(refresh,1500);
})();
