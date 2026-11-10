// AfriFloW PWA: Web Push while closed. No fetch interception or caching.
// Live Supabase, Dropbox and chatbot requests remain untouched.
self.addEventListener('install', function(){self.skipWaiting();});
self.addEventListener('activate', function(event){event.waitUntil(self.clients.claim());});
self.addEventListener('push', function(event){
  event.waitUntil((async function(){
    var data={};
    try{data=event.data?event.data.json():{}}catch(e){return}
    if(!data||!data.title)return;
    // Prevent duplicate notifications when AfriFloW is already visible.
    var active=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    if(active.some(function(c){return c.visibilityState==='visible' && c.url.startsWith(self.registration.scope)}))return;
    var body=String(data.body||'').slice(0,240);
    var url=new URL('./',self.registration.scope).href;
    var teamsUrl=null;
    try {
      var parsed=new URL(data.teamsUrl||'');
      if(parsed.protocol==='https:'&&['teams.microsoft.com','teams.live.com','teams.microsoft.us'].includes(parsed.hostname)){
        teamsUrl=parsed.href;
      }
    }catch(e){}
    var incomingCall=data.kind==='meeting'&&!!teamsUrl;
    await self.registration.showNotification(incomingCall?'📞 Appel Teams entrant':String(data.title).slice(0,100),{
      body:body,
      icon:new URL('logo.png',self.registration.scope).href,
      badge:new URL('logo.png',self.registration.scope).href,
      tag:incomingCall?'afriflow-incoming-call':String(data.tag||'afriflow').slice(0,150),
      renotify:true,
      silent:false,
      requireInteraction:incomingCall,
      data:{url:url,teamsUrl:teamsUrl,kind:data.kind||''},
      actions:teamsUrl?[{action:'join',title:'Répondre dans Teams'}]:[],
    });
  })());
});
self.addEventListener('notificationclick',function(event){
  event.notification.close();
  var info=event.notification.data||{};
  var dest=event.action==='join'&&info.teamsUrl?info.teamsUrl:(info.url||self.registration.scope);
  event.waitUntil((async function(){
    // Teams opens only after user's direct action on the notification.
    if(event.action==='join' && info.teamsUrl){await self.clients.openWindow(dest);return;}
    var windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(var c of windows){
      if(c.url.startsWith(self.registration.scope)){
        await c.focus();
        return;
      }
    }
    await self.clients.openWindow(dest);
  })());
});
