/* Durable text-message outbox. No tokens, attachments, or generic request replay. */
(function(){
'use strict';
const DB='afriflow-message-outbox-v1', STORE='messages';
let dbPromise, identity=null, generation=0, running=false;
const email=()=>String(window.loggedUserEmail||'').toLowerCase();
const sb=()=>window.__sb;
const emit=()=>window.dispatchEvent(new Event('afriflow:outbox-changed'));
function db(){
 if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{const store=req.result.createObjectStore(STORE,{keyPath:'id'});store.createIndex('owner','owner');};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  req.onblocked=()=>reject(new Error('Stockage local bloqué.'));
 }).catch(e=>{dbPromise=null;throw e;});
 return dbPromise;
}
async function transaction(mode,fn){
 const d=await db();
 return new Promise((resolve,reject)=>{
  const t=d.transaction(STORE,mode);let result;
  try{const r=fn(t.objectStore(STORE));r.onsuccess=()=>{result=r.result;};}catch(e){t.abort();reject(e);return;}
  t.oncomplete=()=>resolve(result);t.onabort=t.onerror=()=>reject(t.error||new Error('Stockage local indisponible.'));
 });
}
const listOwner=owner=>transaction('readonly',s=>s.index('owner').getAll(owner));
const put=item=>transaction('readwrite',s=>s.put(item));
const remove=id=>transaction('readwrite',s=>s.delete(id));
function valid(){return identity&&identity.email===email()?identity:null;}
async function bind(){
 const g=++generation, current=email();identity=null;emit();
 if(!current||!sb())return;
 try{
  const r=await sb().auth.getUser(),u=r.data&&r.data.user;
  if(g===generation&&current===email()&&!r.error&&u&&String(u.email||'').toLowerCase()===current){identity={id:u.id,email:current};emit();void flush();}
 }catch(_){}
}
async function list(){const a=valid();if(!a)return [];const rows=await listOwner(a.id);return valid()===a?rows.sort((x,y)=>x.ts-y.ts):[];}
async function enqueue(subject,body,recipients){
 let a=valid();if(!a){await bind();a=valid();}
 if(!a)throw new Error('Reconnectez-vous pour vérifier votre compte avant la mise en attente.');
 const rec=[...new Set(recipients.map(x=>String(x).trim().toLowerCase()))];
 if(!rec.length||rec.some(x=>!x||x===a.email||x.includes(':'))||!body.trim())throw new Error('Destinataires ou message invalides.');
 const ts=Date.now(),key=ts+':'+crypto.randomUUID(),id=a.id+':'+key;
 const data={from:a.email,fromName:window.USER_NAME||a.email,subject,body,ts,read:false};
 const updated_at=new Date(ts).toISOString();
 const rows=[{key:'sent:'+a.email+':'+key,value:{...data,to:rec.join(', '),read:true,group:rec.length>1?rec:undefined},updated_at},...rec.map(to=>({key:'msg:'+to+':'+key,value:{...data,to,group:rec.length>1?rec:undefined},updated_at}))];
 const item={id,owner:a.id,email:a.email,key,ts,subject,body,rec,rows,state:'pending',attempts:0,next:0};
 if(valid()!==a)throw new Error('Compte modifié.');
 await put(item);
 if(valid()!==a){await remove(id);throw new Error('Compte modifié.');}
 emit();void flush();
 return id;
}
function sameAccount(a){return valid()===a;}
async function confirmed(item){
 const r=await sb().from(window.__TABLE||'afriflow_state').select('key,value').eq('key',item.rows[0].key).maybeSingle();
 if(r.error)throw r.error;
 if(!r.data)return false;
 const v=r.data.value||{},expected=item.rows[0].value;
 if(v.from!==expected.from||v.to!==expected.to||v.ts!==expected.ts||v.body!==expected.body||v.subject!==expected.subject)throw Object.assign(new Error('Conflit de contenu.'),{code:'AF_CONFLICT'});
 return true;
}
function permanent(e){return ['AF_CONFLICT','42501','23502','23503','23514','22P02','PGRST301','PGRST302'].includes(String(e&&e.code||''));}
async function process(a){
 // The live server verifies identity and its existing RLS checks every insert.
 const check=await sb().auth.getUser(),u=check.data&&check.data.user;
 if(check.error||!u||u.id!==a.id||String(u.email||'').toLowerCase()!==a.email||!sameAccount(a))return;
 for(const item of await listOwner(a.id)){
  if(!sameAccount(a)||!navigator.onLine)return;
  if(item.state!=='pending'||item.next>Date.now())continue;
  try{
   let already=await confirmed(item);
   if(!sameAccount(a))return;
   if(!already){
    const r=await sb().from(window.__TABLE||'afriflow_state').insert(item.rows);
    if(r.error){if(r.error.code!=='23505'||!await confirmed(item))throw r.error;already=true;}
   }
   // The sent copy and all recipient copies are one atomic database insert.
   await remove(item.id);
   if(sameAccount(a)){emit();if(!already&&window.AfriFlowPush?.notifyMessage)window.AfriFlowPush.notifyMessage(item.key).catch(()=>{});}
  }catch(e){
   if(!sameAccount(a))return;
   item.attempts++;
   item.state=permanent(e)||e.code==='23505'?'blocked':'pending';
   item.next=Date.now()+Math.min(300000,5000*2**Math.min(item.attempts,6));
   await put(item);emit();
  }
 }
}
async function flush(){
 const a=valid();if(!a||running||!navigator.onLine)return;
 running=true;
 try{
  if(navigator.locks)await navigator.locks.request('afriflow-outbox:'+a.id,{ifAvailable:true},lock=>lock&&sameAccount(a)?process(a):undefined);
  else await process(a);
 }catch(_){}finally{running=false;}
}
async function retry(id){const a=valid();if(!a)return;const item=(await list()).find(x=>x.id===id);if(!item||!sameAccount(a))return;item.state='pending';item.next=0;await put(item);emit();void flush();}
async function discard(id){const a=valid();if(!a)return;const item=(await list()).find(x=>x.id===id);if(!item||!sameAccount(a)||running)throw new Error('Synchronisation en cours ou compte indisponible.');await remove(id);emit();}
async function beforeLogout(){
 const a=valid();if(!a)return true;
 if(running){window.alert('Synchronisation en cours. Réessayez après sa fin.');return false;}
 const items=await list();
 if(items.length&&!window.confirm('Des messages restent en attente. Se déconnecter supprimera ces copies locales. Continuer ?'))return false;
 ++generation;identity=null;
 for(const item of items)await remove(item.id);
 emit();return true;
}
window.AfriOutbox={enqueue,list,retry,discard,flush,beforeLogout};
window.addEventListener('afriflow:verified-role',()=>{if(email())void bind();else{++generation;identity=null;emit();}});
window.addEventListener('online',()=>{if(valid())void flush();else void bind();});
window.addEventListener('focus',()=>{if(valid())void flush();else if(email())void bind();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(valid())void flush();else if(email())void bind();}});
setInterval(()=>{if(!document.hidden&&valid())void flush();},15000);
if(email())void bind();
})();
