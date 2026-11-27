/* AfriFlow notifications and meeting invitations for active sessions.
   Closed-app delivery is handled separately by Web Push / native notifications.
   Original short tones synthesized locally (no third-party audio). */
(function () {
  'use strict';
  var sb = null, account = '', firstMessages = true, known = new Set();
  var knownMeetings = new Set(), firstMeetings = true;
  var knownDecisions = new Map(), firstDecisions = true;
  var audio = null, ringTimer = null, ringStopTimer = null, expiryTimer = null, playing = [];
  var activeMeeting = null, previousFocus = null, previousOverflow = '', inertElements = [], joining = false;
  var lastToast = 0, busy = false;
  var ring = null, toast = null;
  var settingsKey = '';
  var enabled = false;
  function element(tag, attrs, parent) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function(k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else n.setAttribute(k,attrs[k]);
    });
    if (parent) parent.appendChild(n);
    return n;
  }
  function currentAccount() { return String(window.loggedUserEmail || '').toLowerCase().trim(); }
  function installationContext() {
    // Match first-use consent: origin storage may be shared by browser and PWA.
    if(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)return 'installed';
    if(navigator.standalone===true)return 'installed';
    if(String(navigator.userAgent).includes('Electron/'))return 'electron';
    if(String(navigator.userAgent).includes('; wv)'))return 'android-webview';
    return 'browser';
  }
  function syncConsent() {
    var owner=currentAccount();
    var key=owner?'afriflow_alerts_enabled_v2_'+installationContext()+'_'+owner:'';
    if(settingsKey!==key){
      settingsKey=key;enabled=false;
      // A device-global legacy approval cannot establish this account's consent.
      try{enabled=!!key&&localStorage.getItem(key)==='yes';}catch(e){}
      if(activeMeeting&&activeMeeting.owner!==owner)endCall();
      else if(!enabled)stopRinging();
    }
    return enabled;
  }
  function monotonicNow() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }
  function meetingNow(m) { return m.clockEpoch + Math.max(0,monotonicNow()-m.clockStart); }
  function meetingId(value) { return /^m[a-z0-9]{5,35}$/.test(String(value || '')) ? String(value) : ''; }
  function invited(m, email) {
    return !Array.isArray(m.invitees) || m.invitees.some(function(value) { return String(value).toLowerCase().trim() === email; });
  }
  function callActionIcon(kind) {
    var ns='http://www.w3.org/2000/svg';
    var icon=document.createElementNS(ns,'svg');
    icon.setAttribute('class','af-meet-action-icon');
    icon.setAttribute('viewBox','0 0 24 24');
    icon.setAttribute('aria-hidden','true');
    icon.setAttribute('focusable','false');
    var path=document.createElementNS(ns,'path');
    path.setAttribute('fill','none');
    path.setAttribute('stroke','currentColor');
    path.setAttribute('stroke-width','2.25');
    path.setAttribute('stroke-linecap','round');
    path.setAttribute('stroke-linejoin','round');
    path.setAttribute('d',kind==='join'
      ? 'M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm12 4 6-3v10l-6-3'
      : kind==='later' ? 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2' : 'M6 6l12 12M18 6 6 18');
    icon.appendChild(path);
    return icon;
  }
  function build() {
    if (ring) return;
    // No floating alert toggle. Notification preference is collected during first use.
    toast = element('div',{id:'af-alert-toast',role:'status','aria-live':'polite'},document.body);
    ring = element('div',{id:'af-meet-call',role:'dialog','aria-modal':'true','aria-labelledby':'af-meet-title','aria-describedby':'af-meet-info af-meet-time af-meet-duration',hidden:''},document.body);
    var panel=element('div',{id:'af-meet-panel',tabindex:'-1'},ring);
    var close=element('button',{type:'button',id:'af-meet-close','aria-label':'Fermer l’invitation'},panel);
    close.appendChild(callActionIcon('close'));
    element('div',{id:'af-meet-incoming',text:'Réunion à rejoindre'},panel);
    element('img',{src:'./logo.svg?v=2',alt:'AfriFlow',width:'96',height:'96'},panel);
    element('p',{id:'af-meet-source',text:'AfriFlow · Microsoft Teams'},panel);
    element('h2',{id:'af-meet-title',text:'Réunion en ligne'},panel);
    element('p',{id:'af-meet-info',text:'Retrouvez les participants dans votre espace de réunion.'},panel);
    element('p',{id:'af-meet-time'},panel);
    element('p',{id:'af-meet-duration'},panel);
    element('p',{id:'af-meet-status',role:'status','aria-live':'polite',hidden:''},panel);
    var actions=element('div',{id:'af-meet-actions'},panel);
    var decline=element('button',{type:'button',id:'af-meet-reject'},actions);
    decline.appendChild(callActionIcon('later')); element('span',{text:'Plus tard'},decline);
    var accept=element('button',{type:'button',id:'af-meet-accept'},actions);
    accept.appendChild(callActionIcon('join')); element('span',{id:'af-meet-join-label',text:'Rejoindre Teams'},accept);
    element('small',{text:'Teams s’ouvre uniquement lorsque vous choisissez de rejoindre la réunion.'},panel);
    decline.addEventListener('click',endCall);
    close.addEventListener('click',endCall);
    accept.addEventListener('click',joinMeeting);
    updateButton();
  }
  function unlockAudio() {
    if (!syncConsent()) return;
    try {
      var C=window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      if (!audio || audio.state === 'closed') audio=new C();
      if (audio.state !== 'running') audio.resume().catch(function(){});
    } catch (e) {}
  }
  // Browser audio requires a user gesture, even when alert preference is remembered.
  document.addEventListener('click',unlockAudio,{passive:true});
  document.addEventListener('pointerdown',unlockAudio,{passive:true});
  document.addEventListener('keydown',unlockAudio);
  function enableAlerts() {
    syncConsent();if(!settingsKey)return;
    enabled = true;
    try { localStorage.setItem(settingsKey,'yes'); } catch(e) {}
    unlockAudio();
  }
  function disableAlerts() {
    syncConsent();
    enabled = false;
    try { if(settingsKey)localStorage.setItem(settingsKey,'no'); } catch(e) {}
    stopRinging();
  }
  window.AfriFlowAlerts = { enable: enableAlerts, disable: disableAlerts,
    enabled: syncConsent, showMeeting: showMeeting };
  function updateButton() { /* Preference is managed in first-use consent. */ }
  function tone(type) {
    if (!syncConsent() || !audio) return;
    try {
      if (audio.state === 'suspended') return;
      var t=audio.currentTime;
      var call=type==='call';
      // A clear two-burst call pattern: audible without mimicking a telephone brand.
      var notes=call
        ? [[523.25,0],[659.25,.18],[523.25,.78],[659.25,.96]]
        : [[523.25,0],[659.25,.15],[783.99,.30]];
      notes.forEach(function(note) {
        var freq=note[0], offset=note[1], length=call?.38:.22;
        var osc=audio.createOscillator(),gain=audio.createGain();
        osc.type=call?'triangle':'sine';
        osc.frequency.setValueAtTime(freq,t+offset);
        gain.gain.setValueAtTime(0.0001,t+offset);
        gain.gain.exponentialRampToValueAtTime(call?.16:.07,t+offset+.035);
        gain.gain.exponentialRampToValueAtTime(.0001,t+offset+length);
        osc.connect(gain).connect(audio.destination);
        playing.push(osc);
        osc.onended=function(){playing=playing.filter(function(node){return node!==osc;});};
        osc.start(t+offset);
        osc.stop(t+offset+length+.02);
      });
      if(call && navigator.vibrate)navigator.vibrate([220,110,220,110,220]);
    } catch(e) {}
  }
  function notifyNative(title,body) {
    if(!window.AfriFlowNative || !window.AfriFlowNative.isBackground || !window.AfriFlowNative.isBackground()) return false;
    try {
      window.AfriFlowNative.notify({title:title,body:body});
      return true;
    }catch(e) { return false; }
  }
  function presentNativeMeeting(m) {
    if(!window.AfriFlowNative || !window.AfriFlowNative.isBackground || !window.AfriFlowNative.isBackground()) return false;
    if(typeof window.AfriFlowNative.presentIncomingMeeting!=='function') return false;
    if(Number(window.AfriFlowNative.meetingInvitationsVersion)<1){
      // An older desktop wrapper does not understand meeting identifiers.
      // Keep its existing generic notification useful until it is updated.
      if(!seen('native_meet_'+m.id+'_'+m.start))notifyNative('AfriFlow · Réunion à rejoindre',m.title||'Ouvrez AfriFlow pour rejoindre Teams.');
      return false;
    }
    try {
      window.AfriFlowNative.presentIncomingMeeting({meetingId:m.id,meetingTitle:m.title||'',start:+m.start,dur:+m.dur,
        end:+m.start+(+m.dur)*60000,stage:'start',expiresAt:Math.min(+m.start+(+m.dur)*60000,+m.start+120000)});
      return true;
    }catch(e) { return false; }
  }
  function notice(title,body,tag) {
    if (!syncConsent() || !account || account!==currentAccount()) return;
    if (Date.now()-lastToast>1800 && toast) {
      lastToast=Date.now();
      toast.textContent=title+' — '+body;
      toast.style.display='block';
      setTimeout(function(){if(toast)toast.style.display='none'},7500);
    }
    if(notifyNative(title,body))return;
    tone('notification');
    if ('Notification' in window && Notification.permission==='granted') {
      try {new Notification(title,{body:body,icon:'./logo.png',tag:tag||title});}catch(e){}
    }
  }
  function seen(key) {
    var k='afriflow_alert_seen_'+currentAccount()+'_'+key;
    try {if(localStorage.getItem(k))return true;localStorage.setItem(k,String(Date.now()));}catch(e){}
    return false;
  }
  function stopRinging(){
    clearInterval(ringTimer);clearTimeout(ringStopTimer);ringTimer=null;ringStopTimer=null;
    playing.forEach(function(node){try{node.stop();}catch(e){}});playing=[];
    try{if(navigator.vibrate)navigator.vibrate(0);}catch(e){}
  }
  function endCall(){
    var wasOpen=!!(ring&&!ring.hidden);
    if (ring) ring.hidden=true;
    activeMeeting=null;
    joining=false;
    stopRinging();clearTimeout(expiryTimer);expiryTimer=null;
    inertElements.forEach(function(item){item.node.inert=item.value;});inertElements=[];
    if(wasOpen){
      document.body.style.overflow=previousOverflow;
      if(previousFocus&&previousFocus.isConnected){try{previousFocus.focus({preventScroll:true});}catch(e){previousFocus.focus();}}
    }
    previousFocus=null;
  }
  function meetingSource(){return window.AfriFlowAndroid?'android':window.AfriFlowNative?'desktop':'alert';}
  function joinState(pending,message){
    joining=pending;
    document.getElementById('af-meet-accept').disabled=pending;
    document.getElementById('af-meet-join-label').textContent=pending?'Ouverture…':'Rejoindre Teams';
    var status=document.getElementById('af-meet-status');status.textContent=message||'';status.hidden=!message;
    ring.setAttribute('aria-busy',pending?'true':'false');
  }
  function joinMeeting(){
    var m=activeMeeting;if(!m||joining)return;
    if(m.owner!==currentAccount()||meetingNow(m)>=m.expiresAt){endCall();return;}
    stopRinging();
    if(!window.AfriMeetings||typeof window.AfriMeetings.join!=='function'){
      joinState(false,'La réunion est en cours de chargement. Réessayez dans un instant.');return;
    }
    joinState(true,'Ouverture de votre réunion…');
    function failed(error){
      if(activeMeeting!==m)return;
      joinState(false,String(error&&error.message||error||'Impossible de rejoindre la réunion. Réessayez.').slice(0,300));
    }
    try{
      // Invoke synchronously inside the click: the shared flow owns authentication,
      // first check-in, and opening Teams without popup blocking.
      var result=window.AfriMeetings.join(m.id,{source:m.source});
      Promise.resolve(result).then(function(value){
        if(activeMeeting!==m)return;
        if(value&&value.ok)endCall();else failed(value&&value.error);
      }).catch(failed);
    }catch(error){failed(error);}
  }
  function showMeeting(m,options) {
    options=options||{};
    syncConsent();
    var owner=currentAccount(),id=meetingId(m&&m.id),start=Number(m&&m.start),duration=Number(m&&m.dur);
    var serverNow=Number(m&&m.serverNow),verified=Number.isFinite(serverNow)&&serverNow>0;
    var end=start+duration*60000,now=verified?serverNow:Date.now();
    if(!owner||!id||!Number.isFinite(start)||!Number.isFinite(duration)||duration<=0||end<=now)return false;
    if(options.automatic&&(!enabled||!invited(m,owner)||document.hidden))return false;
    if(!ring)build();
    if(activeMeeting){
      if(activeMeeting.id===id&&activeMeeting.start===start&&(!verified||activeMeeting.verified))return true;
      if(options.automatic)return false;
      endCall();
    }
    var seenKey='meet_'+id+'_'+start;
    if(options.automatic){
      try{if(localStorage.getItem('afriflow_alert_seen_'+owner+'_'+seenKey))return false;}catch(e){}
    }
    var expires=options.automatic?Math.min(end,now+120000):end;
    if(Number(m.expiresAt)>0)expires=Math.min(expires,Number(m.expiresAt));
    if(expires<=now)return false;
    var source=['alert','desktop','android','push','home'].indexOf(options.source)>-1?options.source:meetingSource();
    var record={id:id,start:start,owner:owner,source:source,expiresAt:expires,clockEpoch:now,clockStart:monotonicNow(),verified:verified};activeMeeting=record;
    previousFocus=document.activeElement;previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    Array.from(document.body.children).forEach(function(node){
      if(node!==ring&&'inert' in node){inertElements.push({node:node,value:node.inert});node.inert=true;}
    });
    document.getElementById('af-meet-incoming').textContent=start>now?'Réunion à venir':'Réunion à rejoindre';
    document.getElementById('af-meet-title').textContent=String(m.title||'Réunion AfriFlow').slice(0,160);
    document.getElementById('af-meet-time').textContent=new Date(start).toLocaleString('fr-FR',{dateStyle:'long',timeStyle:'short'});
    document.getElementById('af-meet-duration').textContent='Durée prévue : '+duration+' min';
    document.getElementById('af-meet-info').textContent=start>now?'Votre réunion est programmée. Retrouvez ici son accès Teams.':'Votre réunion peut être rejointe dans Microsoft Teams.';
    joinState(false,'');
    ring.hidden=false;
    if(options.automatic)seen(seenKey);
    document.getElementById('af-meet-accept').focus({preventScroll:true});
    expiryTimer=setTimeout(function(){if(activeMeeting===record)endCall();},Math.min(expires-now,2147483647));
    if(options.automatic&&start<=now){
      tone('call');
      ringTimer=setInterval(function(){
        if(activeMeeting!==record||record.owner!==currentAccount()||meetingNow(record)>=record.expiresAt){endCall();return;}
        if(document.hidden){stopRinging();return;}
        tone('call');
      },2400);
      ringStopTimer=setTimeout(stopRinging,30000);
    }
    return true;
  }
  function callMeeting(m) {
    if(!syncConsent()||!meetingId(m.id)||!invited(m,currentAccount())||activeMeeting)return;
    var key='meet_'+m.id+'_'+m.start,k='afriflow_alert_seen_'+currentAccount()+'_'+key;
    try{if(localStorage.getItem(k))return;}catch(e){}
    if(presentNativeMeeting(m))seen(key);else showMeeting(m,{automatic:true});
  }
  if(window.AfriFlowNative && typeof window.AfriFlowNative.onIncomingMeeting==='function'){
    window.AfriFlowNative.onIncomingMeeting(function(details){
      var id=meetingId(details&&details.meetingId);if(!id)return;
      // A deliberate tap is resolved again by the server; a wrong device clock
      // must not discard the request before the authorized preview can load.
      window.dispatchEvent(new CustomEvent('afriflow:meeting-request',{detail:{meetingId:id,source:'desktop'}}));
    });
  }
  document.addEventListener('keydown',function(event){
    if(!activeMeeting||!ring||ring.hidden)return;
    if(event.key==='Escape'){event.preventDefault();endCall();return;}
    if(event.key!=='Tab')return;
    var buttons=Array.from(ring.querySelectorAll('button')).filter(function(button){return !button.disabled;});
    if(!buttons.length)return;
    var first=buttons[0],last=buttons[buttons.length-1],focused=document.activeElement;
    if(event.shiftKey&&(focused===first||!ring.contains(focused))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(focused===last||!ring.contains(focused))){event.preventDefault();first.focus();}
  },true);
  document.addEventListener('focusin',function(){
    if(activeMeeting&&ring&&!ring.hidden&&!ring.contains(document.activeElement))document.getElementById('af-meet-panel').focus({preventScroll:true});
  });
  function sessionChanged(){syncConsent();if(activeMeeting&&activeMeeting.owner!==currentAccount())endCall();}
  window.addEventListener('afriflow:verified-role',sessionChanged);
  window.addEventListener('afriflow:auth-ready',sessionChanged);
  window.addEventListener('pagehide',endCall);
  async function poll() {
    sessionChanged();
    var user=currentAccount();
    if (!user || !window.__sb) {
      account='';firstMessages=true;known.clear();firstMeetings=true;knownMeetings.clear();firstDecisions=true;knownDecisions.clear();endCall();updateButton();return;
    }
    if (busy) return;
    if (account!==user){account=user;known.clear();knownMeetings.clear();knownDecisions.clear();firstMessages=true;firstMeetings=true;firstDecisions=true;updateButton();}
    if (!navigator.onLine) return;
    busy=true;
    sb=window.__sb;
    try {
      var queries=await Promise.allSettled([
        sb.from(window.__TABLE||'afriflow_state').select('key,value').like('key','msg:'+account+':%').order('updated_at',{ascending:false}).limit(120),
        sb.from(window.__TABLE||'afriflow_state').select('value').like('key','meet:%').limit(300),
        sb.from(window.__TABLE||'afriflow_state').select('value').eq('key','pub:meetcfg').maybeSingle(),
        sb.from(window.__TABLE||'afriflow_state').select('value').eq('key','pub:deadlines').maybeSingle(),
        sb.from(window.__TABLE||'afriflow_state').select('key,value').like('key','att:jd-%:'+account).limit(200),
        sb.from(window.__TABLE||'afriflow_state').select('key,value').like('key','att:j-%:'+account).limit(200)
      ]);
      if(user!==currentAccount()||account!==user)return;
      syncConsent();
      var messages=queries[0].status==='fulfilled' && !queries[0].value.error ? (queries[0].value.data||[]) : null;
      if(messages){
        var unread=messages.filter(function(x){return x.value&&!x.value.read&&x.value.to===account});
        var current=new Set(unread.map(function(x){return x.key}));
        if(!firstMessages){
          var newones=unread.filter(function(x){return !known.has(x.key)});
          if(newones.length) notice('AfriFlow — Nouveau message',newones.length===1?(newones[0].value.subject||'Vous avez un nouveau message'):newones.length+' nouveaux messages','afri-messages');
        }
        known=current;firstMessages=false;
      }
      var meets=(queries[1].status==='fulfilled'&&!queries[1].value.error?(queries[1].value.data||[]):[])
        .filter(function(row){return row.value&&invited(row.value,user);});
      var conf=queries[2].status==='fulfilled'&&!queries[2].value.error?queries[2].value.data?.value||{}:{};
      var n=Date.now();
      var currentMeetings=new Set(meets.filter(function(row){return row.value&&row.value.id}).map(function(row){return row.value.id}));
      if (!firstMeetings) {
        meets.forEach(function(row){
          var m=row.value;
          if(m&&m.id&&!knownMeetings.has(m.id)&&+m.start>Date.now()) {
            notice('Réunion programmée',m.title+' · '+new Date(+m.start).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}),'afri-new-meeting-'+m.id);
          }
        });
      }
      knownMeetings=currentMeetings;
      firstMeetings=false;
      meets.forEach(function(row) {
        var m=row.value;
        if(!m || !Number.isFinite(+m.start)||!m.id)return;
        var delta=n-(+m.start);
        if(delta>=0&&delta<=120000) {
          if(/^https:\/\//i.test(m.link||conf.link||''))callMeeting(m);
        }
        else if(delta<0&&delta>=-900000 && enabled&&!seen('soon_'+m.id+'_'+m.start)) {
          notice('Réunion bientôt', (m.title||'Réunion')+' commence dans moins de 15 minutes.','af-meet-soon-'+m.id);
        }
      });
      // Alert only on decisions about the latest submitted version of a request.
      var decisionRows=queries[4].status==='fulfilled'&&!queries[4].value.error?(queries[4].value.data||[]):[];
      var justifications=queries[5].status==='fulfilled'&&!queries[5].value.error?(queries[5].value.data||[]):[];
      var submitted={};
      justifications.forEach(function(row){if(row.value&&row.value.mid)submitted[row.value.mid]=Number(row.value.at)||0;});
      var fresh=new Map();
      decisionRows.forEach(function(row){
        var d=row.value;if(!d||!d.mid||d.email!==account)return;
        var at=Number(d.at)||0;
        if(!submitted[d.mid]||at<submitted[d.mid])return;
        fresh.set(row.key,at);
        if(!firstDecisions && knownDecisions.get(row.key)!==at){
          notice(d.ok?'Justificatif accepté':'Justificatif refusé',
            d.ok?'Consultez Mes présences.':'Consultez le motif du refus dans Mes présences.',
            'afri-justification-'+d.mid);
        }
      });
      knownDecisions=fresh;firstDecisions=false;
      var deadlines=queries[3].status==='fulfilled'&&!queries[3].value.error?queries[3].value.data?.value?.items||[]:[];
      deadlines.forEach(function(it){
        if(!it||it.done||!it.due)return;
        var date=new Date(it.due+'T00:00:00');
        var days=Math.floor((date.getTime()-new Date().setHours(0,0,0,0))/86400000);
        var day=new Date().toISOString().slice(0,10);
        if(days>=0&&days<=1&&enabled&&!seen('deadline_'+it.id+'_'+day)) {
          notice('Rappel AfriFlow',it.title+(days===0?' : échéance aujourd’hui':' : échéance demain'),'afri-deadline-'+it.id);
        }
      });
    }catch(e){console.warn('AfriFlow notifications:',e.message)}
    finally {busy=false;}
  }
  function start(){
    build();
    window.dispatchEvent(new Event('afriflow:alerts-ready'));
    setInterval(poll,60000);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)poll()});
    window.addEventListener('online',poll);
    window.addEventListener('afriflow:refresh',poll);
    poll();
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',start);
  else start();
})();
