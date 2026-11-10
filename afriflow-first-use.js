/* AfriFloW first-use conditions and notification opt-in.
   Consent is LOCAL to each account and each app/browser installation.
   A previous Supabase profile choice must never skip approval on a new installation. */
(function(){
  'use strict';
  var VERSION='2026-11-v1', modal=null, showingFor='', timer=null;
  function getAccount(){return String(window.loggedUserEmail||'').trim().toLowerCase()}
  function installationContext(){
    // The browser and an installed PWA may share origin storage on some platforms.
    // Keep their first-use approvals separate when their display modes differ.
    if(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return 'installed';
    if(navigator.standalone === true) return 'installed';
    if(String(navigator.userAgent).includes('Electron/')) return 'electron';
    if(String(navigator.userAgent).includes('; wv)')) return 'android-webview';
    return 'browser';
  }
  function key(email){return 'afriflow_terms_'+VERSION+'_'+installationContext()+'_'+email}
  function accepted(email) {
    try {return localStorage.getItem(key(email))==='accepted'}catch(e){return false}
  }
  function create(){
    if(modal)return;
    modal=document.createElement('div');
    modal.id='af-first-use';
    modal.hidden=true;
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-labelledby','af-first-use-heading');
    modal.innerHTML=
      '<div class="af-first-use-card">'+
      '<img src="./logo.png" alt="AfriFloW" class="af-first-use-logo">'+
      '<h2 id="af-first-use-heading">Bienvenue sur AfriFloW</h2>'+
      '<p>Avant votre première utilisation sur cet appareil ou dans cette application, prenez connaissance des règles de la plateforme et choisissez vos préférences.</p>'+
      '<div class="af-first-use-terms" tabindex="0" aria-label="Conditions d’utilisation">'+
      '<strong>Conditions essentielles d’utilisation</strong>'+
      '<p>AfriFloW est un espace collaboratif de gestion de projets, de documents et de réunions. Utilisez-le uniquement avec votre compte et les autorisations qui vous sont accordées. Ne partagez pas vos identifiants, ne diffusez pas les documents privés et respectez les autres utilisateurs. Les contenus que vous ajoutez peuvent être accessibles aux participants autorisés. Les fonctionnalités dépendent notamment de Supabase, Dropbox et des services de réunion.</p>'+
      '<p>Les données nécessaires au fonctionnement de votre compte et les préférences locales sont traitées pour fournir le service. Les notifications sont facultatives et peuvent être refusées dans le navigateur ou le système. Ce résumé ne remplace pas une politique de confidentialité complète.</p>'+
      '</div>'+
      '<label class="af-first-use-choice"><input id="af-terms-agree" type="checkbox"> <span><strong>J’ai lu et j’accepte les conditions d’utilisation</strong> (obligatoire)</span></label>'+
      '<label class="af-first-use-choice"><input id="af-notify-agree" type="checkbox"> <span><strong>Je souhaite recevoir les alertes AfriFloW</strong> (facultatif) : messages, rappels et réunions, avec sonnerie lorsque l’application fonctionne.</span></label>'+
      '<p class="af-first-use-note">La permission du système sera demandée séparément si vous activez les notifications. Vous pourrez la modifier dans les paramètres du navigateur ou de l’appareil.</p>'+
      '<p id="af-first-use-error" role="alert" aria-live="polite"></p>'+
      '<button id="af-first-use-accept" type="button" disabled>Continuer vers AfriFloW</button>'+
      '</div>';
    document.body.appendChild(modal);
    var agree=modal.querySelector('#af-terms-agree');
    var accept=modal.querySelector('#af-first-use-accept');
    agree.addEventListener('change',function(){accept.disabled=!agree.checked});
    accept.addEventListener('click',async function(){
      var email=getAccount();
      if(!email||email!==showingFor||!agree.checked)return;
      var opted=modal.querySelector('#af-notify-agree').checked;
      // Commit first-use approval before asking for OS permissions or contacting a server.
      // A rejected permission or temporary network outage must never reopen the terms.
      try {localStorage.setItem(key(email),'accepted')}catch(e){
        modal.querySelector('#af-first-use-error').textContent='Impossible de mémoriser ce choix sur cet appareil. Vérifiez les paramètres de stockage du navigateur.';
        return;
      }
      accept.disabled=true;
      // User initiation allows optional browser notification permission prompt.
      if(opted) {
        if(window.AfriFlowAlerts)window.AfriFlowAlerts.enable();
        try {
          if('Notification' in window && Notification.permission==='default'){
            await Notification.requestPermission();
          }
          if(window.AfriFlowPush){
            if(window.AfriFlowAndroid && window.AfriFlowPush.registerAndroidNative){
              // Android WebView has no browser PushManager; register native FCM instead.
              await window.AfriFlowPush.registerAndroidNative();
            }else if(window.AfriFlowPush.supported() && Notification.permission==='granted'){
              var pushResult=await window.AfriFlowPush.subscribe();
              if(!pushResult.ok){
                console.warn('AfriFloW: installation des notifications push différée : '+pushResult.reason);
              }
            }
          }
        }catch(e){}
      } else {
        if(window.AfriFlowAlerts) window.AfriFlowAlerts.disable();
        if(window.AfriFlowPush) await window.AfriFlowPush.unsubscribe();
      }
      // A choice on another app or device does not count as approval here.
      showingFor='';
      modal.hidden=true;
      document.body.classList.remove('af-first-use-active');
    });
  }
  function check(){
    var email=getAccount();
    if(!email){
      if(modal)modal.hidden=true;
      showingFor='';
      document.body.classList.remove('af-first-use-active');
      return;
    }
    if(accepted(email)){
      if(modal)modal.hidden=true;
      showingFor='';
      document.body.classList.remove('af-first-use-active');
      return;
    }
    if(showingFor===email)return;
    create();
    showingFor=email;
    modal.querySelector('#af-terms-agree').checked=false;
    modal.querySelector('#af-notify-agree').checked=false;
    modal.querySelector('#af-first-use-accept').disabled=true;
    modal.querySelector('#af-first-use-error').textContent='';
    modal.hidden=false;
    document.body.classList.add('af-first-use-active');
    modal.querySelector('#af-terms-agree').focus();
  }
  function start(){
    create();
    check();
    timer=setInterval(check,1200);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)check()});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
  else start();
})();
