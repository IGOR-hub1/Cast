(function () {
  'use strict';

  const codePattern = /^(?:[1-9][0-9]{6}|[A-Za-z0-9_-]{32})$/;
  const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
  const maxLifetimeMs = 24 * 60 * 60 * 1000;
  const defaultLifetimeMs = 2 * 60 * 60 * 1000;
  let app;

  function database() {
    if (!window.firebase || !window.XBUNNY_CAST_FIREBASE_CONFIG) throw new Error('Firebase indisponível.');
    if (!app) app = firebase.initializeApp(window.XBUNNY_CAST_FIREBASE_CONFIG, 'xbunny-cast');
    return app.database();
  }

  function requireCode(code) {
    if (typeof code !== 'string' || !codePattern.test(code)) throw new Error('Código de sessão inválido.');
    return code;
  }

  function requireId(value, label) {
    if (typeof value !== 'string' || !idPattern.test(value)) throw new Error(label + ' inválido.');
    return value;
  }

  function makeCode() {
    if (!window.crypto || !window.crypto.getRandomValues) throw new Error('Gerador seguro indisponível.');
    const sample = new Uint32Array(1);
    const range = 9_000_000;
    const limit = Math.floor(4_294_967_296 / range) * range;
    do { window.crypto.getRandomValues(sample); } while (sample[0] >= limit);
    return String(1_000_000 + sample[0] % range);
  }

  async function serverNow(db) {
    const snapshot = await db.ref('.info/serverTimeOffset').once('value');
    return Date.now() + (Number(snapshot.val()) || 0);
  }

  function currentUser() {
    const user = app.auth().currentUser;
    if (!user || !user.emailVerified) throw new Error('Entre com uma conta de e-mail verificado.');
    return user;
  }

  async function createSession({ animeId, episodeId, sourceId, lifetimeMs = defaultLifetimeMs }) {
    requireId(animeId, 'Anime');
    requireId(episodeId, 'Episódio');
    requireId(sourceId, 'Fonte');
    if (!Number.isInteger(lifetimeMs) || lifetimeMs < 60_000 || lifetimeMs > maxLifetimeMs) {
      throw new Error('Duração da sessão inválida.');
    }

    const db = database();
    const user = currentUser();
    await user.getIdToken(true);
    const expiresAt = Math.floor(await serverNow(db) + lifetimeMs);
    let id;
    let committed = false;
    for (let attempt = 0; attempt < 8 && !committed; attempt++) {
      id = makeCode();
      const payload = {
        id, ownerUid: user.uid, animeId, episodeId, sourceId,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        expiresAt, status: 'active'
      };
      const result = await db.ref('castSessions/' + id).transaction(function (current) {
        return current === null ? payload : undefined;
      }, undefined, false);
      committed = result.committed === true;
    }
    if (!committed) throw new Error('Não foi possível reservar um código. Tente novamente.');
    return { id, url: window.location.origin + '/assistir/' + id, expiresAt };
  }

  function validSession(value, code, now) {
    return value && value.id === code && value.status === 'active' &&
      typeof value.expiresAt === 'number' && value.expiresAt > now &&
      idPattern.test(value.animeId) && idPattern.test(value.episodeId) && idPattern.test(value.sourceId);
  }

  async function getSession(code) {
    requireCode(code);
    const db = database();
    const snapshot = await db.ref('castSessions/' + code).once('value');
    const value = snapshot.val();
    if (!validSession(value, code, await serverNow(db))) return null;
    return value;
  }

  function observeSession(code, onState) {
    requireCode(code);
    if (typeof onState !== 'function') throw new TypeError('Callback obrigatório.');
    const db = database();
    const ref = db.ref('castSessions/' + code);
    let stopped = false;
    let timer = null;
    let offset = 0;
    let lastValue = null;

    function report(value) {
      if (stopped) return;
      lastValue = value;
      if (timer) window.clearTimeout(timer);
      const now = Date.now() + offset;
      if (!value || value.id !== code) return onState({ state: 'invalid' });
      if (value.status === 'ended') return onState({ state: 'ended' });
      if (value.expiresAt <= now) return onState({ state: 'expired' });
      if (!validSession(value, code, now)) return onState({ state: 'unavailable' });
      onState({ state: 'active', session: value });
      timer = window.setTimeout(function () { report(lastValue); }, Math.max(0, value.expiresAt - now));
    }

    function failed() {
      if (timer) window.clearTimeout(timer);
      if (!stopped) onState({ state: 'unavailable' });
    }

    function onSnapshot(snapshot) { report(snapshot.val()); }
    ref.on('value', onSnapshot, failed);
    db.ref('.info/serverTimeOffset').once('value').then(function (snapshot) {
      offset = Number(snapshot.val()) || 0;
      if (lastValue) report(lastValue);
    }).catch(function () { /* As regras e o relógio do servidor ainda validam a leitura. */ });

    return function () {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      ref.off('value', onSnapshot);
    };
  }

  async function endSession(code) {
    requireCode(code);
    const db = database();
    const user = currentUser();
    await user.getIdToken(true);
    await db.ref('castSessions/' + code + '/status').set('ended');
  }

  async function deleteSession(code) {
    requireCode(code);
    const db = database();
    const user = currentUser();
    await user.getIdToken(true);
    await db.ref('castSessions/' + code).remove();
  }

  window.XBunnyCastSessions = Object.freeze({ makeCode, createSession, getSession, observeSession, endSession, deleteSession });
})();
