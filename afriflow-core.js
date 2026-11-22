
var STORAGE_KEY = "afriflow_journal_v8", THEME_KEY = "afriflow_theme_v1", MAX_LOGS = 300;

var DEFAULT_ITEMS = [
  {country:"tg",status:"done",date:"Juin–juil. 2026",title:"1. Identité de marque",desc:"Création du logo, animation et visuels de la marque AfriFloW.",details:"Mise en place de l'identité visuelle complète, des supports de communication et validation de la charte graphique fondatrice. Les premiers retours de terrain confirment l'adéquation de notre image avec les attentes du marché togolais et ouest-africain."},
  {country:"tg",status:"done",date:"Juin–août 2026",title:"2. Structure et gouvernance",desc:"Organisation des fonctions, règlement intérieur et réunions hebdomadaires.",details:"Définition des rôles des associés, structuration de la gouvernance exécutive et mise en place des indicateurs clés de performance (KPI) pour le suivi opérationnel."},
  {country:"tg",status:"doing",date:"Sept. 2026",title:"3. Prospection et marché togolais",desc:"Premiers tests concluants et accueil favorable du goût du produit.",details:"Analyse approfondie des retours clients, dégustations publiques réussies et adaptation ciblée de l'emballage pour maximiser l'attractivité en rayon."},
  {country:"bf",status:"todo",date:"Q4 2026",title:"4. Référencement grandes surfaces",desc:"Constitution des dossiers fournisseurs pour les enseignes partenaires.",details:"Préparation des catalogues produits, mise aux normes des packagings et négociations commerciales avancées pour un référencement national."},
  {country:"sn",status:"todo",date:"2027",title:"5. Expansion régionale & boutique en ligne",desc:"Lancement de la plateforme e-commerce et ouverture de nouveaux marchés.",details:"Déploiement des passerelles de paiement mobile, optimisation de la logistique d'exportation transfrontalière et campagnes marketing régionales."}
];

var START_ARCHIVES = {
  title: "START · Registre d'audit & historique des visites",
  date: "Suivi des connexions & actions",
  desc: "Historique des connexions et actions effectuées depuis ce navigateur, avec horodatage.",
  logs: [],
  docs: [{name:"Note de cadrage stratégique globale (Dropbox)", url:"https://www.dropbox.com"}]
};

var ITEMS = [];
var ST = {done:["Réalisé","var(--done)"], doing:["En cours","var(--doing)"], todo:["À venir","var(--todo)"]};
var loggedUserEmail = "";
var roadPath = null, roadLength = 0, scrollTicking = false;

function $(i){ return document.getElementById(i); }
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function safeUrl(u){ try { var x = new URL(u); return (x.protocol === "https:" || x.protocol === "http:") ? x.href : "#"; } catch(e){ return "#"; } }
function safeImg(s){ return (typeof s === "string" && /^data:image\/(png|jpe?g|gif|webp);base64,/.test(s)) ? s : ""; }
function nowStr(){ return new Date().toLocaleString("fr-FR", {dateStyle:"short", timeStyle:"short"}); }
function clone(o){ return JSON.parse(JSON.stringify(o)); }

/* ---------- Données ---------- */
function normalize(){
  if(!Array.isArray(ITEMS)) ITEMS = [];
  ITEMS = ITEMS.filter(function(i){ return i && typeof i === "object"; });
  ITEMS.forEach(function(i){
    if(!ST[i.status]) i.status = "todo";
    if(!Array.isArray(i.docs)) i.docs = [];
    if(typeof i.image !== "string") i.image = "";
  });
  if(!Array.isArray(START_ARCHIVES.logs)) START_ARCHIVES.logs = [];
  if(!Array.isArray(START_ARCHIVES.docs)) START_ARCHIVES.docs = [];
  if(START_ARCHIVES.logs.length > MAX_LOGS) START_ARCHIVES.logs.length = MAX_LOGS;
}
function loadLocal(){
  ITEMS = clone(DEFAULT_ITEMS);
  try {
    var v = localStorage.getItem(STORAGE_KEY);
    if(v){
      var data = JSON.parse(v);
      if(Array.isArray(data.items)) ITEMS = data.items;
      MAP = mergeMap(data.map);
      if(data.archives && typeof data.archives === "object") START_ARCHIVES = Object.assign(START_ARCHIVES, data.archives);
    }
  } catch(e){}
  normalize();
}
function saveLocal(){
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({items:ITEMS, archives:START_ARCHIVES, map:MAP})); return true; }
  catch(e){ alert("Sauvegarde impossible : l'espace de stockage du navigateur est plein (images trop lourdes ?). Exportez une sauvegarde JSON."); return false; }
}
function recordUserAction(text){
  if(!loggedUserEmail) return;
  START_ARCHIVES.logs.unshift({email:loggedUserEmail, date:nowStr(), action:text});
  if(START_ARCHIVES.logs.length > MAX_LOGS) START_ARCHIVES.logs.length = MAX_LOGS;
  saveLocal();
  if(window.AFRI) AFRI.log(text);
}

/* ---------- Authentification (comptes Supabase Auth, droits contrôlés côté serveur) ---------- */
var AUTH_MODE = "login", AUTH_STEP = 1;
var TURNSTILE_SITE_KEY = "0x4AAAAAAGGdSaQPHSavzxha", turnstileWidgetId = null, turnstileToken = "", captchaAttempts = 0, captchaUnavailable = false, captchaTimer = null;
function captchaNotice(){
  var host=$("authCaptcha"); if(!host)return;
  host.innerHTML='<div class="auth-captcha-notice">La vérification Cloudflare est momentanément inaccessible.<button type="button" id="authCaptchaRetry">Réessayer</button></div>';
  var retry=$("authCaptchaRetry"); if(retry)retry.onclick=function(){captchaUnavailable=false;captchaAttempts=0;turnstileWidgetId=null;mountCaptcha();};
}
function mountCaptcha(){
  var host=$("authCaptcha"); if(!host)return;
  if(captchaTimer){clearTimeout(captchaTimer);captchaTimer=null;}
  if(!window.turnstile){
    captchaAttempts+=1;
    if(captchaAttempts>=20){captchaUnavailable=true;captchaNotice();return;}
    captchaTimer=setTimeout(mountCaptcha,250); return;
  }
  captchaAttempts=0; captchaUnavailable=false;
  if(turnstileWidgetId===null){
    host.innerHTML="";
    turnstileWidgetId=window.turnstile.render(host,{sitekey:TURNSTILE_SITE_KEY,theme:"light",callback:function(token){turnstileToken=token;$("authError").textContent="";},"expired-callback":function(){turnstileToken="";},"error-callback":function(){turnstileToken="";captchaUnavailable=true;turnstileWidgetId=null;captchaNotice();}});
  }
}
function resetCaptcha(){turnstileToken="";if(window.turnstile&&turnstileWidgetId!==null)window.turnstile.reset(turnstileWidgetId);}
function captchaProblem(){return turnstileToken?"":captchaUnavailable?"La vérification Cloudflare est indisponible. Désactivez temporairement le VPN ou le bloqueur de contenu, puis réessayez.":"Validez la vérification de sécurité avant de continuer.";}
function authFinalStep(){ return AUTH_MODE === "register" ? 4 : 3; }
function authStepFocus(id){ setTimeout(function(){ var input=$(id); if(input) input.focus(); },0); }
function renderAuthStep(){
  if(AUTH_MODE === "recovery") return;
  var register = AUTH_MODE === "register", finalStep = authFinalStep(), step = AUTH_STEP;
  var roleStep = step === 1, nameStep = register && step === 2, emailStep = (!register && step === 2) || (register && step === 3), passwordStep = step === finalStep;
  document.querySelectorAll("#auth-screen .oauth,.or").forEach(function(el){ el.style.display=roleStep ? "" : "none"; });
  ["authMarketRole","authMarketRoleLabel"].forEach(function(id){ $(id).style.display=register && roleStep ? "" : "none"; });
  $("authName").style.display=nameStep ? "" : "none";
  $("authEmailInput").style.display=emailStep ? "" : "none";
  $("authPasswordRow").style.display=passwordStep ? "" : "none";
  $("authPassword2Row").style.display=register && passwordStep ? "" : "none";
  $("authForgot").style.display=!register && passwordStep ? "" : "none";
  $("authCaptcha").style.display=""; setTimeout(mountCaptcha,0);
  $("authBtn").style.display=passwordStep ? "" : "none";
  $("authNext").style.display=passwordStep ? "none" : "";
  $("authBack").style.display=step > 1 ? "" : "none";
  $("authProgress").style.display=""; $("authProgress").textContent="Étape "+step+" sur "+finalStep;
  if(roleStep) $("authHint").textContent=register?"Choisissez votre profil AfriFloW. Les demandes Partenaire et Actionnaire nécessitent une approbation.":"Connectez-vous avec Google ou continuez par e-mail. Si vous n’avez pas de profil, vous le choisirez après la connexion.";
  else if(nameStep) $("authHint").textContent="Comment devons-nous vous appeler ?";
  else if(emailStep) $("authHint").textContent=register?"Quelle est votre adresse e-mail ?":"Entrez votre adresse e-mail ou votre identifiant personnel AfriFloW.";
  else $("authHint").textContent=register ? "Créez un mot de passe personnel d’au moins 8 caractères." : "Entrez votre mot de passe pour continuer.";
  if(roleStep) authStepFocus(register?"authMarketRole":"authNext"); else if(nameStep) authStepFocus("authName"); else if(emailStep) authStepFocus("authEmailInput"); else authStepFocus("authPasswordInput");
}
function nextAuthStep(){
  var register=AUTH_MODE === "register", err=$("authError"); err.textContent="";
  if(AUTH_STEP === 2 && register && $("authName").value.trim().length < 2){ err.textContent="Indiquez votre nom complet."; return; }
  var emailStep=(!register && AUTH_STEP === 2)||(register && AUTH_STEP === 3);
  if(emailStep && !(register?/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($("authEmailInput").value.trim()):(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($("authEmailInput").value.trim())||/^AF-[0-9]{6,12}$/i.test($("authEmailInput").value.trim())))){err.textContent=register?"Adresse e-mail invalide.":"Indiquez votre e-mail ou votre identifiant AfriFloW.";return;}
  AUTH_STEP=Math.min(authFinalStep(),AUTH_STEP+1); renderAuthStep();
}
function setAuthMode(m){
  AUTH_MODE = m; AUTH_STEP = 1; var reg = m === "register";
  $("authRecoveryFields").style.display = "none"; $("tabLogin").parentNode.style.display = ""; $("authNext").parentNode.style.display="";
  $("authBtn").textContent = reg ? "S'inscrire" : "Se connecter";
  $("tabLogin").classList.toggle("on", !reg); $("tabReg").classList.toggle("on", reg);
  $("authPasswordInput").setAttribute("autocomplete", reg ? "new-password" : "current-password");
  $("authError").textContent = "";
  resetCaptcha();
  renderAuthStep();
}
function toggleAuthPassword(button){
  var input=$(button.dataset.passwordToggle); if(!input)return;
  var reveal=input.type === "password"; input.type=reveal?"text":"password";
  button.innerHTML=ic(reveal?"eye-off":"eye"); button.setAttribute("aria-pressed",String(reveal));
  button.setAttribute("aria-label",(reveal?"Masquer ":"Afficher ")+(input.placeholder||"le mot de passe").toLowerCase());
}
function passwordSafetyMessage(password){
  if(password.length < 12) return "Utilisez au moins 12 caractères.";
  if(!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return "Utilisez une majuscule, une minuscule, un chiffre et un symbole.";
  return "";
}
async function requestPasswordReset(){
  var email=$("authEmailInput").value.trim().toLowerCase(), err=$("authError"), button=$("authForgot");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){err.style.color="";err.textContent="Indiquez votre adresse email pour recevoir le lien.";$("authEmailInput").focus();return;}
  if(!SB()){err.textContent="Service de comptes indisponible.";return;}
  button.disabled=true; err.textContent="";
  try{
    var captchaError=captchaProblem();if(captchaError){err.textContent=captchaError;return;}
    var result=await SB().auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname,captchaToken:turnstileToken});
    if(result.error)throw result.error;
    err.style.color="#1f5d3a";err.textContent="Si cette adresse possède un compte, un lien sécurisé de réinitialisation vient d’être envoyé.";
  }catch(e){err.style.color="";err.textContent="Impossible d’envoyer le lien pour le moment. Réessayez dans quelques minutes.";}
  finally{button.disabled=false;}
}
function showPasswordRecovery(){
  AUTH_MODE="recovery"; $("authTitle").textContent="Choisissez un nouveau mot de passe"; $("authHint").textContent="Utilisez un mot de passe d’au moins 8 caractères.";
  $("tabLogin").parentNode.style.display="none"; document.querySelectorAll("#auth-screen .oauth,.or,#authName,#authMarketRole,#authMarketRoleLabel,#authPasswordRow,#authPassword2Row,#authForgot").forEach(function(el){el.style.display="none";});
  $("authEmailInput").style.display="none"; $("authBtn").style.display="none"; $("authRecoveryFields").style.display=""; $("authProgress").style.display="none"; $("authNext").parentNode.style.display="none"; $("authError").textContent="";
  $("auth-screen").classList.remove("off"); setTimeout(function(){$("authNewPassword").focus();},0);
  history.replaceState(null,"",location.pathname);
}
async function saveRecoveredPassword(){
  var pwd=$("authNewPassword").value, confirm=$("authNewPassword2").value, err=$("authError"), button=$("authResetBtn");
  var passwordProblem=passwordSafetyMessage(pwd); if(passwordProblem){err.textContent=passwordProblem;return;}
  if(pwd!==confirm){err.textContent="Les deux mots de passe ne correspondent pas.";return;}
  button.disabled=true;err.textContent="";
  try{var result=await SB().auth.updateUser({password:pwd});if(result.error)throw result.error;await SB().auth.signOut({scope:"local"});$("authNewPassword").value="";$("authNewPassword2").value="";setAuthMode("login");err.style.color="#1f5d3a";err.textContent="Mot de passe modifié. Vous pouvez maintenant vous connecter.";}
  catch(e){err.textContent="Le lien de réinitialisation est invalide ou a expiré. Demandez un nouveau lien.";}
  finally{button.disabled=false;}
}
async function verifyGlobalAuth(){
  var email = $("authEmailInput").value.trim().toLowerCase(), pwd = $("authPasswordInput").value, intent = $("authMarketRole").value, err = $("authError"), btn = $("authBtn");
  try{sessionStorage.setItem("afriflow_market_intent",intent)}catch(e){}
  err.style.color = "";
  if(!(AUTH_MODE==="login"&&/^AF-[0-9]{6,12}$/i.test(email))&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ err.textContent = AUTH_MODE==="login"?"Identifiant ou adresse e-mail invalide.":"Adresse e-mail invalide."; return; }
  var captchaError=captchaProblem(); if(captchaError){err.textContent=captchaError;return;}
  err.textContent = ""; btn.disabled = true;
  try {
    if(!window.AFRI){ err.textContent = "Service de comptes indisponible. Rechargez la page."; return; }
    if(AUTH_MODE === "login"){
      if(!pwd){ err.textContent = "Entrez votre mot de passe."; return; }
      var r = await AFRI.login(email, pwd, intent, turnstileToken);
      if(!r.ok){ err.textContent = r.error; return; }
      enterApp(r.email, r.role, r.name, r.grants, r.market); recordUserAction(r.role === "admin" ? "Connexion administrateur" : "Connexion réussie");
    } else {
      var name = $("authName").value.trim(), p2 = $("authPassword2").value;
      if(name.length < 2){ err.textContent = "Indiquez votre nom complet."; return; }
      var passwordProblem = passwordSafetyMessage(pwd); if(passwordProblem){ err.textContent = passwordProblem; return; }
      if(pwd !== p2){ err.textContent = "Les deux mots de passe ne correspondent pas."; return; }
      var r2 = await AFRI.register(email, name, pwd, intent, turnstileToken);
      if(!r2.ok){ err.textContent = r2.error; return; }
      if(r2.confirm){ setAuthMode("login"); err.style.color = "#1f5d3a"; err.textContent = "Compte créé. Cliquez sur le lien reçu par email pour le confirmer, puis connectez-vous."; return; }
      enterApp(r2.email, r2.role, r2.name, r2.grants, r2.market); recordUserAction("Inscription et première connexion");
    }
  } finally { btn.disabled = false; resetCaptcha(); }
}

/* ---------- Route ---------- */
function renderRoadmap(){
  var container = $("roadStepsList");
  container.textContent = "";
  var shownFlows = {};
  ITEMS.forEach(function(it, k){
    var info = ST[it.status] || ST.todo;
    var stepEl = document.createElement("div");
    var pc = k && ITEMS[k - 1].country;
        if(it.country && pc && pc !== it.country){
      shownFlows[pc+">"+it.country] = true;
      var bs = document.createElement("div"); bs.className = "border-sign";
      bs.innerHTML = borderHtml(pc, it.country);
      if(USER_ROLE === "admin"){
        bs.style.cursor = "pointer";
        bs.title = "Cliquer pour modifier les représentations";
        bs.onclick = function(){ editBorder(pc, it.country, k); };
      }
      container.appendChild(bs);
    }
    var left = (k % 2 === 0);
    stepEl.className = "road-step " + (left ? "item-odd" : "item-even");
    stepEl.style.setProperty("--c", info[1]);

    var card = document.createElement("div");
    card.className = "step-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.style.setProperty("--c", info[1]);
    var b = document.createElement("b"); b.textContent = it.title || "Étape";
    var s = document.createElement("small"); s.textContent = it.desc || "";
    card.appendChild(b); card.appendChild(s);
    if(it.date){
      var badge = document.createElement("div");
      badge.className = "date-badge";
      badge.textContent = it.date + " · " + info[0];
      card.appendChild(badge);
    }
    var open = function(){
      recordUserAction("Consultation du chapitre : " + (it.title || ("Chapitre " + (k + 1))));
      openJournalView(k);
    };
    card.onclick = open;
    card.onkeydown = function(e){ if(e.key === "Enter" || e.key === " "){ e.preventDefault(); open(); } };

    var node = document.createElement("div");
    node.className = "road-node-center";
    node.style.setProperty("--c", info[1]);
    node.textContent = k + 1;

    var spacer = document.createElement("div");
    spacer.className = "road-spacer";

    stepEl.appendChild(card); stepEl.appendChild(node); stepEl.appendChild(spacer);
    container.appendChild(stepEl);
  });
  /* Les flux ajoutés indépendamment d’un chapitre restent visibles à la fin de la route. */
  if(window.listExportFlows){
    window.listExportFlows().forEach(function(flow){
      if(shownFlows[flow.key])return;
      var bs=document.createElement("div");bs.className="border-sign export-flow";bs.innerHTML=borderHtml(flow.from,flow.to);
      if(USER_ROLE==="admin"){
        bs.style.cursor="pointer";bs.title="Cliquer pour modifier ce flux d’exportation";
        bs.onclick=function(){editBorder(flow.from,flow.to,-1)};
      }
      container.appendChild(bs);
    });
  }
  drawRoad();
}

/* ---------- Vue journal ---------- */
function showDrawer(){ $("ov").classList.add("on"); }
function closeDrawer(){ $("ov").classList.remove("on"); }

function docsBlock(title, icon, docs){
  if(!docs || !docs.length) return "";
  return '<div class="journal-docs"><h4>' + title + '</h4>' + docs.map(function(d){
    return '<div class="file-row"><div>' + icon + ' <a href="' + esc(safeUrl(d.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(d.name) + '</a></div><small style="color:var(--muted)">Dropbox</small></div>';
  }).join("") + '</div>';
}

function openJournalView(index){
  var it = ITEMS[index], pn = $("pn");
  pn.textContent = "";
  var article = document.createElement("div");
  article.className = "journal-article";
  var img = safeImg(it.image);
  var imgHtml = img ? '<div class="journal-img-container"><img class="journal-img" src="' + img + '" alt="Illustration du chapitre ' + (index + 1) + '"><div class="journal-caption">Document visuel associé au chapitre ' + (index + 1) + '</div></div>' : "";
  var details = it.details ? esc(it.details).replace(/\n/g, "<br>") : "Aucun détail supplémentaire rédigé pour le moment.";
  article.innerHTML =
    '<div class="lock-banner"><span>'+ic("unlock")+' <strong>Modification directe</strong></span><button type="button" class="p" data-act="edit" style="padding:6px 14px;font-size:.85rem">'+ic("edit")+' Modifier</button></div>' +
    '<div class="journal-header"><div class="journal-kicker">AfriFloW · Chronique de croissance · Chapitre ' + (index + 1) + '</div>' +
    '<h2 class="journal-title">' + esc(it.title) + '</h2>' +
    '<div class="journal-date">' + (it.date ? "Période : " + esc(it.date) + " · " : "") + "Statut : " + esc(ST[it.status][0]) + '</div></div>' +
    '<p style="font-weight:700;font-size:1.1rem;line-height:1.5;margin-bottom:20px">' + esc(it.desc) + '</p>' +
    imgHtml + '<div class="journal-columns">' + details + '</div>' +
    docsBlock("Documents & liens Dropbox associés :", ic("file"), it.docs) +
    '<div style="margin-top:30px;text-align:center;display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button type="button" class="p" data-act="edit">Modifier l\'article</button><button type="button" data-act="close">Fermer le journal</button></div>';
  article.addEventListener("click", function(e){
    var a = e.target.closest("[data-act]"); if(!a) return;
    if(a.dataset.act === "edit") openEditor(index); else closeDrawer();
  });
  pn.appendChild(article);
  showDrawer();
}

function openStartArchives(again){
  if(again !== true) recordUserAction("Ouverture du registre START");
  var it = START_ARCHIVES, pn = $("pn");
  pn.textContent = "";
  var article = document.createElement("div");
  article.className = "journal-article";
  article.style.borderColor = "var(--green)";
  var logs = '<div class="logs" style="margin-top:20px"><h4>Connexions et actions enregistrées :</h4>';
  logs += it.logs.length ? it.logs.map(function(l){
    return '<div class="file-row" style="flex-direction:column;align-items:flex-start;gap:4px"><div style="display:flex;justify-content:space-between;gap:8px;width:100%;flex-wrap:wrap"><strong>📧 ' + esc(l.email) + '</strong><small style="color:var(--muted)">🕒 ' + esc(l.date) + '</small></div><div style="font-size:.9rem">👉 <em>Action :</em> ' + esc(l.action) + '</div></div>';
  }).join("") : '<p style="color:var(--muted);font-style:italic">Aucune connexion enregistrée pour l\'instant.</p>';
  logs += "</div>";
  if(USER_ROLE !== "admin") logs = '<div class="logs" style="margin-top:20px"><p style="color:var(--muted);font-style:italic">Le journal des connexions est réservé à l\'administrateur.</p></div>';
  article.innerHTML =
    '<div class="journal-header"><div class="journal-kicker">Point zéro · Registre d\'audit AfriFloW</div><h2 class="journal-title">' + esc(it.title) + '</h2><div class="journal-date">' + esc(it.date) + '</div></div>' +
    '<p style="font-weight:700;font-size:1.05rem;line-height:1.5;margin-bottom:20px">' + esc(it.desc) + '</p>' + logs +
    docsBlock("Documents fondateurs START :", "📁", it.docs) +
    '<div style="margin-top:30px;text-align:center"><button type="button" class="p" data-act="close">Fermer le registre</button></div>';
  article.addEventListener("click", function(e){ if(e.target.closest("[data-act]")) closeDrawer(); });
  pn.appendChild(article);
  showDrawer();
}

/* ---------- Éditeur (travaille sur une copie : « Annuler » n'altère rien) ---------- */
function compressImage(file, cb){
  var reader = new FileReader();
  reader.onload = function(e){
    var img = new Image();
    img.onload = function(){
      var max = 1000, r = Math.min(1, max / Math.max(img.width, img.height));
      var c = document.createElement("canvas");
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      cb(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = function(){ alert("Image illisible."); };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function openEditor(index){
  if(!canEdit()) return;
  var isNew = index === null;
  var it = isNew ? {title:"", desc:"", details:"", date:"", status:"todo", image:"", docs:[]} : clone(ITEMS[index]);
  var pn = $("pn");
  pn.textContent = "";

  var closeBtn = document.createElement("button");
  closeBtn.textContent = "× Fermer";
  closeBtn.style.marginBottom = "14px";
  closeBtn.onclick = closeDrawer;
  pn.appendChild(closeBtn);

  var h2 = document.createElement("h2");
  h2.textContent = isNew ? "Ajouter un nouveau chapitre" : "Éditer l'article du journal";
  pn.appendChild(h2);

  var form = document.createElement("div");
  form.className = "fm";
  form.innerHTML =
    '<label for="edTitle">Titre de l\'article</label><input type="text" id="edTitle">' +
    '<label for="edDesc">Chapeau / résumé court</label><textarea id="edDesc"></textarea>' +
    '<label for="edDetails">Corps de l\'article</label><textarea id="edDetails" rows="6"></textarea>' +
    '<label for="edDate">Période / date</label><input type="text" id="edDate">' +
    '<label for="edStatus">Statut</label><select id="edStatus"><option value="done">Réalisé</option><option value="doing">En cours</option><option value="todo">À venir</option></select>' +
    '<label for="edCountry">Pays du chapitre</label><select id="edCountry"><option value="">—</option>'+Object.keys(window.FLAGS||{}).map(function(c){return '<option value="'+c+'">'+window.FLAGS[c]+'</option>'}).join("")+'</select>'+
    '<label for="edImageFile">Photo d\'illustration</label><input type="file" id="edImageFile" accept="image/*"><div id="edImgPreview"></div>';
  pn.appendChild(form);
  $("edTitle").value = it.title || ""; $("edDesc").value = it.desc || "";
  $("edDetails").value = it.details || ""; $("edDate").value = it.date || ""; $("edStatus").value = it.status; $("edCountry").value = it.country || "";
  function drawPreview(){
    var box = $("edImgPreview"); box.textContent = "";
    var src = safeImg(it.image);
    if(src){
      var im = document.createElement("img"); im.src = src; im.alt = ""; im.style.cssText = "max-height:100px;border-radius:8px;margin-right:10px";
      var rm = document.createElement("button"); rm.type = "button"; rm.className = "danger"; rm.textContent = "Retirer l'image";
      rm.onclick = function(){ it.image = ""; drawPreview(); };
      box.appendChild(im); box.appendChild(rm);
    }
  }
  drawPreview();
  $("edImageFile").onchange = function(){
    var f = this.files && this.files[0]; if(!f) return;
    compressImage(f, function(data){ it.image = data; drawPreview(); });
  };

  var h3 = document.createElement("h3"); h3.textContent = "Documents & liens Dropbox"; pn.appendChild(h3);
  var nameIn = document.createElement("input"); nameIn.placeholder = "Nom du document"; nameIn.style.cssText = "margin:6px 0;width:100%";
  var urlIn = document.createElement("input"); urlIn.placeholder = "Lien partagé (https://www.dropbox.com/...)"; urlIn.style.cssText = "margin:6px 0;width:100%";
  var addLink = document.createElement("button");
  addLink.type = "button"; addLink.textContent = "Ajouter le lien";
  var docsBox = document.createElement("div");
  addLink.onclick = function(){
    var name = nameIn.value.trim(), url = urlIn.value.trim();
    if(!name || !url){ alert("Veuillez remplir le nom et le lien."); return; }
    if(safeUrl(url) === "#"){ alert("Le lien doit commencer par https:// ou http://"); return; }
    it.docs.push({name:name, url:safeUrl(url)});
    nameIn.value = ""; urlIn.value = ""; drawDocs();
  };
  pn.appendChild(nameIn); pn.appendChild(urlIn); pn.appendChild(addLink); pn.appendChild(docsBox);
  function drawDocs(){
    docsBox.textContent = "";
    it.docs.forEach(function(d, j){
      var row = document.createElement("div"); row.className = "file-row";
      var a = document.createElement("a"); a.href = safeUrl(d.url); a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = d.name;
      var rm = document.createElement("button"); rm.type = "button"; rm.className = "danger"; rm.textContent = "Retirer";
      rm.onclick = function(){ it.docs.splice(j, 1); drawDocs(); };
      row.appendChild(a); row.appendChild(rm); docsBox.appendChild(row);
    });
  }
  drawDocs();

  var actions = document.createElement("div");
  actions.style.cssText = "margin-top:24px;display:flex;gap:10px;flex-wrap:wrap";
  var save = document.createElement("button");
  save.className = "p"; save.textContent = "Enregistrer";
  save.onclick = function(){
    it.title = $("edTitle").value.trim();
    if(!it.title){ alert("Le titre de l'article est obligatoire."); return; }
    it.desc = $("edDesc").value.trim(); it.details = $("edDetails").value.trim();
    it.date = $("edDate").value.trim(); it.status = $("edStatus").value; it.country = $("edCountry").value;
    if(isNew){
      ITEMS.push(it); recordUserAction("Ajout du chapitre : " + it.title);
    }
    else { ITEMS[index] = it; recordUserAction("Modification du chapitre : " + it.title); }
    saveLocal(); renderRoadmap(); cloudSave("items");
    openJournalView(isNew ? ITEMS.length - 1 : index);
  };
  var cancel = document.createElement("button");
  cancel.textContent = "Annuler"; cancel.onclick = closeDrawer;
  actions.appendChild(save); actions.appendChild(cancel);
  if(!isNew){
    var del = document.createElement("button");
    del.className = "danger"; del.textContent = "Supprimer le chapitre";
    del.onclick = function(){
      if(!confirm("Supprimer définitivement ce chapitre ?")) return;
      recordUserAction("Suppression du chapitre : " + (ITEMS[index].title || ("Chapitre " + (index + 1))));
      ITEMS.splice(index, 1); saveLocal(); renderRoadmap(); closeDrawer(); cloudSave("items");
    };
    actions.appendChild(del);
  }
  pn.appendChild(actions);
  showDrawer();
}

/* ---------- Tracé SVG + véhicule ---------- */
function drawRoad(){
  var container = $("roadContainer"), svg = $("roadSvg");
  var width = container.clientWidth, height = container.offsetHeight;
  if(width < 1 || height < 1) return;
  svg.setAttribute("viewBox", "0 0 " + width + " " + height);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.textContent = "";

  var nodes = Array.prototype.slice.call(container.querySelectorAll(".road-node-center"));
  var cr = container.getBoundingClientRect();
  var amp = Math.min(26, width * 0.04);
  var pts = [{x:width / 2, y:8}];
  nodes.forEach(function(n, i){
    var r = n.getBoundingClientRect();
    pts.push({x:width / 2 + (i % 2 === 0 ? -1 : 1) * amp, y:r.top - cr.top + r.height / 2});
  });
  pts.push({x:width / 2, y:Math.max(height - 8, pts[pts.length - 1].y + 40)});

  var d = "M " + pts[0].x + " " + pts[0].y;
  for(var i = 1; i < pts.length; i++){
    var p = pts[i - 1], c = pts[i], my = (p.y + c.y) / 2;
    d += " C " + p.x + " " + my + ", " + c.x + " " + my + ", " + c.x + " " + c.y;
  }
  ["road-edge", "road-surface", "road-centerline"].forEach(function(cls){
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d); path.setAttribute("class", cls); svg.appendChild(path);
  });
  roadPath = svg.querySelector(".road-centerline");
  roadLength = roadPath.getTotalLength();
  drawScenery(width, height);
  updateCarPosition();
}

function updateCarPosition(){
  var car = $("car-marker"), container = $("roadContainer");
  if(!roadPath || !roadLength) return;
  var rect = container.getBoundingClientRect();
  var progress = (window.innerHeight * 0.45 - rect.top) / Math.max(1, container.offsetHeight);
  progress = Math.max(0, Math.min(1, progress));
  applyWorld(progress);
  var pt = roadPath.getPointAtLength(progress * roadLength);
  car.style.top = pt.y + "px";
  car.style.left = pt.x + "px";
}

window.addEventListener("scroll", function(){
  if(scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(function(){ updateCarPosition(); scrollTicking = false; });
}, {passive:true});
window.addEventListener("load", drawRoad);
if(window.ResizeObserver) new ResizeObserver(function(){ drawRoad(); }).observe($("roadContainer"));
else window.addEventListener("resize", drawRoad);

/* ---------- Export / import ---------- */
$("exportBtn").onclick = function(){
  recordUserAction("Exportation d'une sauvegarde JSON");
  var blob = new Blob([JSON.stringify({items:ITEMS, archives:START_ARCHIVES, map:MAP}, null, 2)], {type:"application/json"});
  var url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "afriflow-journal-sauvegarde.json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
};
$("importTriggerBtn").onclick = function(){ $("importFile").click(); };
$("importFile").onchange = function(e){
  var f = e.target.files[0]; if(!f || !canEdit()) return;
  var reader = new FileReader();
  reader.onload = function(evt){
    try {
      var data = JSON.parse(evt.target.result);
      var items = Array.isArray(data) ? data : data.items;
      if(!Array.isArray(items)) throw new Error("format");
      ITEMS = items;
      if(!Array.isArray(data) && data.archives && typeof data.archives === "object") START_ARCHIVES = Object.assign(START_ARCHIVES, data.archives);
      if(!Array.isArray(data) && data.map) MAP = mergeMap(data.map);
      normalize(); saveLocal(); renderRoadmap(); renderMap(); cloudSave("items"); cloudSave("map");
      recordUserAction("Importation d'une sauvegarde JSON");
      alert("Importation réussie !");
    } catch(err){ alert("Erreur lors de la lecture du fichier JSON."); }
    $("importFile").value = "";
  };
  reader.readAsText(f);
};

/* ---------- Thème ---------- */
function applyCustomTheme(save){
  var g = $("picker-green").value, a = $("picker-amber").value, f = $("picker-font").value;
  var s = document.documentElement.style;
  s.setProperty("--green", g); s.setProperty("--amber", a); s.setProperty("--font-family", f);
  if(save){ try { localStorage.setItem(THEME_KEY, JSON.stringify({g:g, a:a, f:f})); } catch(e){} }
}
function restoreTheme(){
  try {
    var t = JSON.parse(localStorage.getItem(THEME_KEY) || "null");
    if(t){ $("picker-green").value = t.g; $("picker-amber").value = t.a; $("picker-font").value = t.f; applyCustomTheme(false); }
  } catch(e){}
  restoreBg();
}
["picker-green", "picker-amber", "picker-font"].forEach(function(id){ $(id).addEventListener("change", function(){ applyCustomTheme(true); }); });
$("customBtn").onclick = function(){ $("customizer-modal").classList.add("on"); };
$("closeCustomBtn").onclick = function(){ $("customizer-modal").classList.remove("on"); };

/* ---------- Fond personnalisé (couleur ou image, enregistré sur cet appareil) ---------- */
var BG_KEY = "afriflow_bg_v1";
function bgLoad(){ try { return JSON.parse(localStorage.getItem(BG_KEY) || "null") || {}; } catch(e){ return {}; } }
function bgSave(o){ try { localStorage.setItem(BG_KEY, JSON.stringify(o)); return true; } catch(e){ (window.toast || alert)("Stockage de l’appareil plein : choisissez une image plus petite."); return false; } }
function hexRgb(h){ var m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if(!m) return [252,251,250]; var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function bgApply(o){
  var s = document.documentElement.style, L = $("bgLayer");
  if(!o || !o.on){ ["--bg","--card","--ink","--muted","--line"].forEach(function(p){ s.removeProperty(p); }); L.style.backgroundImage = "none"; return; }
  var rgb = hexRgb(o.c), dark = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 < 0.5;
  s.setProperty("--bg", o.c);
  s.setProperty("--card", dark ? "#1e1e1e" : "#ffffff"); s.setProperty("--ink", dark ? "#eef2ec" : "#1d2a22");
  s.setProperty("--muted", dark ? "#9aa89f" : "#66726a"); s.setProperty("--line", dark ? "#333333" : "#e2ded7");
  if(o.i){
    var a = (o.v == null ? 35 : o.v) / 100, c = "rgba(" + rgb.join(",") + "," + a + ")";
    L.style.backgroundImage = "linear-gradient(" + c + "," + c + "),url(\"" + o.i + "\")";
  } else L.style.backgroundImage = "none";
}
function restoreBg(){
  var o = bgLoad(); if(o.c) $("picker-bg").value = o.c; if(o.v != null) $("bg-dim").value = o.v;
  bgApply(o);
}
$("picker-bg").addEventListener("input", function(){ var o = bgLoad(); o.on = 1; o.c = this.value; if(bgSave(o)) bgApply(o); });
$("bg-dim").addEventListener("input", function(){ var o = bgLoad(); if(!o.i) return; o.on = 1; o.c = o.c || $("picker-bg").value; o.v = +this.value; if(bgSave(o)) bgApply(o); });
$("bg-reset").onclick = function(){ try { localStorage.removeItem(BG_KEY); } catch(e){} $("picker-bg").value = "#fcfbfa"; $("bg-dim").value = 35; bgApply(null); };
$("bg-file").addEventListener("change", function(){
  var f = this.files[0]; this.value = ""; if(!f) return;
  if(!/^image\//.test(f.type)){ (window.toast || alert)("Choisissez un fichier image (JPG, PNG, WebP…)."); return; }
  var r = new FileReader();
  r.onload = function(){
    var img = new Image();
    img.onload = function(){
      var k = Math.min(1, 1600 / Math.max(img.width, img.height)), cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      var q = 0.8, d = cv.toDataURL("image/jpeg", q);
      while(d.length > 900000 && q > 0.35){ q -= 0.1; d = cv.toDataURL("image/jpeg", q); }
      var o = bgLoad(); o.on = 1; o.c = o.c || $("picker-bg").value; o.i = d; if(o.v == null) o.v = +$("bg-dim").value;
      if(bgSave(o)) bgApply(o);
    };
    img.onerror = function(){ (window.toast || alert)("Image illisible."); };
    img.src = r.result;
  };
  r.readAsDataURL(f);
});

/* ---------- Événements globaux ---------- */
$("authBtn").onclick = verifyGlobalAuth;
$("authNext").onclick = nextAuthStep;
$("authBack").onclick = function(){ AUTH_STEP=Math.max(1,AUTH_STEP-1); $("authError").textContent=""; renderAuthStep(); };
$("authForgot").onclick = requestPasswordReset;
$("authResetBtn").onclick = saveRecoveredPassword;
document.querySelectorAll(".auth-password-toggle").forEach(function(button){button.onclick=function(){toggleAuthPassword(button);};});
$("authPasswordInput").addEventListener("keydown", function(e){ if(e.key === "Enter") verifyGlobalAuth(); });
$("authEmailInput").addEventListener("keydown", function(e){ if(e.key === "Enter") nextAuthStep(); });
$("authPassword2").addEventListener("keydown", function(e){ if(e.key === "Enter") verifyGlobalAuth(); });
$("authNewPassword2").addEventListener("keydown", function(e){ if(e.key === "Enter") saveRecoveredPassword(); });
$("authClose").onclick = function(){ if(window.AfriMarket) window.AfriMarket.closeAuth(); };
try{var savedMarketIntent=sessionStorage.getItem("afriflow_market_intent");if(/^(client|shareholder|partner)$/.test(savedMarketIntent||""))$("authMarketRole").value=savedMarketIntent}catch(e){}
$("tabLogin").onclick = function(){ setAuthMode("login"); };
$("tabReg").onclick = function(){ setAuthMode("register"); };
$("startBtn").onclick = function(){
  openStartArchives();
  if(window.AFRI && USER_ROLE === "admin") AFRI.mergeLogs().then(function(ch){ if(ch && $("ov").classList.contains("on") && $("pn").querySelector(".logs")) openStartArchives(true); });
};
$("addBtn").onclick = function(){ if(canEdit()) openEditor(null); };
$("addExportBtn").onclick = function(e){
  e.preventDefault();e.stopPropagation();
  if(USER_ROLE!=="admin"){toast("La création d’un flux d’exportation est réservée à l’administrateur.");return}
  if(window.editBorder)window.editBorder("","",-1);
};
[$("startBtn"), $("addBtn")].forEach(function(el){
  el.addEventListener("keydown", function(e){ if(e.key === "Enter" || e.key === " "){ e.preventDefault(); el.click(); } });
});
$("logout-btn").onclick = function(){ recordUserAction("Déconnexion"); logout(); };
$("ov").addEventListener("click", function(e){ if(e.target === this) closeDrawer(); });
$("customizer-modal").addEventListener("click", function(e){ if(e.target === this) this.classList.remove("on"); });
document.addEventListener("keydown", function(e){
  if(e.key === "Escape"){ closeDrawer(); $("customizer-modal").classList.remove("on"); }
});

/* ---------- Décor évolutif : campagne → village → montagne → ville, du jour à la nuit ---------- */
var KF = [{p:0,t:[90,169,230],b:[207,233,255],n:0},{p:.35,t:[70,150,225],b:[200,230,250],n:0},{p:.55,t:[245,138,91],b:[251,211,141],n:.3},{p:.75,t:[11,16,48],b:[42,47,90],n:1},{p:1,t:[90,110,190],b:[255,190,150],n:.35}];
var lastStep = -1;
function mixv(a, b, t){ return a + (b - a) * t; }
function applyWorld(p){
  var sun = $("sun"), moon = $("moon"), i = 0;
  while(i < KF.length - 2 && p > KF[i + 1].p) i++;
  var a = KF[i], b = KF[i + 1], t = clamp((p - a.p) / (b.p - a.p), 0, 1), n = mixv(a.n, b.n, t);
  var step = Math.round(p * 80);
  if(step !== lastStep){
    lastStep = step;
    var col = function(k){ return "rgb(" + [0, 1, 2].map(function(j){ return Math.round(mixv(a[k][j], b[k][j], t)); }).join(",") + ")"; };
    var st = $("roadContainer").style;
    st.setProperty("--night", n.toFixed(3)); st.setProperty("--skyT", col("t")); st.setProperty("--skyB", col("b"));
  }
  sun.style.left = (8 + p * 84) + "%"; sun.style.top = (10 + (1 - Math.sin(Math.PI * p)) * 80) + "px"; sun.style.opacity = clamp(1 - n * 2.2, 0, 1);
  moon.style.left = (15 + p * 70) + "%"; moon.style.opacity = clamp(n * 1.4 - .2, 0, 1);
  $("mts").style.transform = "translateX(" + (-p * 50) + "%)";
}
function buildMts(){
  var s = 3, h = "";
  [[.55,"#9bb0c4",16,50],[1,"#6f8799",30,66]].forEach(function(L){
    var pts = "0,80";
    for(var x = 0; x <= 1920; x += 60){ s = (s * 9301 + 49297) % 233280; pts += " " + x + "," + (80 - (L[2] + (s / 233280) * (L[3] - L[2]))); }
    h += '<polygon points="' + pts + ' 1920,80" style="fill:color-mix(in srgb,' + L[1] + ',#0a1030 calc(var(--night,0)*65%))" opacity="' + L[0] + '"/>';
  });
  $("mts").innerHTML = h;
}

var WK = [], wkOn = false, wkLast = 0;
function wkTick(ts){
  if(document.hidden || (window.matchMedia&&matchMedia("(max-width:700px)").matches)){
    wkOn=false;return; // Pas d'animation coûteuse en boucle sur mobile ou en arrière-plan.
  }
  if(ts-wkLast<33){requestAnimationFrame(wkTick);return}
  wkLast=ts;
  var s = ts / 1000;
  WK.forEach(function(k){
    var T = k.len / k.sp, c = 2 * T + 2 * k.pz, t = (s + k.ph) % c, x, d, idle = false;
    if(t < T){ x = t * k.sp; d = 1; }
    else if(t < T + k.pz){ x = k.len; d = 1; idle = true; }
    else if(t < 2 * T + k.pz){ x = k.len - (t - T - k.pz) * k.sp; d = -1; }
    else { x = 0; d = -1; idle = true; }
    k.el.style.setProperty("--dx", (x - k.len / 2).toFixed(1) + "px");
    if(d !== k.d){ k.d = d; k.fig.style.transform = d < 0 ? "scaleX(-1)" : ""; }
    if(idle !== k.idle){ k.idle = idle; k.el.classList.toggle("idle", idle); }
  });
  if(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) wkOn = false;
  else requestAnimationFrame(wkTick);
}

function drawScenery(w, h){
  var seed = 11, ground = "", obj = "", glow = "", cx = w / 2, SAFE = w < 520 ? 44 : 80, wc = 0, fc = 0;
  function r(){ seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
  function pick(a){ return a[Math.floor(r() * a.length)]; }
  var SK = ["#6b4226","#8d5524","#a8683a","#4a2c17"], CL = ["#c0392b","#2471a3","#f1c40f","#8e44ad","#16a085","#e67e22","#d35400"];
  var LF = [["#7fcf55","#2f7d32"],["#68b94d","#27682e"],["#92c94f","#3b8a2e"]];
  var DEFS = '<svg width="0" height="0" style="position:absolute"><defs>' + LF.map(function(g, i){ return '<radialGradient id="lf' + i + '" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="' + g[0] + '"/><stop offset="1" stop-color="' + g[1] + '"/></radialGradient>'; }).join("") +
    '<linearGradient id="tk" x1="0" x2="1"><stop offset="0" stop-color="#8a6240"/><stop offset=".6" stop-color="#6b4a2b"/><stop offset="1" stop-color="#4a321c"/></linearGradient>' +
    '<linearGradient id="wl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd6dc"/><stop offset="1" stop-color="#8f9aa5"/></linearGradient></defs></svg>';

  /* Vent : la phase dépend de x, donc une vague de brise traverse tout le paysage */
  function sw(x){ return "--d:5s;--dl:-" + ((x / w) * 2.5 + r() * .6).toFixed(2) + "s"; }
  function GL(x, y, d){ return '<i class="gl" style="left:' + x.toFixed(0) + 'px;top:' + y.toFixed(0) + 'px;width:' + d.toFixed(0) + 'px;height:' + d.toFixed(0) + 'px"></i>'; }
  /* Chaque objet est ancré par les pieds (bas-centre), a une ombre au sol et un z-index = y (profondeur) */
  function O(x, y, wd, ht, vb, inner, o){
    o = o || {};
    return '<div class="ob ' + (o.cls || "") + '" style="left:' + x.toFixed(0) + 'px;top:' + y.toFixed(0) + 'px;z-index:' + (10 + Math.round(y)) + ';' + (o.st || "") + '"' + (o.at || "") + '>' +
      (o.sh === 0 ? "" : '<i class="sh" style="width:' + (wd * (o.sh || .8)).toFixed(0) + 'px"></i>') +
      '<svg width="' + wd.toFixed(0) + '" height="' + ht.toFixed(0) + '" viewBox="' + vb + '">' + inner + '</svg></div>';
  }

  function tree(x, y, s, kind){
    var f = 'fill="url(#lf' + Math.floor(r() * 3) + ')"', b = "", k;
    [[30,26,20],[16,36,15],[44,36,15],[22,18,13],[38,18,13],[30,40,14]].forEach(function(c){ b += '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '" ' + f + '/>'; });
    b += '<circle cx="24" cy="16" r="8" fill="#c9f08a" opacity=".28"/>';
    if(kind === "mango") for(k = 0; k < 7; k++) b += '<ellipse cx="' + (14 + r() * 32).toFixed(0) + '" cy="' + (22 + r() * 22).toFixed(0) + '" rx="2.2" ry="3" fill="#f39c12"/>';
    return O(x, y, s, s * 1.3, "0 0 60 78", '<path d="M26 78Q28 56 27 40L33 40Q32 56 35 78Z" fill="url(#tk)"/><g class="sw" style="' + sw(x) + '">' + b + '</g>');
  }
  function acacia(x, y, s){
    return O(x, y, s, s * .8, "0 0 80 64", '<path d="M38 64Q40 44 36 30M40 46Q54 38 62 28M37 34Q24 30 16 24" stroke="#5a3d24" stroke-width="3" fill="none" stroke-linecap="round"/><g class="sw" style="' + sw(x) + '"><ellipse cx="40" cy="22" rx="36" ry="9" fill="url(#lf2)"/><ellipse cx="22" cy="27" rx="18" ry="6" fill="url(#lf1)"/><ellipse cx="60" cy="28" rx="17" ry="6" fill="url(#lf0)"/></g>');
  }
  function baobab(x, y, s){
    return O(x, y, s, s * 1.05, "0 0 80 84", '<path d="M30 84Q24 66 30 46Q34 36 28 30L34 28 40 34 46 28 52 30Q46 36 50 46Q56 66 50 84Z" fill="url(#tk)"/><g stroke="#6b4a2b" stroke-width="3" fill="none" stroke-linecap="round"><path d="M32 32Q18 26 12 16M40 34Q40 20 40 10M48 32Q62 26 68 16"/></g><g class="sw" style="' + sw(x) + '"><circle cx="12" cy="14" r="9" fill="url(#lf0)"/><circle cx="40" cy="8" r="10" fill="url(#lf1)"/><circle cx="68" cy="14" r="9" fill="url(#lf0)"/><circle cx="26" cy="10" r="7" fill="url(#lf2)"/><circle cx="54" cy="10" r="7" fill="url(#lf2)"/></g>', {sh: .6});
  }
  function palm(x, y, s){
    var f = "";
    [[2,24],[7,10],[20,2],[33,10],[38,24],[12,27],[28,27]].forEach(function(e){ f += '<path d="M20 14Q' + ((20 + e[0]) / 2) + ' ' + (Math.min(14, e[1]) - 8) + ' ' + e[0] + ' ' + e[1] + '" stroke="#3f9b3a" stroke-width="3.4" fill="none" stroke-linecap="round"/>'; });
    return O(x, y, s, s * 1.6, "0 0 40 64", '<path d="M19 64Q25 40 20 14" stroke="#8a6a44" stroke-width="3.4" fill="none" stroke-linecap="round"/><g class="sw" style="' + sw(x) + '">' + f + '<circle cx="18.5" cy="16" r="1.6" fill="#6b4a2b"/><circle cx="22" cy="16" r="1.6" fill="#6b4a2b"/></g>', {sh: .5});
  }
  function pine(x, y, s){
    var c = pick(["#2f6b43","#27583a","#3a7d4c"]);
    return O(x, y, s, s * 1.5, "0 0 40 62", '<rect x="18" y="50" width="4" height="12" fill="url(#tk)"/><g class="sw" style="' + sw(x) + '"><polygon points="20,2 33,22 7,22" fill="' + c + '"/><polygon points="20,14 36,38 4,38" fill="' + c + '"/><polygon points="20,26 40,54 0,54" fill="' + c + '"/><polygon points="20,2 20,22 7,22" fill="#000" opacity=".14"/><polygon points="20,14 20,38 4,38" fill="#000" opacity=".14"/><polygon points="20,26 20,54 0,54" fill="#000" opacity=".14"/></g>', {sh: .7});
  }
  function bush(x, y, s){
    var fl = r() < .4 ? '<circle cx="12" cy="14" r="1.6" fill="#f4d03f"/><circle cx="30" cy="12" r="1.6" fill="#fff"/><circle cx="36" cy="19" r="1.6" fill="#f4d03f"/>' : "";
    return O(x, y, s, s * .56, "0 0 50 28", '<g class="sw" style="' + sw(x) + '"><ellipse cx="14" cy="18" rx="14" ry="9" fill="url(#lf1)"/><ellipse cx="35" cy="18" rx="15" ry="10" fill="url(#lf0)"/><ellipse cx="24" cy="12" rx="13" ry="10" fill="url(#lf2)"/>' + fl + '</g>', {sh: .95});
  }
  function tuft(x, y){
    var d = "", k, bx, tx;
    for(k = 0; k < 6; k++){ bx = 2 + k * 2.4; tx = bx + (r() * 6 - 3); d += "M" + bx + " 12Q" + bx + " 6 " + tx.toFixed(1) + " " + (1 + r() * 3).toFixed(1); }
    var p = '<path d="' + d + '" stroke="' + pick(["#4f9a3a","#6bb04a","#3f8a35"]) + '" stroke-width="1.3" fill="none" stroke-linecap="round"/>';
    return O(x, y, 16, 12, "0 0 16 12", r() < .4 ? '<g class="sw" style="' + sw(x) + '">' + p + '</g>' : p, {sh: 0});
  }
  function flowers(x, y){
    var i = "", k, c = pick(["#f4d03f","#e74c3c","#ffffff","#e67eab","#ff9f43"]), fx, fy;
    for(k = 0; k < 5; k++){ fx = 2 + k * 5 + r() * 2; fy = 8 + r() * 6; i += '<path d="M' + fx + ' 22V' + fy + '" stroke="#3f8a35" stroke-width="1"/><circle cx="' + fx + '" cy="' + fy + '" r="2.2" fill="' + c + '"/><circle cx="' + fx + '" cy="' + fy + '" r=".8" fill="#f9e79f"/>'; }
    return O(x, y, 28, 22, "0 0 28 22", '<g class="sw" style="' + sw(x) + '">' + i + '</g>', {sh: 0});
  }
  function hut(x, y, s){
    return O(x, y, s, s * .9, "0 0 50 45", '<rect x="8" y="22" width="34" height="23" rx="3" fill="#c98f5a"/><rect x="25" y="22" width="17" height="23" rx="3" fill="#000" opacity=".14"/><rect x="21" y="31" width="8" height="14" rx="3" fill="#4a3220"/><path d="M1 25Q25 -6 49 25Q25 20 1 25Z" fill="#d6b04a"/><path d="M10 20L7 14M20 15L18 8M30 15L32 8M40 20L43 14" stroke="#a8842f" stroke-width="1.2"/>');
  }
  function house(x, y, s){
    var wc2 = pick(["#ecd9b3","#dba56f","#cf8470","#f2e8d4"]), rc = pick(["#a8452f","#7a4a2b","#8f3d2b"]);
    glow += GL(x - s * .217, y - s * .27, s * .3) + GL(x + s * .217, y - s * .27, s * .3);
    return O(x, y, s, s * .85, "0 0 60 50", '<rect x="8" y="22" width="44" height="28" fill="' + wc2 + '"/><rect x="30" y="22" width="22" height="28" fill="#000" opacity=".12"/><polygon points="4,24 30,4 56,24" fill="' + rc + '"/><polygon points="30,4 56,24 30,24" fill="#000" opacity=".15"/><rect x="26" y="36" width="8" height="14" fill="#5a3a22"/><rect x="13" y="30" width="8" height="8" fill="#9fc3d8" stroke="#5a3a22" stroke-width=".8"/><rect x="39" y="30" width="8" height="8" fill="#9fc3d8" stroke="#5a3a22" stroke-width=".8"/>');
  }
  function building(x, y, s, ht){
    s = Math.floor(s); ht = Math.floor(ht);
    var i = '<rect width="' + s + '" height="' + ht + '" fill="url(#wl)"/><rect width="' + s + '" height="4" fill="#5d6770"/>', yy, xx;
    for(yy = 12; yy < ht - 20; yy += 16) for(xx = 8; xx < s - 12; xx += 14){
      i += '<rect x="' + xx + '" y="' + yy + '" width="7" height="9" fill="#9fc3d8" stroke="#5d6770" stroke-width=".6"/>';
      if(r() < .55) glow += GL(x - s / 2 + xx + 3.5, y - ht + yy + 4.5, 14);
    }
    i += '<rect x="' + (s / 2 - 4) + '" y="' + (ht - 12) + '" width="8" height="12" fill="#4a3a2a"/>';
    return O(x, y, s, ht, "0 0 " + s + " " + ht, i);
  }
  function lamp(x, y){
    glow += GL(x, y - 36, 38);
    return O(x, y, 14, 40, "0 0 14 40", '<rect x="6" y="8" width="2" height="32" fill="#444"/><circle cx="7" cy="7" r="3" fill="#ffe9a8"/>', {sh: .6});
  }
  function mount(x, y, s){
    return O(x, y, s, s * .6, "0 0 100 60", '<polygon points="0,60 35,8 52,30 68,12 100,60" fill="#6f7f8a"/><polygon points="35,8 52,30 68,12 100,60 60,60" fill="#000" opacity=".12"/><polygon points="35,8 29,20 35,16 41,22" fill="#fff"/><polygon points="68,12 62,24 68,20 74,26" fill="#fff"/>', {st: "z-index:2", sh: 0});
  }

  /* Personnages : pieds posés au sol, jambes/bras en contre-phase, léger balancement du buste */
  function person(o){
    var sk = pick(SK), c1 = pick(CL), c2 = pick(CL), f = o.f, lc = f ? sk : "#34495e", s = "", up;
    function leg(x, cl){ return '<g class="lg' + cl + '"><path d="M' + x + ' 30h3.4l-.5 21h-3z" fill="' + lc + '"/><ellipse cx="' + (x + 1.4) + '" cy="52" rx="3" ry="1.5" fill="#1b1b1b"/></g>'; }
    function arm(x1, x2, cl){ return '<g class="am' + cl + '"><path d="M' + x1 + ' 17.8L' + x2 + ' 29" stroke="' + c1 + '" stroke-width="2.6" stroke-linecap="round" fill="none"/><circle cx="' + x2 + '" cy="29.6" r="1.4" fill="' + sk + '"/></g>'; }
    s += o.work ? leg(9.2, " no") + leg(11.6, " no") : leg(9.2, "") + leg(11.6, " l2");
    if(f) s += '<path d="M7 27h10l2.6 15H4.4z" fill="' + c2 + '"/><circle cx="9" cy="33" r="1" fill="#fff" opacity=".5"/><circle cx="14" cy="36" r="1" fill="#fff" opacity=".5"/><circle cx="12" cy="31" r="1" fill="#fff" opacity=".5"/>';
    up = '<path d="M7.4 17Q12 15 16.6 17L17 ' + (f ? 28 : 31) + 'H7z" fill="' + c1 + '"/><path d="M7.2 22h9.8M7.1 26h9.9" stroke="#fff" stroke-opacity=".3"/><rect x="11" y="13.6" width="2.2" height="3.6" fill="' + sk + '"/><circle cx="12" cy="10.5" r="4.2" fill="' + sk + '"/><circle cx="13.7" cy="10.3" r=".6" fill="#111"/>';
    up += f ? '<path d="M7.6 9.4Q8 4.4 12 4.3Q16.2 4.4 16.4 9.4Q12 7 7.6 9.4z" fill="' + c2 + '"/><circle cx="12" cy="4.4" r="2.1" fill="' + c2 + '"/>'
            : '<path d="M7.8 10Q8 5.6 12 5.8Q16 5.6 16.2 10Q14 7.4 12 7.6Q10 7.4 7.8 10z" fill="#1b1410"/>';
    if(o.basket) up += '<ellipse cx="12" cy="2.6" rx="6" ry="1.6" fill="#a97a34"/><path d="M6.4 2.6Q12 -4 17.6 2.6z" fill="#d9a441"/><circle cx="9.6" cy="-.4" r="1.5" fill="#f39c12"/><circle cx="12.6" cy="-1.2" r="1.5" fill="#f1c40f"/><circle cx="15" cy="-.2" r="1.4" fill="#e67e22"/>';
    if(o.work){
      s += '<g transform="rotate(10 12 30)">' + up + arm(7.6, 6.4, " no") + '</g>';
      s += '<g class="hoe2"><path d="M16.4 18L22 27" stroke="' + c1 + '" stroke-width="2.6" stroke-linecap="round" fill="none"/><circle cx="22" cy="27.6" r="1.4" fill="' + sk + '"/><path d="M21 24L31 47" stroke="#6b4a2b" stroke-width="1.8"/><path d="M29.6 45.5L35 47.6L32.4 50.4z" fill="#8a8f94"/></g>';
      return {w: 36, vb: "0 -6 36 60", inner: s};
    }
    s += '<g class="bd">' + up + '</g>' + arm(7.6, 6, "") + arm(16.4, 18, " a2");
    return {w: 24, vb: "0 -6 24 60", inner: s};
  }
  function human(x, y, o){
    var k = o.k || (.9 + r() * .2), P = person(o);
    o.sh = 1.1;
    return O(x, y, P.w * k, 60 * k, P.vb, P.inner, o);
  }
  /* Marcheur : suit un sentier dessiné, va-et-vient, s'arrête, se retourne : toujours au sol */
  function walker(y){
    var left = r() < .5, avail = left ? cx - SAFE - 10 : w - 10 - (cx + SAFE);
    if(avail < 60) return "";
    var len = Math.min(90 + r() * 110, avail), xs = (left ? 10 : cx + SAFE) + r() * (avail - len), f = r() < .5, sp = 26 + r() * 10, pz = 1.2 + r() * 2.4, ph = (r() * 20).toFixed(1);
    wc++;
    return '<i class="pth" style="left:' + (xs - 12).toFixed(0) + 'px;top:' + (y - 4).toFixed(0) + 'px;width:' + (len + 24).toFixed(0) + 'px"></i>' +
      human(xs + len / 2, y, {f: f, basket: f && r() < .65, k: r() < .25 ? .62 : 0, cls: "wk", at: ' data-len="' + len.toFixed(0) + '" data-sp="' + sp.toFixed(1) + '" data-pz="' + pz.toFixed(1) + '" data-ph="' + ph + '"'});
  }
  function farm(x, y){
    var fx = clamp(x, 60, w - 60);
    if(Math.abs(fx - cx) < SAFE + 55) return tree(x, y, 50, "mango");
    fc++;
    return '<div class="fld" style="left:' + (fx - 55) + 'px;top:' + (y - 36) + 'px;width:110px;height:38px"></div>' + human(fx - 4, y - 8, {work: 1, f: r() < .4, k: .95});
  }

  function sideX(){
    var x = 20 + r() * (w - 40);
    if(Math.abs(x - cx) < SAFE) x = x < cx ? cx - SAFE - r() * 30 : cx + SAFE + r() * 30;
    return clamp(x, 20, w - 20);
  }
  /* Biomes qui se fondent progressivement : campagne → village → montagne → ville */
  function cat(t){
    var W = [Math.max(0, 1.2 - t * 3.2), Math.max(0, 1 - Math.abs(t - .45) * 4), Math.max(0, 1 - Math.abs(t - .68) * 4.5), Math.max(0, (t - .62) * 3.5)], v = r() * (W[0] + W[1] + W[2] + W[3] || 1), i = 0;
    while(i < 3 && v > W[i]){ v -= W[i]; i++; }
    return i;
  }

  for(var py = 30; py < h; py += 48){
    var tt = py / h;
    ground += '<i class="pt" style="left:' + (r() * w).toFixed(0) + 'px;top:' + py + 'px;width:' + (120 + r() * 160).toFixed(0) + 'px;height:' + (50 + r() * 60).toFixed(0) + 'px;background:radial-gradient(closest-side,' + (tt > .65 ? pick(["rgba(150,150,150,.35)","rgba(120,125,120,.3)"]) : pick(["rgba(40,120,50,.35)","rgba(130,190,70,.35)","rgba(190,170,80,.22)"])) + ',transparent)"></i>';
  }
  for(var ty = 20; ty < h; ty += 26){ obj += tuft(r() * w, ty + r() * 20) + tuft(r() * w, ty + r() * 20); }
  for(var yy = 50; yy < h - 20; yy += 42){
    for(var j = 0; j < 3; j++){
      var x = sideX(), y = yy + r() * 38, c = cat(y / h), q = r(), s = "";
      if(c === 0){
        if(q < .17) s = acacia(x, y, 70 + r() * 40); else if(q < .27) s = baobab(x, y, 80 + r() * 40);
        else if(q < .45) s = tree(x, y, 50 + r() * 26, "mango"); else if(q < .57) s = palm(x, y, 40 + r() * 22);
        else if(q < .66) s = hut(x, y, 50 + r() * 20); else if(q < .85 && fc < 8) s = farm(x, y);
        else if(q < .92) s = bush(x, y, 34 + r() * 22); else s = flowers(x, y);
      } else if(c === 1){
        if(q < .35) s = house(x, y, 60 + r() * 30); else if(q < .55) s = tree(x, y, 46 + r() * 26, r() < .4 ? "mango" : "");
        else if(q < .65) s = palm(x, y, 40 + r() * 20); else if(q < .85 && wc < 16) s = walker(y);
        else if(q < .93) s = bush(x, y, 34 + r() * 20); else s = flowers(x, y);
      } else if(c === 2){
        if(q < .45) s = pine(x, y, 34 + r() * 28); else if(q < .6 && (x < w * .25 || x > w * .75)) s = mount(x, y + 10, 220 + r() * 120);
        else if(q < .75 && wc < 16) s = walker(y); else if(q < .87) s = house(x, y, 50 + r() * 20); else s = bush(x, y, 30 + r() * 20);
      } else {
        if(q < .42) s = building(x, y, 50 + r() * 30, 110 + r() * 90); else if(q < .57) s = lamp(x, y);
        else if(q < .77 && wc < 16) s = walker(y); else if(q < .9) s = house(x, y, 56 + r() * 20); else s = tree(x, y, 40 + r() * 20);
      }
      obj += s;
    }
  }
  $("scenery").innerHTML = DEFS + ground + obj;
  var g2 = $("sceneryGlow");
  if(!g2){ g2 = document.createElement("div"); g2.id = "sceneryGlow"; $("scenery").after(g2); }
  g2.innerHTML = glow;
  WK = [].map.call($("scenery").querySelectorAll(".wk"), function(el){
    return {el: el, fig: el.querySelector("svg"), len: +el.dataset.len, sp: +el.dataset.sp, pz: +el.dataset.pz, ph: +el.dataset.ph, idle: false, d: 1};
  });
  if(!wkOn && WK.length && !document.hidden && !(window.matchMedia&&matchMedia("(max-width:700px)").matches)){ wkOn = true; requestAnimationFrame(wkTick); }
}

/* ---------- Carte du monde ---------- */
var CN_ = {sn:["🇸🇳","Sénégal"], bf:["🇧🇫","Burkina Faso"], tg:["🇹🇬","Togo"]};
function CN(c){ return CN_[c] ? CN_[c][0] + " " + CN_[c][1] : ""; }
var ORIGIN = "854"; /* pays de départ des marchandises : Burkina Faso */
var ETAT = {actif:"Nous commercialisons déjà", prosp:"En prospection", prevu:"Prévu"};
function newRec(){ return {etat:"", stock:0, transit:0, valeur:0, vol:0, notes:"", actionnaires:"", produits:[]}; }
var MAP = {};
function rec(k){ return MAP[k] || newRec(); }
function mergeMap(s){
  var m = {}, mig = {sn:"686", bf:"854", tg:"768"};
  if(s && typeof s === "object") Object.keys(s).forEach(function(k){
    var v = s[k]; if(!v || typeof v !== "object") return;
    var nk = mig[k] || k; if(mig[k] && s[nk]) return;
    var r = Object.assign(newRec(), v);
    if(!Array.isArray(r.produits)) r.produits = [];
    if(!ETAT[r.etat]) r.etat = "";
    delete r.out; delete r.statut; m[nk] = r;
  });
  return m;
}
var WORLD = null, WMAP = {}, loadingWorld = false, VEH = [], loopOn = false;
var VB = {x:0, y:0, w:960, h:500}, drag = null, moved = false;
var ALIAS = {"United States of America":"US","Dem. Rep. Congo":"CD","Congo":"CG","Central African Rep.":"CF","Dominican Rep.":"DO","Bosnia and Herz.":"BA","S. Sudan":"SS","Eq. Guinea":"GQ","eSwatini":"SZ","N. Macedonia":"MK","W. Sahara":"EH","Falkland Is.":"FK","Solomon Is.":"SB","Fr. S. Antarctic Lands":"TF","Kosovo":"XK","Czechia":"CZ","Palestine":"PS","Côte d'Ivoire":"CI"};
var fmt = function(n){ return Number(n || 0).toLocaleString("fr-FR"); };
function parseSh(k){
  return String(rec(k).actionnaires || "").split("\n").map(function(l){ var p = l.split(":"); return {name:p[0].trim(), part:(p[1] || "").trim()}; }).filter(function(x){ return x.name; });
}
function nm(k){ return WMAP[k] ? WMAP[k].name : k; }
function loadJs(u){ return new Promise(function(ok, ko){ var s = document.createElement("script"); s.src = u; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); }
function loadWorld(){
  if(WORLD || loadingWorld) return;
  loadingWorld = true;
  $("shSummary").textContent = "Chargement de la carte du monde…";
  Promise.all([
    loadJs("https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"),
    loadJs("https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js"),
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json").then(function(r){ return r.json(); })
  ]).then(function(res){ buildWorld(res[2]); renderMap(); })
    .catch(function(){ loadingWorld = false; $("shSummary").textContent = "Carte indisponible : une connexion internet est nécessaire pour charger le fond de carte. Rechargez la page en ligne."; });
}
function buildWorld(topo){
  var fc = topojson.feature(topo, topo.objects.countries).features.filter(function(f){ return f.id !== "010"; });
  var gp = d3.geoPath(d3.geoNaturalEarth1().fitSize([960, 500], {type:"FeatureCollection", features:fc}));
  var DE = new Intl.DisplayNames(["en"], {type:"region"}), DF = new Intl.DisplayNames(["fr"], {type:"region"}), E2C = {};
  for(var a = 65; a < 91; a++) for(var b = 65; b < 91; b++){
    var c = String.fromCharCode(a, b);
    try { var n = DE.of(c); if(n && n !== c) E2C[n] = c; } catch(e){}
  }
  WORLD = [];
  fc.forEach(function(f){
    var en = f.properties.name, code = ALIAS[en] || E2C[en], g = f.geometry, d = gp(f), cp;
    if(!d) return;
    if(g.type === "MultiPolygon"){
      var ba = -1, bp = null;
      g.coordinates.forEach(function(p){ var ft = {type:"Polygon", coordinates:p}, ar = gp.area(ft); if(ar > ba){ ba = ar; bp = ft; } });
      cp = gp.centroid(bp);
    } else cp = gp.centroid(f);
    var fr = en, flag = "";
      if(code){ try { fr = DF.of(code); } catch(e){} }
    WORLD.push({k:String(f.id || en), nm:fr, name:flag + fr, d:d, c:cp});
  });
  WORLD.forEach(function(w){ WMAP[w.k] = w; });
}

function renderMap(){
  if(!WORLD){ loadWorld(); return; }
  var svg = $("flowMap"), s = $("shSel"), sel = s.value, cs = $("cSel");
  var names = [];
  Object.keys(MAP).forEach(function(k){ parseSh(k).forEach(function(x){ if(names.indexOf(x.name) < 0) names.push(x.name); }); });
  s.textContent = "";
  var o0 = document.createElement("option"); o0.value = ""; o0.textContent = "Tous"; s.appendChild(o0);
  names.forEach(function(n){ var o = document.createElement("option"); o.value = n; o.textContent = n; s.appendChild(o); });
  s.value = names.indexOf(sel) < 0 ? "" : sel; sel = s.value;
  if(cs.options.length < 2) WORLD.slice().sort(function(x, y){ return x.nm.localeCompare(y.nm, "fr"); }).forEach(function(w){ var o = document.createElement("option"); o.value = w.k; o.textContent = w.name; cs.appendChild(o); });
  var conc = function(k){ return !sel || parseSh(k).some(function(x){ return x.name === sel; }); };

  var h = '<rect width="960" height="500" style="fill:color-mix(in srgb,#2b7bb9 22%,var(--card))"/>', ah = "", vh = "";
  WORLD.forEach(function(w){
    var m = rec(w.k);
    h += '<path class="country' + (m.etat ? " st-" + m.etat : "") + (conc(w.k) ? "" : " dim") + '" data-k="' + esc(w.k) + '" d="' + w.d + '"><title>' + esc(w.name) + (m.etat ? " · " + ETAT[m.etat] : "") + (m.stock ? " · stock " + fmt(m.stock) : "") + (m.produits.length ? " · " + m.produits.length + " produit(s)" : "") + '</title></path>';
  });
  var o = WMAP[ORIGIN];
  if(o) WORLD.forEach(function(w, i){
    var m = rec(w.k);
    if(w.k === ORIGIN || m.etat !== "actif") return;
    var dist = Math.hypot(w.c[0] - o.c[0], w.c[1] - o.c[1]), on = conc(w.k);
    ah += '<path class="rt' + (on ? "" : " dim") + '" id="ar' + i + '" d="M' + o.c[0] + " " + o.c[1] + "Q" + (o.c[0] + w.c[0]) / 2 + " " + ((o.c[1] + w.c[1]) / 2 - dist * 0.25) + " " + w.c[0] + " " + w.c[1] + '" fill="none" stroke-width="1.5" stroke-dasharray="4 5" stroke="#d98a1b" pointer-events="none"/>';
    var n = m.vol > 0 ? Math.min(5, 1 + Math.floor(m.vol / 100)) : 0;
      for(var j = 0; j < n; j++) vh += '<use class="veh" href="#i-' + (dist > 300 ? "ship" : "truck") + '" width="14" height="14" transform="translate(-7 -7)" data-r="' + i + '" data-j="' + j + '" data-n="' + n + '" data-s="' + (dist > 300 ? 1 : 0) + '" style="stroke:var(--ink);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round" pointer-events="none" opacity="' + (on ? 1 : .25) + '"/>';
  });
  h += ah + (o ? '<circle cx="' + o.c[0] + '" cy="' + o.c[1] + '" r="4" fill="#fff" stroke="#000" pointer-events="none"/>' : "") + vh;
  svg.innerHTML = h;
  VEH = [];
  Array.prototype.forEach.call(svg.querySelectorAll(".veh"), function(el){
    var p = $("ar" + el.dataset.r);
    VEH.push({el:el, path:p, len:p.getTotalLength(), off:+el.dataset.j / +el.dataset.n, dur:9000 + (+el.dataset.r % 5) * 1500, dir:(+el.dataset.j % 2 === 0)});
  });

  var sm = $("shSummary"), ks = Object.keys(MAP), tot = {s:0, t:0};
  ks.forEach(function(k){ tot.s += +MAP[k].stock || 0; tot.t += +MAP[k].transit || 0; });
  if(sel){
    sm.innerHTML = "<strong>" + esc(sel) + "</strong> : " + (ks.filter(conc).map(function(k){
      var x = parseSh(k).filter(function(y){ return y.name === sel; })[0];
      return esc(nm(k)) + " (" + esc(x.part || "part non précisée") + ") — stock " + fmt(MAP[k].stock) + ", en transit " + fmt(MAP[k].transit);
    }).join(" · ") || "aucun pays renseigné");
  } else {
    var act = WORLD.filter(function(w){ return rec(w.k).etat === "actif"; });
    sm.innerHTML = "Total : " + fmt(tot.s) + " unités en stock · " + fmt(tot.t) + " en transit. " +
      (act.length ? "Pays où nous commercialisons (" + act.length + ") : " + act.map(function(w){ return '<button type="button" class="chip" data-k="' + esc(w.k) + '">' + esc(w.name) + '</button>'; }).join("") : "Aucun pays marqué « commercialisé » : cliquez sur un pays pour renseigner sa situation.") +
      " Base de départ des flux : " + esc(nm(ORIGIN)) + ".";
  }
  if(!loopOn){ loopOn = true; requestAnimationFrame(tick); }
}
function tick(t){
  VEH.forEach(function(v){
    var f = ((t / v.dur) + v.off) % 1, pt = v.path.getPointAtLength((v.dir ? f : 1 - f) * v.len);
    v.el.setAttribute("x", pt.x); v.el.setAttribute("y", pt.y);
  });
  if(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches){ loopOn = false; return; }
  requestAnimationFrame(tick);
}

function openCountry(k){
  var m = Object.assign(newRec(), MAP[k] || {}), pn = $("pn"); pn.textContent = "";
  var prod = (m.produits || []).map(function(p){ return Object.assign({nom:"", prix:"", source:""}, p); });
  var box = document.createElement("div"); box.className = "journal-article";
  box.innerHTML = '<div class="journal-header"><div class="journal-kicker">Situation pays</div><h2 class="journal-title">' + esc(nm(k)) + '</h2></div><div class="fm">' +
    '<label for="mcEtat">Statut commercial (détermine la couleur sur la carte)</label><select id="mcEtat"><option value="">Aucune activité</option><option value="actif">Nous commercialisons déjà</option><option value="prosp">En prospection</option><option value="prevu">Prévu</option></select>' +
    '<label for="mcStock">Marchandises en stock (unités)</label><input id="mcStock" type="number" min="0">' +
    '<label for="mcTransit">Marchandises en transit (unités)</label><input id="mcTransit" type="number" min="0">' +
    '<label for="mcValeur">Valeur estimée (€)</label><input id="mcValeur" type="number" min="0">' +
    '<label for="mcVol">Envois depuis ' + esc(nm(ORIGIN)) + ' (unités / mois) — règle le nombre de véhicules animés</label><input id="mcVol" type="number" min="0">' +
    '<label for="mcSh">Actionnaires concernés (une ligne : Nom : part %)</label><textarea id="mcSh" rows="3"></textarea>' +
    '<label for="mcNotes">Notes</label><textarea id="mcNotes" rows="3"></textarea>' +
    '<label>Produits naturels les moins chers dans ce pays (saisie manuelle)</label><div id="mcProd"></div><button type="button" id="mcAdd">+ Ajouter un produit</button></div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="p" data-act="save">Enregistrer</button><button type="button" data-act="close">Fermer</button></div>';
  pn.appendChild(box);
  $("mcEtat").value = m.etat; $("mcStock").value = m.stock || 0; $("mcTransit").value = m.transit || 0; $("mcValeur").value = m.valeur || 0; $("mcVol").value = m.vol || 0;
  $("mcSh").value = m.actionnaires || ""; $("mcNotes").value = m.notes || "";
  function drawRows(){
    var rb = $("mcProd"); rb.textContent = "";
    prod.forEach(function(p, i){
      var r = document.createElement("div"); r.className = "prow";
      [["nom","Produit (ex : karité)"],["prix","Prix + unité (ex : 1 200 FCFA/kg)"],["source","Source / date"]].forEach(function(f){
        var inp = document.createElement("input"); inp.value = p[f[0]] || ""; inp.placeholder = f[1]; inp.setAttribute("aria-label", f[1]);
        inp.oninput = function(){ p[f[0]] = inp.value; }; r.appendChild(inp);
      });
      var rm = document.createElement("button"); rm.type = "button"; rm.className = "danger"; rm.textContent = "×"; rm.setAttribute("aria-label", "Retirer");
      rm.onclick = function(){ prod.splice(i, 1); drawRows(); }; r.appendChild(rm); rb.appendChild(r);
    });
  }
  drawRows();
  $("mcAdd").onclick = function(){ prod.push({nom:"", prix:"", source:""}); drawRows(); };
  box.addEventListener("click", function(e){
    var a = e.target.closest("[data-act]"); if(!a) return;
    if(a.dataset.act === "close") return closeDrawer();
    if(!canEdit()) return;
    var num = function(id){ return Math.max(0, Number($(id).value) || 0); };
    MAP[k] = {etat:$("mcEtat").value, stock:num("mcStock"), transit:num("mcTransit"), valeur:num("mcValeur"), vol:num("mcVol"),
      actionnaires:$("mcSh").value.trim(), notes:$("mcNotes").value.trim(),
      produits:prod.filter(function(p){ return (p.nom || "").trim(); }).map(function(p){ return {nom:p.nom.trim(), prix:(p.prix || "").trim(), source:(p.source || "").trim()}; })};
    recordUserAction("Mise à jour de la situation : " + (WMAP[k] ? WMAP[k].nm : k));
    saveLocal(); renderMap(); closeDrawer(); cloudSave("map");
  });
  if(!canEdit()){ box.querySelectorAll("input,select,textarea").forEach(function(x){ x.disabled = true; }); }
  showDrawer();
}

function applyVB(){ $("flowMap").setAttribute("viewBox", VB.x + " " + VB.y + " " + VB.w + " " + VB.h); }
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function zoomBy(f){
  var nw = clamp(VB.w * f, 60, 960), nh = nw * 500 / 960, cx = VB.x + VB.w / 2, cy = VB.y + VB.h / 2;
  VB.x = clamp(cx - nw / 2, 0, 960 - nw); VB.y = clamp(cy - nh / 2, 0, 500 - nh); VB.w = nw; VB.h = nh; applyVB();
}
$("zIn").onclick = function(){ zoomBy(.6); };
$("zOut").onclick = function(){ zoomBy(1 / .6); };
$("zRst").onclick = function(){ VB = {x:0, y:0, w:960, h:500}; applyVB(); };
$("flowMap").addEventListener("pointerdown", function(e){ drag = {x:e.clientX, y:e.clientY}; moved = false; });
window.addEventListener("pointermove", function(e){
  if(!drag) return;
  var r = $("flowMap").getBoundingClientRect(), dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if(!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
  moved = true;
  VB.x = clamp(VB.x - dx / r.width * VB.w, 0, 960 - VB.w); VB.y = clamp(VB.y - dy / r.height * VB.h, 0, 500 - VB.h);
  drag = {x:e.clientX, y:e.clientY}; applyVB();
});
window.addEventListener("pointerup", function(){ drag = null; });
window.addEventListener("pointercancel", function(){ drag = null; moved = false; });
$("flowMap").addEventListener("click", function(e){
  if(moved){ moved = false; return; }
  var p = e.target.closest(".country"); if(p) openCountry(p.dataset.k);
});
$("shSummary").addEventListener("click", function(e){ var c = e.target.closest(".chip"); if(c) openCountry(c.dataset.k); });
$("cSel").addEventListener("change", function(){ var k = this.value; this.value = ""; if(k) openCountry(k); });
$("shSel").addEventListener("change", renderMap);

/* ---------- Session (15 min d'inactivité) + intro vidéo ---------- */
var USER_ROLE = "reader", USER_NAME = "", USER_GRANTS = [];
function canEditPage(id){ return USER_ROLE === "admin" || USER_GRANTS.indexOf("all") > -1 || USER_GRANTS.indexOf(id) > -1; }
function canEdit(){ return canEditPage("home"); }
var SESSION_KEY = "afriflow_session_v1", INTRO_KEY = "afriflow_intro_seen";
var lastAct = Date.now(), lastSaved = 0;

function saveSession(force){
  if(!loggedUserEmail) return;
  var n = Date.now();
  if(!force && n - lastSaved < 15000) return;
  lastSaved = n;
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({e:loggedUserEmail, t:lastAct, r:USER_ROLE, n:USER_NAME, g:USER_GRANTS})); } catch(e){}
}
function touch(){ lastAct = Date.now(); saveSession(false); }
function enterApp(email, role, name, grants, market){
  document.body.classList.remove("af-auth-open");
  loggedUserEmail = email; USER_ROLE = role === "admin" ? "admin" : (role === "editor" ? "editor" : "reader");
  USER_NAME = name || ""; USER_GRANTS = Array.isArray(grants) ? grants : [];
  window.afriMarketSession = market || null;
  lastAct = Date.now(); saveSession(true);
  var accessMode=market&&market.access_mode;
  if(accessMode==="onboarding_required"){
    if(window.AfriMarket)window.AfriMarket.openPublic();
    if(window.AFRI&&window.AFRI.promptRoleChoice)window.AFRI.promptRoleChoice().catch(function(e){console.error("Onboarding:",e)});
    return;
  }
  // Seul un actionnaire approuvé ou un administrateur reconnu peut ouvrir le workspace.
  if(USER_ROLE!=="admin" && !["shareholder_approved","collaborator"].includes(accessMode)){
    if(window.AfriMarket)window.AfriMarket.open({kind:"authenticated",market:market||{access_mode:"client"}});
    return;
  }
  document.documentElement.classList.remove("af-role-checking");
  document.body.classList.remove("af-market-mode");
  document.body.classList.toggle("ro", !canEdit());
  $("auth-screen").classList.add("off");
  $("authPasswordInput").value = ""; $("authPassword2").value = "";
 $("editStatusIndicator").innerHTML = USER_ROLE === "admin" ? ic("unlock") + " Connecté : " + esc(email) + " — administrateur" : (canEdit() ? ic("unlock") + " Connecté : " + esc(email) + " — modification active" : ic("lock") + " Connecté : " + esc(email) + " — lecture seule");
  renderRoadmap();
  if(window.onRole) window.onRole();
}
function logout(msg){
  if(window.AFRI){ AFRI.stop(); AFRI.signOut(); }
  loggedUserEmail = ""; USER_ROLE = "reader"; USER_NAME = ""; USER_GRANTS = []; window.afriMarketSession = null; document.body.classList.add("ro");
  try { localStorage.removeItem(SESSION_KEY); if(window.AfriNav)window.AfriNav.clear(); } catch(e){}
  closeDrawer(); $("customizer-modal").classList.remove("on");
  $("authPasswordInput").value = ""; $("authError").textContent = msg || "";
  $("editStatusIndicator").textContent = "";
  if(window.AfriMarket) window.AfriMarket.openPublic(); else $("auth-screen").classList.remove("off");
}
/* La session Supabase est persistante : une PWA ou l'application installée ne redemande
   pas le mot de passe après une simple fermeture. Seule la déconnexion explicite la retire. */
function checkIdle(){}
function resumeSession(){
  var s = null;
  try { s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch(e){}
  window.__resume = !!(s && s.e);   /* la session réelle est toujours vérifiée auprès de Supabase */
}
["pointerdown", "keydown", "touchstart", "scroll", "wheel"].forEach(function(ev){ window.addEventListener(ev, touch, {passive:true}); });
setInterval(checkIdle, 20000);
document.addEventListener("visibilitychange", function(){ if(document.hidden) saveSession(true); else checkIdle(); });
window.addEventListener("pagehide", function(){ saveSession(true); });

function initIntro(){
  var box = $("intro"), v = $("introVideo"), bg = $("introBackdropVideo"), snd = $("introSnd");
  if(!box || document.documentElement.classList.contains("no-intro")) return;
  var done = false, fs = setTimeout(finish, 120000);
  var gestures = []; // Les clics sur l’introduction contrôlent uniquement le son.
  function paint(){
    var l = v.muted ? "Activer le son" : "Couper le son";
    snd.innerHTML = ic(v.muted ? "volume-off" : "volume"); snd.title = l; snd.setAttribute("aria-label", l);
  }
  function stopGestures(){ gestures.forEach(function(ev){ window.removeEventListener(ev, onGesture, true); }); }
  function toggleIntroSound(e){
    if(e){e.preventDefault();e.stopPropagation();}
    if(done)return;
    v.muted=!v.muted;
    if(!v.muted)v.volume=1;
    paint();
    if(v.paused && !v.ended){var play=v.play();if(play&&play.catch)play.catch(function(){});}
  }
  function finish(){
    if(done) return; done = true; clearTimeout(fs); stopGestures();
    try { sessionStorage.setItem(INTRO_KEY, "1"); } catch(e){}
    box.classList.add("out"); v.pause(); if(bg)bg.pause(); document.documentElement.classList.add("af-intro-finished");
    setTimeout(function(){ box.style.display = "none"; }, 700);
    if(window.afriMarketInitial)window.afriMarketInitial();
  }
  $("introSkip").onclick = function(e){ e.preventDefault(); e.stopPropagation(); toggleIntroSound(); };
  snd.onclick = toggleIntroSound;
  box.addEventListener("click",toggleIntroSound);
  // Preserve every source frame; allow a quiet 850 ms hold before the existing fade.
  v.addEventListener("ended", function(){setTimeout(finish,850)});
  v.addEventListener("error", finish);
  if(bg){
    bg.muted=true; bg.volume=0;
    bg.play().catch(function(){});
    v.addEventListener("timeupdate",function(){ if(Math.abs(bg.currentTime-v.currentTime)>.25){try{bg.currentTime=v.currentTime}catch(e){}} });
  }

  v.muted = false; v.volume = 1; paint();
  var p = v.play();
  if(p && p.catch) p.catch(function(){
    /* son refusé par le navigateur : lecture muette, le son s'active au 1er geste ou via le petit bouton */
    v.muted = true; paint();
    v.play().catch(function(){ /* Conserver l’introduction visible en cas de lecture bloquée. */ });
  });
}
/* ---------- Démarrage : on charge AVANT toute écriture ---------- */
loadLocal();
restoreTheme();
buildMts();
renderMap();
resumeSession();
initIntro();
