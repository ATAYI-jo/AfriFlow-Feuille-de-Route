
/* ===== Comptes, droits, présence en temps réel, journal partagé ===== */
(function(){
var AFRI={}, ch=null, meta=null, online={}, timers=[], lastPend=0;
function SB(){return window.__sb} function TB(){return window.__TABLE||"afriflow_state"}
function iso(){return new Date().toISOString()}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function hex(b){return Array.prototype.map.call(new Uint8Array(b),function(x){return ("0"+x.toString(16)).slice(-2)}).join("")}
function unhex(h){var a=new Uint8Array(h.length/2);for(var i=0;i<a.length;i++)a[i]=parseInt(h.substr(i*2,2),16);return a}
async function hashPw(pw,salt){
  if(!window.crypto||!crypto.subtle)throw new Error("Le navigateur bloque le chiffrement : ouvrez le site en https.");
  var k=await crypto.subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:unhex(salt),iterations:150000},k,256));
}
async function getRow(key){var r=await SB().from(TB()).select("value").eq("key",key).maybeSingle();if(r.error)throw r.error;return r.data?r.data.value:null}
async function putRow(key,val){var r=await SB().from(TB()).upsert({key:key,value:val,updated_at:iso()});if(r.error)throw r.error}
async function listRows(prefix,lim){var r=await SB().from(TB()).select("key,value,updated_at").like("key",prefix+"%").order("updated_at",{ascending:false}).limit(lim||500);if(r.error)throw r.error;return r.data||[]}
function ukey(e){return "user:"+String(e).toLowerCase()}
function fail(e){var m=String((e&&e.message)||e);return /fetch|network|Failed/i.test(m)?"Connexion au serveur impossible. Vérifiez votre réseau.":m}
function fdt(t){return new Date(t).toLocaleString("fr-FR",{dateStyle:"short",timeStyle:"short"})}

/* --- Comptes (Supabase Auth : mots de passe gérés et hachés par le serveur) --- */
function nameOf(us){var md=us.user_metadata||{};return md.full_name||md.name||String(us.email).split("@")[0]}
function nameParts(name){
  var p=String(name||"").trim().split(/\s+/);return {first:p.shift()||"",last:p.join(" ")};
}
async function ensureMemberProfile(us){
  /* Le profil privé et l'annuaire public sont volontairement séparés. */
  if(!us||!us.id||!us.email)return;
  var email=String(us.email).toLowerCase(),n=nameParts(nameOf(us)),now=iso();
  try{
    var p=await SB().from("afriflow_profiles").insert({
      user_id:us.id,email:email,first_name:n.first,last_name:n.last,
      profile_due_at:new Date(Date.now()+15*24*60*60*1000).toISOString(),created_at:now,updated_at:now
    });
    if(p.error&&p.error.code!=="23505")console.warn("Profil AfriFloW :",p.error.message);
    var d=await SB().from("afriflow_member_directory").insert({
      user_id:us.id,email:email,first_name:n.first,last_name:n.last,
      display_name:String(nameOf(us)||email),created_at:now,updated_at:now
    });
    if(d.error&&d.error.code!=="23505")console.warn("Annuaire AfriFloW :",d.error.message);
  }catch(e){console.warn("Initialisation du profil :",e.message||e)}
}
async function finish(us,intent){
  var email=String(us.email).toLowerCase(),isA=false;
  try{var a=await SB().rpc("af_is_admin");isA=a.data===true}catch(e){}
  var u=await getRow(ukey(email));
  if(!u){
    u={email:email,name:nameOf(us),grants:[],created:iso()};
    var ins=await SB().from(TB()).insert({key:ukey(email),value:u,updated_at:iso()});
    if(ins.error&&ins.error.code!=="23505")throw ins.error;
  }
  ensureMemberProfile(us);
  var market=await ensureMarketProfile(us,intent);
  var g=isA?["all"]:(u.grants||[]);
  return {ok:true,email:email,name:isA?"Administrateur":(u.name||nameOf(us)),grants:g,role:isA?"admin":(g.length?"editor":"reader"),market:market};
}
function readMarketIntent(){
  var v=document.getElementById("authMarketRole"); var role=v&&v.value;
  try{role=role||sessionStorage.getItem("afriflow_market_intent")}catch(e){}
  return /^(client|shareholder|partner)$/.test(role||"")?role:"client";
}
async function ensureMarketProfile(us,intent){
  if(!us||!us.id)throw new Error("Session utilisateur invalide");
  var selected=/^(client|shareholder|partner)$/.test(intent||"")?intent:null;
  try{
    var existing=await SB().from("afriflow_market_profiles").select("user_id,requested_role,access_mode").eq("user_id",us.id).maybeSingle();
    if(existing.error)throw existing.error;
    if(existing.data){
      /* Le rôle est choisi une seule fois à la création du compte. Une connexion
         ultérieure — y compris OAuth — ne doit jamais modifier cet accès. */
      return existing.data;
    }
    if(!selected)return {access_mode:"onboarding_required"};
    var created=await SB().from("afriflow_market_profiles").insert({user_id:us.id,requested_role:selected}).select("user_id,requested_role,access_mode").single();
    if(created.error)throw created.error;return created.data;
  }catch(e){
    /* Fail closed: do not treat an unavailable profile as collaborator access. */
    throw new Error("Impossible de vérifier les autorisations du profil : "+fail(e));
  }
}
/* Choix obligatoire lors du premier login (OAuth, email ou autre).
 * Pas de droits jusqu'à l'insertion et la vérification du profil côté Supabase.
 */
AFRI.promptRoleChoice=async function(){
  if(!SB())return false;
  var response=await SB().auth.getUser(),user=response.data&&response.data.user;
  if(response.error||!user)return false;
  var current=await SB().from("afriflow_market_profiles")
    .select("requested_role,access_mode").eq("user_id",user.id).maybeSingle();
  if(current.error)throw current.error;
  if(current.data){var existing=await finish(user);enterApp(existing.email,existing.role,existing.name,existing.grants,existing.market);return true;}
  var overlay=document.getElementById("afRoleChooser");
  if(!overlay){
    overlay=document.createElement("div");overlay.id="afRoleChooser";overlay.setAttribute("role","dialog");
    overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-labelledby","afRoleHeading");
    overlay.style.cssText="position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(6,24,17,.88);padding:18px";
    overlay.innerHTML='<section style="width:min(100%,500px);max-height:90dvh;overflow:auto;background:#fff;color:#163b2a;padding:27px;border-radius:22px;box-shadow:0 16px 70px #0005;font:16px/1.5 system-ui">'
      +'<h2 id="afRoleHeading" style="margin:0 0 10px">Bienvenue sur AfriFloW</h2>'
      +'<p>Pour votre première connexion, choisissez votre profil. Ce choix ne pourra pas vous donner de droits supplémentaires sans validation.</p>'
      +'<div style="display:grid;gap:12px">'
      +'<button type="button" data-af-role="client">Client — accéder à la Marketplace</button>'
      +'<button type="button" data-af-role="partner">Partenaire — demander une approbation</button>'
      +'<button type="button" data-af-role="shareholder">Actionnaire — demander une approbation</button></div>'
      +'<p id="afRoleMessage" role="status" style="font-size:14px"></p>'
      +'<button type="button" id="afRoleSignout">Déconnexion</button></section>';
    document.body.appendChild(overlay);
    overlay.querySelectorAll("[data-af-role]").forEach(function(button){
      button.style.cssText="width:100%;text-align:left;padding:14px;border:1px solid #bdd8cc;border-radius:12px;background:#f3faf6;color:#164a33;font:inherit;cursor:pointer";
      button.addEventListener("click",async function(){
        var msg=document.getElementById("afRoleMessage");
        overlay.querySelectorAll("button").forEach(function(b){b.disabled=true});
        try{
          var data=await ensureMarketProfile(user,button.dataset.afRole);
          if(!data||data.access_mode==="onboarding_required")throw new Error("Profil non enregistré");
          overlay.remove();
          var info=await finish(user);
          enterApp(info.email,info.role,info.name,info.grants,info.market);
        }catch(e){
          msg.textContent="Erreur : "+fail(e);
          overlay.querySelectorAll("button").forEach(function(b){b.disabled=false});
        }
      });
    });
    overlay.querySelector("#afRoleSignout").onclick=async function(){
      await SB().auth.signOut({scope:"local"});
      overlay.remove();if(window.AfriMarket)window.AfriMarket.openPublic();
    };
  }
  overlay.style.display="grid";
  overlay.querySelector("[data-af-role]").focus();
  return true;
};
AFRI.login=async function(email,pwd,intent,captchaToken){
  try{
    if(!SB())return {ok:false,error:"Service de comptes indisponible."};
    var r=await SB().auth.signInWithPassword({email:email,password:pwd,options:{captchaToken:captchaToken}});
    if(r.error){
      var m=r.error.message||"";
      if(/not confirmed/i.test(m))return {ok:false,error:"Email non confirmé : cliquez sur le lien reçu par email."};
      if(/invalid login/i.test(m))return {ok:false,error:"Email ou mot de passe incorrect. Compte créé avant la mise à jour de sécurité ? Cliquez sur « S'inscrire » avec le même email pour choisir un mot de passe."};
      return {ok:false,error:m};
    }
    return await finish(r.data.user,intent);
  }catch(e){return {ok:false,error:fail(e)}}
};
AFRI.register=async function(email,name,pwd,intent,captchaToken){
  try{
    if(!SB())return {ok:false,error:"Service de comptes indisponible."};
    intent=/^(client|shareholder|partner)$/.test(intent||"")?intent:"client";
    try{sessionStorage.setItem("afriflow_market_intent",intent)}catch(e){}
    var r=await SB().auth.signUp({email:email,password:pwd,options:{data:{full_name:name},emailRedirectTo:location.origin+location.pathname,captchaToken:captchaToken}});
    if(r.error){
      if(/already registered/i.test(r.error.message||""))return {ok:false,error:"Cet email est déjà inscrit. Connectez-vous."};
      return {ok:false,error:r.error.message};
    }
    if(!r.data.session)return {ok:true,confirm:true};
    return await finish(r.data.user,intent);
  }catch(e){return {ok:false,error:fail(e)}}
};
AFRI.resume=async function(){
  try{
    var r=await SB().auth.getSession(),us=r.data&&r.data.session&&r.data.session.user;
    if(!us||!us.email)return false;
    var x=await finish(us);
    if(x.market&&x.market.access_mode==="onboarding_required"){await AFRI.promptRoleChoice();return true;}
    enterApp(x.email,x.role,x.name,x.grants,x.market);return true;
  }catch(e){return false}
};
AFRI.signOut=function(){try{if(SB())SB().auth.signOut({scope:"local"})}catch(e){}};
AFRI.listUsers=async function(){return (await listRows("user:",500)).map(function(r){return r.value})};
AFRI.listMembers=async function(){
  var r=await SB().from("afriflow_member_directory")
    .select("user_id,email,first_name,last_name,display_name,avatar_kind,avatar_value,job_title,department,organization,country,city,bio,updated_at")
    .order("display_name",{ascending:true}).limit(500);
  if(r.error)throw r.error;
  return (r.data||[]).map(function(u){
    u.name=u.display_name||[u.first_name,u.last_name].filter(Boolean).join(" ")||u.email;return u;
  });
};
AFRI.listRequests=async function(){return (await listRows("req:",300)).map(function(r){return r.value})};
AFRI.setGrants=async function(email,g){var u=await getRow(ukey(email));if(!u)throw new Error("Compte introuvable");u.grants=g;await putRow(ukey(email),u)};
AFRI.deleteUser=async function(email){
  var e=String(email).toLowerCase(),r=await SB().functions.invoke("afriflow-admin-user",{body:{action:"delete_member",email:e}});
  if(r.error)throw r.error;
  if(r.data&&r.data.error)throw new Error(r.data.error);
  return r.data;
};
AFRI.sendRequest=async function(pages,msg){var e=loggedUserEmail.toLowerCase();await putRow("req:"+e,{email:e,name:USER_NAME,pages:pages,msg:msg,at:iso(),status:"pending"})};
AFRI.sendDocRequest=async function(path){var e=loggedUserEmail.toLowerCase();await putRow("req:"+e,{email:e,name:USER_NAME,pages:[],docPath:path,msg:"Demande de modification : "+String(path).split("/").pop(),at:iso(),status:"pending"})};
AFRI.myRequest=function(){return getRow("req:"+loggedUserEmail.toLowerCase())};
AFRI.resolve=async function(email,ok){
  email=String(email).toLowerCase(); var r=await getRow("req:"+email); if(!r)return;
  if(ok&&r.docPath){
    var per=await getRow("pub:dbxperm")||{},users=per.users||{},key=String(r.docPath).toLowerCase();
    var list=Array.isArray(users[key])?users[key]:[];
    if(list.indexOf(email)<0)list.push(email);
    users[key]=list;
    per.users=users;per.at=Date.now();per.by=loggedUserEmail;
    await putRow("pub:dbxperm",per);
  }else if(ok){var u=await getRow(ukey(email));if(u){var g=u.grants||[];(r.pages||[]).forEach(function(p){if(g.indexOf(p)<0)g.push(p)});if(g.indexOf("all")>-1)g=["all"];u.grants=g;await putRow(ukey(email),u)}}
  r.status=ok?"approved":"refused";r.done=iso();await putRow("req:"+email,r);
};
async function refreshMe(){
  if(!loggedUserEmail||USER_ROLE==="admin")return;
  try{
    var u=await getRow(ukey(loggedUserEmail));
    if(!u){window.logout("Votre compte n'existe plus. Inscrivez-vous à nouveau.");return}
    var g=u.grants||[];if(JSON.stringify(g)===JSON.stringify(USER_GRANTS))return;
    USER_GRANTS=g;USER_ROLE=g.length?"editor":"reader";document.body.classList.toggle("ro",!canEdit());
    var ind=document.getElementById("editStatusIndicator");if(ind)ind.innerHTML=ic(canEdit()?"unlock":"lock")+" Connecté : "+esc(loggedUserEmail)+(canEdit()?" — modification active":" — lecture seule");
    try{saveSession(true)}catch(e){}
    renderRoadmap();if(window.onRole)window.onRole();
    if(window.toast)toast(g.length?"Vos droits de modification ont été mis à jour.":"Vos droits de modification ont été retirés.");
  }catch(e){}
}
async function pollReq(){
  try{var n=(await AFRI.listRequests()).filter(function(r){return r.status==="pending"}).length;
    if(n>lastPend&&window.toast)toast(n+" demande(s) de modification en attente : ouvrez « Administration ».");
    lastPend=n;if(window.onPending)onPending(n)}catch(e){}
}
AFRI.pollReq=pollReq;

/* --- Présence en temps réel --- */
function track(){if(ch&&meta)ch.track(meta)}
AFRI.start=function(email,role,name){
  var s=SB();if(!s)return;
  meta={email:email,name:name||"",role:role,page:(meta&&meta.page)||"Accueil",since:(meta&&meta.since)||iso()};
  if(ch&&ch._af===email){track();return}
  AFRI.stop(true);
  ch=s.channel("afriflow-presence",{config:{presence:{key:email}}});ch._af=email;
  ch.on("presence",{event:"sync"},function(){online=ch.presenceState();if(AFRI.onPresence)AFRI.onPresence()});
  ch.subscribe(function(st){if(st==="SUBSCRIBED")track()});
  timers.push(setInterval(refreshMe,45000));setTimeout(refreshMe,1500);
  if(role==="admin"){timers.push(setInterval(pollReq,25000));setTimeout(pollReq,2000)}
};
AFRI.stop=function(keep){
  timers.forEach(clearInterval);timers=[];
  if(ch){try{ch.untrack();SB().removeChannel(ch)}catch(e){}ch=null}
  online={};if(!keep)meta=null;
};
AFRI.page=function(name){if(meta){meta.page=name;track()}};
AFRI.onlineList=function(){return Object.keys(online).map(function(k){var a=online[k];return a[a.length-1]})};

/* --- Journal des connexions partagé (avant : enregistré seulement sur l'appareil) --- */
AFRI.log=function(text){
  if(!SB()||!loggedUserEmail)return;var ts=Date.now();
  SB().from(TB()).insert({key:"log:"+ts+":"+Math.random().toString(36).slice(2,6),value:{email:loggedUserEmail,date:new Date().toLocaleString("fr-FR",{dateStyle:"short",timeStyle:"short"}),action:text,ts:ts},updated_at:iso()}).then(function(r){if(r.error)console.warn("Journal cloud :",r.error.message)});
};
AFRI.mergeLogs=async function(){
  try{
    var cl=(await listRows("log:",200)).map(function(r){return r.value}),k=function(l){return l.email+"|"+l.date+"|"+l.action},sk={};
    cl.forEach(function(l){sk[k(l)]=1});
    var merged=cl.concat((START_ARCHIVES.logs||[]).filter(function(l){return !sk[k(l)]})).slice(0,MAX_LOGS);
    var changed=JSON.stringify(merged)!==JSON.stringify(START_ARCHIVES.logs);START_ARCHIVES.logs=merged;return changed;
  }catch(e){return false}
};

/* --- Demande de droits de modification (côté utilisateur) --- */
function reqUI(){
  var lo=document.getElementById("logout-btn"),b=document.getElementById("reqBtn");if(!lo)return;
  if(!loggedUserEmail||USER_ROLE==="admin"||USER_GRANTS.indexOf("all")>-1){if(b)b.remove();return}
  if(!b){b=document.createElement("button");b.type="button";b.id="reqBtn";lo.parentNode.insertBefore(b,lo);b.onclick=openReq}
  b.textContent="Demander des droits de modification";b.disabled=false;
  AFRI.myRequest().then(function(r){if(r&&r.status==="pending"){b.textContent="Demande en attente d'approbation";b.disabled=true}}).catch(function(){});
}
function openReq(){
  var box=document.getElementById("xmBox"),L=[{id:"all",n:"Tout (toute la plateforme)"}].concat(window.getPages?getPages():[]);
  box.innerHTML='<h2 style="margin-top:0">Demande de droits de modification</h2><p style="font-size:.85rem;color:var(--muted);margin-top:0">Cochez ce que vous souhaitez pouvoir modifier. L\'administrateur doit approuver votre demande.</p>'
  +L.map(function(p){return '<label class="rq"><input type="checkbox" value="'+esc(p.id)+'"> '+esc(p.n)+'</label>'}).join("")
  +'<div class="fm"><label for="rqM">Message (facultatif)</label><input id="rqM" autocomplete="off"></div><div id="xerr" role="alert" style="color:#c0392b;min-height:1.2em;font-size:.85rem"></div><div class="dact"><button type="button" class="p" id="rqOk">Envoyer la demande</button><button type="button" id="rqNo">Annuler</button></div>';
  box.onkeydown=null;document.getElementById("xm").classList.add("on");
  document.getElementById("rqNo").onclick=function(){document.getElementById("xm").classList.remove("on")};
  document.getElementById("rqOk").onclick=function(){
    var v=[].slice.call(box.querySelectorAll("input[type=checkbox]:checked")).map(function(i){return i.value});
    if(!v.length){document.getElementById("xerr").textContent="Cochez au moins un élément.";return}
    if(v.indexOf("all")>-1)v=["all"];
    AFRI.sendRequest(v,document.getElementById("rqM").value.trim()).then(function(){document.getElementById("xm").classList.remove("on");if(window.toast)toast("Demande envoyée à l'administrateur.");reqUI()}).catch(function(e){document.getElementById("xerr").textContent="Envoi impossible : "+fail(e)});
  };
}
var prev=window.onRole;
window.onRole=function(){if(prev)prev();if(loggedUserEmail)AFRI.start(loggedUserEmail,USER_ROLE,USER_NAME);reqUI();if(window.cloudLoad)cloudLoad()};
  /* --- Connexion OAuth : erreurs affichées et reprise de session après redirection --- */
var oauthBusy = false;
var oauthReturning = /(?:^|[?#&])(?:code|access_token|error|error_description)=/.test(
  (window.__oauthQuery || '') + '&' + (window.__oauthReturn || '')
);
var passwordRecoveryReturning = /(?:^|[?#&])type=recovery(?:[&#]|$)/.test(
  location.search + '&' + location.hash
);
var oauthPending = false;
try { oauthPending = sessionStorage.getItem('afriflow_oauth_pending') === '1'; } catch (error) {}
function oauthError(message) {
  var el = document.getElementById('authError');
  if (el) el.textContent = message || 'Connexion externe impossible.';
}
function oauthFriendlyError(message) {
  var raw=String(message||"").toLowerCase();
  if(raw.indexOf("redirect_uri")>-1||raw.indexOf("redirect")>-1) return "Google refuse le retour de connexion : l’adresse de retour doit être autorisée dans Google et Supabase.";
  if(raw.indexOf("access_blocked")>-1||raw.indexOf("not configured")>-1||raw.indexOf("client")>-1) return "Connexion Google non finalisée côté administrateur. Vérifiez l’identifiant et le secret Google dans Supabase.";
  return "Connexion Google refusée. Réessayez, ou contactez AfriFloW si le problème persiste.";
}
function oauthRedirect() { return location.origin + location.pathname; }
async function loginOAuth(provider) {
  if (!SB()) { oauthError('Service de connexion indisponible. Rechargez la page.'); return; }
  if (oauthBusy) return;
  oauthBusy = true;
  oauthError('');
  try {
    try { sessionStorage.setItem('afriflow_market_intent', readMarketIntent()); } catch (error) {}
    var captchaError=captchaProblem(); if(captchaError){oauthError(captchaError);oauthBusy=false;return;}
    var options = { redirectTo: oauthRedirect(), captchaToken:turnstileToken };
    if (provider === 'google') options.queryParams = { prompt: 'select_account' };
    if (provider === 'azure') options.scopes = 'email';
    try { sessionStorage.setItem('afriflow_oauth_pending', '1'); } catch (error) {}
    var response = await SB().auth.signInWithOAuth({provider:provider, options:options});
    if (response.error) throw response.error;
    if (!response.data || !response.data.url) throw new Error('Aucune redirection OAuth reçue. Vérifiez la configuration du fournisseur dans Supabase.');
  } catch (error) {
    oauthBusy = false;
    try { sessionStorage.removeItem('afriflow_oauth_pending'); } catch (ignore) {}
    oauthError(provider === 'google' ? oauthFriendlyError(fail(error)) : 'Connexion ' + provider + ' : ' + fail(error));
  }
}
window.afriOAuthLogin = loginOAuth;
document.querySelectorAll('.oauth').forEach(function(button) {
  button.onclick = function() { loginOAuth(button.dataset.p); };
});
var oauthHandled = false;
async function finishOAuthUser(user) {
  if (oauthHandled || !user || !user.email) return;
  oauthHandled = true;
  try {
    var info = await finish(user);
    if(info.market && info.market.access_mode==="onboarding_required"){
      await AFRI.promptRoleChoice();
    } else {
      enterApp(info.email, info.role, info.name, info.grants, info.market);
    }
    recordUserAction('Connexion via ' + ((user.app_metadata && user.app_metadata.provider) || 'fournisseur externe'));
    try { sessionStorage.removeItem('afriflow_oauth_pending'); } catch (error) {}
    if (oauthReturning) history.replaceState(null, '', location.pathname);
  } catch (error) {
    oauthHandled = false;
    oauthError('Compte connecté, mais ouverture AfriFloW impossible : ' + fail(error));
  }
}
(async function oauthResume() {
  if (!SB()) return;
  var params = new URLSearchParams((window.__oauthReturn || '').replace(/^#/, ''));
  var query = new URLSearchParams((window.__oauthQuery || '').replace(/^\?/, ''));
  var oauthFailure = params.get('error_description') || query.get('error_description') ||
                     params.get('error') || query.get('error');
  if (oauthFailure) {
    try { sessionStorage.removeItem('afriflow_oauth_pending'); } catch (error) {}
    oauthError(oauthFriendlyError(oauthFailure));
    return;
  }
  // OAuth session recovery may finish after the callback's URL has been cleaned.
  // onAuthStateChange catches it without treating regular email/password sign-ins as OAuth.
  SB().auth.onAuthStateChange(function (event, session) {
    if (event === 'PASSWORD_RECOVERY' && session) { setTimeout(showPasswordRecovery, 0); return; }
    if (event !== 'SIGNED_IN' || !(oauthReturning || oauthPending) || !session || !session.user) return;
    setTimeout(function () { finishOAuthUser(session.user); }, 0);
  });
  if (passwordRecoveryReturning) {
    for (var recoveryAttempt = 0; recoveryAttempt < 16; recoveryAttempt++) {
      var recoverySession = await SB().auth.getSession();
      if (recoverySession.data && recoverySession.data.session) { showPasswordRecovery(); return; }
      await new Promise(function(resolve) { setTimeout(resolve, 350); });
    }
    oauthError('Le lien de réinitialisation est invalide ou a expiré. Demandez-en un nouveau.');
  } else if (oauthReturning || oauthPending) {
    // En retour PKCE, on échange explicitement le code si la récupération automatique
    // n'a pas encore écrit la session : cela évite le faux « session introuvable ».
    var oauthCode = query.get('code');
    var initialSession = await SB().auth.getSession();
    if (initialSession.data && initialSession.data.session && initialSession.data.session.user) {
      await finishOAuthUser(initialSession.data.session.user);
    } else if (oauthCode) {
      var exchanged = await SB().auth.exchangeCodeForSession(oauthCode);
      if (exchanged.error) {
        oauthError('La connexion Google a expiré ou a été interrompue. Recommencez depuis le bouton Google dans ce même navigateur.');
      } else if (exchanged.data && exchanged.data.session && exchanged.data.session.user) {
        await finishOAuthUser(exchanged.data.session.user);
      }
    }
    // Supabase peut aussi récupérer une session OAuth depuis le fragment ou un code PKCE.
    for (var attempt = 0; attempt < 16 && !oauthHandled; attempt++) {
      var result = await SB().auth.getSession();
      if (result.error) { oauthError('Session OAuth : ' + fail(result.error)); break; }
      var user = result.data && result.data.session && result.data.session.user;
      if (user) { await finishOAuthUser(user); break; }
      await new Promise(function(resolve) { setTimeout(resolve, 350); });
    }
    if (!oauthHandled && !document.getElementById('authError').textContent) {
      oauthError('Authentification Google terminée mais session introuvable sur ce navigateur. Vérifiez le retour OAuth et les URL de redirection.');
    }
  } else {
    AFRI.resume().then(function(ok) {
      if (!ok) { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
    });
  }
})();
window.AFRI = AFRI;
})();
