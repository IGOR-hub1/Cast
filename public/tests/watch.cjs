'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/watch.js');
const helpers = handler._test;

const code = '1234567';
const provider = 'https://serv01.meusdoramas.club/#/video/126971/1/3/';
function session(changes) {
  return Object.assign({ id: code, ownerUid: 'owner_1', animeId: 'md_126971',
    episodeId: 's1_e3', sourceId: 'serv01_iframe', iframeUrl: provider,
    createdAt: Date.now() - 1000, expiresAt: Date.now() + 60000, status: 'active' }, changes);
}
async function visit(url, value, responseOk) {
  const oldFetch = global.fetch;
  const paths = [];
  global.fetch = async (target) => {
    paths.push(target);
    return { ok: responseOk !== false, json: async () => value };
  };
  const headers = {};
  const res = { statusCode: 200, setHeader(name, value) { headers[name] = value; },
    end(body) { this.body = body || ''; } };
  try { await handler({ method: 'GET', url, headers: { host: 'cast-anime.vercel.app' } }, res); }
  finally { global.fetch = oldFetch; }
  return { res, headers, paths };
}

test('código de 7 dígitos e link completo são aceitos; host e entrada maliciosa são recusados', () => {
  assert.equal(helpers.codeFrom(code, 'cast-anime.vercel.app'), code);
  assert.equal(helpers.requestCode({ url: '/api/watch', query: { codigo: code }, headers: { host: 'cast-anime.vercel.app' } }), code);
  assert.equal(helpers.codeFrom('Abcdefghijklmnopqrstuvwx12345678', 'cast-anime.vercel.app'), 'Abcdefghijklmnopqrstuvwx12345678');
  assert.equal(helpers.codeFrom('https://cast-anime.vercel.app/assistir/' + code, 'cast-anime.vercel.app'), code);
  assert.equal(helpers.codeFrom('https://outro.example/assistir/' + code, 'cast-anime.vercel.app'), null);
  assert.equal(helpers.codeFrom('../castSessions', 'cast-anime.vercel.app'), null);
  assert.equal(helpers.codeFrom('<script>', 'cast-anime.vercel.app'), null);
});

test('consulta só a sessão pedida e redireciona fonte validada', async () => {
  const result = await visit('/api/watch?code=' + code, session());
  assert.deepEqual(result.paths, ['https://animes-64408-default-rtdb.firebaseio.com/castSessions/' + code + '.json']);
  assert.equal(result.res.statusCode, 302);
  assert.equal(result.headers.Location, provider);
  assert.equal(result.headers['Cache-Control'], 'no-store');
});

test('sessão ausente, encerrada e expirada exibem motivo sem redirecionar', async () => {
  const cases = [[null, 'Sessão não encontrada'], [session({ status: 'ended' }), 'Sessão encerrada'],
    [session({ expiresAt: Date.now() - 1000 }), 'Sessão expirada']];
  for (const [value, title] of cases) {
    const result = await visit('/api/watch?code=' + code, value);
    assert.equal(result.res.statusCode, 200);
    assert.match(result.res.body, new RegExp(title));
    assert.equal(result.headers.Location, undefined);
  }
});

test('URL de outro provedor e leitura recusada nunca redirecionam', async () => {
  const bad = await visit('/api/watch?code=' + code, session({ iframeUrl: 'https://evil.example/#/video/126971/1/3/' }));
  assert.match(bad.res.body, /Sessão indisponível/);
  assert.equal(bad.headers.Location, undefined);
  const denied = await visit('/api/watch?code=' + code, null, false);
  assert.match(denied.res.body, /Firebase recusou/);
  assert.equal(denied.headers.Location, undefined);
});

test('fonte direta autorizada gera vídeo nativo e texto escapado', () => {
  const state = helpers.sessionState(session({ sourceId: 'primary', iframeUrl: undefined }), code, Date.now());
  const catalog = { entries: [{ animeId: 'md_126971', episodeId: 's1_e3', sourceId: 'primary',
    externalPlaybackAllowed: true, allowedCastOrigins: ['https://cast-anime.vercel.app'],
    allowedMediaOrigins: ['https://media.example'], kind: 'mp4', title: '<Anime>',
    episodeTitle: 'Episódio 3', variants: [{ label: '720p', url: 'https://media.example/ep.mp4' }] }] };
  const source = helpers.mediaSource(state, 'https://cast-anime.vercel.app', null, catalog);
  assert(source);
  const html = helpers.directPage(source, code);
  assert.match(html, /<video controls autoplay/);
  assert.match(html, /&lt;Anime&gt;/);
  assert.doesNotMatch(html, /<script/);
  catalog.entries[0].allowedMediaOrigins = ['https://other.example'];
  assert.equal(helpers.mediaSource(state, 'https://cast-anime.vercel.app', null, catalog), null);
});
