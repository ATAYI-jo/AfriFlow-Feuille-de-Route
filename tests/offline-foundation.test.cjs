const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');
function setup(fail=true){
 const handlers={};const writes=[];const deleted=[];const fallback={offline:true};
 const ctx={URL,Request,Response,fetch:async()=>{if(fail)throw new Error('offline');return {network:true};},caches:{open:async()=>({add:async r=>writes.push(r.url),match:async()=>fallback}),keys:async()=>['unrelated','afriflow-offline-shell-v0','afriflow-offline-shell-v1'],delete:async k=>deleted.push(k)},self:{registration:{scope:'https://example.com/app/'},addEventListener:(n,f)=>handlers[n]=f,skipWaiting:async()=>{},clients:{claim:async()=>{}}}};
 vm.runInNewContext(source,ctx);
 return {handlers,writes,deleted,fallback};
}
function fireFetch(handlers,url,method='GET',mode='navigate'){
 let response;handlers.fetch({request:{url,method,mode},respondWith:p=>response=p});return response;
}
test('installation only precaches public offline page',async()=>{const {handlers,writes}=setup();let p;handlers.install({waitUntil:v=>p=v});await p;assert.deepEqual(writes,['https://example.com/app/offline.html']);assert.ok(handlers.push);assert.ok(handlers.notificationclick);});
test('activation preserves unrelated caches',async()=>{const {handlers,deleted}=setup();let p;handlers.activate({waitUntil:v=>p=v});await p;assert.deepEqual(deleted,['afriflow-offline-shell-v0']);});
test('root falls back when network fails',async()=>{const {handlers,fallback}=setup();assert.equal(await fireFetch(handlers,'https://example.com/app/'),fallback);});
test('root network success is not replaced',async()=>{const {handlers}=setup(false);assert.equal((await fireFetch(handlers,'https://example.com/app/')).network,true);});
test('no interception of writes, API, callbacks or external data',()=>{const {handlers}=setup();for(const [url,method,mode] of [['https://example.com/app/','POST','navigate'],['https://example.com/app/?code=x','GET','navigate'],['https://example.com/app/api','GET','cors'],['https://example.com/app/private','GET','navigate'],['https://supabase.example/rest/v1/messages','GET','cors']])assert.equal(fireFetch(handlers,url,method,mode),undefined);});
