/* AfriFloW PWA Web Push subscription: permission is always opt-in.
   Installed iOS PWA, Android browsers and desktop browsers may support it.
   The native Android WebView and current Electron wrapper need their own native push integration. */
(function(){
  'use strict';
  var KEY='afriflow_push_status_v1';
  var URL='https://jgvwdpzevghfavmpjbqp.supabase.co/functions/v1/afriflow-push';
  var inflight=null;
  function account(){return String(window.loggedUserEmail||'').toLowerCase().trim()}
  function supported(){
    return !!(window.isSecureContext &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window);
  }
  function decodeKey(str){
    var base64=String(str).replace(/-/g,'+').replace(/_/g,'/');
    var raw=atob(base64.padEnd(Math.ceil(base64.length/4)*4,'='));
    var bytes=new Uint8Array(raw.length);
    for(var i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return bytes;
  }
  function status(text) {
    if(!text)return;
    console.info('AfriFloW Web Push: '+text);
  }
  async function getKey(){
    var response=await fetch(URL,{method:'GET',cache:'no-store'});
    if(!response.ok)throw new Error('Serveur push indisponible ('+response.status+')');
    var data=await response.json();
    if(!data.publicKey)throw new Error('Clé publique VAPID absente');
    return data.publicKey;
  }
  async function register() {
    if(inflight)return inflight;
    inflight=(async function(){
      if(!supported())return {ok:false,reason:'non_supported'};
      if(Notification.permission!=='granted')return {ok:false,reason:'permission'};
      var email=account();
      if(!email || !window.__sb)return {ok:false,reason:'not_authenticated'};
      var session=await window.__sb.auth.getUser();
      var user=session.data&&session.data.user;
      if(!user || String(user.email||'').toLowerCase()!==email)return {ok:false,reason:'not_authenticated'};
      var worker=await navigator.serviceWorker.ready;
      if(!worker.pushManager)return {ok:false,reason:'no_push_manager'};
      var subscription=await worker.pushManager.getSubscription();
      if(!subscription){
        var publicKey=await getKey();
        subscription=await worker.pushManager.subscribe({
          userVisibleOnly:true,
          applicationServerKey:decodeKey(publicKey),
        });
      }
      var p=subscription.toJSON();
      if(!p.keys || !p.keys.p256dh || !p.keys.auth)throw new Error('Abonnement incomplet');
      var payload={endpoint:p.endpoint,p256dh:p.keys.p256dh,auth_key:p.keys.auth,user_email:email,updated_at:new Date().toISOString()};
      var result=await window.__sb.from('afriflow_push_subscriptions').upsert(payload,{onConflict:'endpoint'});
      if(result.error)throw result.error;
      try{localStorage.setItem(KEY,email)}catch(e){}
      status('appareil inscrit');
      return {ok:true};
    })().catch(function(error){
      status(error.message||'Abonnement impossible');
      return {ok:false,reason:error.message||'error'};
    }).finally(function(){inflight=null});
    return inflight;
  }
  async function unregister(){
    try{
      var worker=await navigator.serviceWorker.ready;
      var sub=await worker.pushManager.getSubscription();
      if(sub){
        var email=account();
        if(email&&window.__sb){
          await window.__sb.from('afriflow_push_subscriptions')
            .delete().eq('endpoint',sub.endpoint).eq('user_email',email);
        }
        await sub.unsubscribe();
      }
      try{localStorage.removeItem(KEY)}catch(e){}
    }catch(e){status('Désinscription indisponible : '+(e.message||e))}
  }
  async function autoRegister(){
    if(!supported() || Notification.permission!=='granted')return;
    if(!window.AfriFlowAlerts || !window.AfriFlowAlerts.enabled())return;
    var email=account();
    if(!email)return;
    var last='';
    try{last=localStorage.getItem(KEY)||''}catch(e){}
    // On another browser/new installation, re-register even when consent exists elsewhere.
    if(last!==email)await register();
  }
  function start(){
    // Registration after system permission was expressly approved, not silently at page load.
    var timer=setInterval(autoRegister,20000);
    window.addEventListener('online',autoRegister);
    window.addEventListener('focus',autoRegister);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)autoRegister()});
    autoRegister();
  }
  window.AfriFlowPush={subscribe:register,unsubscribe:unregister,supported:supported};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
  else start();
})();
