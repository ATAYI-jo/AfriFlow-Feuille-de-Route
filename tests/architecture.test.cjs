/* Tests de non-régression structurels (aucune connexion externe). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const essentialScripts = [
  'afriflow-core.js', 'afriflow-workspace.js', 'afriflow-profile.js',
  'afriflow-push.js', 'afriflow-first-use.js', 'afriflow-alerts.js', 'market.js'
];
const modules = {
  authentification: 'afriflow-core.js',
  market: 'market.js',
  documents: 'document-permissions.js',
  messagerie: 'afriflow-workspace.js',
  administration: 'afriflow-workspace.js'
};

test('Les points d’entrée des domaines critiques existent', () => {
  for (const [domain, file] of Object.entries(modules)) {
    assert.ok(fs.existsSync(path.join(root, file)), domain + ': fichier manquant ' + file);
  }
});

test('Tous les scripts JavaScript applicatifs sont syntaxiquement valides', () => {
  const scripts = [
    ...essentialScripts, 'document-excel-editor.js', 'document-permissions.js',
    'document-urgency.js', 'updates.js',
    'modules/auth/oauth-icons.js', 'modules/messaging/internal-messaging.js',
    'modules/documents/document-viewer.js'
  ];
  for (const script of scripts) {
    assert.doesNotThrow(() => new vm.Script(read(script), { filename: script }), script);
  }
});

test('Les scripts essentiels sont déclarés une seule fois dans index.html', () => {
  for (const file of essentialScripts) {
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('<script\\b[^>]*\\bsrc=["\\\'][^"\\\']*' + escaped + '(?:\\?[^"\\\']*)?["\\\']', 'gi');
    assert.equal([...html.matchAll(regex)].length, 1, file + ': chargement absent ou dupliqué');
  }
});

test('Le noyau est chargé avant les modules qui en dépendent', () => {
  const order = essentialScripts.map(file => html.indexOf(file));
  assert.ok(order.every(offset => offset >= 0), 'Il manque un script essentiel');
  assert.ok(order[0] < order[1], 'afriflow-core doit précéder workspace');
  assert.ok(order[0] < order[essentialScripts.indexOf('market.js')], 'core doit précéder market');
});

test('PWA : manifest et service worker référencés et présents', () => {
  assert.match(html, /rel=["']manifest["']/);
  assert.match(html, /navigator\.serviceWorker\.register\(['"]\.\/sw\.js['"]/);
  for (const f of ['manifest.webmanifest', 'sw.js']) assert.ok(fs.existsSync(path.join(root, f)));
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
});

test('Les trois scripts extraits sont chargés une fois et dans le bon ordre', () => {
  const extracted = [
    'modules/messaging/internal-messaging.js',
    'modules/documents/document-viewer.js',
    'modules/auth/oauth-icons.js'
  ];
  for (const script of extracted) {
    assert.ok(fs.existsSync(path.join(root, script)), 'Module absent : ' + script);
    const tag = '<script src="./' + script + '?v=20261121-modularisation-1"></script>';
    assert.equal(html.split(tag).length - 1, 1, 'Chargement manquant ou dupliqué : ' + script);
  }
  assert.ok(html.indexOf('modules/messaging/internal-messaging.js') <
            html.indexOf('modules/documents/document-viewer.js'));
  assert.ok(html.indexOf('modules/documents/document-viewer.js') <
            html.indexOf('modules/auth/oauth-icons.js'));
});

test('Aucun bloc extrait ne subsiste en double dans index.html', () => {
  assert.doesNotMatch(html, /Messagerie interne : envoi groupé, pièces jointes, archivage Dropbox/);
  assert.doesNotMatch(html, /var U=\\{pdf:"https:\/\/cdn\\.jsdelivr\\.net\/npm\/pdfjs-dist/);
  assert.doesNotMatch(html, /var NM=\\{google:"Google",facebook:"Facebook",azure:"Microsoft"/);
});
