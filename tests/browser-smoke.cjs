/* Browser smoke tests against a static local server, without credentials. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.webmanifest':'application/manifest+json',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg',
  '.webp':'image/webp', '.mp4':'video/mp4' };
function serve(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const safe = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!safe.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.stat(safe, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', types[path.extname(safe)] || 'application/octet-stream');
    fs.createReadStream(safe).pipe(res);
  });
}
test('Anonymous page boots and locally hosted JavaScript loads', { timeout: 90000 }, async () => {
  const server = http.createServer(serve);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const port = server.address().port;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const failedScripts = [];
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.hostname === '127.0.0.1' && /\.js$/.test(url.pathname) && response.status() >= 400) {
        failedScripts.push(url.pathname + ': ' + response.status());
      }
    });
    await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);
    assert.equal(await page.title(), 'AfriFloW – Accueil');
    assert.equal(await page.locator('#introVideo').count(), 1);
    assert.equal(await page.locator('#auth-screen').count(), 1);
    assert.equal(await page.locator('#market-view').count(), 1);
    assert.equal(await page.locator('#navList').count(), 1);
    assert.deepEqual(failedScripts, [], 'Local JavaScript returned HTTP errors');
    assert.equal(await page.locator('script[src*="/modules/documents/word-editor.js"]').count(), 0,
      'Word editor should not load before it is requested');
    const loaderReady = await page.evaluate(() => typeof window.dvWordEdit === 'function' &&
      typeof window.dvPerm === 'function' && typeof window.dvTogglePerm === 'function');
    assert.ok(loaderReady, 'Word editor compatibility API should be available');
    await page.evaluate(() => { window.dvPerm('__smoke_no_access__'); });
    await page.waitForFunction(() =>
      document.querySelector('script[src*="/modules/documents/word-editor.js"]') !== null,
      { timeout: 10000 });

    const modules = await page.evaluate(() => ({
      supabase: typeof window.__sb !== 'undefined',
      messaging: typeof window.AFRI !== 'undefined',
      market: typeof window.AfriMarket !== 'undefined'
    }));
    assert.ok(modules.supabase && modules.messaging && modules.market,
      'Startup APIs missing: ' + JSON.stringify(modules));
    // Public Market and authentication dialog must coexist without a real user session.
    await page.evaluate(() => window.AfriMarket.openPublic());
    assert.equal(await page.locator('body.af-market-mode').count(), 1,
      'Public Market should show the market mode');
    await page.evaluate(() => window.AfriMarket.openAuth('login'));
    assert.equal(await page.locator('#auth-screen:not(.off)').count(), 1,
      'Login dialog should open from public Market');
    await page.evaluate(() => window.AfriMarket.closeAuth());
    assert.equal(await page.locator('#auth-screen.off').count(), 1,
      'Login dialog should close and return to Market');
    // Once loaded on first use, the Word module must remain a singleton.
    const wordSources = await page.evaluate(() =>
      [...document.querySelectorAll('script[src*="/modules/documents/word-editor.js"]')].length);
    assert.equal(wordSources, 1, 'Word editor script should load only once');
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
