/* AfriFloW diagnostics accessible from menu, without a floating alert badge.
   Does not claim success until browser + server report a functioning subscription. */
(function(){
  'use strict';
  var modal=null, entry=null, active=false;
  function el(tag,cls,text,parent){
    var n=document.createElement(tag);
    if(cls)n.className=cls;
    if(text)n.textContent=text;
    if(parent)parent.appendChild(n);
    return n;
  }
  function mount(){
    var side=document.getElementById('side');
    if(!side||entry)return;
    entry=el('button','af-push-menu','🔔 Vérifier les notifications',side);
    entry.type='button';
    entry.style.display='none';
    entry.addEventListener('click',open);
    modal=el('div','af-push-diagnostics',null,document.body);
    modal.hidden=true;
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-label','Diagnostic des notifications AfriFloW');
    var card=el('div','af-push-diagnostics-card',null,modal);
    el('h2',null,'Notifications AfriFloW',card);
    var note=el('p',null,'Vérifiez si cet appareil peut recevoir les alertes lorsque la plateforme est fermée.',card);
    note.className='af-push-help';
    var status=el('div','af-push-status',null,card);
    status.id='af-push-diag-status';
    status.setAttribute('role','status');
    var buttons=el('div','af-push-actions',null,card);
    var refresh=el('button',null,'Vérifier',buttons);refresh.type='button';
    var test=el('button',null,'Envoyer un test',buttons);test.type='button';
    var close=el('button',null,'Fermer',buttons);close.type='button';
    refresh.addEventListener('click',check);
    test.addEventListener('click',async function(){
      var api=window.AfriFlowPush;
      if(!api||!api.supported()) {status.textContent='Cette application ne prend pas en charge Web Push. L’APK Android actuel nécessite Firebase Cloud Messaging natif ; l’EXE Windows nécessite un service de notifications dédié.';return;}
      if('Notification' in window && Notification.permission==='default'){
        try{await Notification.requestPermission()}catch(e){}
      }
      if(Notification.permission!=='granted'){status.textContent='Autorisation refusée ou désactivée dans les réglages système.';return;}
      status.textContent='Test de livraison en cours…';
      try{
        var result=await api.test();
        status.textContent=result.ok
          ?'Envoi accepté ('+(result.sent||0)+' appareil(s)). Verrouillez votre écran pour vérifier la prochaine alerte. L’envoi ne garantit pas son affichage par le système.'
          :'Test impossible : '+(result.reason||'échec de l’inscription ou de l’envoi')+'.';
      }catch(e){status.textContent='Erreur : '+e.message}
    });
    close.addEventListener('click',function(){modal.hidden=true});
    modal.addEventListener('click',function(e){if(e.target===modal)modal.hidden=true});
    setInterval(function(){
      var hasUser=!!String(window.loggedUserEmail||'').trim();
      entry.style.display=hasUser?'block':'none';
      if(!hasUser)modal.hidden=true;
    },1400);
  }
  function open(){
    if(!modal)return;
    modal.hidden=false;
    document.getElementById('side')?.classList.remove('on');
    check();
  }
  async function check(){
    var status=document.getElementById('af-push-diag-status');
    if(!status)return;
    if(!window.AfriFlowPush){status.textContent='Module de notifications indisponible sur cette version.';return;}
    status.textContent='Vérification de cet appareil…';
    try{
      var d=await window.AfriFlowPush.diagnostics();
      if(!d.supported){
        status.textContent='Web Push indisponible dans cette application. L’APK Android WebView et l’EXE Electron n’intègrent pas encore de service natif. Utilisez une PWA installée depuis Chrome ou Safari pour tester Web Push.';
        return;
      }
      status.textContent='Autorisation : '+d.permission+' · Abonnement enregistré sur cet appareil : '+(d.registered?'oui':'non')+' · Serveur : '+(d.server?'accessible':'indisponible')+(d.error?' · '+d.error:'');
    }catch(e){status.textContent='Erreur : '+e.message}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);
  else mount();
})();
