const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const file = path.join(__dirname, '../../API ANIMES E CHAT/database.rules.json');
const rules = JSON.parse(fs.readFileSync(file, 'utf8')).rules;
const originalRules = { ...rules };
delete originalRules.castSessions;
delete originalRules.castAuthorizedSources;
assert.equal(createHash('sha256').update(JSON.stringify(originalRules)).digest('hex'), 'a0f82363b08a730cc911e954584e7ab40446a08d018637cd483ed8bdbf327c9a');
const code = '1234567';
const legacyCode = 'Abcdefghijklmnopqrstuvwx12345678';
const now = 1_700_000_000_000;
const auth = uid => ({ uid, token: { email_verified: true, auth_time: 123 } });
const sourcePath = { anime_1: { ep_2: { primary: true } } };

class Snapshot {
  constructor(value) { this.value = value; }
  child(key) { return new Snapshot(this.value && typeof this.value === 'object' ? this.value[key] : undefined); }
  val() { return this.value === undefined ? null : this.value; }
  exists() { return this.value !== undefined && this.value !== null; }
  isString() { return typeof this.value === 'string'; }
  isNumber() { return typeof this.value === 'number' && Number.isFinite(this.value); }
  hasChildren(keys) { return keys.every(key => this.child(key).exists()); }
}

function evaluate(expression, { data, newData, root, user, extra = {} }) {
  if (typeof expression === 'boolean') return expression;
  const js = expression.replace(/\.matches\(/g, '.match(');
  return Boolean(vm.runInNewContext(js, {
    data: new Snapshot(data), newData: new Snapshot(newData), root: new Snapshot(root),
    auth: user, now, $code: code, $anime: 'anime_1', $episode: 'ep_2', $source: 'primary', ...extra
  }));
}

function rootData(session, overrides = {}) {
  return {
    users: { owner_1: { banned: false, blocked: false }, other_2: { banned: false, blocked: false } },
    admins: { admin_1: true }, revokedSessions: {}, castAuthorizedSources: sourcePath,
    castSessions: session ? { [code]: session } : {}, ...overrides
  };
}

function session() {
  return { id: code, ownerUid: 'owner_1', animeId: 'anime_1', episodeId: 'ep_2', sourceId: 'primary', createdAt: now, expiresAt: now + 7_200_000, status: 'active' };
}

const node = rules.castSessions.$code;
function write(before, after, user, root = rootData(before), sessionCode = code) {
  if (!evaluate(node['.write'], { data: before, newData: after, root, user, extra: { $code: sessionCode } })) return false;
  if (!after) return true;
  if (!evaluate(node['.validate'], { data: before, newData: after, root, user })) return false;
  for (const [key, value] of Object.entries(after)) {
    const field = node[key] || node.$other;
    if (!field || !evaluate(field['.validate'], {
      data: before?.[key], newData: value, root, user, extra: { $code: sessionCode }
    })) return false;
  }
  return true;
}
function read(value, root = rootData(value), sessionCode = code) {
  return evaluate(node['.read'], { data: value, root, extra: { $code: sessionCode } });
}

const active = session();
assert.equal(rules['.read'], false);
assert.equal(rules.castSessions['.read'], undefined);
assert.equal(read(active), true);
const legacy = { ...active, id: legacyCode };
assert.equal(read(legacy, rootData(legacy), legacyCode), true);
assert.equal(write(null, legacy, auth('owner_1'), rootData(null), legacyCode), false);
assert.equal(write(legacy, { ...legacy, status: 'ended' }, auth('owner_1'), rootData(legacy), legacyCode), true);
assert.equal(read({ ...active, expiresAt: now - 1 }), true);
assert.equal(read({ ...active, status: 'ended' }), true);
assert.equal(read(null), true);
assert.equal(read(active, rootData(active, { castAuthorizedSources: {} })), false);
assert.equal(write(null, active, auth('owner_1')), true);
assert.equal(write(null, active, null), false);
assert.equal(write(null, active, auth('other_2')), false);
assert.equal(write(null, { ...active, expiresAt: now - 1 }, auth('owner_1')), false);
assert.equal(write(null, { ...active, sourceId: 'unregistered' }, auth('owner_1')), false);
assert.equal(write(null, { ...active, url: 'https://protected.example' }, auth('owner_1')), false);
assert.equal(write(active, { ...active, status: 'ended' }, auth('owner_1')), true);
assert.equal(write(active, { ...active, status: 'ended' }, auth('other_2')), false);
assert.equal(write(active, { ...active, sourceId: 'unregistered', status: 'ended' }, auth('owner_1')), false);
assert.equal(write({ ...active, status: 'ended' }, active, auth('owner_1')), false);
assert.equal(write(active, null, auth('owner_1')), true);
assert.equal(write(active, null, auth('other_2')), false);
assert.equal(write(null, active, auth('owner_1'), rootData(null, { revokedSessions: { owner_1: { 123: true } } })), false);
assert.equal(write(null, active, auth('owner_1'), rootData(null, { users: { owner_1: { banned: true } } })), false);

const iframe = { ...active, animeId: 'md_126971', episodeId: 's1_e3', sourceId: 'serv01_iframe',
  iframeUrl: 'https://serv01.meusdoramas.club/#/video/126971/1/3/' };
const withoutCatalog = rootData(null, { castAuthorizedSources: {} });
assert.equal(write(null, iframe, auth('owner_1'), withoutCatalog), true);
assert.equal(read(iframe, rootData(iframe, { castAuthorizedSources: {} })), true);
assert.equal(write(iframe, { ...iframe, status: 'ended' }, auth('owner_1')), true);
assert.equal(write(iframe, { ...iframe, iframeUrl: 'https://serv01.meusdoramas.club/#/video/126971/1/4/', status: 'ended' }, auth('owner_1')), false);
assert.equal(write(null, { ...iframe, iframeUrl: 'https://evil.example/#/video/126971/1/3/' }, auth('owner_1'), withoutCatalog), false);
assert.equal(write(null, { ...iframe, iframeUrl: 'https://serv01.meusdoramas.club/#/video/126971/1/3/?token=secret' }, auth('owner_1'), withoutCatalog), false);

const registry = rules.castAuthorizedSources.$anime.$episode.$source;
assert.equal(evaluate(registry['.write'], { root: rootData(), user: auth('admin_1') }), true);
assert.equal(evaluate(registry['.write'], { root: rootData(), user: auth('owner_1') }), false);
assert.equal(evaluate(registry['.validate'], { newData: true }), true);
assert.equal(evaluate(registry['.validate'], { newData: 'https://protected.example' }), false);

console.log('Rules OK: leitura pontual, expiração, fonte registrada, dono, encerramento, exclusão e administrador.');
