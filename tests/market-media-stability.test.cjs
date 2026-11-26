const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'market.js'), 'utf8');
const mediaSource = source.slice(source.indexOf('  function slug(s)'), source.indexOf('  /* ---------- Bandeau éditable'));

function harness({ admin = true, visible = true } = {}) {
  const requests = [], images = [];
  let renders = 0;
  class Element {
    constructor(tag, className = '') {
      this.tagName = tag; this.className = className; this.children = []; this.parentNode = null;
      this.textContent = ''; this.dataset = {};
      this.style = { setProperty() {}, getPropertyValue() { return ''; } };
      this.classList = { contains: name => this.className.split(' ').includes(name) };
    }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    insertBefore(child, before) { child.parentNode = this; this.children.splice(Math.max(0, this.children.indexOf(before)), 0, child); }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
    get firstChild() { return this.children[0] || null; }
    get isConnected() { return this === root || !!(this.parentNode && this.parentNode.isConnected); }
    getAttribute(name) { return name === 'src' ? this.src : null; }
    querySelectorAll(selector) {
      const classes = selector.split(',').map(part => part.trim().split('.').pop());
      return this.children.flatMap(child => [
        ...(classes.some(name => child.classList.contains(name)) ? [child] : []),
        ...child.querySelectorAll(selector)
      ]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  class Image extends Element {
    constructor() { super('img'); images.push(this); this.naturalWidth = 800; this.naturalHeight = 600; }
    set src(value) { this.url = value; if (value.startsWith('products/')) queueMicrotask(() => this.onerror()); }
    get src() { return this.url; }
  }
  const root = new Element('main'), search = root.appendChild(new Element('input'));
  search.value = 'cacao'; search.selectionStart = 3;
  const form = root.appendChild(new Element('form'));
  form.draft = 'Description non enregistrée';
  const card = new Element('div'); card.dataset.alt = 'Cacao';
  const fallback = card.appendChild(new Element('span', 'af-market-fallback'));
  const logo = fallback.appendChild(new Element('img', 'af-fb-logo'));
  logo.src = 'logo.svg?v=2';
  fallback.appendChild(new Element('em')).textContent = 'Cacao';
  if (visible) root.appendChild(card);
  const document = {
    activeElement: search,
    createElement(tag) { return new Element(tag); },
    querySelectorAll(selector) {
      const match = selector.match(/^\[data-market-image="cacao"\](?: (.*))?$/);
      if (!match || !card.isConnected) return [];
      return match[1] ? card.querySelectorAll(match[1]) : [card];
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  };
  const state = { products: [{ id: 'cacao', name: 'Cacao' }], context: { kind: 'authenticated' }, imgs: {}, imgErr: {} };
  const context = vm.createContext({
    state, catalogRequest: 1, EXT: ['jpg', 'jpeg', 'webp', 'png'], document, Image,
    isAdmin: () => admin, isAnnouncement: p => p.listing_type === 'announcement', esc: String,
    sb: () => ({ functions: { invoke: () => new Promise(resolve => requests.push(resolve)) } }),
    render() { renders++; root.children = []; search.value = ''; form.draft = ''; },
    console: { warn() {} }
  });
  vm.runInContext(mediaSource, context, { filename: 'market.js:images' });
  async function settle() { for (let i = 0; i < 50; i++) await Promise.resolve(); }
  return {
    context, state, root, search, form, card, fallback, logo, document, images, settle,
    load() { context.loadInitialImages(); },
    get renders() { return renders; },
    fail(message = 'Photo indisponible <réessayer>') { requests.shift()({ error: { message } }); },
    succeed(url) { requests.shift()({ data: { url } }); }
  };
}

test('A delayed image failure only updates its hint and preserves search, focus, form, and fallback logo', async () => {
  const app = harness();
  const originalChildren = [...app.root.children];
  app.load();
  app.search.value = 'cacao équitable';
  app.form.draft = 'Texte saisi pendant le chargement';
  app.fail(); await app.settle();
  assert.equal(app.renders, 0);
  assert.deepEqual(app.root.children, originalChildren);
  assert.equal(app.search.value, 'cacao équitable');
  assert.equal(app.search.selectionStart, 3);
  assert.equal(app.document.activeElement, app.search);
  assert.equal(app.form.draft, 'Texte saisi pendant le chargement');
  assert.equal(app.fallback.querySelector('.af-fb-logo'), app.logo);
  assert.equal(app.logo.src, 'logo.svg?v=2');
  assert.equal(app.fallback.querySelector('.af-fb-hint').textContent, 'Photo non chargée (visible par vous seul) : Photo indisponible <réessayer>');
  app.load(); app.fail('Toujours indisponible'); await app.settle();
  assert.equal(app.fallback.querySelectorAll('.af-fb-hint').length, 1);
  assert.equal(app.renders, 0);
});

test('An image failure for a filtered or absent card does not rebuild the page', async () => {
  const app = harness({ visible: false });
  app.load(); app.fail(); await app.settle();
  assert.equal(app.renders, 0);
  assert.equal(app.search.value, 'cacao');
  assert.equal(app.form.draft, 'Description non enregistrée');
  assert.equal(app.fallback.querySelector('.af-fb-hint'), null);
});

test('Image diagnostics remain restricted to administrators', async () => {
  const app = harness({ admin: false });
  app.load(); app.fail(); await app.settle();
  assert.equal(app.fallback.querySelector('.af-fb-hint'), null);
  assert.equal(app.renders, 0);
});

test('Results from a previous catalogue or account context do not change the current cards', async () => {
  for (const change of [app => app.context.catalogRequest++, app => { app.state.context = { kind: 'public' }; }]) {
    const app = harness();
    app.load(); change(app); app.fail(); await app.settle();
    assert.equal(app.fallback.querySelector('.af-fb-hint'), null);
    assert.equal(app.renders, 0);
    app.load(); change(app); app.succeed('https://example.test/previous-photo.jpg'); await app.settle();
    assert.equal(app.state.imgs.cacao, undefined);
    assert.equal(app.card.querySelector('.af-photo'), null);
  }
});

test('A successful media request still applies its photo without replacing surrounding content', async () => {
  const app = harness();
  app.load(); app.succeed('https://example.test/cacao.jpg'); await app.settle();
  assert.equal(app.state.imgs.cacao, 'https://example.test/cacao.jpg');
  const photo = app.images.find(image => image.className === 'af-photo');
  assert.ok(photo);
  assert.equal(app.fallback.isConnected, true, 'Keep the fallback until the photo has loaded');
  photo.onload();
  assert.equal(app.card.querySelector('.af-photo'), photo);
  assert.equal(app.fallback.isConnected, false);
  assert.equal(app.root.children[0], app.search);
  assert.equal(app.form.draft, 'Description non enregistrée');
  assert.equal(app.renders, 0);
});
