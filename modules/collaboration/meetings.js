
(function(){
"use strict";
var CFG="pub:meetcfg", PRE="meet:", ATT="att:";
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
    var label=String(u.name||u.display_name||u.first_name||u.email||"").trim();
    var initials=label.split(/\s+/).slice(0,2).map(function(part){return part.charAt(0)}).join("").toUpperCase();
    return '<span aria-hidden="true" style="width:48px;height:48px;border-radius:50%;display:grid;place-items:center;flex:none;background:#e8f2ec;color:#17462e;font-weight:700">'+esc(initials)+'</span>';
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
// Suggest a future five-minute boundary in the scheduler's local timezone.
function suggestedMeetingStart(now){
  var d=new Date(now+20*60000);
  d.setSeconds(0,0);
  d.setMinutes(Math.ceil(d.getMinutes()/5)*5);
  return d;
}
function isFutureMeetingStart(start,now){
  return Number.isFinite(start)&&start>=now+2*60000;
}

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
  var cur=meets.filter(function(m){return n>=m.start&&n<Number(m.start)+m.dur*6e4});
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
var cardDeadline=0, countdownStart=0;
function countdownValues(start){
  var seconds=Math.max(0,Math.ceil((start-Date.now())/1000));
  return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(function(v){return String(v).padStart(2,"0")});
}
function countdownMarkup(start){
  var labels=["heures","minutes","secondes"];
  return '<span class="mt-countdown" role="timer" aria-label="Temps avant la réunion">'+countdownValues(start).map(function(value,i){
    return '<span class="mt-unit"><strong id="mtDigit'+i+'">'+value+'</strong><small>'+labels[i]+'</small></span>';
  }).join("")+'</span>';
}
function tickCard(){
  if(!cardDeadline||document.hidden)return;
  if(!me()||Date.now()>=cardDeadline){drawCard();return;}
  if(!countdownStart)return;
  countdownValues(countdownStart).forEach(function(value,i){
    var digit=$("mtDigit"+i);
    if(!digit||digit.textContent===value)return;
    digit.textContent=value;
    if(digit.animate&&window.matchMedia&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      digit.animate([{opacity:.55,transform:"translateY(-3px)"},{opacity:1,transform:"translateY(0)"}],{duration:200,easing:"ease-out"});
  });
}
function drawCard(){
  var host=$("meetCard");
  if(!host){
    var br=document.querySelector("#view-home .brand");if(!br)return;
    host=document.createElement("div");host.id="meetCard";br.after(host);
  }
  cardDeadline=0;countdownStart=0;
  if(!me()){host.innerHTML="";return}
  var p=pick(),sub="Aucune réunion programmée",action="";
  if(p){
    var start=Number(p.m.start);
    if(p.live){
      cardDeadline=start+p.m.dur*60000;
      sub='<span class="mt-dot"></span>En cours : '+esc(p.m.title)+' · '+fh(start)+' – '+fh(cardDeadline)+(atts[ATT+p.m.id+":"+me()]?' · pointage enregistré':'');
      action='<a class="mt-btn" id="meetGo" data-meeting="'+esc(p.m.id)+'" href="?meeting='+encodeURIComponent(p.m.id)+'">Rejoindre</a>';
    }else{
      cardDeadline=countdownStart=start;
      sub='Prochaine réunion : '+esc(p.m.title)+' · '+fdt(start);
      action=countdownMarkup(start);
    }
  }
  host.innerHTML='<div class="mt-card'+(p&&p.live?' live':'')+'">'+ICON+'<span class="mt-txt"><b>Réunion en ligne</b><small>'+sub+'</small></span>'+action+'</div>';
}
// Every AfriFlow entry point uses the same authenticated, server-timed join.
// Opening an invitation never creates an attendance record.
function paintPointageAvatar(screen,account){
  var header=$("sideAvatar");
  if(!header||header.dataset.profileOwner!==account||me()!==account)return;
  var image=header.querySelector("img");
  var portrait=screen.querySelector(".af-pointage-photo"),initials=screen.querySelector(".af-pointage-initials");
  var src=image&&(image.currentSrc||image.src);
  if(!src||portrait.getAttribute("src")===src)return;
  function reveal(){if(portrait.naturalWidth){portrait.hidden=false;initials.hidden=true;}}
  portrait.onload=reveal;
  portrait.onerror=function(){portrait.hidden=true;initials.hidden=false;};
  portrait.src=src;
  if(portrait.complete)reveal();
}
function pointageScreen(account){
  var screen=document.createElement("div");
  screen.className="af-pointage-screen";
  screen.innerHTML='<div class="af-pointage-card"><div class="af-pointage-portrait" aria-hidden="true"><span class="af-pointage-initials"></span><img class="af-pointage-photo" hidden alt="" referrerpolicy="no-referrer"></div><p role="status">Pointage en cours…</p><div class="af-pointage-stamp" hidden><span>Heure du pointage</span><time></time></div></div>';
  screen.querySelector(".af-pointage-initials").textContent=(String(window.USER_NAME||account).trim().match(/\S+/g)||[]).slice(0,2).map(function(part){return part[0]}).join("").toUpperCase();
  paintPointageAvatar(screen,account);
  document.body.appendChild(screen);
  return screen;
}
async function joinMeeting(id,options){
  options=options||{};
  if(!validId(id)||!me()||!SB())return {ok:false,error:"Connectez-vous pour rejoindre cette réunion."};
  if(joining.has(id))return {ok:false,error:"Le pointage est déjà en cours. Patientez un instant."};
  var account=me(),nativeOpen=window.AfriFlowNative&&typeof window.AfriFlowNative.openTeams==="function";
  joining.add(id);
  var screen;
  try{
    screen=pointageScreen(account);
    var result=await mark(id,options.source||"home");
    if(account!==me())throw new Error("La session a changé. Reconnectez-vous avant de rejoindre la réunion.");
    drawCard();
    var target=result.meeting&&result.meeting.link;
    if(!okUrl(target))throw new Error("Le lien Teams de cette réunion est indisponible.");
    screen.querySelector("p").textContent="Vous êtes connecté";
    paintPointageAvatar(screen,account);
    var at=new Date(result.record.at),time=screen.querySelector("time");
    if(Number.isFinite(at.getTime())){
      time.dateTime=at.toISOString();
      time.textContent=at.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
      screen.querySelector(".af-pointage-stamp").hidden=false;
    }
    screen.classList.add("confirmed");
    await new Promise(function(resolve){setTimeout(resolve,2100)});
    if(account!==me())throw new Error("La session a changé. Reconnectez-vous avant de rejoindre la réunion.");
    if(nativeOpen){
      var opened=await window.AfriFlowNative.openTeams(target);
      if(!opened||!opened.ok)throw new Error("Pointage conservé, mais Teams n’a pas pu s’ouvrir. Réessayez.");
    }else{window.location.assign(target);}
    toast("Pointage enregistré à "+fh(result.record.at)+". La participation à Teams reste à vérifier séparément.");
    return {ok:true,record:result.record};
  }catch(error){
    return {ok:false,error:error.message||"Pointage indisponible. Réessayez."};
  }finally{if(screen)screen.remove();joining.delete(id);}
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
async function consumeMeetingTap(id){
  var url=new URL(window.location.href),fragment=new URLSearchParams(url.hash.slice(1));
  var tap=fragment.get("accept"),until=Number(fragment.get("until"));
  if(url.searchParams.get("meeting")!==id || !tap || !/^[a-f0-9-]{36}$/i.test(tap))return false;
  url.hash="";
  window.history.replaceState(window.history.state,"",url.href);
  if(!window.caches || !Number.isFinite(until) || until<=Date.now())return false;
  try{
    var receipt=new URL("./",url);
    receipt.searchParams.set("meeting",id);
    receipt.searchParams.set("until",String(until));
    receipt.searchParams.set("tap",tap);
    var cache=await window.caches.open("afriflow-meeting-taps-v1");
    return await cache.delete(receipt.href);
  }catch(ignore){return false;}
}
async function flushPending(){
  if(!pendingMeeting||previewBusy||!me()||!SB()||!window.AfriFlowAlerts||!window.AfriFlowAlerts.showMeeting)return;
  var id=pendingMeeting;previewBusy=true;
  try{
    var owner=me();
    if(await consumeMeetingTap(id) && owner===me() && id===pendingMeeting){
      var joined=await joinMeeting(id,{source:"push"});
      if(joined.ok){pendingMeeting="";return;}
      toast(joined.error);
    }
    if(await previewMeeting(id,{source:pendingSource})&&pendingMeeting===id){pendingMeeting="";
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
  var d=suggestedMeetingStart(Date.now()),dd=d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
  var startHour=pad(d.getHours())+":"+pad(d.getMinutes());
  var h='<div class="toolbar"><b>Censeur</b><div class="toolbar-actions"><button type="button" id="csRef">Actualiser</button></div></div>'
   +'<div class="mt-box"><h3>Programmer une réunion</h3><div class="mt-grid">'
   +'<label class="full">Intitulé<input id="csT" maxlength="100" placeholder="Ex. Point hebdomadaire" autocomplete="off"></label>'
   +'<label>Date<input type="date" id="csD" min="'+dd+'" value="'+dd+'"></label><label>Heure de début<input type="time" id="csH" value="'+startHour+'"></label>'
   +'<label>Durée (min)<input type="number" id="csU" value="60" min="5" max="600"></label>'
   +'<label>Tolérance de pointage (min)<input type="number" id="csG" value="5" min="0" max="120"></label>'
   +'<label class="full">Lien propre à cette réunion (facultatif, sinon lien général)<input id="csL" placeholder="https://…" autocomplete="off"></label>'
   +'<label class="full">Destinataires<select id="csAudience"><option value="all">Tous les membres du Journal de Bord</option><option value="selected">Membres sélectionnés uniquement</option></select></label>'
   +'<div class="full" id="csPeople" hidden><p>Cocher les personnes à inviter. Seuls leurs comptes pourront pointer leur présence. <strong id="csInviteCount" role="status" aria-live="polite">0 personne sélectionnée</strong>.</p>'
   +'<div class="mt-grid" style="max-height:300px;overflow:auto;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:10px;padding:4px">'+U.filter(function(u){return u&&u.email}).map(inviteeCard).join("")+'</div></div></div>'
   +'<p class="af-att-note">Sélectionner des membres ne les appelle pas immédiatement. Après programmation, une notification peut être envoyée avant puis au début de la réunion, sur les appareils autorisés.</p>'
    +'<div class="mt-err" id="csErr" role="alert"></div><button type="button" class="p" id="csGo">Programmer les invitations</button>'
   +'<p class="af-att-note">Fuseau de votre appareil : <b>'+esc(zone)+'</b>. Saisissez votre heure locale ; chaque participant verra l’horaire dans son propre fuseau. Le pointage ouvre 15 min avant la réunion.</p></div>';
  var L=meets.slice().sort(function(a,b){return b.start-a.start});
  h+='<h3 style="color:var(--green)">Réunions et présences</h3>'+(L.length?L.map(function(m){
    var emails={},names={};U.forEach(function(u){if(u&&u.email)names[String(u.email).toLowerCase()]=u.name||u.display_name||""});
    // New meetings freeze their roster. A historical meeting with no roster
    // cannot retrospectively assign today's members to that old meeting.
    if(Array.isArray(m.invitees))m.invitees.forEach(function(em){em=String(em).toLowerCase();emails[em]=names[em]||"";});
    Object.keys(atts).forEach(function(k){var v=atts[k];if(v&&v.meet===m.id&&v.email&&!(v.email in emails))emails[v.email]=v.name||""});
    if(attendanceData){["justifications","permissions","events"].forEach(function(group){Object.keys(attendanceData[group]||{}).forEach(function(key){if(key.indexOf(m.id+":")===0){var em=key.slice(m.id.length+1);if(!(em in emails))emails[em]=names[em]||""}})});}
    var rows=Object.keys(emails).sort().map(function(em){var rec=atts[ATT+m.id+":"+em],s=statut(m,rec,em);return {em:em,nm:emails[em],rec:rec,s:s}});
    var c={present:0,late:0,excused:0,absent:0,wait:0};rows.forEach(function(r){var category=r.s.unavailable?"wait":r.s.category||"wait";c[category]=(c[category]||0)+1;});
    var summary=[[c.present,"ok",c.present>1?"présents":"présent"],[c.late,"late",c.late>1?"retards":"retard"],[c.excused,"ok",c.excused>1?"excusés":"excusé"],[c.absent,"abs",c.absent>1?"absents":"absent"],[c.wait,"wait","en attente"]].filter(function(x){return x[0]>0}).map(function(x){return '<span class="mt-pill mt-'+x[1]+'">'+x[0]+' '+x[2]+'</span>'}).join("");
    return '<details class="mt-m"><summary><b>'+esc(m.title)+'</b><small>'+fdt(m.start)+' · '+m.dur+' min</small>'
     +'<span class="mt-sum">'+summary+'</span></summary>'
     +'<div class="mt-body"><p class="af-att-note">Tolérance : '+(Number.isFinite(Number(m.grace))?Number(m.grace):5)+' min · Horaires locaux : '+esc(zone)+'. Les statuts tiennent compte du pointage et des décisions du censeur.</p>'
     +(!Array.isArray(m.invitees)?'<p class="af-att-note">Liste des invités non conservée pour cette ancienne réunion. Seuls les pointages et dossiers connus sont affichés.</p>':'')
     +'<div class="mt-tw mt-attendance"><table role="table"><thead><tr><th>Nom</th><th>Email</th><th>Statut</th><th>Pointage serveur</th></tr></thead><tbody>'
     +(rows.length?rows.map(function(r){var options=window.AfriAttendance.context(attendanceData,m.id,r.em);if(loadError)options.unavailable=true;return '<tr><td data-label="Nom">'+esc(r.nm||"—")+'</td><td data-label="Email">'+esc(r.em)+'</td><td data-label="Statut">'+window.AfriAttendance.statusHTML(r.s)+(r.em===me()?window.AfriAttendance.verificationHTML(m,r.rec,options):'')+'</td><td data-label="Pointage serveur">'+(r.rec?esc(new Date(r.rec.at).toLocaleString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit",timeZoneName:"short"})):"Non reçu")+'</td></tr>'}).join(""):'<tr><td colspan="4" style="color:var(--muted)">Aucun pointage ou dossier à afficher.</td></tr>')
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
  function updateInviteCount(){
     if(!people)return;
     var count=people.querySelectorAll("[data-cs-invite]:checked").length;
     var label=$("csInviteCount");
     if(label)label.textContent=count+" personne"+(count>1?"s":"")+" sélectionnée"+(count>1?"s":"");
   }
   if(audience&&people)audience.onchange=function(){people.hidden=audience.value!=="selected";updateInviteCount()};
   host.onchange=function(event){if(event.target.matches&&event.target.matches("[data-cs-invite]"))updateInviteCount()};
   updateInviteCount();
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
      if(!isFutureMeetingStart(st,Date.now())){er.textContent="Choisissez une heure de début au moins 2 minutes dans le futur. La sélection d’invités ne déclenche pas d’appel immédiat.";return}
      er.textContent="";
      var selected=$("csAudience")&&$("csAudience").value==="selected";
      var invitees=selected?Array.from($("csPeople").querySelectorAll("[data-cs-invite]:checked")).map(function(x){return x.dataset.csInvite}):roster.slice();
      if(selected&&!invitees.length){er.textContent="Sélectionnez au moins une personne invitée.";return}
      if(!invitees.length){er.textContent="Aucun membre vérifié à inviter. Actualisez les comptes.";return}
      b.disabled=true;
      var m={id:uid(),title:t,start:st,dur:du,grace:g,link:l,invitees:invitees,by:me(),created:Date.now(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone};
      var r=await SB().from(TB()).upsert({key:PRE+m.id,value:m,updated_at:new Date().toISOString()});
      b.disabled=false;
      if(r.error){er.textContent="Enregistrement impossible : "+(r.error.message||r.error);return}
      meets.push(m);meets.sort(function(x,y){return x.start-y.start});delete $("viewHost").dataset.meetingDraft;toast("Réunion programmée pour "+fdt(st)+" · "+invitees.length+" invité"+(invitees.length>1?"s":"")+". Les alertes ne sont pas envoyées immédiatement.");drawCard();render();return;
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
setInterval(tickCard,1000);
document.addEventListener("visibilitychange",tickCard);
if(me())setTimeout(refresh,1500);
})();
