// AfriFlow PWA: Web Push while closed. No fetch interception or caching.
// Live Supabase, Dropbox and chatbot requests remain untouched.
self.addEventListener('install', function(){self.skipWaiting();});
self.addEventListener('activate', function(event){event.waitUntil(self.clients.claim());});
self.addEventListener('push', function(event){
  event.waitUntil((async function(){
    var data={};
    try{data=event.data?event.data.json():{}}catch(e){return}
    if(!data||!data.title)return;
    // Web Push must remain visible to the user (including installed iOS apps).
    // Forward to an open app too, without losing the structured meeting ID.
    var active=[];
    try{active=await self.clients.matchAll({type:'window',includeUncontrolled:true});}catch(ignore){}
    var visible=active.filter(function(c){return c.visibilityState==='visible' && c.url.startsWith(self.registration.scope)});
    var body=String(data.body||'').slice(0,240);
    var url=new URL('./',self.registration.scope).href;
    var meeting=data.kind==='meeting',id=String(data.meetingId||'');
    if(meeting&&(!/^m[a-z0-9]{5,35}$/.test(id)||!Number.isFinite(Number(data.expiresAt))||Number(data.expiresAt)<=Date.now()))return;
    if(meeting){
      var linked=new URL(url);linked.searchParams.set('meeting',id);url=linked.href;
      visible.forEach(function(c){
        try{c.postMessage({type:'afriflow:meeting-push',meetingId:id,stage:data.stage,expiresAt:Number(data.expiresAt)});}catch(ignore){}
      });
    }
    var title=meeting?(data.stage==='soon'?'Réunion dans 15 minutes':'Votre réunion commence'):String(data.title).slice(0,100);
    await self.registration.showNotification(title,{
      body:meeting && data.stage==='start' ? 'Touchez pour accepter et rejoindre Teams. '+body : body,
      icon:new URL('logo.png',self.registration.scope).href,
      badge:new URL('logo.png',self.registration.scope).href,
      tag:meeting?'afriflow-meeting-'+id+'-'+String(data.start)+'-'+(data.stage==='soon'?'soon':'start'):String(data.tag||'afriflow').slice(0,150),
      renotify:!visible.length || (meeting && data.stage==='start'),
      silent:!!visible.length && !(meeting && data.stage==='start'),
      requireInteraction:meeting&&data.stage==='start',
      timestamp:meeting?Number(data.start):Date.now(),
      data:{url:url,meetingId:meeting?id:'',expiresAt:meeting?Number(data.expiresAt):0,kind:data.kind||'',stage:meeting?data.stage:''},
      actions:meeting?[data.stage==='start'?{action:'accept',title:'Accepter'}:{action:'join',title:'Voir la réunion'},{action:'dismiss',title:'Plus tard'}]:[],
    });
  })());
});
function previewAccepted(client,id){
  // A newly activated worker can still control an old, open page. Ask whether
  // that page queued the invitation before relying on its message handler.
  if(typeof MessageChannel!=='function')return Promise.resolve(false);
  return new Promise(function(resolve){
    var channel,timer,finished=false;
    function complete(accepted){
      if(finished)return;finished=true;clearTimeout(timer);
      if(channel){try{channel.port1.close();channel.port2.close();}catch(ignore){}}
      resolve(accepted);
    }
    try{
      channel=new MessageChannel();
      channel.port1.onmessage=function(event){complete(!!(event.data&&event.data.accepted===true));};
      channel.port1.onmessageerror=function(){complete(false);};
      timer=setTimeout(function(){complete(false);},400);
      client.postMessage({type:'afriflow:meeting-request',meetingId:id,source:'push'},[channel.port2]);
    }catch(error){complete(false);}
  });
}
self.addEventListener('notificationclick',function(event){
  event.notification.close();
  if(event.action==='dismiss')return;
  var info=event.notification.data||{};
  var id=/^m[a-z0-9]{5,35}$/.test(String(info.meetingId||''))?info.meetingId:'';
  // A notification never opens Teams directly: the authenticated app must
  // verify the invitation and record the join when the member chooses it.
  var dest=new URL('./',self.registration.scope);
  if(id)dest.searchParams.set('meeting',id);
  event.waitUntil((async function(){
    if(id && info.kind==='meeting' && info.stage==='start' && Number(info.expiresAt)>Date.now() && (!event.action || event.action==='accept')){
      // Bind the explicit tap to one short-lived launch, including cold starts.
      try{
        var until=Math.min(Number(info.expiresAt),Date.now()+120000);
        var token=crypto.randomUUID();
        var cache=await caches.open('afriflow-meeting-taps-v1');
        for(var previous of await cache.keys()){
          if(Number(new URL(previous.url).searchParams.get('until'))<=Date.now())await cache.delete(previous);
        }
        var receipt=new URL(dest.href);
        receipt.searchParams.set('until',String(until));
        receipt.searchParams.set('tap',token);
        await cache.put(receipt.href,new Response('1'));
        dest.hash='accept='+token+'&until='+until;
        await self.clients.openWindow(dest.href);
        return;
      }catch(ignore){dest.hash='';}
    }
    var windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(var c of windows){
      if(c.url.startsWith(self.registration.scope)){
        if(!id){try{await c.focus();return;}catch(ignore){continue;}}
        if(await previewAccepted(c,id)){
          try{await c.focus();return;}catch(ignore){}
        }
        // Do not reload or navigate an old tab: it may contain unsaved work.
        // A fresh same-origin page can read this invitation after signing in.
        break;
      }
    }
    await self.clients.openWindow(dest.href);
  })());
});
