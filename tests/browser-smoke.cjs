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
    assert.equal(await page.title(), 'AfriFlow – Accueil');
    assert.equal(await page.locator('#introVideo').count(), 1);
    assert.equal(await page.locator('#auth-screen').count(), 1);
    assert.equal(await page.locator('#market-view').count(), 1);
    assert.equal(await page.locator('#afPwaInstallBtn').getAttribute('aria-label'),
      'Installer ou télécharger AfriFlow');
    assert.equal(await page.locator('#afPwaInstallBtn svg').count(), 1);
    assert.equal((await page.locator('#afPwaInstallBtn').textContent()).trim(), '');
    // The install flag survives a reload and hides the invitation.
    await page.evaluate(() => { localStorage.setItem('afriflow_pwa_installed_v1','yes'); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#afPwaInstallArea').evaluate(el => el.hidden), true);
    await page.evaluate(() => { localStorage.removeItem('afriflow_pwa_installed_v1'); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#afPwaInstallArea').evaluate(el => el.hidden), false);

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
    assert.equal(await page.locator('#afMarketBack').count(), 0,
      'A visitor must never see Retour à l’accueil or Retour à mon espace');
    await page.evaluate(() => window.AfriMarket.open({
      kind: 'authenticated', market: { access_mode: 'client' }
    }));
    assert.equal(await page.locator('#afMarketBack').count(), 0,
      'A customer must not see the shareholder workspace navigation');
    assert.equal(await page.locator('#afMarketSignOut').count(), 1,
      'Authenticated customers need a logout button');
    assert.equal(await page.locator('#afMarketSignOut').isVisible(), true,
      'Logout must remain visible on mobile screens');
    await page.evaluate(() => window.AfriMarket.open({
      kind: 'authenticated', market: { access_mode: 'shareholder_pending' }
    }));
    assert.equal(await page.locator('#afMarketBack').count(), 0,
      'A pending shareholder must not see the workspace navigation');
    await page.evaluate(() => window.AfriMarket.openPublic());
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
    // Simulate workspace roles after the public-market checks.
    await page.evaluate(() => {
      window.USER_ROLE = 'reader';
      window.loggedUserEmail = 'member@example.test';
      window.onPending(0);
    });
    const footer = page.locator('#admBox #fdrFooter');
    assert.equal(await footer.textContent(), 'Échéances et alertes');
    assert.equal(await page.locator('#addNav').count(), 0);
    await footer.dispatchEvent('click');
    assert.equal(await page.locator('[data-fdr-view="deadlines"] h2').textContent(), 'Échéances et alertes');
    assert.equal(await page.locator('#b-dl > button').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#mkDoc, #fdrGo').count(), 0);
    assert.equal(await footer.getAttribute('aria-current'), 'page');
    await page.locator('#navList [data-fdr-nav]').dispatchEvent('click');
    await page.locator('[data-fdr-view="marketing"] #mkDoc').waitFor({state:'attached'});
    assert.equal(await footer.getAttribute('aria-current'), null);
    await page.evaluate(() => { window.USER_ROLE = 'admin'; window.onPending(0); });
    assert.equal(await page.locator('#admBox #addNav').count(), 1);
    assert.equal(await footer.count(), 0);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test('Inbox cards contain their subject, sender and preview while scrolling', async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    // Keep the production stylesheet cascade and test with synthetic messages offline.
    const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*rel="stylesheet"[^>]*href="\.\/([^"?]+)[^"]*"[^>]*>/gi)]
      .map(match => match[1] ?? fs.readFileSync(path.join(root, match[2]), 'utf8')).join('\n');
    const card = '<button class="dcard"><b>Non lu · Urgent · nouveau devis pour Mangue Séchée – Sachet 50 g</b><small>De : Portail partenaire · 24/11/2026 11:45</small><small>Le vendeur a accepté votre demande de livraison. Consultez le détail dans la messagerie.</small></button>';
    await page.setContent('<style>'+styles+'</style><body class="af-mail-open"><div id="afMailLayer"><section id="msgBox" class="msg-box"><div class="toolbar">Messagerie</div><div class="auth-tabs">Réception</div><div id="msgList" class="dgrid">'+card.repeat(18)+'</div></section></div></body>');
    for (const width of [320,375,430,1024]) {
      await page.setViewportSize({width,height:812});
      const result = await page.locator('#msgList').evaluate(list => {
        list.scrollTop = list.scrollHeight;
        const cards = [...list.children];
        return {
          scrolled: list.scrollTop > 0,
          contained: cards.every(card => [...card.children].every(child =>
            child.getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom + 1)),
          finalVisible: cards.at(-1).getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom + 1
        };
      });
      assert.deepEqual(result, {scrolled:true, contained:true, finalVisible:true}, 'Inbox layout at '+width+'px');
    }
  } finally { await browser.close(); }
});

test('Deadline alerts reach only the members selected across search results', async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:375,height:812}});
    await page.setContent('<style>[hidden]{display:none}</style><nav id="navList"><div><button class="nv" data-id="home">Accueil</button></div></nav><div id="view-home"></div><div id="fdrBanner"></div><div id="viewHost"></div>');
    await page.evaluate(() => {
      Object.assign(window, {
        USER_ROLE:'admin', loggedUserEmail:'admin@example.test', confirm:()=>true, toast:()=>{},
        sent:[], records:{}, AFRI:{
          page:()=>{}, listUsers:async()=>[
            {name:'Élodie',email:'elodie@example.test'},
            {name:'Samuel',email:'samuel@example.test'},
            {name:'Joël',email:'joel@example.test'},
            {name:'Admin',email:'admin@example.test'}
          ]
        },
        __sb:{
          from:()=>({select:()=>({eq:(_field,key)=>({maybeSingle:async()=>({data:window.records[key]||null})})})}),
          rpc:async (name,{p_action,p_payload})=>{
            if(name!=='af_deadline_action')throw new Error('Unexpected RPC: '+name);
            const members=await window.AFRI.listUsers();
            const eligible=members.filter(m=>m.email!==window.loggedUserEmail);
            if(p_action==='directory')return {data:eligible};
            if(p_action==='create'){
              const recipients=p_payload.targeted?p_payload.recipients:eligible.map(m=>m.email);
              if(!recipients.length||recipients.some(email=>!eligible.some(m=>m.email===email)))throw new Error('Invalid recipients');
              window.testDeadlineRecipients=recipients.slice();
              const item={id:'deadline-test',title:p_payload.title,start:p_payload.start,due:p_payload.due,note:p_payload.note,author:window.loggedUserEmail,notified:Date.now(),notifiedCount:recipients.length};
              window.records['pub:deadlines']={key:'pub:deadlines',value:{items:[item]}};
              for(const email of recipients)window.sent.push({key:'msg:'+email,value:{to:email}});
              return {data:{items:[item],count:recipients.length}};
            }
            if(p_action==='resend'){
              if(p_payload.id!=='deadline-test')throw new Error('Invalid deadline');
              for(const email of window.testDeadlineRecipients)window.sent.push({key:'msg:'+email,value:{to:email}});
              return {data:{items:window.records['pub:deadlines'].value.items,count:window.testDeadlineRecipients.length}};
            }
            throw new Error('Unexpected action: '+p_action);
          }
        }
      });
    });
    await page.addScriptTag({path:path.join(root, 'modules/roadmap/timeline.js')});
    await page.locator('[data-fdr-nav]').click();
    if(await page.locator('#b-dl > button').getAttribute('aria-expanded')==='false')await page.locator('#b-dl > button').click();
    await page.locator('#fdrT').fill('Préparer le bilan');
    await page.locator('#fdrTarget').selectOption('selected');
    await page.locator('#fdrGo').click();
    assert.match(await page.locator('#fdrErr').innerText(), /Sélectionnez/);
    await page.locator('#fdrSearch').fill('elodie');
    await page.getByRole('checkbox', {name:/Élodie/}).check();
    await page.locator('#fdrSearch').fill('samuel');
    await page.getByRole('checkbox', {name:/Samuel/}).check();
    assert.match(await page.locator('#fdrSelected').innerText(), /^2 membres/);
    await page.locator('#fdrGo').click();
    await page.getByRole('button', {name:'Relancer',exact:true}).click();
    await page.waitForFunction(() => window.sent.filter(r=>r.key.startsWith('msg:')).length >= 4);
    const result = await page.evaluate(() => ({
      recipients:window.sent.filter(r=>r.key.startsWith('msg:')).map(r=>r.value.to).sort(),
      publicDeadline:JSON.stringify(window.records['pub:deadlines'])
    }));
    assert.deepEqual(result.recipients,['elodie@example.test','elodie@example.test','samuel@example.test','samuel@example.test']);
    assert.doesNotMatch(result.publicDeadline,/elodie@example.test|samuel@example.test/);
  } finally { await browser.close(); }
});

test('Partner removal requires confirmation in Administration and refreshes the list', async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:375,height:812}});
    await page.setContent('<div id="adPartnerTerms"></div>');
    await page.evaluate(() => {
      const partner = {user_id:'00000000-0000-4000-8000-000000000002', email:'partner@example.test'};
      window.USER_ROLE = 'reader';
      window.removalCalls = [];
      window.toast = () => {};
      window.__sb = {functions:{invoke:async (_fn,{body}) => {
        if (body.action === 'admin_dashboard') {
          return {data:{partners:window.removalCalls.length ? [] : [partner]}};
        }
        if (body.action === 'admin_remove_partner') {
          window.removalCalls.push(body.partnerId);
          return {data:{ok:true}};
        }
        return {data:{}};
      }}};
    });
    await page.addScriptTag({path:path.join(root, 'market.js')});
    await page.evaluate(() => AfriMarket.renderPartnerTermsAdmin('adPartnerTerms'));
    const remove = page.getByRole('button',{name:'Supprimer le partenaire',exact:true});
    assert.equal(await remove.count(), 0);
    await page.evaluate(() => {
      window.USER_ROLE = 'admin';
      return AfriMarket.renderPartnerTermsAdmin('adPartnerTerms');
    });
    await remove.click();
    assert.match(await page.getByRole('dialog').innerText(), /partner@example.test/);
    await page.getByRole('button',{name:'Annuler',exact:true}).click();
    assert.equal(await page.evaluate(() => window.removalCalls.length), 0);
    await remove.click();
    await page.getByRole('button',{name:'Confirmer la suppression',exact:true}).click();
    await page.getByText('Aucun compte partenaire à configurer.').waitFor();
    assert.deepEqual(await page.evaluate(() => window.removalCalls), ['00000000-0000-4000-8000-000000000002']);
  } finally { await browser.close(); }
});
