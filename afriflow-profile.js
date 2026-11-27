
(function(){
"use strict";
var $=function(id){return document.getElementById(id)},portraitVariants=["01","02","03","04","05","06"],hairVariants=[],current=null,chosen={kind:"dicebear",value:""};
for(var hairIndex=1;hairIndex<=48;hairIndex++)hairVariants.push("variant"+(hairIndex<10?"0":"")+hairIndex);
function esc(s){return String(s==null?"":s).replace(/[&<>\"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function photo(v){return typeof v==="string"&&/^data:image\/(png|jpe?g|webp);base64,/i.test(v)}
function cleanColor(v,fallback){return /^[0-9a-f]{6}$/i.test(String(v||""))?String(v).toLowerCase():fallback}
function diceConfig(value){
  var defaults={seed:"afriflow",hairVariant:"",hairColor:"2c1b18",skinColor:"f2d3b1",backgroundColor:"e8f2ec",glasses:false,earrings:false,flowers:false,flip:false,custom:false},raw=null;
  if(typeof value==="string"&&value){try{raw=JSON.parse(value)}catch(e){defaults.seed=value}}
  if(raw&&typeof raw==="object"&&typeof raw.seed==="string"){
    defaults.seed=raw.seed||defaults.seed;defaults.hairVariant=hairVariants.indexOf(raw.hairVariant)>=0?raw.hairVariant:"";defaults.hairColor=cleanColor(raw.hairColor,defaults.hairColor);defaults.skinColor=cleanColor(raw.skinColor,defaults.skinColor);defaults.backgroundColor=cleanColor(raw.backgroundColor,defaults.backgroundColor);defaults.glasses=raw.glasses===true;defaults.earrings=raw.earrings===true;defaults.flowers=raw.flowers===true;defaults.flip=raw.flip===true;defaults.custom=true;
  }
  return defaults;
}
function diceValue(c){return c&&c.custom?JSON.stringify({v:1,seed:c.seed,hairVariant:c.hairVariant||"",hairColor:c.hairColor,skinColor:c.skinColor,backgroundColor:c.backgroundColor,glasses:!!c.glasses,earrings:!!c.earrings,flowers:!!c.flowers,flip:!!c.flip}):String((c&&c.seed)||"afriflow")}
function diceUrl(value){
  var c=diceConfig(value),q=new URLSearchParams();q.set("seed",c.seed||"afriflow");
  if(c.custom){if(c.hairVariant)q.set("hairVariant",c.hairVariant);q.set("hairColor",c.hairColor);q.set("skinColor",c.skinColor);q.set("backgroundColor",c.backgroundColor);if(c.glasses){q.set("glassesProbability","100");q.set("glassesVariant","variant01")}if(c.earrings){q.set("earringsProbability","100");q.set("earringsVariant","variant01")}if(c.flowers){q.set("hairAccessoriesProbability","100");q.set("hairAccessoriesVariant","flowers")}if(c.flip)q.set("flip","horizontal")}
  return "https://api.dicebear.com/10.x/lorelei/svg?"+q.toString();
}
function avatar(kind,value,label){
  if(kind==="photo"&&photo(value))return '<span class="pf-avatar"><img src="'+value+'" alt="'+esc(label||"Photo de profil")+'"></span>';
  return '<span class="pf-avatar pf-dicebear"><img src="'+diceUrl(value)+'" alt="'+esc(label||"Portrait généré")+'" referrerpolicy="no-referrer"></span>';
}
function close(){var p=$("profilePanel");p.classList.remove("member-hub-mode");p.classList.remove("open");p.setAttribute("aria-hidden","true");document.body.classList.remove("af-profile-open");var b=$("profileOpen");if(b)b.focus()}
function dayText(d){var n=Math.ceil((new Date(d).getTime()-Date.now())/86400000);return n<0?"Le délai est dépassé.":n===0?"Le délai se termine aujourd’hui.":"Il reste "+n+" jour"+(n>1?"s":"")+"."}
function localName(){return String(window.USER_NAME||"").trim().split(/\s+/)[0]||""}
function shareholderProfileRequired(){var market=window.afriMarketSession||{};return market.requested_role==="shareholder"||["shareholder_pending","shareholder_approved"].indexOf(market.access_mode)>=0}
function updateHeader(p,d){
  var first=(p&&p.first_name)||localName(),g=$("sideGreeting"),a=$("sideAvatar"),b=$("profileOpen");
  if(g)g.textContent=first?"Hey "+first:"Hey";
  if(a){a.dataset.profileOwner=String(current&&current.user&&current.user.email||"").trim().toLowerCase();a.innerHTML=avatar((d&&d.avatar_kind)||"dicebear",(d&&d.avatar_value)||"afriflow",first);}
  var incomplete=shareholderProfileRequired()&&!(p&&p.profile_completed_at);if(b)b.classList.toggle("needs-profile",!!window.loggedUserEmail&&incomplete);
  updateReminder(incomplete,p&&p.profile_due_at);
}
function updateReminder(incomplete,due){
  var r=$("profileReminder");if(!r){r=document.createElement("button");r.type="button";r.id="profileReminder";r.className="profile-reminder";r.onclick=open;document.body.appendChild(r)}
  r.hidden=!incomplete||!window.loggedUserEmail;if(r.hidden)return;
  r.innerHTML='<svg class="ic" aria-hidden="true"><use href="#i-user"/></svg><span><strong>Profil à compléter</strong><span>'+esc(dayText(due||new Date(Date.now()+15*86400000).toISOString()))+' Cliquez pour ouvrir le questionnaire.</span></span>';
}
async function load(){
  var sb=window.__sb;if(!sb||!window.loggedUserEmail)throw new Error("Connectez-vous pour consulter votre profil.");
  var u=await sb.auth.getUser();if(u.error||!u.data.user)throw new Error("Session introuvable.");
  var user=u.data.user,pr=await sb.from("afriflow_profiles").select("*").eq("user_id",user.id).maybeSingle(),di=await sb.from("afriflow_member_directory").select("*").eq("user_id",user.id).maybeSingle();
  if(pr.error)throw pr.error;if(di.error)throw di.error;
  current={user:user,profile:pr.data||{},directory:di.data||{}};
  var name=String((current.profile.first_name||"")+" "+(current.profile.last_name||"")).trim()||String(window.USER_NAME||"");
  var storedValue=current.directory.avatar_value||"",kind=current.directory.avatar_kind||"dicebear",stored=diceConfig(storedValue);
  if(kind!=="photo"&&(!storedValue||stored.seed===current.user.id)){stored.seed=current.user.id+"-lorelei-01";storedValue=diceValue(stored)}
  chosen={kind:kind,value:storedValue};updateHeader(current.profile,current.directory);
  return {name:name};
}
function field(label,id,value,type,wide,ph){return '<label class="'+(wide?"wide":"")+'">'+label+'<input id="pf_'+id+'" type="'+(type||"text")+'" value="'+esc(value||"")+'" placeholder="'+esc(ph||"")+'"></label>'}
function activeDiceConfig(){var base=current&&current.user&&current.user.id?current.user.id+"-lorelei-01":"afriflow",c=diceConfig(chosen.kind==="dicebear"?chosen.value:base);if(!c.seed||c.seed==="afriflow")c.seed=base;return c}
function avatarChoices(){var base=current&&current.user&&current.user.id||"afriflow",c=activeDiceConfig();return '<div class="avatar-choice" id="pfAvatars">'+portraitVariants.map(function(n){var seed=base+"-lorelei-"+n,next={seed:seed,hairVariant:c.hairVariant,hairColor:c.hairColor,skinColor:c.skinColor,backgroundColor:c.backgroundColor,glasses:c.glasses,earrings:c.earrings,flowers:c.flowers,flip:c.flip,custom:c.custom};return '<button type="button" data-avatar-seed="'+esc(seed)+'"'+(chosen.kind==="dicebear"&&c.seed===seed?' class="selected"':'')+' aria-label="Proposition de portrait '+n+'">'+avatar("dicebear",diceValue(next),"Proposition de portrait "+n)+'</button>'}).join("")+'</div>'}
function colorField(id,label,value){return '<label>'+label+'<input id="pfAvatar_'+id+'" data-avatar-setting type="color" value="#'+esc(value)+'"></label>'}
function toggleField(id,label,on){return '<label><input id="pfAvatar_'+id+'" data-avatar-setting type="checkbox"'+(on?' checked':'')+'><span>'+label+'</span></label>'}
function hairField(value){return '<label>Coiffure<select id="pfAvatar_hairVariant" data-avatar-setting><option value="">Aléatoire</option>'+hairVariants.map(function(v){return '<option value="'+v+'"'+(value===v?' selected':'')+'>Coiffure '+v.replace("variant","")+'</option>'}).join("")+'</select></label>'}
function avatarEditor(){var c=activeDiceConfig();return '<div id="pfAvatarSettings" class="avatar-builder"><div class="avatar-builder-preview">'+avatar("dicebear",diceValue(c),"Aperçu du portrait")+'<span>Aperçu</span></div><div><b style="font-size:.84rem;color:var(--muted)">Personnaliser mon portrait</b><p class="profile-note" style="margin:5px 0 8px">Choisissez une proposition, puis une coiffure, les couleurs et les accessoires. L’aperçu se met à jour avant l’enregistrement.</p>'+avatarChoices()+'<div class="avatar-tuning">'+hairField(c.hairVariant)+colorField("hairColor","Couleur des cheveux",c.hairColor)+colorField("skinColor","Teint",c.skinColor)+colorField("backgroundColor","Arrière-plan",c.backgroundColor)+'<div class="avatar-toggles">'+toggleField("glasses","Lunettes",c.glasses)+toggleField("earrings","Boucles d’oreilles",c.earrings)+toggleField("flowers","Fleurs dans les cheveux",c.flowers)+toggleField("flip","Inverser le portrait",c.flip)+'</div><div class="avatar-editor-actions"><button type="button" id="pfAvatarNew" class="quiet">Nouvelle proposition</button><button type="button" id="pfAvatarReset" class="quiet">Réinitialiser</button></div></div></div></div>'}
function renderAvatarEditor(){var old=$("pfAvatarSettings");if(!old)return;old.outerHTML=avatarEditor();bindAvatarEditor()}
function bindAvatarEditor(){
  var grid=$("pfAvatars");if(grid)grid.onclick=function(e){var b=e.target.closest("[data-avatar-seed]");if(!b)return;var c=activeDiceConfig();c.seed=b.dataset.avatarSeed;chosen={kind:"dicebear",value:diceValue(c)};renderAvatarEditor()};
  ["hairVariant","hairColor","skinColor","backgroundColor","glasses","earrings","flowers","flip"].forEach(function(id){var input=$("pfAvatar_"+id);if(!input)return;input.onchange=function(){var c=activeDiceConfig();c.hairVariant=$("pfAvatar_hairVariant").value;c.hairColor=$("pfAvatar_hairColor").value.slice(1);c.skinColor=$("pfAvatar_skinColor").value.slice(1);c.backgroundColor=$("pfAvatar_backgroundColor").value.slice(1);c.glasses=$("pfAvatar_glasses").checked;c.earrings=$("pfAvatar_earrings").checked;c.flowers=$("pfAvatar_flowers").checked;c.flip=$("pfAvatar_flip").checked;c.custom=true;chosen={kind:"dicebear",value:diceValue(c)};renderAvatarEditor()}});
  var next=$("pfAvatarNew");if(next)next.onclick=function(){var c=activeDiceConfig(),base=current&&current.user&&current.user.id||"afriflow";c.seed=base+"-lorelei-"+Date.now().toString(36);chosen={kind:"dicebear",value:diceValue(c)};renderAvatarEditor()};
  var reset=$("pfAvatarReset");if(reset)reset.onclick=function(){var base=current&&current.user&&current.user.id||"afriflow";chosen={kind:"dicebear",value:base+"-lorelei-01"};renderAvatarEditor()};
}

async function certificateCall(action,body){
 var sb=window.__sb;if(!sb)throw new Error("Connexion Supabase indisponible");
 var response=await sb.functions.invoke("afriflow-certificates",{body:Object.assign({action:action},body||{})});
 if(response.error){var message=response.error.message||"Service indisponible";try{var detail=await response.error.context.json();message=detail.error||message}catch(e){}throw new Error(message)}
 if(response.data&&response.data.error)throw new Error(response.data.error);
 return response.data;
}

async function loadIdentifiers(){
 var host=$("pfIdentity");if(!host||!current)return;
 try{
  var q=await window.__sb.from("afriflow_member_ids").select("login_id,admin_number").eq("user_id",current.user.id).single();
  if(q.error)throw q.error;
  var id=q.data||{};
  host.innerHTML='<h3>Mes références AfriFlow</h3><p class="profile-note">Références permanentes et personnelles : elles ne changent pas si vous modifiez votre pays ou votre rôle.</p>'
    +'<p><strong>Identifiant de connexion :</strong> <code>'+esc(id.login_id||"")+'</code></p>'
    +'<p><strong>Numéro administratif :</strong> <code>'+esc(id.admin_number||"")+'</code></p>'
    +'<p class="profile-note">Vous pouvez utiliser l’identifiant avec votre mot de passe sur l’écran de connexion. Le numéro administratif sert uniquement aux dossiers.</p>';
 }catch(e){if(host.isConnected)host.innerHTML='<h3>Mes références AfriFlow</h3><p class="profile-note">Identifiants indisponibles : '+esc(e.message||e)+'</p>'}
}
async function loadCertificatesProfile(){
 var host=$("pfCertificates");if(!host)return;
 try{
  var response=await certificateCall("profile_summary"),d=response.profile||{};
  if(!host.isConnected)return;
  var role=d.type==="partner"?"Partenaire commercial":d.type==="shareholder"?"Actionnaire":"Membre AfriFlow";
  var status=d.approved?"Statut confirmé dans AfriFlow":"Statut non approuvé ou à confirmer";
  host.innerHTML='<h3>Mon attestation AfriFlow</h3><p class="profile-note">Document généré automatiquement à partir de votre profil et de votre statut actuel. Aucun administrateur ne doit émettre le document.</p>'
   +'<div class="pf-cert-row"><b>'+esc(d.name||"Membre")+'</b><small>Rôle : '+esc(role)+'</small><small>'+esc(status)+'</small>'
   +(d.type==="partner"?'<small>Marché commercial : '+esc(d.market||"Non renseigné")+'</small>':'')
   +'<p class="profile-note">'+(d.approved?"Votre attestation reflète le statut actuel enregistré dans AfriFlow.":"Votre fiche est disponible. Elle ne certifie pas une qualité d’actionnaire ou de partenaire tant que le statut n’est pas approuvé.")+'</p>'
   +'<div class="profile-actions"><button type="button" class="p" id="pfProfileView">Voir le document</button><button type="button" id="pfProfilePdf">Télécharger le PDF</button></div></div>';
  ["pfProfileView","pfProfilePdf"].forEach(function(id){
   var btn=$(id);if(!btn)return;
   btn.onclick=async function(){
   btn.disabled=true;
   try{
    var blob=await certificateCall("profile_pdf");
    if(!(blob instanceof Blob))throw new Error("Réponse PDF indisponible");
    var url=URL.createObjectURL(blob);
    if(id==="pfProfileView"){
      var opened=window.open(url,"_blank","noopener,noreferrer");
      if(!opened){var a=document.createElement("a");a.href=url;a.download="AfriFlow-attestation-de-profil.pdf";document.body.appendChild(a);a.click();a.remove()}
    }else{
      var a=document.createElement("a");a.href=url;a.download="AfriFlow-attestation-de-profil.pdf";document.body.appendChild(a);a.click();a.remove();
    }
    setTimeout(function(){URL.revokeObjectURL(url)},60000);
   }catch(e){host.querySelector(".profile-note").textContent="Téléchargement impossible : "+(e.message||e)}
   finally{btn.disabled=false}
   };
  });
 }catch(e){if(host.isConnected)host.innerHTML='<h3>Mon attestation AfriFlow</h3><p class="profile-note">Service indisponible : '+esc(e.message||e)+'</p>'}
}

function profilePage(){
  var p=current.profile,d=current.directory,required=shareholderProfileRequired(),complete=!!p.profile_completed_at,notice=!required?'Ces informations sont facultatives pour votre compte. Vous pouvez les compléter ou les modifier à tout moment.':complete?'Votre profil actionnaire est complet. Vous pourrez le modifier à tout moment.':'Complétez les informations demandées et choisissez un avatar. '+dayText(p.profile_due_at||new Date(Date.now()+15*86400000).toISOString());
  $("profileMain").innerHTML='<div class="profile-tabs"><button type="button" class="on" data-profile-tab="me">Mon profil</button><button type="button" data-profile-tab="directory">Annuaire des membres</button></div><div class="profile-grid"><section class="profile-card"><h3>Mes informations</h3><p class="profile-status">'+esc(notice)+'</p><p class="profile-note">Le nom, la fonction, le pays, la ville et l’avatar sont visibles dans l’annuaire. Les coordonnées personnelles restent privées.</p><div class="profile-form">'
    +field("Prénom *","first",p.first_name,"text",false,"Ex. Aïcha")+field("Nom *","last",p.last_name,"text",false,"Ex. Mensah")
    +field("E-mail", "email",p.email||current.user.email,"email",true)+field("Téléphone *","phone",p.phone,"tel",false,"Ex. +228 …")+field("Date de naissance *","birth",p.birth_date,"date",false)
    +'<label>Pays de résidence (ISO 3166-1)<select id="pf_countryCode">'+(window.AfriCountries?window.AfriCountries.options(p.country_code||d.country_code||window.AfriCountries.match(p.country||d.country)):'<option value="">Indisponible</option>')+'</select></label>'+field("Ville *","city",p.city||d.city,"text",false,"Ex. Lomé")+field("Adresse *","address",p.address,"text",true,"Quartier, rue, numéro")
    +field("Fonction","job",p.job_title||d.job_title,"text",false,"Ex. Responsable export")+field("Département","department",p.department||d.department,"text",false,"Ex. Opérations")+field("Organisation","organization",p.organization||d.organization,"text",true,"Ex. AfriFlow")
    +field("Langues","languages",p.languages,"text",true,"Ex. Français, anglais")+field("Contact d’urgence","emergencyName",p.emergency_name,"text",false,"Nom")+field("Téléphone d’urgence","emergencyPhone",p.emergency_phone,"tel",false,"Numéro")
    +'<div id="pfIdentity" class="wide pf-certificates"><h3>Références personnelles</h3><p class="profile-note">Chargement des identifiants...</p></div>'
    +'<label class="wide">Présentation publique<textarea id="pf_bio" maxlength="360" placeholder="Présentez brièvement votre expertise ou votre rôle.">'+esc(d.bio||"")+'</textarea></label><div class="wide"><b style="font-size:.84rem;color:var(--muted)">Portrait DiceBear personnalisable *</b>'+avatarEditor()+'<label style="margin-top:10px">ou ajouter une photo publique<input id="pf_photo" type="file" accept="image/png,image/jpeg,image/webp"></label><small style="display:block;color:var(--muted);margin-top:5px">Vous pouvez ajuster le portrait à tout moment. Ajouter une photo remplace le portrait généré ; choisir une nouvelle proposition le réactive.</small></div></div><div id="pfErr" role="alert" style="color:#b43b35;min-height:1.3em;margin-top:12px"></div><div class="profile-actions"><button type="button" id="pfSave" class="p">Enregistrer mon profil</button></div></section><aside class="profile-card"><h3>Informations proposées</h3><p class="profile-note">Pour un profil professionnel utile, vous pouvez aussi renseigner :</p><ul style="line-height:1.65;margin:0;padding-left:19px"><li>fonction et département ;</li><li>organisation et langues ;</li><li>ville et pays ;</li><li>une courte présentation ;</li><li>un contact d’urgence privé.</li></ul><div id="pfCertificates" class="pf-certificates"><h3>Mes certificats AfriFlow</h3><p class="profile-note">Chargement...</p></div></aside></div>';
  bindProfile();loadIdentifiers();loadCertificatesProfile();
}
function directoryPage(){
  $("profileMain").innerHTML='<div class="profile-tabs"><button type="button" data-profile-tab="me">Mon profil</button><button type="button" class="on" data-profile-tab="directory">Annuaire des membres</button></div><section class="profile-card"><h3>Annuaire des membres</h3><p class="profile-note">Retrouvez les collègues inscrits et leur rôle. Les coordonnées personnelles ne sont pas affichées ici.</p><div id="memberDirectory" class="directory-grid"><p class="profile-note">Chargement…</p></div></section>';
  $("profileMain").querySelectorAll("[data-profile-tab]").forEach(function(b){b.onclick=function(){profilePage()}});
  window.AFRI.listMembers().then(function(list){var box=$("memberDirectory");if(!box)return;box.innerHTML=list.length?list.map(function(m){return '<article class="member-card">'+avatar(m.avatar_kind,m.avatar_value,m.name)+'<div><b>'+esc(m.name)+'</b><small>'+esc([m.job_title,m.department].filter(Boolean).join(" · ")||"Membre AfriFlow")+'</small><small>'+esc([m.city,m.country].filter(Boolean).join(", "))+'</small>'+(m.bio?'<small>'+esc(m.bio)+'</small>':'')+'</div></article>'}).join(""):'<p class="profile-note">Aucun membre à afficher.</p>'}).catch(function(e){var box=$("memberDirectory");if(box)box.innerHTML='<p class="profile-note">Annuaire indisponible : '+esc(e.message||e)+'</p>'});
}
/* Accès rapide à l'annuaire : seules les informations professionnelles publiques sont affichées. */
function hubAvatar(){return '<span class="pf-avatar pf-dicebear"><img src="https://api.dicebear.com/10.x/lorelei/svg?seed=afriflow-assistance&backgroundColor=e8f2ec" alt="Annuaire AfriFlow" referrerpolicy="no-referrer"></span>'}
function mountMemberHub(){
  var h=$("memberHub");
  if(!h){h=document.createElement("button");h.type="button";h.id="memberHub";h.title="Membres et messages";h.setAttribute("aria-label","Ouvrir les membres et messages");h.innerHTML=hubAvatar()+'<span class="member-hub-count" hidden aria-label="Messages non lus"></span>';document.body.appendChild(h);h.onclick=openMemberHub}
  h.hidden=!window.loggedUserEmail;
  var n=Number(window.MSG_UNREAD||0),badge=h.querySelector(".member-hub-count");if(badge){badge.hidden=!n;badge.textContent=n>99?"99+":String(n);badge.setAttribute("aria-label",n+" message"+(n>1?"s":"")+" non lu"+(n>1?"s":""))}
}
function directTime(t){try{return new Date(Number(t)).toLocaleString("fr-FR",{dateStyle:"short",timeStyle:"short"})}catch(e){return ""}}
async function directRows(peer){
  var sb=window.__sb,email=String(window.loggedUserEmail||"").toLowerCase(),table=window.__TABLE||"afriflow_state";
  if(!sb||!email)return [];
  var both=await Promise.all([sb.from(table).select("key,value").like("key","msg:"+email+":%").limit(250),sb.from(table).select("key,value").like("key","sent:"+email+":%").limit(250)]);
  var err=both[0].error||both[1].error;if(err)throw err;
  return both[0].data.concat(both[1].data).filter(function(row){var v=row.value||{};return String(v.from||"").toLowerCase()===peer.email||String(v.to||"").toLowerCase()===peer.email}).sort(function(a,b){return Number(a.value.ts||0)-Number(b.value.ts||0)});
}
async function sendDirect(peer,text){
  var sb=window.__sb,from=String(window.loggedUserEmail||"").toLowerCase(),table=window.__TABLE||"afriflow_state",ts=Date.now(),k=ts+":"+Math.random().toString(36).slice(2,6),now=new Date().toISOString();
  if(!sb||!from||!peer.email)throw new Error("Session introuvable.");
  var base={from:from,fromName:window.USER_NAME||from,subject:"Discussion avec "+(peer.name||"un membre"),body:text.trim().slice(0,5000),ts:ts,read:false};
  var r=await sb.from(table).insert([{key:"sent:"+from+":"+k,value:Object.assign({},base,{to:peer.email,read:true}),updated_at:now},{key:"msg:"+peer.email+":"+k,value:Object.assign({},base,{to:peer.email}),updated_at:now}]);
  if(r.error)throw r.error;
  if(window.AfriFlowPush&&window.AfriFlowPush.notifyMessage)window.AfriFlowPush.notifyMessage(k).catch(function(){});
}
async function openMemberHub(){
  if(!window.loggedUserEmail){if(window.toast)toast("Connectez-vous pour consulter les membres.");return}
  var panel=$("profilePanel");panel.classList.remove("member-selected");panel.classList.add("member-hub-mode","open");panel.setAttribute("aria-hidden","false");document.body.classList.add("af-profile-open");panel.scrollTop=0;
  $("profileMain").innerHTML='<section class="profile-card"><div class="profile-tabs"><button type="button" class="on">Membres et messages</button><button type="button" id="memberHubProfile">Mon profil</button></div><div class="member-shell"><section class="profile-card member-list-card"><h3>Membres AfriFlow</h3><p class="profile-note">Sélectionnez un membre pour consulter son profil professionnel ou lui écrire.</p><div id="memberHubList" class="member-list"><p class="profile-note">Chargement…</p></div></section><section id="memberHubDetail" class="profile-card member-detail-card"><div class="member-detail-empty">Choisissez un membre dans l’annuaire.</div></section></div></section>';
  $("memberHubProfile").onclick=async function(){try{panel.classList.remove("member-hub-mode");await load();profilePage()}catch(e){if(window.toast)toast("Profil indisponible.")}};
  try{
    var list=(await window.AFRI.listMembers()).filter(function(m){return m.email&&m.email!==String(window.loggedUserEmail||"").toLowerCase()});
    var box=$("memberHubList");box.innerHTML=list.length?list.map(function(m,i){return '<button type="button" class="member-list-item" data-member="'+i+'">'+avatar(m.avatar_kind,m.avatar_value,m.name)+'<span><b>'+esc(m.name||"Membre AfriFlow")+'</b><small>'+esc([m.job_title,m.department].filter(Boolean).join(" · ")||"Membre AfriFlow")+'</small></span></button>'}).join(""):'<p class="profile-note">Aucun autre membre inscrit pour le moment.</p>';
    box.onclick=function(e){var b=e.target.closest("[data-member]");if(b)showMemberDetail(list[Number(b.dataset.member)])};
  }catch(e){$("memberHubList").innerHTML='<p class="profile-note">Annuaire indisponible : '+esc(e.message||e)+'</p>'}
}
function showMemberDetail(member){
  var card=$("memberHubDetail");if(!card||!member)return;
  $("profilePanel").classList.add("member-selected");
  $("memberHubList").querySelectorAll(".member-list-item").forEach(function(b){b.classList.toggle("on",Number(b.dataset.member)>=0&&b.textContent.indexOf(member.name||"")>=0)});
  card.innerHTML='<div class="member-identity">'+avatar(member.avatar_kind,member.avatar_value,member.name)+'<div><h3>'+esc(member.name||"Membre AfriFlow")+'</h3><p class="profile-note">'+esc(member.job_title||"Membre AfriFlow")+'</p></div></div><div class="member-public-info"><div><small>Département</small>'+esc(member.department||"Non renseigné")+'</div><div><small>Organisation</small>'+esc(member.organization||"AfriFlow")+'</div><div><small>Pays</small>'+esc(member.country||"Non renseigné")+'</div><div><small>Ville</small>'+esc(member.city||"Non renseignée")+'</div></div>'+(member.bio?'<p class="member-bio">'+esc(member.bio)+'</p>':'')+'<div class="profile-actions" style="justify-content:flex-start"><button type="button" class="p" id="memberWrite">Écrire à '+esc((member.name||"").split(" ")[0])+'</button></div>';
  $("memberWrite").onclick=function(){openDirectChat(member)};
}

// Ne jamais ouvrir automatiquement le clavier mobile : seule une action explicite sur la zone de saisie l'active.
// Aucun focus() sur le textarea à l'ouverture ou après chargement.
async function openDirectChat(member){
  var card=$("memberHubDetail");if(!card)return;
  card.innerHTML='<div class="member-chat"><div class="member-chat-head">'+avatar(member.avatar_kind,member.avatar_value,member.name)+'<div><b>'+esc(member.name||"Membre AfriFlow")+'</b><small>Discussion privée</small></div></div><div id="memberChatLog" class="member-chat-log"><p class="profile-note">Chargement…</p></div><div class="member-chat-compose"><textarea id="memberChatText" maxlength="5000" placeholder="Écrire un message…"></textarea><button type="button" class="p" id="memberChatSend">Envoyer</button></div></div>';
  async function render(){try{var rows=await directRows(member),log=$("memberChatLog"),mine=String(window.loggedUserEmail||"").toLowerCase();if(!log)return;log.innerHTML=rows.length?rows.map(function(x){var v=x.value||{},own=String(v.from||"").toLowerCase()===mine;return '<div class="member-bubble'+(own?' mine':'')+'>'+esc(v.body||"")+'<small>'+esc(directTime(v.ts))+'</small></div>'}).join(""):'<p class="profile-note">Commencez la discussion avec '+esc(member.name||"ce membre")+'.</p>';log.scrollTop=log.scrollHeight;var unread=rows.filter(function(x){return String(x.value.from||"").toLowerCase()===member.email&&!x.value.read});if(unread.length){await Promise.all(unread.map(function(x){return window.__sb.from(window.__TABLE||"afriflow_state").update({value:Object.assign({},x.value,{read:true})}).eq("key",x.key)}));}}catch(e){var log=$("memberChatLog");if(log)log.innerHTML='<p class="profile-note">Conversation indisponible : '+esc(e.message||e)+'</p>'}}
  $("memberChatSend").onclick=async function(){var input=$("memberChatText"),text=input.value.trim(),btn=this;if(!text)return;btn.disabled=true;try{await sendDirect(member,text);input.value="";await render()}catch(e){if(window.toast)toast("Envoi impossible : "+(e.message||e))}finally{btn.disabled=false}};
  $("memberChatText").onkeydown=function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("memberChatSend").click()}};
  await render();
}
function readPhoto(file){return new Promise(function(resolve,reject){var r=new FileReader();r.onload=function(){var im=new Image();im.onload=function(){var s=Math.min(1,320/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.max(1,Math.round(im.width*s));c.height=Math.max(1,Math.round(im.height*s));c.getContext("2d").drawImage(im,0,0,c.width,c.height);resolve(c.toDataURL("image/jpeg",.82))};im.onerror=function(){reject(new Error("Photo illisible."))};im.src=r.result};r.onerror=function(){reject(new Error("Lecture de la photo impossible."))};r.readAsDataURL(file)})}
function bindProfile(){
  $("profileMain").querySelectorAll("[data-profile-tab]").forEach(function(b){b.onclick=function(){directoryPage()}});
  bindAvatarEditor();
  $("pf_photo").onchange=function(){var f=this.files[0];if(!f)return;readPhoto(f).then(function(data){chosen={kind:"photo",value:data};renderAvatarEditor()}).catch(function(e){$("pfErr").textContent=e.message})};
  $("pfSave").onclick=saveProfile;
}
async function saveProfile(){
  var p=current.profile,d=current.directory,err=$("pfErr"),v=function(id){var x=$("pf_"+id);return x?x.value.trim():""},first=v("first"),last=v("last"),phone=v("phone"),birth=v("birth"),countryCode=v("countryCode"),country=window.AfriCountries&&countryCode?window.AfriCountries.name(countryCode):(p.country||""),city=v("city"),address=v("address");
  var required=shareholderProfileRequired();if(required&&(!first||!last||!phone||!birth||!countryCode||!city||!address||!chosen.kind||!chosen.value)){err.textContent="Renseignez les champs marqués d’un astérisque et choisissez un portrait.";return}
  var btn=$("pfSave");btn.disabled=true;err.textContent="";var now=new Date().toISOString(),display=(first+" "+last).trim()||String(current.user.email).split("@")[0],due=p.profile_due_at||new Date(Date.now()+15*86400000).toISOString();
  try{
    var profile={user_id:current.user.id,email:String(current.user.email).toLowerCase(),first_name:first,last_name:last,phone:phone,address:address,birth_date:birth,country:country,country_code:countryCode||null,city:city,job_title:v("job"),department:v("department"),organization:v("organization"),languages:v("languages"),emergency_name:v("emergencyName"),emergency_phone:v("emergencyPhone"),profile_completed_at:required?now:(p.profile_completed_at||null),profile_due_at:due,updated_at:now};
    var pub={user_id:current.user.id,email:String(current.user.email).toLowerCase(),first_name:first,last_name:last,display_name:display,avatar_kind:chosen.kind,avatar_value:chosen.value,job_title:v("job"),department:v("department"),organization:v("organization"),country:country,country_code:countryCode||null,city:city,bio:v("bio"),updated_at:now};
    var a=await window.__sb.from("afriflow_profiles").upsert(profile,{onConflict:"user_id"});if(a.error)throw a.error;var b=await window.__sb.from("afriflow_member_directory").upsert(pub,{onConflict:"user_id"});if(b.error)throw b.error;
    current.profile=profile;current.directory=pub;window.USER_NAME=display;updateHeader(profile,pub);if(window.toast)toast("Profil enregistré.");profilePage();
  }catch(e){err.textContent="Enregistrement impossible : "+(e.message||e)}finally{btn.disabled=false}
}
async function open(){var p=$("profilePanel");p.classList.add("open");p.setAttribute("aria-hidden","false");document.body.classList.add("af-profile-open");p.scrollTop=0;try{await load();profilePage()}catch(e){$("profileMain").innerHTML='<section class="profile-card"><h3>Profil indisponible</h3><p class="profile-note">'+esc(e.message||e)+'</p></section>'}}
$("profileOpen").onclick=open;$("profileClose").onclick=close;window.AfriProfileOpen=open;document.addEventListener("keydown",function(e){if(e.key==="Escape"&&$("profilePanel").classList.contains("open"))close()});
var prior=window.onRole;window.onRole=function(){if(prior)prior();if(window.loggedUserEmail)load().catch(function(){});mountMemberHub()};
var priorLogout=window.logout;window.logout=function(message){current=null;updateReminder(false);mountMemberHub();if(priorLogout)priorLogout(message)};
/* A two-second global refresh kept rebuilding the member hub even when nothing
   changed. Authentication and role events above already refresh immediately. */
setInterval(function(){if(window.loggedUserEmail&&(!current||current.user.email!==window.loggedUserEmail))load().catch(function(){});mountMemberHub()},30000);
/* Efface un ancien marqueur de test affiché littéralement dans certaines installations. */
Array.prototype.slice.call(document.body.childNodes).forEach(function(n){if(n.nodeType===3&&String(n.nodeValue||"").trim()==="\\n")n.remove()});
mountMemberHub();
})();
