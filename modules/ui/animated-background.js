
(function(){
"use strict";
var LS="afriflow_animbg_v1", W=0, H=0, raf=0, lastKey="", builtW=-1;
function $(i){return document.getElementById(i)}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function mix(a,b,t){return a+(b-a)*t}
var KF=[{p:0,t:[90,169,230],b:[207,233,255],n:0},{p:.35,t:[70,150,225],b:[200,230,250],n:0},{p:.55,t:[245,138,91],b:[251,211,141],n:.3},{p:.75,t:[11,16,48],b:[42,47,90],n:1},{p:1,t:[90,110,190],b:[255,190,150],n:.35}];
function world(p){
  var i=0;while(i<KF.length-2&&p>KF[i+1].p)i++;
  var a=KF[i],b=KF[i+1],t=clamp((p-a.p)/(b.p-a.p),0,1);
  function c(k){return "rgb("+[0,1,2].map(function(j){return Math.round(mix(a[k][j],b[k][j],t))}).join(",")+")"}
  return {t:c("t"),b:c("b"),n:mix(a.n,b.n,t)};
}

/* ----- Structure ----- */
var off=false;try{off=localStorage.getItem(LS)==="0"}catch(e){}
document.body.classList.toggle("af-off",off);
var root=document.createElement("div");root.id="afBg";root.setAttribute("aria-hidden","true");
root.innerHTML='<div class="af-sky"></div><div class="af-stars"></div><div class="af-sun" id="afSun"></div><div class="af-moon" id="afMoon"></div>'
 +'<div class="af-cloud" style="top:6%;--d:95s;--dl:-12s"></div><div class="af-cloud" style="top:14%;--d:120s;--dl:-60s"></div><div class="af-cloud" style="top:22%;--d:80s;--dl:-35s"></div>'
 +'<svg class="af-mts" id="afMts" viewBox="0 0 1920 110" preserveAspectRatio="none"></svg><div class="af-ground"></div><div id="afScene"></div>';
document.body.insertBefore(root,document.body.firstChild);

/* collines au loin */
(function(){
  var s=5,h="";
  [[.55,"#9bb0c4",14,46],[1,"#6f8799",26,64]].forEach(function(L){
    var pts="0,110";
    for(var x=0;x<=1920;x+=60){s=(s*9301+49297)%233280;pts+=" "+x+","+(110-(L[2]+(s/233280)*(L[3]-L[2])))}
    h+='<polygon points="'+pts+' 1920,110" style="fill:color-mix(in srgb,'+L[1]+',#0a1030 calc(var(--n)*65%))" opacity="'+L[0]+'"/>';
  });
  $("afMts").innerHTML=h;
})();

/* ----- Paysage (4 biomes qui se fondent) ----- */
function build(){
  W=window.innerWidth;H=window.innerHeight;builtW=W;
  var gy=H*.34,gh=H-gy,seed=9,half=Math.min(460,W*.46),m0=W/2-half,m1=W/2+half;
  function r(){seed=(seed*9301+49297)%233280;return seed/233280}
  function pick(a){return a[Math.floor(r()*a.length)]}
  function dl(){return "--dl:-"+(r()*5).toFixed(1)+"s"}
  function O(x,y,w,h,vb,inner,mid){return '<div class="af-ob'+(mid?' af-mid':'')+'" style="left:'+x.toFixed(0)+'px;top:'+y.toFixed(0)+'px;z-index:'+Math.round(y)+'"><i class="af-sh" style="width:'+(w*.8).toFixed(0)+'px"></i><svg width="'+w.toFixed(0)+'" height="'+h.toFixed(0)+'" viewBox="'+vb+'">'+inner+'</svg></div>'}
  var G=function(c){return pick(c)};
  function tree(x,y,k,m){return O(x,y,56*k,72*k,"0 0 56 72",'<rect x="25" y="44" width="6" height="28" fill="#6b4a2b"/><g class="af-sw" style="'+dl()+'"><circle cx="28" cy="26" r="20" fill="#3f9a3f"/><circle cx="16" cy="36" r="14" fill="#4aa84a"/><circle cx="40" cy="36" r="14" fill="#378a39"/><circle cx="22" cy="18" r="9" fill="#9be06a" opacity=".35"/></g>',m)}
  function acacia(x,y,k,m){return O(x,y,80*k,62*k,"0 0 80 62",'<path d="M38 62Q40 44 36 30M40 46Q54 38 62 28M37 34Q24 30 16 24" stroke="#5a3d24" stroke-width="3" fill="none" stroke-linecap="round"/><g class="af-sw" style="'+dl()+'"><ellipse cx="40" cy="22" rx="36" ry="9" fill="#4f9a3a"/><ellipse cx="22" cy="27" rx="18" ry="6" fill="#3f8a35"/><ellipse cx="60" cy="28" rx="17" ry="6" fill="#68b94d"/></g>',m)}
  function palm(x,y,k,m){var f="";[[2,24],[7,10],[20,2],[33,10],[38,24],[12,27],[28,27]].forEach(function(e){f+='<path d="M20 14Q'+((20+e[0])/2)+' '+(Math.min(14,e[1])-8)+' '+e[0]+' '+e[1]+'" stroke="#3f9b3a" stroke-width="3.4" fill="none" stroke-linecap="round"/>'});return O(x,y,40*k,64*k,"0 0 40 64",'<path d="M19 64Q25 40 20 14" stroke="#8a6a44" stroke-width="3.4" fill="none" stroke-linecap="round"/><g class="af-sw" style="'+dl()+'">'+f+'</g>',m)}
  function bush(x,y,k,m){return O(x,y,50*k,28*k,"0 0 50 28",'<g class="af-sw" style="'+dl()+'"><ellipse cx="14" cy="18" rx="14" ry="9" fill="#3f8a35"/><ellipse cx="35" cy="18" rx="15" ry="10" fill="#4f9a3a"/><ellipse cx="24" cy="12" rx="13" ry="10" fill="#68b94d"/></g>',m)}
  function hut(x,y,k,m){return O(x,y,50*k,45*k,"0 0 50 45",'<rect x="8" y="22" width="34" height="23" rx="3" fill="#c98f5a"/><rect x="25" y="22" width="17" height="23" rx="3" fill="#000" opacity=".14"/><rect x="21" y="31" width="8" height="14" rx="3" fill="#4a3220"/><path d="M1 25Q25 -6 49 25Q25 20 1 25Z" fill="#d6b04a"/>',m)}
  function house(x,y,k,m){var wc=G(["#ecd9b3","#dba56f","#cf8470","#f2e8d4"]),rc=G(["#a8452f","#7a4a2b","#8f3d2b"]);return O(x,y,60*k,50*k,"0 0 60 50",'<rect x="8" y="22" width="44" height="28" fill="'+wc+'"/><rect x="30" y="22" width="22" height="28" fill="#000" opacity=".12"/><polygon points="4,24 30,4 56,24" fill="'+rc+'"/><rect x="26" y="36" width="8" height="14" fill="#5a3a22"/><rect x="13" y="30" width="8" height="8" fill="#9fc3d8"/><rect x="39" y="30" width="8" height="8" fill="#9fc3d8"/><rect x="13" y="30" width="8" height="8" style="fill:#ffd66e;opacity:var(--n)"/><rect x="39" y="30" width="8" height="8" style="fill:#ffd66e;opacity:var(--n)"/>',m)}
  function pine(x,y,k,m){var c=G(["#2f6b43","#27583a","#3a7d4c"]);return O(x,y,40*k,62*k,"0 0 40 62",'<rect x="18" y="50" width="4" height="12" fill="#6b4a2b"/><g class="af-sw" style="'+dl()+'"><polygon points="20,2 33,22 7,22" fill="'+c+'"/><polygon points="20,14 36,38 4,38" fill="'+c+'"/><polygon points="20,26 40,54 0,54" fill="'+c+'"/><polygon points="20,2 20,22 7,22" fill="#000" opacity=".14"/><polygon points="20,14 20,38 4,38" fill="#000" opacity=".14"/><polygon points="20,26 20,54 0,54" fill="#000" opacity=".14"/></g>',m)}
  function mount(x,y,k,m){return O(x,y,100*k,60*k,"0 0 100 60",'<polygon points="0,60 35,8 52,30 68,12 100,60" fill="#6f7f8a"/><polygon points="35,8 52,30 68,12 100,60 60,60" fill="#000" opacity=".12"/><polygon points="35,8 29,20 35,16 41,22" fill="#fff"/><polygon points="68,12 62,24 68,20 74,26" fill="#fff"/>',m)}
  function building(x,y,k,m){var w=Math.round((38+r()*34)*k),h=Math.round((90+r()*90)*k),i='<rect width="'+w+'" height="'+h+'" fill="#aab4bd"/><rect width="'+w+'" height="'+(4*k)+'" fill="#5d6770"/>',yy,xx,s=Math.max(5,Math.round(7*k)),gx=Math.max(9,Math.round(13*k)),gy2=Math.max(11,Math.round(16*k));
    for(yy=Math.round(10*k);yy<h-gy2*1.4;yy+=gy2)for(xx=Math.round(7*k);xx<w-s-3;xx+=gx){i+='<rect x="'+xx+'" y="'+yy+'" width="'+s+'" height="'+Math.round(s*1.3)+'" fill="#9fc3d8"/>';if(r()<.55)i+='<rect x="'+xx+'" y="'+yy+'" width="'+s+'" height="'+Math.round(s*1.3)+'" style="fill:#ffd66e;opacity:var(--n)"/>'}
    return O(x,y,w,h,"0 0 "+w+" "+h,i,m)}
  function lamp(x,y,k,m){return O(x,y,14*k,40*k,"0 0 14 40",'<rect x="6" y="8" width="2" height="32" fill="#444"/><circle cx="7" cy="7" r="3" fill="#ffe9a8"/><circle cx="7" cy="7" r="9" style="fill:#ffd66e;opacity:calc(var(--n)*.5)"/>',m)}

  var n=window.innerWidth<=700?10:Math.round(clamp(W/30,18,64)),bio=["","","",""];
  for(var b=0;b<4;b++){
    for(var i=0;i<n;i++){
      var x=r()*W,t=Math.pow(r(),.85),y=gy+gh*(.06+.92*t),k=mix(.34,1.15,t),mid=x>m0&&x<m1,q=r(),s;
      if(b===0){s=q<.4?tree(x,y,k,mid):q<.58?acacia(x,y,k*1.1,mid):q<.72?palm(x,y,k,mid):q<.84?hut(x,y,k,mid):bush(x,y,k,mid)}
      else if(b===1){s=q<.4?house(x,y,k,mid):q<.68?tree(x,y,k,mid):q<.76?palm(x,y,k,mid):q<.86?hut(x,y,k,mid):bush(x,y,k,mid)}
      else if(b===2){s=q<.6?pine(x,y,k,mid):(q<.68&&t<.3&&!mid)?mount(x,y,k*3,mid):q<.78?house(x,y,k,mid):q<.9?bush(x,y,k,mid):tree(x,y,k,mid)}
      else{s=q<.5?building(x,y,k,mid):q<.68?lamp(x,y,k,mid):q<.82?house(x,y,k,mid):tree(x,y,k,mid)}
      bio[b]+=s;
    }
  }
  $("afScene").innerHTML=bio.map(function(h){return '<div class="af-bio">'+h+'</div>'}).join("");
  lastKey="";
}

/* ----- Mise à jour au défilement ----- */
var CEN=[.05,.42,.68,.95];
function frame(){
  raf=0;
  if(document.body.classList.contains("af-off"))return;
  var hv=$("view-home"),rc=$("roadContainer"),home=!!(hv&&hv.style.display!=="none"),p;
  if(home&&rc){var rect=rc.getBoundingClientRect();p=clamp((window.innerHeight*.45-rect.top)/Math.max(1,rc.offsetHeight),0,1)}
  else{var mx=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);p=clamp(window.scrollY/mx,0,1)*.55}
  var w=world(p),key=w.t+w.b+w.n.toFixed(2)+(home?"h":"o")+Math.round(p*100);
  if(key===lastKey)return;lastKey=key;
  var s=root.style;s.setProperty("--aT",w.t);s.setProperty("--aB",w.b);s.setProperty("--n",w.n.toFixed(3));
  root.dataset.home=home?"1":"0";
  var sx=(.06+.88*p)*W-23,sy=(.03+(1-Math.sin(Math.PI*p))*.2)*H;
  $("afSun").style.transform="translate("+sx.toFixed(0)+"px,"+sy.toFixed(0)+"px)";$("afSun").style.opacity=clamp(1-w.n*2.2,0,1);
  $("afMoon").style.transform="translate("+((.12+.76*p)*W-23).toFixed(0)+"px,"+(.05*H).toFixed(0)+"px)";$("afMoon").style.opacity=clamp(w.n*1.4-.2,0,1);
  $("afMts").style.transform="translateX("+(-p*45)+"%)";
  var L=$("afScene").children;
  for(var i=0;i<L.length;i++)L[i].style.opacity=clamp(1-Math.abs(p-CEN[i])/.3,0,1).toFixed(2);
}
function sched(){if(document.hidden)return;if(!raf)raf=requestAnimationFrame(frame)}
window.addEventListener("scroll",sched,{passive:true});
var rt;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(function(){if(window.innerWidth!==builtW){if(!document.body.classList.contains("af-off"))build()}else{H=window.innerHeight}lastKey="";sched()},180)});
/* changement de page (accueil ↔ autres vues) */
["view-home","viewHost"].forEach(function(id){var e=$(id);if(e)new MutationObserver(function(){lastKey="";sched()}).observe(e,{attributes:true,attributeFilter:["style"]})});
// Éviter les recalculs périodiques inutiles sur mobile et onglets masqués.
setInterval(function(){if(!document.hidden && window.innerWidth>700){lastKey="";sched()}},12000);

/* ----- Réglage dans « Personnaliser » ----- */
var cb=$("closeCustomBtn");
if(cb&&cb.parentNode){
  var bx=document.createElement("div");bx.className="fm";
  bx.innerHTML='<label style="display:flex;flex-direction:row;gap:10px;align-items:center;color:var(--ink);font-size:.95rem"><input type="checkbox" id="afAnim" style="width:auto"> Fond animé plein écran</label><small style="color:var(--muted)">Ciel jour et nuit, paysage qui évolue. Désactivez-le pour un fond sobre.</small>';
  cb.parentNode.before(bx);
  var ck=$("afAnim");ck.checked=!off;
  ck.onchange=function(){
    var on=ck.checked;try{localStorage.setItem(LS,on?"1":"0")}catch(e){}
    document.body.classList.toggle("af-off",!on);
    if(on){build()}lastKey="";sched();
  };
}

if(!off)build();
document.addEventListener("visibilitychange",function(){if(!document.hidden)sched()});
sched();
})();
