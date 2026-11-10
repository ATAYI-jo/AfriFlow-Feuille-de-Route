/* AfriFloW notifications: active sessions only.
   No push in a closed app, no surprise permission requests.
   Original short tones synthesized locally (no third-party audio). */
(function () {
  'use strict';
  var sb = null, account = '', firstMessages = true, known = new Set();
  var knownMeetings = new Set(), firstMeetings = true;
  var audio = null, ringTimer = null, activeMeeting = null, lastToast = 0, busy = false;
  var ring = null, toast = null;
  var settingsKey = 'afriflow_alerts_enabled_v1';
  var enabled = false;
  try { enabled = localStorage.getItem(settingsKey) === 'yes'; } catch (e) {}
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
  function build() {
    if (ring) return;
    // No floating alert toggle. Notification preference is collected during first use.
    toast = element('div',{id:'af-alert-toast',role:'status','aria-live':'polite'},document.body);
    ring = element('div',{id:'af-meet-call',role:'alertdialog','aria-modal':'true','aria-labelledby':'af-meet-title',hidden:''},document.body);
    var panel=element('div',{id:'af-meet-panel'},ring);
    element('div',{id:'af-meet-incoming',text:'Appel entrant'},panel);
    element('img',{src:'./logo.png',alt:'AfriFloW'},panel);
    element('h2',{id:'af-meet-title',text:'Appel Teams entrant'},panel);
    element('p',{id:'af-meet-source',text:'AfriFloW · via Teams'},panel);
    element('p',{id:'af-meet-info'},panel);
    element('p',{id:'af-meet-time'},panel);
    var actions=element('div',{id:'af-meet-actions'},panel);
    var decline=element('button',{type:'button',id:'af-meet-reject','aria-label':'Refuser l’appel Teams',text:'Refuser'},actions);
    var accept=element('button',{type:'button',id:'af-meet-accept','aria-label':'Répondre et ouvrir Teams',text:'Répondre'},actions);
    element('small',{text:'Répondre ouvre Teams. Sonnerie et alertes disponibles lorsque AfriFloW est actif.'},panel);
    decline.addEventListener('click',endCall);
    accept.addEventListener('click',function(){
      var m=activeMeeting;endCall();
      if (!m || !m.url) return;
      // Open directly from user click, never from a background timer.
      if (!/^https:\/\//i.test(m.url)) return;
      window.open(m.url,'_blank','noopener,noreferrer');
    });
    updateButton();
  }
  function unlockAudio() {
    if (!enabled || audio) return;
    try {
      var C=window.AudioContext || window.webkitAudioContext;
      if (C) {audio=new C();audio.resume().catch(function(){});}
    } catch (e) {}
  }
  // Browser audio requires a user gesture, even when alert preference is remembered.
  document.addEventListener('pointerdown',unlockAudio,{passive:true});
  document.addEventListener('keydown',unlockAudio);
  function enableAlerts() {
    enabled = true;
    try { localStorage.setItem(settingsKey,'yes'); } catch(e) {}
    unlockAudio();
  }
  function disableAlerts() {
    enabled = false;
    try { localStorage.setItem(settingsKey,'no'); } catch(e) {}
  }
  window.AfriFlowAlerts = { enable: enableAlerts, disable: disableAlerts,
    enabled: function(){return enabled} };
  function updateButton() { /* Preference is managed in first-use consent. */ }
  function tone(type) {
    if (!enabled || !audio) return;
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
        osc.start(t+offset);
        osc.stop(t+offset+length+.02);
      });
      if(call && navigator.vibrate)navigator.vibrate([220,110,220,110,220]);
    } catch(e) {}
  }
  function notifyNative(title,body,teamsUrl,meetingTitle) {
    if(!window.AfriFlowNative || !window.AfriFlowNative.isBackground || !window.AfriFlowNative.isBackground()) return false;
    try {
      window.AfriFlowNative.notify({title:title,body:body,teamsUrl:teamsUrl||'',meetingTitle:meetingTitle||''});
      return true;
    }catch(e) { return false; }
  }
  function presentNativeMeeting(meetingTitle,teamsUrl) {
    if(!window.AfriFlowNative || !window.AfriFlowNative.isBackground || !window.AfriFlowNative.isBackground()) return false;
    if(typeof window.AfriFlowNative.presentIncomingMeeting!=='function') return false;
    try {
      window.AfriFlowNative.presentIncomingMeeting({meetingTitle:meetingTitle||'',teamsUrl:teamsUrl||''});
      return true;
    }catch(e) { return false; }
  }
  function notice(title,body,tag) {
    if (!enabled || !account) return;
    if (Date.now()-lastToast>1800 && toast) {
      lastToast=Date.now();
      toast.textContent=title+' — '+body;
      toast.style.display='block';
      setTimeout(function(){if(toast)toast.style.display='none'},7500);
    }
    if(notifyNative(title,body,''))return;
    tone('notification');
    if ('Notification' in window && Notification.permission==='granted') {
      try {new Notification(title,{body:body,icon:'./logo.png',tag:tag||title});}catch(e){}
    }
  }
  function seen(key) {
    var k='afriflow_alert_seen_'+account+'_'+key;
    try {if(localStorage.getItem(k))return true;localStorage.setItem(k,String(Date.now()));}catch(e){}
    return false;
  }
  function endCall(){
    if (ring) ring.hidden=true;
    activeMeeting=null;
    clearInterval(ringTimer);
    ringTimer=null;
  }
  function showMeetingCall(m,url) {
    if (!ring || !ring.hidden || !/^https:\/\//i.test(url)) return;
    activeMeeting={url:url};
    document.getElementById('af-meet-info').textContent=m.title||'Réunion en ligne';
    document.getElementById('af-meet-time').textContent=m.start
      ? new Date(+m.start).toLocaleString('fr-FR',{dateStyle:'long',timeStyle:'short'})
      : 'Prête à rejoindre maintenant';
    ring.hidden=false;
    document.getElementById('af-meet-accept').focus();
    tone('call');
    ringTimer=setInterval(function(){if(!ring.hidden)tone('call')},2400);
    setTimeout(function(){if(!ring.hidden)endCall()},120000);
    if('Notification' in window && Notification.permission==='granted'){
      try {new Notification('Appel Teams entrant',{body:(m.title||'Réunion AfriFloW')+' · Ouvrez AfriFloW pour répondre.',icon:'./logo.png',tag:'af-meeting-'+(m.id||'now')})}catch(e){}
    }
  }
  function callMeeting(m,url) {
    if (!enabled || !ring || !ring.hidden) return;
    if(seen('meet_'+m.id))return;
    if(presentNativeMeeting(m.title||'',url))return;
    showMeetingCall(m,url);
  }
  if(window.AfriFlowNative && typeof window.AfriFlowNative.onIncomingMeeting==='function'){
    window.AfriFlowNative.onIncomingMeeting(function(details){
      if(!details || !/^https:\/\//i.test(String(details.teamsUrl||'')))return;
      showMeetingCall({title:String(details.title||'Réunion AfriFloW'),id:'windows-'+Date.now()},String(details.teamsUrl));
    });
  }
  async function poll() {
    if (busy) return;
    var user=String(window.loggedUserEmail||'').toLowerCase();
    if (!user || !window.__sb) {
      account='';firstMessages=true;known.clear();firstMeetings=true;knownMeetings.clear();endCall();updateButton();return;
    }
    if (account!==user){account=user;known.clear();knownMeetings.clear();firstMessages=true;firstMeetings=true;updateButton();}
    if (!navigator.onLine) return;
    busy=true;
    sb=window.__sb;
    try {
      var queries=await Promise.allSettled([
        sb.from(window.__TABLE||'afriflow_state').select('key,value').like('key','msg:'+account+':%').order('updated_at',{ascending:false}).limit(120),
        sb.from(window.__TABLE||'afriflow_state').select('value').like('key','meet:%').limit(300),
        sb.from(window.__TABLE||'afriflow_state').select('value').eq('key','pub:meetcfg').maybeSingle(),
        sb.from(window.__TABLE||'afriflow_state').select('value').eq('key','pub:deadlines').maybeSingle()
      ]);
      var messages=queries[0].status==='fulfilled' && !queries[0].value.error ? (queries[0].value.data||[]) : null;
      if(messages){
        var unread=messages.filter(function(x){return x.value&&!x.value.read&&x.value.to===account});
        var current=new Set(unread.map(function(x){return x.key}));
        if(!firstMessages){
          var newones=unread.filter(function(x){return !known.has(x.key)});
          if(newones.length) notice('AfriFloW — Nouveau message',newones.length===1?(newones[0].value.subject||'Vous avez un nouveau message'):newones.length+' nouveaux messages','afri-messages');
        }
        known=current;firstMessages=false;
      }
      var meets=queries[1].status==='fulfilled'&&!queries[1].value.error?(queries[1].value.data||[]):[];
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
          var link=m.link||conf.link||'';
          if(/^https:\/\//i.test(link)) callMeeting(m,link);
        }
        else if(delta<0&&delta>=-900000 && enabled&&!seen('soon_'+m.id)) {
          notice('Réunion bientôt', (m.title||'Réunion')+' commence dans moins de 15 minutes.','af-meet-soon-'+m.id);
        }
      });
      var deadlines=queries[3].status==='fulfilled'&&!queries[3].value.error?queries[3].value.data?.value?.items||[]:[];
      deadlines.forEach(function(it){
        if(!it||it.done||!it.due)return;
        var date=new Date(it.due+'T00:00:00');
        var days=Math.floor((date.getTime()-new Date().setHours(0,0,0,0))/86400000);
        var day=new Date().toISOString().slice(0,10);
        if(days>=0&&days<=1&&enabled&&!seen('deadline_'+it.id+'_'+day)) {
          notice('Rappel AfriFloW',it.title+(days===0?' : échéance aujourd’hui':' : échéance demain'),'afri-deadline-'+it.id);
        }
      });
    }catch(e){console.warn('AfriFloW notifications:',e.message)}
    finally {busy=false;}
  }
  function start(){
    build();
    setInterval(poll,30000);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)poll()});
    window.addEventListener('online',poll);
    window.addEventListener('afriflow:refresh',poll);
    poll();
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',start);
  else start();
})();
