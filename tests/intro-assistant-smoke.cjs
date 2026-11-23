/* Local Three.js introduction smoke test. Run: node tests/intro-assistant-smoke.cjs */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const puppeteer = require(path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx', '4b4c857f6efdfb61', 'node_modules', 'puppeteer'));
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.mp4':'video/mp4', '.glb':'model/gltf-binary', '.json':'application/json'};
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({ headless: true, args: ['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--no-sandbox'] });
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/tests/intro-3d-probe.html';
    for (const size of [{width:1365,height:768},{width:390,height:844}]) {
      const page = await browser.newPage();
      await page.setViewport(size);
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
      await page.goto(url, { waitUntil:'domcontentloaded', timeout:45000 });
      await page.waitForFunction(() => window.__probeLoaded === true, { timeout: 30000 });
      await page.evaluate(() => document.getElementById('introVideo').dispatchEvent(new Event('playing')));
      await new Promise(r => setTimeout(r, 8000));
      const state = await page.evaluate(() => {
        const el = document.querySelector('.af-intro-avatar');
        return { installed:!!el, visible:el?.classList.contains('visible'), canvas:!!el?.querySelector('canvas'), video:!!document.getElementById('introVideo'), width:el?.getBoundingClientRect().width };
      });
      console.log('VIEW',size,state,'ERRORS',errors.slice(0,10));
      assert.equal(state.installed, true, 'Overlay should be installed');
      assert.equal(state.canvas, true, 'WebGL canvas should exist');
      await page.screenshot({path:path.join(root,'tests',`intro-check-${size.width}.png`)});
      assert.ok(state.video);
      assert.ok(!errors.some(e => /Failed to resolve module specifier|SyntaxError|GLTFLoader/i.test(e)),errors.join('; '));
      await page.evaluate(() => document.getElementById('introVideo').dispatchEvent(new Event('ended')));
      await new Promise(r => setTimeout(r, 400));
      assert.equal(await page.$('.af-intro-avatar'), null, 'Overlay should disappear when video ends');
      await page.close();
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(err => { console.error(err); process.exitCode=1; server.close(); });
