
(function(){
"use strict";
var $=function(i){return document.getElementById(i)};
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function SB(){return window.__sb} function TB(){return window.__TABLE||"afriflow_state"}

/* ----- Boutons de connexion : Apple retiré, Microsoft ajouté ----- */
var ap=document.querySelector('.oauth[data-p="apple"]'); if(ap)ap.remove();
var fb=document.querySelector('.oauth[data-p="facebook"]');
if(fb&&!document.querySelector('.oauth[data-p="azure"]')){
  var mb=document.createElement("button");mb.type="button";mb.className="oauth";mb.dataset.p="azure";mb.textContent="Continuer avec Microsoft";
  fb.after(mb);
  mb.onclick=function(){
    if(!SB()){$("authError").textContent="Service indisponible.";return}
    if (window.afriOAuthLogin) window.afriOAuthLogin("azure");
  };
}

/* ----- Onglets réellement présents dans le menu ----- */
function tabs(){
  var out=[];
  document.querySelectorAll("#navList .nvr .nv").forEach(function(b){
    var id=b.dataset.id||(b.hasAttribute("data-cs-nav")?"censeur":(b.hasAttribute("data-fdr-nav")?"fdr":null));
    if(!id||id==="admin"||id==="messages")return;
    out.push({id:id,n:b.textContent.replace(/\s\(\d+\)$/,"")});
  });
  return out;
}
var oldGP=window.getPages;
window.getPages=function(){var t=tabs().filter(function(x){return x.id!=="censeur"});return t.length?t:(oldGP?oldGP():[])};

/* ----- Fenêtre « Droits » à jour ----- */
async function getCfg(){
  var r=await SB().from(TB()).select("value").eq("key","pub:meetcfg").maybeSingle();
  return (r.data&&r.data.value)||{link:"",censeurs:[]};
}
document.addEventListener("click",async function(e){
  var b=e.target.closest("button[data-dg]");
  if(!b||window.USER_ROLE!=="admin")return;
  e.stopPropagation();e.preventDefault();
  var email=b.dataset.dg,low=email.toLowerCase();
  try{
    var U=await window.AFRI.listUsers(),u=U.filter(function(x){return x.email===email})[0];if(!u)return;
    var cfg=await getCfg(),cs=(cfg.censeurs||[]).map(function(x){return String(x).toLowerCase()}),g=u.grants||[];
    var items=[{id:"all",n:"Tout (toute la plateforme)"}].concat(tabs());
    var box=$("xmBox");
    box.innerHTML='<h2 style="margin-top:0">Droits de modification</h2><p style="font-size:.85rem;color:var(--muted);margin-top:0">'+esc(u.name)+' · '+esc(u.email)+'</p>'
      +items.map(function(p){
        var on=p.id==="censeur"?cs.indexOf(low)>-1:g.indexOf(p.id)>-1;
        return '<label class="rq"><input type="checkbox" value="'+esc(p.id)+'"'+(on?' checked':'')+'> '+esc(p.n)+'</label>';
      }).join("")
      +'<div class="dact"><button type="button" class="p" id="gOk2">Enregistrer</button><button type="button" id="gNo2">Annuler</button></div>';
    box.onkeydown=null;$("xm").classList.add("on");
    $("gNo2").onclick=function(){$("xm").classList.remove("on")};
    $("gOk2").onclick=async function(){
      try{
        var v=[].slice.call(box.querySelectorAll("input:checked")).map(function(i){return i.value}),isC=v.indexOf("censeur")>-1;
        v=v.filter(function(x){return x!=="censeur"});if(v.indexOf("all")>-1)v=["all"];
        await window.AFRI.setGrants(email,v);
        var ns=cs.filter(function(x){return x!==low});if(isC)ns.push(low);
        if(ns.join()!==cs.join()){
          var r=await SB().from(TB()).upsert({key:"pub:meetcfg",value:{link:cfg.link||"",censeurs:ns,at:Date.now(),by:String(window.loggedUserEmail||"")},updated_at:new Date().toISOString()});
          if(r.error)throw r.error;
        }
        $("xm").classList.remove("on");(window.toast||alert)("Droits mis à jour");
        var rf=$("adRef");if(rf)rf.click();
      }catch(x){(window.toast||alert)("Échec : "+(x.message||x))}
    };
  }catch(x){(window.toast||alert)("Impossible d'ouvrir les droits : "+(x.message||x))}
},true);
})();
