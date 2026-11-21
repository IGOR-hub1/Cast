'use strict';

// A função consulta só a sessão pedida. Não usa Admin SDK, scraper ou proxy de vídeo.
var DATABASE = 'https://animes-64408-default-rtdb.firebaseio.com';
var CODES = /^(?:[1-9][0-9]{6}|[A-Za-z0-9_-]{32})$/;
var IDS = /^[A-Za-z0-9_-]{1,128}$/;
var PROVIDER = /^https:\/\/serv01\.meusdoramas\.club\/#\/video\/[0-9]{1,12}\/[0-9]{1,4}\/[0-9]{1,4}\/$/;
var catalog = require('../assets/playback-catalog.json');

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}

function codeFrom(value, host) {
  if (typeof value !== 'string') return null;
  value = value.replace(/^\s+|\s+$/g, '');
  if (/^https?:\/\//i.test(value)) {
    var link;
    try { link = new URL(value); } catch (_) { return null; }
    if (link.host.toLowerCase() !== String(host || '').toLowerCase() || link.search || link.hash) return null;
    value = link.pathname;
  }
  var route = value.match(/^\/assistir\/([^/]+)\/?$/);
  if (route) value = route[1];
  return CODES.test(value) ? value : null;
}

function requestCode(req) {
  var parsed;
  try { parsed = new URL(req.url, 'https://cast-anime.vercel.app'); } catch (_) { return null; }
  var query = req.query || {};
  var raw = query.codigo || query.code || parsed.searchParams.get('codigo') || parsed.searchParams.get('code');
  if (!raw) raw = parsed.pathname;
  return codeFrom(raw, req.headers && req.headers.host);
}

function sessionState(value, code, now) {
  if (!value || value.id !== code) return { state: 'invalid' };
  if (value.status === 'ended') return { state: 'ended' };
  if (typeof value.expiresAt !== 'number' || value.expiresAt <= now) return { state: 'expired' };
  if (value.status !== 'active' || !IDS.test(value.animeId || '') ||
      !IDS.test(value.episodeId || '') || !IDS.test(value.sourceId || '')) return { state: 'unavailable' };
  if (value.sourceId === 'serv01_iframe') {
    if (typeof value.iframeUrl !== 'string' || !PROVIDER.test(value.iframeUrl)) return { state: 'unavailable' };
    return { state: 'redirect', url: value.iframeUrl };
  }
  return { state: 'direct', animeId: value.animeId, episodeId: value.episodeId, sourceId: value.sourceId };
}

function mediaSource(session, origin, requestedQuality, sourceCatalog) {
  var data = sourceCatalog || catalog;
  if (!data || !Array.isArray(data.entries)) return null;
  for (var i = 0; i < data.entries.length; i++) {
    var entry = data.entries[i];
    if (!entry || entry.animeId !== session.animeId || entry.episodeId !== session.episodeId ||
        entry.sourceId !== session.sourceId) continue;
    if (entry.externalPlaybackAllowed !== true || !Array.isArray(entry.allowedCastOrigins) ||
        entry.allowedCastOrigins.indexOf(origin) < 0 || !Array.isArray(entry.allowedMediaOrigins) ||
        !Array.isArray(entry.variants) || entry.variants.length < 1 || entry.variants.length > 8) return null;
    var kind = entry.kind;
    if (kind !== 'mp4' && kind !== 'webm' && kind !== 'hls') return null;
    var index = /^[0-7]$/.test(String(requestedQuality || '')) ? Number(requestedQuality) : 0;
    if (index >= entry.variants.length) index = 0;
    var variants = [];
    for (var j = 0; j < entry.variants.length; j++) {
      var variant = entry.variants[j];
      var url;
      try { url = new URL(variant.url); } catch (_) { return null; }
      if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash ||
          entry.allowedMediaOrigins.indexOf(url.origin) < 0 ||
          !(kind === 'hls' ? /\.m3u8$/i : kind === 'webm' ? /\.webm$/i : /\.(?:mp4|m4v)$/i).test(url.pathname)) return null;
      variants.push({ label: String(variant.label || 'Qualidade ' + (j + 1)).slice(0, 24), url: url.href });
    }
    return { title: String(entry.title || 'Anime').slice(0, 120),
      episode: String(entry.episodeTitle || 'Episódio').slice(0, 120),
      kind: kind, variants: variants, selected: index };
  }
  return null;
}

function page(title, message, body) {
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="referrer" content="no-referrer"><title>' + escapeHtml(title) + ' — X-Bunny Cast</title>' +
    '<link rel="stylesheet" href="/assets/styles.css?v=4"></head><body>' +
    '<div class="site-shell"><div class="site-header"><a class="brand" href="/">X-Bunny <strong>Cast</strong></a></div>' +
    '<main class="watch-main"><div class="player-card"><div class="player-stage">' + (body ||
    '<div class="player-error"><strong>' + escapeHtml(title) + '</strong><p>' + escapeHtml(message) + '</p></div>') +
    '</div></div><div class="watch-info"><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(message) + '</p>' +
    '<a class="text-link" href="/">Voltar ao início</a></div></main></div></body></html>';
}

function directPage(source, code) {
  var variant = source.variants[source.selected];
  var video = '<video controls autoplay preload="metadata" playsinline src="' + escapeHtml(variant.url) + '">' +
    'Este navegador não suporta vídeo HTML5.</video>';
  if (source.variants.length > 1) {
    video += '<form class="quality-form" action="/assistir/' + escapeHtml(code) + '" method="get">' +
      '<label for="quality">Qualidade</label> <select id="quality" name="quality">';
    for (var i = 0; i < source.variants.length; i++) {
      video += '<option value="' + i + '"' + (i === source.selected ? ' selected' : '') + '>' +
        escapeHtml(source.variants[i].label) + '</option>';
    }
    video += '</select> <button type="submit">Mudar</button></form>';
  }
  return page(source.title, source.episode, video);
}

function sendPage(res, html) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; media-src https:; form-action 'self'; base-uri 'none'");
  res.end(html);
}

async function handler(req, res) {
  if (req.method !== 'GET') return sendPage(res, page('Método indisponível', 'Abra o link em um navegador.'));
  var code = requestCode(req);
  if (!code) return sendPage(res, page('Código inválido', 'Digite os 7 números do link de compartilhamento.'));
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, 10000);
  var value;
  try {
    var response = await fetch(DATABASE + '/castSessions/' + code + '.json', { signal: controller.signal });
    if (!response.ok) return sendPage(res, page('Sessão indisponível', 'O Firebase recusou a consulta deste código.'));
    value = await response.json();
  } catch (_) {
    return sendPage(res, page('Falha de conexão', 'Não foi possível consultar a sessão no Firebase.'));
  } finally {
    clearTimeout(timer);
  }
  var state = sessionState(value, code, Date.now());
  if (state.state === 'redirect') {
    res.statusCode = 302;
    res.setHeader('Location', state.url);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return res.end();
  }
  if (state.state === 'invalid') return sendPage(res, page('Sessão não encontrada', 'Confira o código no X-Bunny Animes.'));
  if (state.state === 'ended') return sendPage(res, page('Sessão encerrada', 'O compartilhamento foi encerrado pelo proprietário.'));
  if (state.state === 'expired') return sendPage(res, page('Sessão expirada', 'Gere um novo código no X-Bunny Animes.'));
  if (state.state !== 'direct') return sendPage(res, page('Sessão indisponível', 'Os dados deste link não são válidos.'));
  var origin = 'https://' + String(req.headers && req.headers.host || '').toLowerCase();
  var parsed;
  try { parsed = new URL(req.url, origin); } catch (_) { parsed = null; }
  var source = mediaSource(state, origin, parsed && parsed.searchParams.get('quality'));
  if (!source) return sendPage(res, page('Fonte indisponível', 'Este episódio não tem uma fonte direta autorizada para o Cast.'));
  return sendPage(res, directPage(source, code));
}

module.exports = handler;
module.exports._test = { codeFrom: codeFrom, requestCode: requestCode, sessionState: sessionState,
  mediaSource: mediaSource, page: page, directPage: directPage };
