const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../assets/session-store.js'), 'utf8');
const originalConfigWindow = {};
const castConfigWindow = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/firebase-config.js'), 'utf8'), { window: originalConfigWindow });
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/firebase-config.js'), 'utf8'), { window: castConfigWindow });
for (const key of ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId']) {
  assert.equal(castConfigWindow.XBUNNY_CAST_FIREBASE_CONFIG[key], originalConfigWindow.DK_FIREBASE_CONFIG[key]);
}
const calls = [];
const records = new Map();
const timers = new Map();
let nextTimer = 1;
const user = { uid: 'owner_1', emailVerified: true, async getIdToken() { return 'test-token'; } };
const db = {
  ref(key) {
    return {
      async once() {
        calls.push(['read', key]);
        return { val: () => key === '.info/serverTimeOffset' ? 0 : records.get(key) ?? null };
      },
      async transaction(update) {
        const value = update(records.get(key) ?? null);
        if (value === undefined) return { committed: false };
        calls.push(['write', key, value]); records.set(key, value);
        return { committed: true };
      },
      async set(value) { calls.push(['write', key, value]); records.set(key, value); },
      async remove() { calls.push(['delete', key]); records.delete(key); },
      on(_event, callback) { calls.push(['observe', key]); callback({ val: () => records.get(key) ?? null }); },
      off() { calls.push(['stop', key]); }
    };
  }
};
const app = { database: () => db, auth: () => ({ currentUser: user }) };
const firebase = {
  initializeApp: () => app,
  database: { ServerValue: { TIMESTAMP: { '.sv': 'timestamp' } } }
};
const window = {
  firebase,
  XBUNNY_CAST_FIREBASE_CONFIG: { projectId: 'animes-64408' },
  crypto: webcrypto,
  btoa,
  location: { origin: 'https://cast.example' },
  setTimeout(callback) { const id = nextTimer++; timers.set(id, callback); return id; },
  clearTimeout(id) { timers.delete(id); }
};
vm.runInNewContext(source, { window, firebase, Uint8Array, Uint32Array, Date, Number, String, TypeError, Math });
const store = window.XBunnyCastSessions;

(async () => {
  const codes = new Set(Array.from({ length: 20 }, () => store.makeCode()));
  assert.equal(codes.size, 20);
  assert([...codes].every(code => /^[1-9][0-9]{6}$/.test(code)));

  const created = await store.createSession({ animeId: 'anime_1', episodeId: 'ep_2', sourceId: 'primary' });
  const key = 'castSessions/' + created.id;
  const payload = records.get(key);
  assert.equal(payload.id, created.id);
  assert.equal(payload.ownerUid, 'owner_1');
  assert.equal(payload.sourceId, 'primary');
  assert.equal(payload.status, 'active');
  assert.deepEqual(payload.createdAt, { '.sv': 'timestamp' });
  assert(payload.expiresAt > Date.now());
  assert(!JSON.stringify(payload).includes('https://'));
  assert.equal(created.url, 'https://cast.example/assistir/' + created.id);

  const found = await store.getSession(created.id);
  assert.equal(found.id, created.id);
  assert(!calls.some(([action, path]) => action === 'read' && path === 'castSessions'));

  const states = [];
  const stop = store.observeSession(created.id, event => states.push(event.state));
  assert(states.includes('active'));
  stop();
  assert(calls.some(([action, path]) => action === 'stop' && path === key));

  records.set(key, { ...payload, expiresAt: Date.now() - 1 });
  assert.equal(await store.getSession(created.id), null);
  await store.endSession(created.id);
  assert(calls.some(([action, path, value]) => action === 'write' && path === key + '/status' && value === 'ended'));
  await store.deleteSession(created.id);
  assert.equal(records.has(key), false);

  user.emailVerified = false;
  await assert.rejects(store.createSession({ animeId: 'anime_1', episodeId: 'ep_2', sourceId: 'primary' }));
  console.log('Session store OK: códigos, criação, consulta individual, expiração, encerramento e exclusão.');
})().catch(error => { console.error(error); process.exitCode = 1; });
