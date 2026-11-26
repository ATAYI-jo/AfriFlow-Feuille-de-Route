/* AfriFlow PWA Web Push subscription: permission is always opt-in.
   Installed iOS PWA, Android browsers and desktop browsers may support it.
   The native Android WebView and current Electron wrapper need their own native push integration. */
(function(){
  'use strict';
  var KEY='afriflow_push_status_v1';
  var URL='https://jgvwdpzevghfavmpjbqp.supabase.co/functions/v1/afriflow-push';
  var inflight=null, lastCheck=0;
  function account(){return String(window.loggedUserEmail||'').toLowerCase().trim()}
  function optedIn(){return !!(window.AfriFlowAlerts&&window.AfriFlowAlerts.enabled())}
  function registrationIssue(email,client){
    if(!optedIn())return 'alerts_disabled';
    if(account()!==email || window.__sb!==client)return 'account_changed';
    if(Notification.permission!=='granted')return 'permission';
    return '';
  }
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
    console.info('AfriFlow Web Push: '+text);
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
      if(!optedIn())return {ok:false,reason:'alerts_disabled'};
      if(!supported())return {ok:false,reason:'non_supported'};
      if(Notification.permission!=='granted')return {ok:false,reason:'permission'};
      var email=account(), client=window.__sb;
      if(!email || !client)return {ok:false,reason:'not_authenticated'};
      var session=await client.auth.getUser();
      var user=session.data&&session.data.user;
      if(!user || String(user.email||'').toLowerCase()!==email)return {ok:false,reason:'not_authenticated'};
      var worker=await navigator.serviceWorker.ready;
      var issue=registrationIssue(email,client);
      if(issue)return {ok:false,reason:issue};
      if(!worker.pushManager)return {ok:false,reason:'no_push_manager'};
      var subscription=await worker.pushManager.getSubscription();
      issue=registrationIssue(email,client);
      if(issue)return {ok:false,reason:issue};
      var created=false;
      if(!subscription){
        var publicKey=await getKey();
        issue=registrationIssue(email,client);
        if(issue)return {ok:false,reason:issue};
        subscription=await worker.pushManager.subscribe({
          userVisibleOnly:true,
          applicationServerKey:decodeKey(publicKey),
        });
        created=true;
      }
      issue=registrationIssue(email,client);
      if(issue){
        if(created)try{await subscription.unsubscribe()}catch(e){}
        return {ok:false,reason:issue};
      }
      var p=subscription.toJSON();
      if(!p.keys || !p.keys.p256dh || !p.keys.auth)throw new Error('Abonnement incomplet');
      var payload={endpoint:p.endpoint,p256dh:p.keys.p256dh,auth_key:p.keys.auth,user_email:email,updated_at:new Date().toISOString()};
      var result=await client.from('afriflow_push_subscriptions').upsert(payload,{onConflict:'endpoint'});
      if(result.error)throw result.error;
      issue=registrationIssue(email,client);
      if(issue){
        try{await subscription.unsubscribe()}catch(e){}
        return {ok:false,reason:issue};
      }
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
  var lastNativeAttempt=0;
  async function registerAndroidNative(){
    if(!window.AfriFlowAndroid || !window.AfriFlowAlerts || !window.AfriFlowAlerts.enabled())return;
    if(Date.now()-lastNativeAttempt<120000)return;
    var who=account();
    if(!who || !window.__sb?.auth)return;
    lastNativeAttempt=Date.now();
    try{
      var data=await window.__sb.auth.getSession();
      var session=data.data?.session;
      if(!session?.access_token||String(session.user?.email||'').toLowerCase()!==who)return;
      if(!optedIn()||account()!==who)return;
      window.AfriFlowAndroid.postMessage(JSON.stringify({action:'enablePush',accessToken:session.access_token}));
    }catch(e){status('Inscription Android indisponible : '+e.message);}
  }
  async function autoRegister(){
    if(!optedIn())return;
    if(window.AfriFlowAndroid) {await registerAndroidNative();return;}
    if(!supported() || Notification.permission!=='granted')return;
    var email=account();
    if(!email)return;
    var last='';
    try{last=localStorage.getItem(KEY)||''}catch(e){}
    // On another browser/new installation, re-register even when consent exists elsewhere.
    if(last!==email || Date.now()-lastCheck>5*60*1000){lastCheck=Date.now();await register();}
  }
  async function diagnostics() {
    var out={secure:window.isSecureContext,supported:supported(),
      permission:('Notification' in window?Notification.permission:'unsupported'),
      registered:false,server:false,error:null};
    if(!out.supported)return out;
    try{
      var sw=await navigator.serviceWorker.ready;
      var sub=await sw.pushManager.getSubscription();
      out.registered=!!sub;
      var response=await fetch(URL,{method:'GET',cache:'no-store'});
      out.server=response.ok;
    }catch(e){out.error=e.message||String(e)}
    return out;
  }
  async function testNotification() {
    var result=await register();
    if(!result.ok) return {ok:false,reason:result.reason};
    var session=await window.__sb.auth.getSession();
    var jwt=session.data?.session?.access_token;
    if(!jwt)return {ok:false,reason:'Aucune session Supabase Auth active.'};
    var response=await fetch(URL,{method:'POST',headers:{
      'Content-Type':'application/json','Authorization':'Bearer '+jwt
    },body:JSON.stringify({action:'test'})});
    var data=await response.json();
    return {ok:response.ok && (data.sent>0 || data.already_sent>0),
      reason:data.error||'',...data};
  }
  async function notifyMessage(messageKey) {
    var email=account();
    if(!email || !window.__sb)return {ok:false,reason:'not_authenticated'};
    // Sending a message does not opt its author into receiving notifications.
    // Recipient delivery remains authenticated independently of this device.
    if(optedIn())await register();
    var session=await window.__sb.auth.getSession();
    var jwt=session.data&&session.data.session&&session.data.session.access_token;
    if(!jwt)return {ok:false,reason:'not_authenticated'};
    var response=await fetch(URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+jwt},body:JSON.stringify({action:'message',message_key:String(messageKey||'')})});
    var data={};try{data=await response.json()}catch(e){}
    return {ok:response.ok,reason:data.error||'',...data};
  }
  function start(){
    // Registration after system permission was expressly approved, not silently at page load.
    var timer=setInterval(autoRegister,60000);
    window.addEventListener('online',autoRegister);
    window.addEventListener('focus',autoRegister);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)autoRegister()});
    autoRegister();
  }
  window.AfriFlowPush={subscribe:register,unsubscribe:unregister,supported:supported,registerAndroidNative:registerAndroidNative,
    diagnostics:diagnostics,test:testNotification,notifyMessage:notifyMessage};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
  else start();
})();
