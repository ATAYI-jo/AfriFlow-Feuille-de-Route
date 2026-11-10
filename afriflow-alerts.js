/* AfriFloW notifications: active sessions only.
   No push in a closed app, no surprise permission requests.
   Original short tones synthesized locally (no third-party audio). */
(function () {
  'use strict';
  var sb = null, account = '', firstMessages = true, known = new Set();
  var audio = null, ringTimer = null, activeMeeting = null, lastToast = 0, busy = false;
  var ring = null, toast = null, toggle = null;
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
    toggle = element('div',{id:'af-notice-control'},document.body);
    var b = element('button',{type:'button',text:'🔔 Activer les alertes AfriFloW'},toggle);
    b.addEventListener('click',async function() {
      enabled = true;
      try {localStorage.setItem(settingsKey,'yes')}catch(e){}
      try {
        var C = window.AudioContext || window.webkitAudioContext;
        if (C) {audio = audio || new C(); await audio.resume(); tone('notification');}
      } catch (e) {}
      if ('Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (e) {}
      }
      updateButton();
    });
    toast = element('div',{id:'af-alert-toast',role:'status','aria-live':'polite'},document.body);
    ring = element('div',{id:'af-meet-call',role:'dialog','aria-modal':'true','aria-labelledby':'af-meet-title',hidden:''},document.body);
    var panel=element('div',{id:'af-meet-panel'},ring);
    element('img',{src:'./logo.png',alt:'AfriFloW'},panel);
    element('h2',{id:'af-meet-title',text:'Réunion AfriFloW'},panel);
    element('p',{id:'af-meet-info'},panel);
    element('p',{id:'af-meet-time'},panel);
    var actions=element('div',{id:'af-meet-actions'},panel);
    var decline=element('button',{type:'button',id:'af-meet-reject',text:'✕ Rejeter'},actions);
    var accept=element('button',{type:'button',id:'af-meet-accept',text:'✓ Prendre'},actions);
    element('small',{text:'Sonnerie et alertes disponibles lorsque AfriFloW est ouvert.'},panel);
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
  function updateButton() {
    if (!toggle) return;
    toggle.style.display = account ? 'block' : 'none';
    var b=toggle.querySelector('button');
    if (b) b.textContent = enabled ? '🔔 Alertes AfriFloW activées' : '🔔 Activer les alertes AfriFloW';
  }
  function tone(type) {
    if (!enabled || !audio) return;
    try {
      if (audio.state === 'suspended') return;
      var t=audio.currentTime;
      // Original AfriFloW audio signature: ascending major-sixth with a soft fifth.
      var notes=type==='call' ? [392,587.33,493.88,659.25] : [523.25,659.25,783.99];
      notes.forEach(function(freq,i) {
        var osc=audio.createOscillator(),gain=audio.createGain();
        osc.type='sine';
        osc.frequency.setValueAtTime(freq,t+i*.15);
        gain.gain.setValueAtTime(0.0001,t+i*.15);
        gain.gain.exponentialRampToValueAtTime(type==='call'?.09:.055,t+i*.15+.025);
        gain.gain.exponentialRampToValueAtTime(.0001,t+i*.15+(type==='call'?.29:.19));
        osc.connect(gain).connect(audio.destination);
        osc.start(t+i*.15);
        osc.stop(t+i*.15+.33);
      });
    } catch(e) {}
  }
  function notice(title,body,tag) {
    if (!enabled || !account) return;
    if (Date.now()-lastToast>1800 && toast) {
      lastToast=Date.now();
      toast.textContent=title+' — '+body;
      toast.style.display='block';
      setTimeout(function(){if(toast)toast.style.display='none'},7500);
    }
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
  function callMeeting(m,url) {
    if (!enabled || !ring || !ring.hidden) return;
    if(seen('meet_'+m.id))return;
    activeMeeting={url:url};
    document.getElementById('af-meet-info').textContent=m.title||'Réunion en ligne';
    document.getElementById('af-meet-time').textContent=new Date(+m.start).toLocaleString('fr-FR',{dateStyle:'long',timeStyle:'short'});
    ring.hidden=false;
    document.getElementById('af-meet-accept').focus();
    tone('call');
    ringTimer=setInterval(function(){if(!ring.hidden)tone('call')},2800);
    setTimeout(function(){if(!ring.hidden)endCall()},120000);
    if('Notification' in window && Notification.permission==='granted'){
      try {new Notification('Réunion AfriFloW : '+(m.title||''),{body:'La réunion commence. Ouvrez AfriFloW pour répondre.',icon:'./logo.png',tag:'af-meeting-'+m.id})}catch(e){}
    }
  }
  async function poll() {
    if (busy) return;
    var user=String(window.loggedUserEmail||'').toLowerCase();
    if (!user || !window.__sb) {
      account='';firstMessages=true;known.clear();endCall();updateButton();return;
    }
    if (account!==user){account=user;known.clear();firstMessages=true;updateButton();}
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
    poll();
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',start);
  else start();
})();
