'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('entrada não depende de JavaScript nem do SDK Firebase no navegador', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<form[^>]*action="\/api\/watch"[^>]*method="get"/);
  assert.match(html, /name="code"/);
  assert.doesNotMatch(html, /<script|firebasejs|hls\.js/i);
  assert.equal(fs.existsSync(path.join(root, 'assistir/index.html')), false);
});

test('links de compartilhamento são enviados à função de consulta', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert(config.rewrites.some(rule => rule.source === '/assistir/:codigo' && rule.destination === '/api/watch'));
  assert(config.rewrites.some(rule => rule.source === '/assistir/:codigo/' && rule.destination === '/api/watch'));
  const css = fs.readFileSync(path.join(root, 'assets/styles.css'), 'utf8');
  assert.doesNotMatch(css, /display:\s*(?:grid|flex)|\bclamp\(/);
});
