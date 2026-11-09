// AfriFloW 3D mascot — procedural 3D model with browser-driven animations.
// Copyright (c) AfriFloW. All assets from the user remain their property.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';
const viewport = document.getElementById('avatarViewport');
const status = document.getElementById('sceneStatus');
const feedback = document.getElementById('feedback');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
camera.position.set(0,.27,8.7);camera.lookAt(0,-.05,0);
const renderer = new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.38;
viewport.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xf8fffc,0x977664,2.7));
function light(color,intensity,x,y,z){const l=new THREE.DirectionalLight(color,intensity);l.position.set(x,y,z);scene.add(l)}
light(0xffe1c9,3.25,-3,5,6);light(0xc1eadd,1.65,4,2,3);light(0xffcf8b,1.8,2,4,-4);
const material=(color,roughness=.76,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const m={skin:material(0xaf6846,.83),skin2:material(0xc17b55,.83),shadow:material(0x8c4936,.81),pink:material(0xc47b73,.83),hair:material(0x211612,.86),hairLight:material(0x38221a,.85),hairDark:material(0x180e0d,.91),white:material(0xf7f6f3,.77),shirtShade:material(0xe7e7e4,.8),green:material(0x06563d,.7),gold:material(0xd7a446,.31,.69),ivory:material(0xfffcf1,.27),iris:material(0x8e4c21,.32),iris2:material(0x482519,.3),pupil:material(0x130c0a,.12),mouth:material(0x451b1b,.85),lip:material(0xa24e48,.68)};
const subject=new THREE.Group();scene.add(subject);
const torso=new THREE.Group();torso.position.y=-.16;subject.add(torso);
function ell(parent,mat,pos,scale,segments=32){const obj=new THREE.Mesh(new THREE.SphereGeometry(1,segments,Math.max(16,Math.round(segments*.75))),mat);obj.position.set(...pos);obj.scale.set(...scale);parent.add(obj);return obj}
function tube(parent,points,r,mat,segments=70,sides=8){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const obj=new THREE.Mesh(new THREE.TubeGeometry(curve,segments,r,sides,false),mat);parent.add(obj);return obj}
function part(parent,a,b,r1,r2,mat){const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),dv=q.clone().sub(p);const obj=new THREE.Mesh(new THREE.CylinderGeometry(r2,r1,dv.length(),20,1),mat);obj.position.copy(p.clone().add(q).multiplyScalar(.5));obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dv.normalize());parent.add(obj);ell(parent,mat,a,[r1,r1,r1],20);ell(parent,mat,b,[r2,r2,r2],20);return obj}
// Torso: polo shirt, placket, collar, sleeves, arms.
ell(torso,m.white,[0,-1.23,-.1],[1.05,1.24,.57],48);
ell(torso,m.skin,[0,-.13,.04],[.31,.56,.30],32);
const collarL=ell(torso,m.white,[-.23,-.51,.43],[.38,.13,.19]);collarL.rotation.z=-.31;
const collarR=ell(torso,m.white,[.23,-.51,.43],[.38,.13,.19]);collarR.rotation.z=.31;
ell(torso,m.shirtShade,[0,-.89,.48],[.115,.30,.035]);
for (let y of [-.72,-.93,-1.14])ell(torso,m.ivory,[0,y,.519],[.027,.027,.017],20);
const shoulderL=new THREE.Group(),shoulderR=new THREE.Group();shoulderL.position.set(-.85,-.74,.04);shoulderR.position.set(.85,-.74,.04);torso.add(shoulderL,shoulderR);
const sleeveL=ell(shoulderL,m.white,[-.14,-.22,0],[.4,.45,.45]);sleeveL.rotation.z=-.38;
const sleeveR=ell(shoulderR,m.white,[.14,-.22,0],[.4,.45,.45]);sleeveR.rotation.z=.38;
part(shoulderL,[-.3,-.4,0],[-.61,-.93,.37],.18,.15,m.skin2);
part(shoulderR,[.3,-.4,0],[.63,-1.04,.36],.18,.14,m.skin2);
ell(shoulderL,m.skin2,[-.65,-.94,.41],[.24,.12,.2]);ell(shoulderR,m.skin2,[.67,-1.06,.42],[.24,.12,.20]);
// watch on right wrist
const watch=new THREE.Mesh(new THREE.TorusGeometry(.15,.045,10,30),m.hairDark);watch.position.set(.51,-.83,.39);watch.rotation.set(.2,.1,-.48);shoulderR.add(watch);
ell(shoulderR,m.gold,[.53,-.82,.55],[.095,.105,.035]);
ell(shoulderR,m.hairDark,[.53,-.82,.582],[.07,.075,.01]);
// Face is independently articulated.
const headPivot=new THREE.Group();headPivot.position.set(0,.24,.04);torso.add(headPivot);
const head=new THREE.Group();head.position.y=.72;headPivot.add(head);
ell(head,m.skin2,[0,0,0],[.91,1.12,.70],64);
ell(head,m.skin2,[-.9,-.08,.0],[.145,.23,.17]);ell(head,m.skin2,[.9,-.08,0],[.145,.23,.17]);
// Nose, soft cheek blush, subtle facial freckles.
ell(head,m.skin2,[0,-.12,.69],[.155,.15,.135]);
for(const x of [-.50,.50])ell(head,m.pink,[x,-.29,.53],[.25,.15,.065]);
for(let i=0;i<48;i++){
 const side=i<24?-1:1,idx=i%24,x=side*(.16+(idx%6)*.078),y=-.14-Math.floor(idx/6)*.060;
 ell(head,m.shadow,[x,y,.682-Math.abs(x)*.2],[.009,.009,.008],8);
}
// Each eye group can blink independently.
const eyes=[];
for(const side of [-1,1]){
 const eye=new THREE.Group();eye.position.set(side*.375,.185,.603);head.add(eye);
 ell(eye,m.shadow,[0,0,-.025],[.292,.228,.145]);
 ell(eye,m.ivory,[0,0,.007],[.273,.208,.138]);
 ell(eye,m.iris,[side*.012,-.015,.132],[.137,.153,.045]);
 ell(eye,m.iris2,[side*.012,-.017,.160],[.104,.122,.031]);
 ell(eye,m.pupil,[side*.012,-.018,.183],[.078,.092,.018]);
 ell(eye,m.ivory,[-.037,.050,.204],[.037,.045,.011],16);
 tube(eye,[[-.25,.11,.042],[-.13,.22,.075],[0,.235,.09],[.16,.183,.075],[.26,.10,.03]],.033,m.hairDark,26,7);
 for(let j=0;j<5;j++){
  const lx=-.20+j*.10;
  tube(eye,[[lx,.19,.071],[lx-(j-2)*.018,.25,.069],[lx-(j-2)*.026,.3,.036]],.013,m.hairDark,8,5);
 }
 eyes.push(eye);
 const eyebrow=ell(head,m.hairDark,[side*.39,.53,.63],[.27,.073,.065]);eyebrow.rotation.z=side*-.08;
}
// Lips, teeth, mouth cavity. All geometry is real 3D and morphs as speech progresses.
const mouthRoot=new THREE.Group();mouthRoot.position.set(0,-.51,.622);head.add(mouthRoot);
const cavity=ell(mouthRoot,m.mouth,[0,-.008,0],[.27,.06,.040]);
const upperLip=ell(mouthRoot,m.lip,[0,.066,.028],[.30,.050,.055]);
const lowerLip=ell(mouthRoot,m.lip,[0,-.073,.028],[.28,.057,.05]);
const teeth=ell(mouthRoot,m.ivory,[0,.011,.05],[.221,.028,.023]);
// Hair with overlapping masses, then multiple 3D curling strands.
ell(head,m.hairDark,[0,.51,-.20],[1.055,.94,.77],42);
for(let side of [-1,1]){
 for(let row=0;row<5;row++)for(let col=0;col<4;col++){
  const x=side*(.79+.125*col),y=.63-row*.36+Math.sin(col*1.7+row)*.09,z=-.18+col*.11;
  ell(head,(row+col)%3===0?m.hairLight:m.hair,[x,y,z],[.28,.32,.25],24);
 }
}
for(let col=0;col<9;col++){
 const x=-.92+col*.23;
 const fringe=ell(head,col%3===0?m.hairLight:m.hair,[x,.84+Math.sin(col*.8)*.10,.38],[.24,.31,.22],24);
 fringe.rotation.z=-.42+x*.18;
}
for(let i=0;i<84;i++){
 const side=i%2?1:-1,idx=Math.floor(i/2),band=idx%7,row=Math.floor(idx/7),x=side*(.86+band*.066),y=.73-row*.27,z=.28-band*.08;
 const points=[];
 for(let j=0;j<10;j++){
  const t=j/9*Math.PI*2.2;
  points.push([x+side*Math.sin(t)*.075,y-j*.034,z+Math.cos(t)*.066]);
 }
 tube(head,points,.024+(idx%3)*.004,idx%5===0?m.hairLight:m.hair,22,5);
}
// Gold earrings, accurate styling from source portrait.
for(const side of [-1,1]){
 const e=new THREE.Mesh(new THREE.TorusGeometry(.12,.033,12,36),m.gold);
 e.position.set(side*.967,-.34,.10);e.rotation.y=side*.25;head.add(e);
}
// Use the actual logo PNG (not an approximation or generated lettering) on the polo.
const tex=await new THREE.TextureLoader().loadAsync('assets/logo-afriflow.png');
tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
const brand=new THREE.Mesh(new THREE.PlaneGeometry(.58,.58),new THREE.MeshBasicMaterial({map:tex,transparent:true,alphaTest:.015,depthWrite:false,side:THREE.DoubleSide}));
brand.position.set(.38,-1.10,.475);brand.rotation.y=-.13;torso.add(brand);
// Gold swoosh in scene as subtle identity cue.
const ring=new THREE.Mesh(new THREE.TorusGeometry(2.22,.018,8,100,Math.PI*1.15),m.gold);
ring.position.set(0,-.15,-.8);ring.rotation.set(-.12,.17,-.17);ring.material.transparent=true;ring.material.opacity=.24;scene.add(ring);
let speaking=false,doIdle=true,doLips=true,speech=null,blink=0,blinkInterval=3.7,mouthLevel=.04,gesture=0,rotating=false,moveX=0,lastX=0,userRotation=0,portrait=false;
const watchClock=new THREE.Clock();let time=0;
function animate(){requestAnimationFrame(animate);const dt=Math.min(watchClock.getDelta(),.05);time+=dt;
 const idle=doIdle?1:0;
 torso.position.y=-.16+Math.sin(time*1.3)*.023*idle;
 torso.rotation.y=Math.sin(time*.45)*.035*idle+userRotation;
 headPivot.rotation.z=idle*Math.sin(time*.75)*.033;
 headPivot.rotation.x=idle*Math.sin(time*.9)*.023-(speaking?.025:0);
 shoulderL.rotation.z=idle*(-.06+Math.sin(time*.95)*.075)-(speaking?.05*Math.sin(time*3):0);
 shoulderR.rotation.z=idle*(.05+Math.sin(time*1.03)*.08)+(speaking?.055*Math.sin(time*2.5):0);
 blink+=dt;
 const eyeScale=blink>blinkInterval&&blink<blinkInterval+.14?.075:1;
 if(blink>blinkInterval+.3){blink=0;blinkInterval=2.4+2.2*Math.abs(Math.sin(time*.31));}
 eyes.forEach(e=>e.scale.y=eyeScale);
 const target=speaking&&doLips?(.17+.80*Math.abs(Math.sin(time*9.2)+.18*Math.sin(time*15))):.025;
 mouthLevel+=(target-mouthLevel)*Math.min(1,dt*17);
 cavity.scale.y=.06+mouthLevel*.95;lowerLip.position.y=-.073-mouthLevel*.07;
 teeth.scale.y=Math.max(.02,mouthLevel*.35);teeth.position.y=.009+mouthLevel*.012;
 mouthRoot.scale.x=speaking?1+Math.sin(time*6)*.09:1;
 ring.rotation.z=Math.sin(time*.14)*.1;
 renderer.render(scene,camera);
}animate();
function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();const mobile=w<600;camera.position.z=mobile?9.5:8.7;camera.position.y=mobile?.1:.27;camera.lookAt(0,-.08,0)}
new ResizeObserver(resize).observe(viewport);resize();
renderer.domElement.addEventListener('pointerdown',e=>{rotating=true;lastX=e.clientX;renderer.domElement.setPointerCapture(e.pointerId)});
renderer.domElement.addEventListener('pointermove',e=>{if(!rotating)return;moveX=e.clientX-lastX;lastX=e.clientX;userRotation=THREE.MathUtils.clamp(userRotation+moveX*.004,-.52,.52)});
renderer.domElement.addEventListener('pointerup',()=>rotating=false);
renderer.domElement.addEventListener('pointercancel',()=>rotating=false);
const synth=window.speechSynthesis;
function stop(){if(synth)synth.cancel();speaking=false;speech=null;feedback.textContent='La lecture est arrêtée.';status.textContent='Avatar 3D interactif'}
function speak(value,options={}){
 const text=String(value??'').trim();if(!text)return;
 if(!synth||!window.SpeechSynthesisUtterance){feedback.textContent='Ce navigateur ne propose pas de synthèse vocale.';return false}
 stop();const utter=new SpeechSynthesisUtterance(text);utter.lang=options.lang||'fr-FR';utter.rate=options.rate||.94;utter.pitch=options.pitch||1.08;
 const voices=synth.getVoices();const preferred=voices.find(v=>v.lang.toLowerCase().startsWith('fr')&&/female|femme|hortense|audrey|denise|celine|amelie|marie/i.test(v.name))||voices.find(v=>v.lang.toLowerCase().startsWith('fr'));
 if(preferred)utter.voice=preferred;
 utter.onstart=()=>{speaking=true;status.textContent='L’assistante parle';feedback.textContent='Lecture en cours…'};
 utter.onend=()=>{speaking=false;speech=null;status.textContent='Avatar 3D interactif';feedback.textContent='Lecture terminée.'};
 utter.onerror=e=>{speaking=false;speech=null;feedback.textContent='Lecture interrompue ou voix indisponible.';status.textContent='Avatar 3D interactif'};
 // Browser TTS supplies durations but NOT reliable per-phoneme timestamps.
 // Mouth animation here is approximated, not phoneme-perfect lip-sync.
 speech=utter;synth.speak(utter);return true;
}
window.AfriFlowAvatar={speak,stop,setIdle(value){doIdle=!!value},setLipAnimation(value){doLips=!!value},get isSpeaking(){return speaking}};
document.getElementById('play').addEventListener('click',()=>speak(document.getElementById('message').value));
document.getElementById('stop').addEventListener('click',stop);
document.getElementById('idle').addEventListener('change',e=>doIdle=e.target.checked);
document.getElementById('lips').addEventListener('change',e=>doLips=e.target.checked);
function switchMode(photo){portrait=photo;document.getElementById('photoMode').classList.toggle('hidden',!photo);document.getElementById('modePhoto').classList.toggle('active',photo);document.getElementById('mode3d').classList.toggle('active',!photo);status.textContent=photo?'Image fidèle — non animée':'Avatar 3D interactif';document.querySelector('.hint').textContent=photo?'Portrait de référence (fixe)':'Faites glisser pour orienter le personnage'}
document.getElementById('modePhoto').addEventListener('click',()=>switchMode(true));
document.getElementById('mode3d').addEventListener('click',()=>switchMode(false));
window.addEventListener('beforeunload',()=>synth?.cancel());

// Safe same-origin bridge to the existing AfriFloW chatbot.
window.addEventListener('message', function(event) {
  if (event.origin !== window.location.origin) return;
  if (!event.data || event.data.type !== 'AFRIFLOW_SPEAK') return;
  const t=String(event.data.text||'').slice(0,2500);
  if(t && window.AfriFlowAvatar)window.AfriFlowAvatar.speak(t);
});
