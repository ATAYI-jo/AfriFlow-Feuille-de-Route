
(function(){
"use strict";
var $=function(i){return document.getElementById(i)};
var KATEX_JS="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js",KATEX_CSS="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
function toast(m){(window.toast||alert)(m)}
function js(u){return new Promise(function(ok,ko){var s=document.createElement("script");s.src=u;s.onload=ok;s.onerror=function(){ko(new Error("Module indisponible"))};document.head.appendChild(s)})}
async function call(b){
  var r=await window.__sb.functions.invoke("admin-ai",{body:b});
  if(r.error){var m=r.error.message||"Erreur";try{var j=await r.error.context.json();if(j&&j.error)m=j.error}catch(e){}throw new Error(m)}
  if(r.data&&r.data.error)throw new Error(r.data.error);return r.data;
}
function b64(buf){var b=new Uint8Array(buf),s="",k=0x8000;for(var i=0;i<b.length;i+=k)s+=String.fromCharCode.apply(null,b.subarray(i,i+k));return btoa(s)}

/* ================= Visage : VOTRE PHOTO (avatar.jpg), animée ================= */
/* Repères en fraction de l'image : si un œil ou la bouche est décalé, ajustez ces 3 lignes. */
var AVU="avatar.jpg";
var AV={eyes:[[.411,.45],[.635,.45]],erx:.058,ery:.055,mouth:[.516,.64],mw:.07};
var HEAD=null,raf=0,px=0,py=0;
addEventListener("pointermove",function(e){px=(e.clientX/innerWidth)*2-1;py=(e.clientY/innerHeight)*2-1},{passive:true});
var COL={listen:"#4fa874",think:"#d98a1b",speak:"#4a90c2"},TXT={listen:"Je vous écoute",think:"Je réfléchis",speak:"Je parle"};
function buildHead(cv,getLevel,getState){
  var ctx=cv.getContext("2d"),img=new Image(),ok=false,skin=["#b4734d","#b4734d"],lv=0,blinkAt=0,nextBlink=1800,last="";
  img.onload=function(){
    ok=true;
    try{
      var o=document.createElement("canvas");o.width=img.naturalWidth;o.height=img.naturalHeight;
      var c=o.getContext("2d");c.drawImage(img,0,0);
      skin=AV.eyes.map(function(e){
        var d=c.getImageData(Math.round(e[0]*o.width)-3,Math.round((e[1]+.09)*o.height)-3,6,6).data,r=0,g=0,b=0,n=d.length/4;
        for(var i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2]}
        return "rgb("+Math.round(r/n)+","+Math.round(g/n)+","+Math.round(b/n)+")";
      });
    }catch(e){}
  };
  img.onerror=function(){toast("Image « "+AVU+" » introuvable : ajoutez-la dans GitHub, à côté de logo.png.")};
  img.src=AVU;

  function lid(x,y,k,col,iw,ih){
    var rx=AV.erx*iw,ry=AV.ery*ih,h=ry*2*k;
    ctx.save();ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.clip();
    ctx.fillStyle=col;ctx.fillRect(x-rx,y-ry,rx*2,h);
    ctx.strokeStyle="#2a1608";ctx.lineWidth=Math.max(1.5,ih*.008);ctx.lineCap="round";
    ctx.beginPath();ctx.moveTo(x-rx,y-ry+h);ctx.quadraticCurveTo(x,y-ry+h+ry*.3*k,x+rx,y-ry+h);ctx.stroke();
    ctx.restore();
  }
  function mouth(l,iw,ih){
    var rx=AV.mw*iw*(1-l*.1),ry=Math.max(1,l*ih*.04),cx=AV.mouth[0]*iw,cy=AV.mouth[1]*ih+ry;
    ctx.save();ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx.fillStyle="#3b0d10";ctx.fill();ctx.clip();
    ctx.fillStyle="#f6f1ea";ctx.fillRect(cx-rx,cy-ry,rx*2,ry*.5);
    ctx.fillStyle="#c4565a";ctx.beginPath();ctx.ellipse(cx,cy+ry*.85,rx*.62,ry*.55,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
    ctx.strokeStyle="rgba(160,75,75,.9)";ctx.lineWidth=Math.max(1,ih*.006);
    ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx.stroke();
  }
  function frame(ms){
    raf=requestAnimationFrame(frame);
    var w=cv.clientWidth,h=cv.clientHeight;if(!w||!h)return;
    var dpr=Math.min(devicePixelRatio||1,2),W=Math.round(w*dpr),H=Math.round(h*dpr);
    if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H}
    ctx.setTransform(dpr,0,0,dpr,0,0);
    var g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,"#0d5a49");g.addColorStop(1,"#1fd1a8");ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    var st=getState();
    if(st!==last){
      last=st;var lb=$("aiLbl"),sg=$("aiStage");
      if(lb){lb.lastChild.textContent=TXT[st]||"";lb.firstChild.style.background=COL[st]||COL.listen}
      if(sg)sg.style.boxShadow="inset 0 0 0 3px "+(COL[st]||COL.listen)+",inset 0 0 46px "+(COL[st]||COL.listen)+"66";
    }
    if(!ok)return;
    lv+=(getLevel()-lv)*.45;
    var iw=img.naturalWidth,ih=img.naturalHeight,s=Math.max(w/iw,h/ih)*(1.04+lv*.006);
    ctx.save();
    ctx.translate(w/2+px*6,h/2+py*4+Math.sin(ms/1200)*1.5);
    ctx.rotate((px*1.6+Math.sin(ms/1700)*.5)*Math.PI/180);
    ctx.scale(s,s);ctx.translate(-iw/2,-ih/2);
    ctx.drawImage(img,0,0);
    if(ms>nextBlink){blinkAt=ms;nextBlink=ms+2400+Math.random()*3200}
    var bt=ms-blinkAt,k=bt<190?Math.sin(bt/190*Math.PI):0;
    if(k>.03)AV.eyes.forEach(function(e,i){lid(e[0]*iw,e[1]*ih,k,skin[i],iw,ih)});
    if(lv>.05)mouth(Math.min(1,lv),iw,ih);
    ctx.restore();
  }
  frame(0);
  return {mic:0,dispose:function(){cancelAnimationFrame(raf)}};
}

/* ================= Conversation en direct (API Live) ================= */
var LV=null, fallbackVoiceMode=false;
function fallbackVoice(reason){
  // Le mode de secours préexistant utilise micro -> transcription -> chat -> lecture navigateur.
  if(fallbackVoiceMode)return;
  fallbackVoiceMode=true;stopLive();
  var s=document.getElementById("aiStat");
  if(s)s.textContent="Mode vocal de secours : conversation possible sans Gemini Live.";
  var b=document.getElementById("aiVoice");
  if(b)b.click(); // Les autres écouteurs vocaux déjà présents prennent le relais.
}
function stage(){
  if($("aiStage"))return;
  var s=document.createElement("div");s.id="aiStage";
  s.innerHTML='<canvas id="aiCv"></canvas><div id="aiLbl"><i></i><span>Connexion…</span></div><button type="button" id="aiHang" aria-label="Terminer la conversation"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>';
  $("aiBox").appendChild(s);
}
async function startLive(){
  if(LV)return;
  var box=$("aiBox");if(!box||box.style.display!=="flex"){var b=$("aiBtn");if(b)b.click()}
  box=$("aiBox");box.classList.add("ai-live");stage();
  var AC=window.AudioContext||window.webkitAudioContext,ctx=new AC();
  ctx.resume();                                   /* dans le geste de l'utilisateur (Safari/iPhone) */
  LV={ctx:ctx,ws:null,ready:false,srcs:[],next:0,mic:0,lastVoice:0,lastOut:0,an:null,stream:null,pr:null};
  var me=LV;
  try{
    me.an=ctx.createAnalyser();me.an.fftSize=512;me.an.connect(ctx.destination);
    var buf=new Uint8Array(me.an.fftSize);
    function speaking(){return me.next>ctx.currentTime+.02}
    function level(){if(!speaking())return 0;me.an.getByteTimeDomainData(buf);var s=0;for(var i=0;i<buf.length;i++){var v=(buf[i]-128)/128;s+=v*v}return Math.min(1,Math.sqrt(s/buf.length)*5)}
    function state(){if(!me.ready)return "think";if(speaking())return "speak";var n=Date.now();if(me.lastVoice>me.lastOut&&n-me.lastVoice>500&&n-me.lastVoice<5000)return "think";return "listen"}
    // L'avatar visuel est facultatif : un échec Canvas/WebGL ne doit jamais bloquer le micro ni Gemini Live.
    try { HEAD=buildHead($("aiCv"),level,state); }
    catch(avatarError) {
      HEAD=null;
      console.warn("Animation avatar indisponible, voix Live maintenue :",avatarError);
      var avCanvas=$("aiCv");if(avCanvas)avCanvas.style.display="none";
      var avLabel=$("aiLbl");if(avLabel)avLabel.lastChild.textContent="Connexion vocale…";
    }
    /* 1. le micro d'abord : la fenêtre d'autorisation peut durer, le jeton (valable 1 min) est demandé après */
    me.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
    if(LV!==me)return;
    var d=await call({op:"live_token",tz:new Date().getTimezoneOffset()});
    if(LV!==me)return;
    await ctx.resume();
    var ws=new WebSocket("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage."+(d.api||"v1beta")+".GenerativeService.BidiGenerateContentConstrained?access_token="+encodeURIComponent(d.token));
    me.ws=ws;
    ws.onopen=function(){ws.send(JSON.stringify({setup:{model:"models/"+d.model,
      generationConfig:{responseModalities:["AUDIO"],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:d.voice}}}},
      systemInstruction:{parts:[{text:d.system}]}}}))};
    ws.onmessage=async function(ev){
      var m;try{m=JSON.parse(typeof ev.data==="string"?ev.data:await ev.data.text())}catch(e){return}
      if(m.setupComplete){me.ready=true;return}
      var sc=m.serverContent;if(!sc)return;
      if(sc.interrupted){me.srcs.forEach(function(s){try{s.stop()}catch(e){}});me.srcs=[];me.next=0}
      var ps=(sc.modelTurn&&sc.modelTurn.parts)||[];
      ps.forEach(function(p){if(p.inlineData&&p.inlineData.data)play(p.inlineData.data)});
    };
    ws.onerror=function(){console.warn("WebSocket vocal : erreur (détail dans l'événement de fermeture)")};
    ws.onclose=function(ev){
      if(LV!==me||me.closing)return;
      console.warn("Gemini Live terminé :",ev.code,ev.reason||"");
      if(!me.ready){
        fallbackVoice("Connexion Live refusée");
      }else{
        toast("Conversation Live interrompue. Le mode vocal de secours est disponible.");
        fallbackVoice("Connexion Live perdue");
      }
    };
    function play(b){
      var bin=atob(b),n=bin.length>>1,bf=ctx.createBuffer(1,n,24000),ch=bf.getChannelData(0);
      for(var i=0;i<n;i++){var v=(bin.charCodeAt(2*i+1)<<8)|bin.charCodeAt(2*i);if(v>=32768)v-=65536;ch[i]=v/32768}
      var s=ctx.createBufferSource();s.buffer=bf;s.connect(me.an);
      var t=Math.max(ctx.currentTime+.03,me.next);s.start(t);me.next=t+bf.duration;me.lastOut=Date.now();me.srcs.push(s);
      s.onended=function(){me.srcs=me.srcs.filter(function(x){return x!==s})};
    }
    var src=ctx.createMediaStreamSource(me.stream),pr=ctx.createScriptProcessor(2048,1,1),z=ctx.createGain();z.gain.value=0;
    me.pr=pr;src.connect(pr);pr.connect(z);z.connect(ctx.destination);
    pr.onaudioprocess=function(e){
      var d0=e.inputBuffer.getChannelData(0),sum=0,i,j;
      for(i=0;i<d0.length;i++)sum+=d0[i]*d0[i];
      me.mic=Math.sqrt(sum/d0.length);if(HEAD)HEAD.mic=Math.min(1,me.mic*6);if(me.mic>.02)me.lastVoice=Date.now();
      if(!me.ready||ws.readyState!==1)return;
      var r=ctx.sampleRate/16000,n=Math.floor(d0.length/r),o=new Int16Array(n);
      for(i=0;i<n;i++){var a=0,s0=Math.floor(i*r),s1=Math.max(s0+1,Math.floor((i+1)*r));for(j=s0;j<s1&&j<d0.length;j++)a+=d0[j];a/=(s1-s0);a=Math.max(-1,Math.min(1,a));o[i]=a<0?a*32768:a*32767}
      ws.send(JSON.stringify({realtimeInput:{audio:{data:b64(o.buffer),mimeType:"audio/pcm;rate=16000"}}}));
    };
  }catch(e){
    if(e&&e.name==="NotAllowedError"){
      toast("Micro refusé : autorisez-le dans le navigateur.");stopLive();return;
    }
    console.warn("Connexion Gemini Live indisponible :",e&&e.message||e);
    fallbackVoice(e);
  }
}
function stopLive(){
  var me=LV;if(!me)return;me.closing=true;LV=null;
  try{me.ws&&me.ws.close()}catch(e){}
  try{me.pr&&me.pr.disconnect()}catch(e){}
  try{me.stream&&me.stream.getTracks().forEach(function(t){t.stop()})}catch(e){}
  me.srcs.forEach(function(s){try{s.stop()}catch(e){}});
  try{me.ctx.close()}catch(e){}
  if(HEAD){HEAD.dispose();HEAD=null}
  var b=$("aiBox");if(b)b.classList.remove("ai-live");
}
/* phase de capture sur window : passe avant l'ancien code vocal */
addEventListener("click",function(e){
  // En mode de secours, laisser le gestionnaire vocal classique traiter le clic.
  if(e.target.closest("#aiVoice")){if(fallbackVoiceMode)return;e.stopPropagation();e.preventDefault();LV?stopLive():startLive();return}
  if(e.target.closest("#aiHang")){stopLive();return}
  if(LV&&e.target.closest("#aiClose,#aiBtn"))stopLive();
},true);
addEventListener("keydown",function(e){if(e.key==="Escape"&&LV)stopLive()});

/* ================= Formules (KaTeX) + images / vidéos générées ================= */
var kp=null,RX=/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;
function loadKatex(){
  if(window.katex)return Promise.resolve();
  if(!kp){var l=document.createElement("link");l.rel="stylesheet";l.href=KATEX_CSS;document.head.appendChild(l);kp=js(KATEX_JS)}
  return kp;
}
function mathify(root){
  var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),L=[],n;
  while((n=w.nextNode())){if(n.parentNode.closest("pre,code,.katex"))continue;if(/\$\$|\\\[|\\\(/.test(n.nodeValue))L.push(n)}
  if(!L.length)return;
  loadKatex().then(function(){L.forEach(function(n){
    var s=n.nodeValue,f=document.createDocumentFragment(),last=0,m;RX.lastIndex=0;
    while((m=RX.exec(s))){
      if(m.index>last)f.appendChild(document.createTextNode(s.slice(last,m.index)));
      var sp=document.createElement(m[3]?"span":"div");
      try{sp.innerHTML=window.katex.renderToString((m[1]||m[2]||m[3]).trim(),{displayMode:!m[3],throwOnError:false})}catch(e){sp.textContent=m[0]}
      f.appendChild(sp);last=RX.lastIndex;
    }
    if(last<s.length)f.appendChild(document.createTextNode(s.slice(last)));
    n.parentNode.replaceChild(f,n);
  })}).catch(function(){});
}
var PEND=null;
(function(){
  var f=window.__sb&&window.__sb.functions;if(!f)return;
  var o=f.invoke.bind(f);
  f.invoke=function(n,opt){var p=o(n,opt);
    if(n==="admin-ai"&&opt&&opt.body&&opt.body.messages)p.then(function(r){var d=r&&r.data;if(d&&((d.images&&d.images.length)||(d.videos&&d.videos.length)))PEND={images:d.images||[],videos:d.videos||[]}}).catch(function(){});
    return p};
})();
function dl(name,url){return '<a href="'+url+'" download="'+name+'" style="display:inline-block;margin-top:4px;color:var(--green);font-weight:700">Télécharger</a>'}
function addMedia(node,P){
  P.images.forEach(function(im,i){
    var u="data:"+im.mime+";base64,"+im.data,d=document.createElement("div");
    d.innerHTML='<img src="'+u+'" alt="Image générée" style="max-width:100%;border-radius:12px;margin-top:8px;display:block">'+dl("image-afriflow-"+(i+1)+".png",u);
    node.appendChild(d);
  });
  P.videos.forEach(function(v){
    var d=document.createElement("div");d.style.marginTop="8px";d.textContent="Création de la vidéo en cours (1 à 3 minutes)…";node.appendChild(d);
    var t=setInterval(async function(){
      try{
        var r=await call({op:"video_status",name:v.op});
        if(r.done){
          clearInterval(t);
          var bin=atob(r.data),u8=new Uint8Array(bin.length);for(var i=0;i<u8.length;i++)u8[i]=bin.charCodeAt(i);
          var url=URL.createObjectURL(new Blob([u8],{type:"video/mp4"}));
          d.innerHTML='<video controls src="'+url+'" style="max-width:100%;border-radius:12px;display:block"></video>'+dl("video-afriflow.mp4",url);
        }
      }catch(e){clearInterval(t);d.textContent="Vidéo impossible : "+(e.message||e)}
    },8000);
  });
}
var log=$("aiLog");
if(log)new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){
  if(n.nodeType!==1||!n.children[1]||n.dataset.mx)return;
  var who=n.firstElementChild.textContent;if(!/^AfriFlow/.test(who))return;
  var t=n.children[1].textContent;if(/^je réfléchis/.test(t))return;
  n.dataset.mx="1";mathify(n.children[1]);
  if(PEND){var P=PEND;PEND=null;addMedia(n,P)}
})})}).observe(log,{childList:true});
})();
