(function(){
"use strict";
function $(x){return document.getElementById(x)}
function txt(s){return String(s==null?"":s).replace(/[&<>"']/g,function(x){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[x]})}
function notify(s){(window.toast||alert)(s)}
function b64(blob){return new Promise(function(ok,fail){var r=new FileReader();r.onload=function(){ok(String(r.result).split(",")[1])};r.onerror=fail;r.readAsDataURL(blob)})}
window.dvExcelEdit=function(path){
 var wb=window.__dvWorkbook,X=window.XLSX;
 if(!wb||!X){notify("Ouvre le fichier Excel avant de le modifier.");return}
 if(!confirm("Cet éditeur Excel est simplifié. Macros, graphiques, tableaux croisés et certaines mises en forme peuvent être altérés. Une sauvegarde de l'original sera créée dans Dropbox avant chaque enregistrement. Continuer ?"))return;
 if($("afExcel"))$("afExcel").remove();
 var modal=document.createElement("section");modal.id="afExcel";modal.setAttribute("role","dialog");modal.setAttribute("aria-label","Édition Excel");
 modal.innerHTML='<header><strong>Excel · '+txt(path.split("/").pop())+'</strong><button id="afExcelSave" type="button">Enregistrer dans Dropbox</button><button id="afExcelClose" type="button">Fermer</button></header><p>Éditeur simplifié — modifier les cellules, puis enregistrer.</p><nav id="afExcelTabs"></nav><div id="afExcelPaging" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:8px 12px;background:#f5fbf5"></div><div class="afExcelGrid" id="afExcelGrid"></div><footer id="afExcelStatus">Prêt</footer>';
 document.body.appendChild(modal);
 var old=document.body.style.overflow;document.body.style.overflow="hidden";var sheetN=0,dirty=false,busy=false,rowStart=0,colStart=0;
 function render(){
   $("afExcelTabs").innerHTML=wb.SheetNames.map(function(n,i){return '<button type="button" data-sheet="'+i+'"'+(i===sheetN?' class="on"':'')+'>'+txt(n)+'</button>'}).join("");
   var sh=wb.Sheets[wb.SheetNames[sheetN]],range=X.utils.decode_range(sh["!ref"]||"A1");
   var rows=Math.max(30,range.e.r+1),cols=Math.max(10,range.e.c+1);
   var rowEnd=Math.min(rows,rowStart+100),colEnd=Math.min(cols,colStart+20);
   var pg=$("afExcelPaging");
   pg.innerHTML='<button type="button" data-pg="rp">← 100 lignes</button><button type="button" data-pg="rn">100 lignes →</button><button type="button" data-pg="cp">← 20 colonnes</button><button type="button" data-pg="cn">20 colonnes →</button><span>Lignes '+(rowStart+1)+'–'+rowEnd+' / '+rows+' · Colonnes '+X.utils.encode_col(colStart)+'–'+X.utils.encode_col(colEnd-1)+' / '+cols+'</span>';
   pg.onclick=function(e){var b=e.target.closest("[data-pg]");if(!b)return;var a=b.dataset.pg;if(a==="rp")rowStart=Math.max(0,rowStart-100);if(a==="rn")rowStart+=100;if(a==="cp")colStart=Math.max(0,colStart-20);if(a==="cn")colStart+=20;render()};
   var out='<table><thead><tr><th></th>';for(var j=colStart;j<colEnd;j++)out+='<th>'+X.utils.encode_col(j)+'</th>';out+='</tr></thead><tbody>';
   for(var r=rowStart;r<rowEnd;r++){
     out+='<tr><th>'+(r+1)+'</th>';
     for(var c=colStart;c<colEnd;c++){
       var a=X.utils.encode_cell({r:r,c:c}),cell=sh[a],v=cell?(cell.f?"="+cell.f:(cell.v==null?"":String(cell.v))):"";
       out+='<td><input type="text" aria-label="'+a+'" data-cell="'+a+'" value="'+txt(v)+'"></td>';
     }
     out+='</tr>';
   }
   $("afExcelGrid").innerHTML=out+'</tbody></table>';
   $("afExcelTabs").onclick=function(e){var b=e.target.closest("[data-sheet]");if(b){sheetN=+b.dataset.sheet;rowStart=0;colStart=0;render()}};
   $("afExcelGrid").onchange=function(e){
     var input=e.target;if(!input.dataset.cell)return;
     var a=input.dataset.cell,v=input.value,sh=wb.Sheets[wb.SheetNames[sheetN]];
     if(!v)delete sh[a];
     else if(v.startsWith("="))sh[a]={t:"n",f:v.slice(1)};
     else if(/^[-+]?\d+(\.\d+)?$/.test(v))sh[a]={t:"n",v:Number(v)};
     else sh[a]={t:"s",v:v};
     var r=X.utils.decode_range(sh["!ref"]||"A1"),pos=X.utils.decode_cell(a);
     r.e.r=Math.max(r.e.r,pos.r);r.e.c=Math.max(r.e.c,pos.c);
     sh["!ref"]=X.utils.encode_range(r);dirty=true;$("afExcelStatus").textContent="Modifications non enregistrées";
   };
 }
 render();
 $("afExcelClose").onclick=function(){
   if(dirty&&!confirm("Fermer sans enregistrer les modifications ?"))return;
   document.body.style.overflow=old;modal.remove();
   if(window.dvReload)window.dvReload();
 };
 $("afExcelSave").onclick=async function(){
   if(busy)return;busy=true;this.disabled=true;$("afExcelStatus").textContent="Enregistrement…";
   try{
     var data=X.write(wb,{bookType:"xlsx",type:"array"}),file=new Blob([data],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
     var res=await window.__sb.functions.invoke("dropbox-save",{body:{path:path,data:await b64(file)}});
     if(res.error){var msg=res.error.message||"Erreur serveur";try{var j=await res.error.context.json();if(j.error)msg=j.error}catch(x){}throw Error(msg)}
     if(res.data&&res.data.error)throw Error(res.data.error);
     dirty=false;$("afExcelStatus").textContent="Enregistré (copie précédente conservée)";notify("Document Excel enregistré.");
   }catch(e){$("afExcelStatus").textContent="Échec de l'enregistrement";notify("Impossible d'enregistrer : "+(e.message||e))}
   busy=false;$("afExcelSave").disabled=false;
 };
};
})();