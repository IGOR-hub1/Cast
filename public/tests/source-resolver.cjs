const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../assets/source-resolver.js'), 'utf8');
const window = {};
vm.runInNewContext(source, { window, URL });
const resolve = window.XBunnyCastSourceResolver.resolve;
const session = { animeId: 'demo', episodeId: 'flower', sourceId: 'mdn' };
const entry = {
  ...session,
  title: 'Amostra pública MDN', episodeTitle: 'Flor',
  externalPlaybackAllowed: true,
  allowedCastOrigins: ['https://cast.example'],
  allowedMediaOrigins: ['https://mdn.github.io'],
  kind: 'mp4',
  variants: [{ label: 'Original', url: 'https://mdn.github.io/shared-assets/videos/flower.mp4' }]
};
const catalog = { version: 1, entries: [entry] };

assert.equal(resolve(session, catalog, 'https://cast.example').ok, true);
assert.equal(resolve(session, { version: 1, entries: [] }, 'https://cast.example').reason, 'source-unconfigured');
assert.equal(resolve(session, { version: 1, entries: [{ ...entry, externalPlaybackAllowed: false }] }, 'https://cast.example').reason, 'external-playback-blocked');
assert.equal(resolve(session, catalog, 'https://outro.example').reason, 'cast-domain-blocked');
assert.equal(resolve({ ...session, episodeId: 'outro' }, catalog, 'https://cast.example').reason, 'source-unconfigured');
assert.equal(resolve(session, { version: 1, entries: [{ ...entry, variants: [{ label: 'Original', url: 'https://mdn.github.io/shared-assets/videos/flower.mp4?token=secret' }] }] }, 'https://cast.example').reason, 'source-not-authorized');
assert.equal(resolve(session, { version: 1, entries: [{ ...entry, variants: [{ label: 'Original', url: 'https://outro.example/flower.mp4' }] }] }, 'https://cast.example').reason, 'source-not-authorized');
assert.equal(resolve(session, { version: 1, entries: [{ ...entry, kind: 'hls', variants: [{ label: 'Auto', url: 'https://mdn.github.io/shared-assets/videos/flower.mp4' }] }] }, 'https://cast.example').reason, 'source-not-authorized');
assert.equal(resolve({ ...session, sourceId: '../other' }, catalog, 'https://cast.example').reason, 'invalid-session');

console.log('Resolver OK: amostra MDN autorizada e bloqueios por domínio, fonte, formato e URL protegida.');
