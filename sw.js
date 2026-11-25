// AfriFlow: public offline recovery shell + existing Web Push.
// Never cache authenticated API responses, user documents, or mutations.
const OFFLINE_PREFIX = 'afriflow-offline-shell-';
const OFFLINE_CACHE = OFFLINE_PREFIX + 'v1';
const scope = new URL(self.registration.scope);
const offlinePage = new URL('offline.html', scope).href;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.add(new Request(offlinePage, {cache:'reload', credentials:'omit'}));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(OFFLINE_PREFIX) && key !== OFFLINE_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  const url = new URL(req.url);
  // OAuth callbacks, deep links and external services remain untouched.
  if (url.origin !== scope.origin || url.search ||
      ![scope.pathname, new URL('index.html', scope).pathname].includes(url.pathname)) return;
  event.respondWith((async () => {
    try { return await fetch(req); }
    catch (_) {
      const cache = await caches.open(OFFLINE_CACHE);
      return await cache.match(offlinePage) || Response.error();
    }
  })());
});
self.addEventListener('push', function(event){
  event.waitUntil((async function(){
    var data={};
    try{data=event.data?event.data.json():{}}catch(e){return}
    if(!data||!data.title)return;
    // Prevent duplicate notifications when AfriFlow is already visible.
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
    await self.registration.showNotification(incomingCall?'Appel Teams entrant':String(data.title).slice(0,100),{
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
