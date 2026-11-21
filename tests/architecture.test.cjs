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
    'modules/documents/document-viewer.js',
    'modules/documents/word-editor.js', 'modules/documents/word-editor-loader.js', 'modules/admin/access-controls.js',
    'modules/auth/account-management.js', 'modules/documents/dropbox-browser.js',
    'modules/assistant/chat-ui.js', 'modules/assistant/math-rendering.js',
    'modules/collaboration/meetings.js', 'modules/roadmap/timeline.js',
    'modules/ui/animated-background.js'
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
  assert.ok(!html.includes('Messagerie interne : envoi groupé, pièces jointes, archivage Dropbox'));
  assert.ok(!html.includes('var U={pdf:"https://cdn.jsdelivr.net/npm/pdfjs-dist'));
  assert.ok(!html.includes('var NM={google:"Google",facebook:"Facebook",azure:"Microsoft"'));
});

test('Éditeur Word et gestion des droits chargés une seule fois', () => {
  for (const filename of [
    'modules/documents/word-editor.js',
    'modules/admin/access-controls.js'
  ]) {
    const version = filename.endsWith('word-editor.js') ? null : '20261121-modularisation-2';
    if (version) {
      const tag = '<script src="./' + filename + '?v=' + version + '"></script>';
      assert.equal(html.split(tag).length - 1, 1, filename + ' absent ou chargé plusieurs fois');
    }
    assert.ok(fs.existsSync(path.join(root, filename)), filename + ' manquant');
  }
  assert.ok(html.indexOf('modules/admin/access-controls.js') <
    html.indexOf('modules/documents/word-editor-loader.js'),
    'Ordre des scripts modifié');
  assert.ok(!html.includes('Bibliothèque d\'export Word'),
    'Le code de l\'éditeur Word est encore dupliqué dans index.html');
  assert.ok(!html.includes('Boutons de connexion : Apple retiré, Microsoft ajouté'),
    'Le code des droits est encore dupliqué dans index.html');
});

test('Gestion des comptes et explorateur Dropbox chargés une fois', () => {
  const paths = [
    'modules/auth/account-management.js',
    'modules/documents/dropbox-browser.js'
  ];
  for (const filename of paths) {
    const tag = '<script src="./' + filename + '?v=20261121-modularisation-3"></script>';
    assert.equal(html.split(tag).length - 1, 1, filename + ' absent ou dupliqué');
    assert.ok(fs.existsSync(path.join(root, filename)), filename + ' manquant');
  }
  assert.ok(html.indexOf('modules/auth/account-management.js') <
    html.indexOf('modules/messaging/internal-messaging.js'),
    'Les comptes doivent être initialisés avant la messagerie');
  assert.ok(!html.includes('Comptes, droits, présence en temps réel, journal partagé'),
    'Le module comptes est toujours inline');
  assert.ok(!html.includes('var KEY="pub:dbxshow"'),
    'Explorateur Dropbox toujours inline');
});

test('Assistant IA et moteur mathématique chargés dans leur ordre initial', () => {
  const paths = ['modules/assistant/chat-ui.js', 'modules/assistant/math-rendering.js'];
  for (const filename of paths) {
    const tag = '<script src="./' + filename + '?v=20261121-modularisation-4"></script>';
    assert.equal(html.split(tag).length - 1, 1, filename + ' absent ou dupliqué');
    assert.ok(fs.existsSync(path.join(root, filename)), filename + ' manquant');
  }
  assert.ok(html.indexOf('modules/assistant/chat-ui.js') <
            html.indexOf('modules/assistant/math-rendering.js'),
            'Chargement de l’assistant inversé');
  assert.ok(!html.includes('/* ---------- Icônes (SVG intégrés) ---------- */'));
  assert.ok(!html.includes('var KATEX_JS='));
});

test('Réunions, feuille de route et décor chargé une seule fois', () => {
  const extracted = [
    'modules/collaboration/meetings.js',
    'modules/roadmap/timeline.js',
    'modules/ui/animated-background.js'
  ];
  for (const filename of extracted) {
    const tag = '<script src="./' + filename + '?v=20261121-modularisation-5"></script>';
    assert.equal(html.split(tag).length - 1, 1, filename + ' absent ou dupliqué');
    assert.ok(fs.existsSync(path.join(root, filename)), filename + ' absent');
  }
  assert.ok(html.indexOf('modules/roadmap/timeline.js') < html.indexOf('modules/ui/animated-background.js'));
  assert.ok(html.indexOf('modules/ui/animated-background.js') < html.indexOf('modules/collaboration/meetings.js'));
  for (const m of ['var CFG="pub:meetcfg"', 'var START="2026-11-09"', 'var LS="afriflow_animbg_v1"']) {
    assert.ok(!html.includes(m), 'Bloc initial encore présent dans index.html : ' + m);
  }
});

test('Éditeur Word chargé à la demande, sans chargement initial du script métier', () => {
  const tag = '<script src="./modules/documents/word-editor-loader.js?v=20261121-lazy-word-1"></script>';
  assert.equal(html.split(tag).length - 1, 1);
  assert.ok(!html.includes('<script src="./modules/documents/word-editor.js?'));
  const source = read('modules/documents/word-editor-loader.js');
  assert.match(source, /window\.dvWordEdit\s*=\s*wordEdit/);
  assert.match(source, /window\.dvPerm\s*=\s*permission/);
  assert.match(source, /window\.dvTogglePerm\s*=\s*togglePermission/);
});
