/* Performance and dependency regression checks; no network or credentials required. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];

test('Every local JavaScript entrypoint referenced by the HTML exists', () => {
  for (const [, attrs] of scripts) {
    const src = /\bsrc=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!src || /^(?:https?:)?\/\//i.test(src)) continue;
    const clean = src.split(/[?#]/)[0].replace(/^\.\//, '');
    assert.ok(clean && !clean.startsWith('..'), 'Unexpected script URL: ' + src);
    assert.ok(fs.existsSync(path.join(root, clean)), 'Local script missing: ' + src);
  }
});

test('Inline JavaScript blocks parse successfully', () => {
  for (const [, attrs, body] of scripts) {
    if (/\bsrc\s*=/.test(attrs) || !body.trim()) continue;
    const type = /\btype=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (type && !['text/javascript', 'application/javascript'].includes(type.toLowerCase())) continue;
    assert.doesNotThrow(() => new vm.Script(body), 'Invalid inline JavaScript');
  }
});

test('HTML shell stays below the agreed refactor regression budget', () => {
  // Measure the canonical LF deployment payload, not Windows checkout CRLF overhead.
  // .gitattributes also keeps fresh checkouts of index.html in LF format.
  const bytes = Buffer.byteLength(html.replace(/\r\n/g, '\n'), 'utf8');
  assert.ok(bytes < 225_000,
    'index.html size exceeded 225 KB: ' + bytes + ' bytes. Extract logic rather than inlining it.');
});

test('Startup Market is not initialized twice in the HTML', () => {
  assert.equal((html.match(/\bsrc=["'][^"']*market\.js(?:\?[^"']*)?["']/g) || []).length, 1);
  assert.ok(!html.includes('window.afriMarketInitial();'), 'Market initialization unexpectedly duplicated in HTML');
});
