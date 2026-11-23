const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require(path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx', '4b4c857f6efdfb61', 'node_modules', 'puppeteer'));
const root = path.resolve(__dirname, '..');
const html = '<!doctype html><html><head><meta charset="utf-8"><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/"}}</script></head><body><script>var USER_ROLE="reader",loggedUserEmail="";</script><script defer src="/avatar-3d/admin-intro-preview.js"></script></body></html>';
const server = http.createServer((req,res)=>{
  if(req.url === '/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(data);});
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:'+server.address().port+'/');
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('afriflow:verified-role',{detail:{role:'reader'}})));
    assert.equal(await page.$('#afIntroAdminPreviewBtn'),null,'ordinary reader must not see preview');
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('afriflow:verified-role',{detail:{role:'admin'}})));
    assert.equal(await page.$('#afIntroAdminPreviewBtn'),null,'forged role event without authenticated admin must not show preview');
    await page.evaluate(()=>{window.USER_ROLE='admin';window.loggedUserEmail='admin@example.invalid';window.dispatchEvent(new CustomEvent('afriflow:verified-role',{detail:{role:'admin'}}));});
    assert.ok(await page.$('#afIntroAdminPreviewBtn'),'authenticated admin should see preview button');
    await page.click('#afIntroAdminPreviewBtn');
    await page.waitForSelector('#afAdminIntroPreview video', {timeout:10000});
    await page.waitForSelector('#afAdminIntroPreview canvas', {timeout:30000});
    console.log('PASS: admin-only preview creates a Three.js canvas');
    await page.evaluate(()=>{window.USER_ROLE='reader';window.loggedUserEmail='';window.dispatchEvent(new CustomEvent('afriflow:verified-role',{detail:{role:'reader'}}));});
    assert.equal(await page.$('#afIntroAdminPreviewBtn'),null,'logout must remove admin button');
    console.log('PASS: reader denied, unverified event denied, admin shown, logout hidden.');
    await page.close();
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
