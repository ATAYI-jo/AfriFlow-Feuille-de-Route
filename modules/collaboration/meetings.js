
(function(){
"use strict";
var CFG="pub:meetcfg", PRE="meet:", ATT="att:", OPEN_BEFORE=15*6e4;
var cfg={link:"",censeurs:[]},cfgFor="", meets=[], atts={}, active=false,pageGeneration=0;
var attendanceData=null,loadError="",loadSequence=0,dataFor="",roster=[],joining=new Set(),pendingMeeting="",pendingSource="push",previewBusy=false;

function $(i){return document.getElementById(i)}
function SB(){return window.__sb} function TB(){return window.__TABLE||"afriflow_state"}
function me(){return String(window.loggedUserEmail||"").toLowerCase()}
function isAdmin(){return window.USER_ROLE==="admin"}
function isCens(){return isAdmin()||(cfg.censeurs||[]).indexOf(me())>-1}
window.AfriCensorAccess=function(){return isAdmin()?true:(me()&&cfgFor===me()?isCens():null)};
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
function okUrl(u){try{var url=new URL(u);return url.protocol==="https:"&&!url.username&&!url.password&&["teams.microsoft.com","teams.live.com","teams.microsoft.us"].indexOf(url.hostname)>-1}catch(e){return false}}
function validId(id){return /^m[a-z0-9]{5,35}$/.test(String(id||""))}
function uid(){return "m"+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36)}
function fdt(ms){return new Date(ms).toLocaleString("fr-FR",{weekday:"long",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"})}
function fh(ms){return new Date(ms).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}
function pad(n){return ("0"+n).slice(-2)}

/* ---------- Lecture des données ---------- */
async function load(){
  if(!SB()||!me())return;
  var email=me(),sequence=++loadSequence;
  if(dataFor!==email){meets=[];atts={};attendanceData=null;dataFor=email;loadError="";}
  try{
    var a=await SB().from(TB()).select("value").eq("key",CFG).maybeSingle();
    if(email!==me()||sequence!==loadSequence)return;
    if(a.error)throw a.error;
    cfg=a.data&&a.data.value||{link:"",censeurs:[]};cfg.censeurs=(cfg.censeurs||[]).map(function(x){return String(x).toLowerCase()});cfgFor=email;
    var responses=await Promise.all([
      SB().from(TB()).select("key,value").like("key",PRE+"%").order("key").limit(300),
      readPointages(isCens()?ATT+"m%":ATT+"m%:"+email),
      window.AfriAttendance.load()
    ]);
    if(email!==me()||sequence!==loadSequence)return;
    if(responses[0].error)throw responses[0].error;
    var nextAtts={};responses[1].forEach(function(x){nextAtts[x.key]=x.value});
    meets=(responses[0].data||[]).map(function(x){return x.value}).filter(function(v){return v&&v.start&&visibleMeeting(v)}).sort(function(x,y){return x.start-y.start});
    atts=nextAtts;attendanceData=responses[2];loadError="";
  }catch(error){
    if(email===me()&&sequence===loadSequence)loadError="Les présences ne peuvent pas être vérifiées pour le moment. Actualisez pour réessayer.";
    throw error;
  }
}
async function readPointages(pattern){
  var rows=[],offset=0;
  while(true){var result=await SB().from(TB()).select("key,value").like("key",pattern).order("key").range(offset,offset+499);
    if(result.error)throw result.error;
    rows=rows.concat(result.data||[]);if(!result.data||result.data.length<500)return rows;offset+=500;
  }
}

/* ---------- Réunion en cours / prochaine ---------- */
function pick(){
  var n=Date.now();
  var cur=meets.filter(function(m){return n>=m.start-OPEN_BEFORE&&n<=m.start+m.dur*6e4});
  if(cur.length)return {m:cur[0],live:true};
  var nx=meets.filter(function(m){return m.start>n})[0];
  return nx?{m:nx,live:false}:null;
}
function statut(m,rec,email){
  var context=window.AfriAttendance.context(attendanceData,m.id,email);
  if(loadError)context.unavailable=true;
  return window.AfriAttendance.status(m,rec,context);
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
  if(p&&p.live)sub='<span class="mt-dot"></span>'+(Date.now()<p.m.start?'Ouverture du pointage : ':'En cours : ')+esc(p.m.title)+' · '+fh(p.m.start)+' – '+fh(p.m.start+p.m.dur*6e4)+(atts[ATT+p.m.id+":"+me()]?' · pointage enregistré':'');
  else if(p)sub='Prochaine réunion : '+esc(p.m.title)+' · '+fdt(p.m.start);
  else sub=cfg.link?'Aucune réunion programmée · lien disponible':'Aucune réunion programmée';
  host.innerHTML='<a class="mt-card'+(p&&p.live?' live':'')+'" id="meetGo" data-meeting="'+(p?esc(p.m.id):'')+'" href="'+(p?'?meeting='+encodeURIComponent(p.m.id):'#')+'">'
    +ICON+'<span class="mt-txt"><b>Réunion en ligne</b><small>'+sub+'</small></span><span class="mt-btn">Rejoindre</span></a>';
}
// Every AfriFlow entry point uses the same authenticated, server-timed join.
// Opening an invitation never creates an attendance record.
async function joinMeeting(id,options){
  options=options||{};
  if(!validId(id)||!me()||!SB())return {ok:false,error:"Connectez-vous pour rejoindre cette réunion."};
  if(joining.has(id))return {ok:false,error:"Le pointage est déjà en cours. Patientez un instant."};
  var account=me(),tab=null,nativeOpen=window.AfriFlowNative&&typeof window.AfriFlowNative.openTeams==="function";
  var android=window.AfriFlowAndroid&&typeof window.AfriFlowAndroid.postMessage==="function";
  // Browser popup must be created in the direct click, before asynchronous auth.
  if(!nativeOpen&&!android){
    tab=window.open("about:blank","_blank");
    if(!tab)return {ok:false,error:"Autorisez l’ouverture d’un onglet pour rejoindre Teams, puis réessayez."};
    try{tab.opener=null;tab.document.title="Ouverture de la réunion";tab.document.body.textContent="Enregistrement du pointage AfriFlow…"}catch(ignore){}
  }
  joining.add(id);
  try{
    var result=await mark(id,options.source||"home");
    if(account!==me())throw new Error("La session a changé. Reconnectez-vous avant de rejoindre la réunion.");
    var target=result.meeting&&result.meeting.link;
    if(!okUrl(target))throw new Error("Le lien Teams de cette réunion est indisponible.");
    if(nativeOpen){
      var opened=await window.AfriFlowNative.openTeams(target);
      if(!opened||!opened.ok)throw new Error("Pointage conservé, mais Teams n’a pas pu s’ouvrir. Réessayez.");
    }else if(android){
      // The Android WebView intercepts this external URL and launches Teams.
      window.location.assign(target);
    }else{tab.location.replace(target);}
    drawCard();toast("Pointage enregistré à "+fh(result.record.at)+". La participation à Teams reste à vérifier séparément.");
    return {ok:true,record:result.record};
  }catch(error){
    if(tab)try{tab.close()}catch(ignore){}
    return {ok:false,error:error.message||"Pointage indisponible. Réessayez."};
  }finally{joining.delete(id);}
}
async function mark(id,source){
  var email=me();
  // Always ask the server, even for repeat clicks and a wrong device clock.
  var result=await SB().functions.invoke("afriflow-meeting-checkin",{body:{meetingId:id,source:source}});
  if(result.error){
    var message=result.error.message||"Pointage impossible";
    try{var details=await result.error.context.json();message=details.error||message}catch(ignore){}
    throw new Error(message);
  }
  if(!result.data||!result.data.ok||!result.data.record)throw new Error("Le pointage n’a pas été confirmé. Réessayez.");
  if(email!==me())throw new Error("La session a changé.");
  atts[ATT+id+":"+email]=result.data.record;
  return result.data;
}
document.addEventListener("click",async function(e){
  var button=e.target.closest("#meetGo");if(!button)return;e.preventDefault();
  var id=button.dataset.meeting;
  if(!validId(id)){toast("Aucune réunion programmée à rejoindre pour le moment.");return;}
  var result=await joinMeeting(id,{source:"home"});if(!result.ok)toast(result.error);
});
async function resolveMeeting(id){
  if(!validId(id)||!SB()||!me())throw new Error("Connectez-vous pour consulter cette invitation.");
  var email=me(),response=await SB().rpc("af_meeting_preview",{p_meeting_id:id});
  if(email!==me())throw new Error("La session a changé.");
  if(response.error)throw response.error;
  var m=response.data&&response.data.meeting;
  if(!m||m.id!==id)throw new Error("Cette réunion est indisponible ou votre compte n’est pas invité.");
  var result=Object.assign({},m,{serverNow:Number(response.data.serverNow)});
  if(email!==me())throw new Error("La session a changé.");
  if(!okUrl(result.link))throw new Error("Le lien Teams de cette réunion n’a pas été configuré.");
  return result;
}
async function previewMeeting(id,options){
  if(!validId(id))return false;
  if(!me()||!SB()||!window.AfriFlowAlerts||!window.AfriFlowAlerts.showMeeting){pendingMeeting=id;pendingSource=options&&options.source||"push";return false;}
  var meeting=await resolveMeeting(id);
  return window.AfriFlowAlerts.showMeeting(meeting,options||{})!==false;
}
async function flushPending(){
  if(!pendingMeeting||previewBusy||!me()||!SB()||!window.AfriFlowAlerts||!window.AfriFlowAlerts.showMeeting)return;
  var id=pendingMeeting;previewBusy=true;
  try{if(await previewMeeting(id,{source:pendingSource})&&pendingMeeting===id){pendingMeeting="";
    var url=new URL(window.location.href);if(url.searchParams.get("meeting")===id){url.searchParams.delete("meeting");window.history.replaceState(window.history.state,"",url.href);}
  }}catch(error){pendingMeeting="";toast(error.message||"Invitation indisponible.");}
  finally{previewBusy=false;}
}
function queuePreview(id,source){if(validId(id)){pendingMeeting=id;pendingSource=source||"push";flushPending();}}
try{pendingMeeting=new URL(window.location.href).searchParams.get("meeting")||"";if(!validId(pendingMeeting))pendingMeeting="";}catch(ignore){}
window.AfriMeetings={join:joinMeeting,preview:previewMeeting};
window.addEventListener("afriflow:meeting-request",function(event){queuePreview(event.detail&&event.detail.meetingId,event.detail&&event.detail.source);});
window.addEventListener("afriflow:workspace-ready",flushPending);
window.addEventListener("afriflow:alerts-ready",flushPending);
window.addEventListener("load",flushPending);
if(navigator.serviceWorker)navigator.serviceWorker.addEventListener("message",function(event){
  var data=event.data||{};
  if(data.type==="afriflow:meeting-request"&&validId(data.meetingId)){
    queuePreview(data.meetingId,"push");
    if(event.ports&&event.ports[0])try{event.ports[0].postMessage({accepted:true})}catch(ignore){}
  }
  else if(data.type==="afriflow:meeting-push"&&validId(data.meetingId)&&Number(data.expiresAt)>Date.now()&&window.AfriFlowAlerts&&window.AfriFlowAlerts.enabled()){
    if(data.stage==="start")previewMeeting(data.meetingId,{automatic:true,source:"push"}).catch(function(){});
  }
});

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
async function openPage(options){
  options=options||{};
  if(!isCens())return;
  var home=document.querySelector('#navList .nv[data-id="home"]');if(home)home.click();
  var generation=++pageGeneration,email=me();
  active=true;$("view-home").style.display="none";$("viewHost").style.display="";
  var sc=$("scrim");if(sc&&sc.classList.contains("on"))sc.click();
  $("viewHost").innerHTML='<div class="toolbar"><b>Censeur</b></div><p style="color:var(--muted)">Chargement…</p>';
  delete $("viewHost").dataset.meetingDraft;
  mark2();if(!options.restore)window.scrollTo(0,0);if(window.AFRI)window.AFRI.page("Censeur");
  if(window.AfriNav)window.AfriNav.remember("censor");
  try{await load()}catch(e){}
  if(active&&generation===pageGeneration&&email===me()&&isCens())render();
}
window.AfriOpenCensor=function(options){
  if(!me()||!isCens())return false;
  openPage(options);return true;
};
window.addEventListener("afriflow:navigate",function(event){
  if(!event.detail||event.detail.id!=="censor"){active=false;pageGeneration++}
});
async function render(){
  var host=$("viewHost");if(!active||!host)return;
  var generation=pageGeneration,email=me();
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
  if(!active||generation!==pageGeneration||email!==me()||!isCens())return;
  roster=memberLoadError?[]:U.map(function(u){return String(u.email||"").trim().toLowerCase()}).filter(Boolean);
  var zone=Intl.DateTimeFormat().resolvedOptions().timeZone||"fuseau de votre appareil";
  var d=new Date(),dd=d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
  var h='<div class="toolbar"><b>Censeur</b><div class="toolbar-actions"><button type="button" id="csRef">Actualiser</button></div></div>'
   +'<div class="mt-box"><h3>Programmer une réunion</h3><div class="mt-grid">'
   +'<label class="full">Intitulé<input id="csT" maxlength="100" placeholder="Ex. Point hebdomadaire" autocomplete="off"></label>'
   +'<label>Date<input type="date" id="csD" value="'+dd+'"></label><label>Heure de début<input type="time" id="csH" value="14:00"></label>'
   +'<label>Durée (min)<input type="number" id="csU" value="60" min="5" max="600"></label>'
   +'<label>Tolérance de pointage (min)<input type="number" id="csG" value="5" min="0" max="120"></label>'
   +'<label class="full">Lien propre à cette réunion (facultatif, sinon lien général)<input id="csL" placeholder="https://…" autocomplete="off"></label>'
   +'<label class="full">Destinataires<select id="csAudience"><option value="all">Tous les membres du Journal de Bord</option><option value="selected">Membres sélectionnés uniquement</option></select></label>'
   +'<div class="full" id="csPeople" hidden><p>Choisissez les personnes invitées. Seuls leurs comptes pourront pointer leur présence.</p>'
   +'<div class="mt-grid" style="max-height:300px;overflow:auto;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:10px;padding:4px">'+U.filter(function(u){return u&&u.email}).map(inviteeCard).join("")+'</div></div></div>'
   +'<div class="mt-err" id="csErr" role="alert"></div><button type="button" class="p" id="csGo">Programmer</button>'
   +'<p style="color:var(--muted);font-size:.85rem;margin:12px 0 0">Fuseau de saisie : <b>'+esc(zone)+'</b>. Le pointage ouvre 15 min avant la réunion. L’heure de réception est enregistrée par le serveur. Un clic tardif ou manquant demande une vérification de la participation dans Teams.</p></div>';
  var L=meets.slice().sort(function(a,b){return b.start-a.start});
  h+='<h3 style="color:var(--green)">Réunions et présences</h3>'+(L.length?L.map(function(m){
    var emails={},names={};U.forEach(function(u){if(u&&u.email)names[String(u.email).toLowerCase()]=u.name||u.display_name||""});
    // New meetings freeze their roster. A historical meeting with no roster
    // cannot retrospectively assign today's members to that old meeting.
    if(Array.isArray(m.invitees))m.invitees.forEach(function(em){em=String(em).toLowerCase();emails[em]=names[em]||"";});
    Object.keys(atts).forEach(function(k){var v=atts[k];if(v&&v.meet===m.id&&v.email&&!(v.email in emails))emails[v.email]=v.name||""});
    if(attendanceData){["justifications","permissions","events"].forEach(function(group){Object.keys(attendanceData[group]||{}).forEach(function(key){if(key.indexOf(m.id+":")===0){var em=key.slice(m.id.length+1);if(!(em in emails))emails[em]=names[em]||""}})});}
    var rows=Object.keys(emails).sort().map(function(em){var rec=atts[ATT+m.id+":"+em],s=statut(m,rec,em);return {em:em,nm:emails[em],rec:rec,s:s}});
    var c={pointage:0,review:0,present:0,late:0,excused:0,abs:0,wait:0};rows.forEach(function(r){
      var s=r.s;if(s.unavailable)c.wait++;else if(s.source==="permission"||s.source==="justification"||s.review&&s.review.outcome==="excused")c.excused++;
      else if(s.source==="review"){if(s.review.outcome==="on_time")c.present++;else if(s.review.outcome==="late")c.late++;else if(s.review.outcome==="absent")c.abs++;}
      else if(s.k==="ok")c.pointage++;else if(s.k==="late")c.review++;else c.wait++;
    });
    var summary=[[c.pointage,"ok","pointage(s) à l’heure"],[c.review,"wait","pointage(s) à vérifier"],[c.present,"ok","présence(s) confirmée(s)"],[c.late,"late","retard(s) confirmé(s)"],[c.excused,"ok","excusé(s)"],[c.abs,"abs","absence(s) confirmée(s)"],[c.wait,"wait","à confirmer"]].filter(function(x){return x[0]>0}).map(function(x){return '<span class="mt-pill mt-'+x[1]+'">'+x[0]+' '+x[2]+'</span>'}).join("");
    return '<details class="mt-m"><summary><b>'+esc(m.title)+'</b><small>'+fdt(m.start)+' · '+m.dur+' min</small>'
     +'<span class="mt-sum">'+summary+'</span></summary>'
     +'<div class="mt-body"><p class="af-att-note">Tolérance : '+(Number.isFinite(Number(m.grace))?Number(m.grace):5)+' min. Fuseau d’affichage : '+esc(zone)+'. Le pointage ne prouve pas l’entrée ni la durée dans Teams.</p>'
     +(!Array.isArray(m.invitees)?'<p class="af-att-note">Liste des invités non conservée pour cette ancienne réunion. Seuls les pointages et dossiers connus sont affichés.</p>':'')
     +'<div class="mt-tw"><table><thead><tr><th>Nom</th><th>Email</th><th>Statut</th><th>Pointage serveur</th></tr></thead><tbody>'
     +(rows.length?rows.map(function(r){return '<tr><td>'+esc(r.nm||"—")+'</td><td>'+esc(r.em)+'</td><td><span class="mt-pill mt-'+r.s.k+'">'+esc(r.s.t)+'</span>'+(r.em===me()?'<br><button type="button" data-att-request="'+esc(m.id)+'">Demander une vérification</button>':'')+'</td><td>'+(r.rec?esc(new Date(r.rec.at).toLocaleString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit",timeZoneName:"short"})):"Non reçu")+'</td></tr>'}).join(""):'<tr><td colspan="4" style="color:var(--muted)">Aucun pointage ou dossier à afficher.</td></tr>')
     +'</tbody></table></div><p style="margin:14px 0 0"><button type="button" class="danger" data-csdel="'+esc(m.id)+'">Supprimer cette réunion</button></p></div></details>';
  }).join(""):'<p style="color:var(--muted)">Aucune réunion programmée.</p>');
  if(memberLoadError||loadError)h='<p role="alert" class="mt-err">'+esc(memberLoadError||loadError)+'</p>'+h;
  // Recheck after the directory awaits: a member may have begun editing while
  // the background refresh was in flight. Keep expanded evidence readable too.
  if(hasDraft())return;
  var openMeetings=Array.from(host.querySelectorAll("details.mt-m[open]")).map(function(section){var button=section.querySelector("[data-csdel]");return button&&button.dataset.csdel;});
  host.innerHTML=h;host.onclick=onClick;
  window.AfriAttendance.decorateCensor(host,meets,atts,loadError?{unavailable:true}:attendanceData);
  host.querySelectorAll("details.mt-m").forEach(function(section){var button=section.querySelector("[data-csdel]");if(button&&openMeetings.indexOf(button.dataset.csdel)>-1)section.open=true;});
  host.oninput=function(event){if(event.target.closest(".mt-box"))host.dataset.meetingDraft="yes";};
  delete host.dataset.meetingDraft;
  var createButton=$("csGo");if(createButton&&memberLoadError)createButton.disabled=true;
  var audience=$("csAudience"),people=$("csPeople");
  if(audience&&people)audience.onchange=function(){people.hidden=audience.value!=="selected"};
}
async function onClick(e){
  var b=e.target.closest("button");if(!b)return;
  try{
    if(b.id==="csRef"){delete $("viewHost").dataset.meetingDraft;await load();render();return}
    if(b.id==="csGo"){
      var t=$("csT").value.trim(),d=$("csD").value,hh=$("csH").value,du=+$("csU").value,g=+$("csG").value,l=$("csL").value.trim(),er=$("csErr");
      if(!t||!d||!hh){er.textContent="Indiquez l'intitulé, la date et l'heure.";return}
      if(!(Number.isInteger(du)&&du>=5&&du<=600)){er.textContent="Indiquez une durée entre 5 et 600 minutes.";return}
      if(!(Number.isInteger(g)&&g>=0&&g<=120)){er.textContent="Indiquez une tolérance entre 0 et 120 minutes.";return}
      if(l&&!okUrl(l)){er.textContent="Indiquez un lien de réunion Teams valide (https).";return}
      var st=new Date(d+"T"+hh).getTime();if(isNaN(st)){er.textContent="Date ou heure invalide.";return}
      if(st+du*6e4<Date.now()){er.textContent="Cette réunion est déjà terminée.";return}
      er.textContent="";
      var selected=$("csAudience")&&$("csAudience").value==="selected";
      var invitees=selected?Array.from(document.querySelectorAll("[data-cs-invite]:checked")).map(function(x){return x.dataset.csInvite}):roster.slice();
      if(selected&&!invitees.length){er.textContent="Sélectionnez au moins une personne invitée.";return}
      if(!invitees.length){er.textContent="Aucun membre vérifié à inviter. Actualisez les comptes.";return}
      b.disabled=true;
      var m={id:uid(),title:t,start:st,dur:du,grace:g,link:l,invitees:invitees,by:me(),created:Date.now(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone};
      var r=await SB().from(TB()).upsert({key:PRE+m.id,value:m,updated_at:new Date().toISOString()});
      b.disabled=false;
      if(r.error){er.textContent="Enregistrement impossible : "+(r.error.message||r.error);return}
      meets.push(m);meets.sort(function(x,y){return x.start-y.start});delete $("viewHost").dataset.meetingDraft;toast("Réunion programmée.");drawCard();render();return;
    }
    if(b.dataset.csdel&&confirm("Supprimer cette réunion et ses présences ?")){
      var id=b.dataset.csdel;
      await SB().from(TB()).delete().eq("key",PRE+id);
      try{await SB().from(TB()).delete().like("key",ATT+id+":%")}catch(x){}
      meets=meets.filter(function(x){return x.id!==id});Object.keys(atts).forEach(function(k){if(k.indexOf(ATT+id+":")===0)delete atts[k]});
      drawCard();render();
    }
  }catch(x){if(b.id==="csGo")b.disabled=false;toast("Action impossible : "+(x&&x.message||x))}
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
    if(b.hasAttribute("data-cs-nav"))openPage();else if(!b.hasAttribute("data-fdr-ren")&&b.dataset.id!=="messages")active=false;
  });
}
var vh=$("viewHost");if(vh)new MutationObserver(injectAdmin).observe(vh,{childList:true});

/* ---------- Démarrage ---------- */
function hasDraft(){var host=$("viewHost");return !!(window.AfriAttendance.isReviewing()||host&&host.dataset.meetingDraft==="yes")}
function refresh(){if(!me()){drawCard();return}load().then(function(){inject();drawCard();injectAdmin();if(active&&!hasDraft())render();flushPending();window.dispatchEvent(new Event("afriflow:navigation-ready"))}).catch(function(){if(active&&!hasDraft())render();flushPending();})}
window.addEventListener("afriflow:attendance-changed",refresh);
var prev=window.onRole;
window.onRole=function(){if(prev)prev();setTimeout(refresh,1300)};
setInterval(function(){if(me())refresh();else drawCard()},60000);
setInterval(function(){if(me())drawCard()},30000);
if(me())setTimeout(refresh,1500);
})();
