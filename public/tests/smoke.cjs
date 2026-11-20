const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');

function screen(page, pathname, resolved) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        hidden: false,
        textContent: '',
        value: '',
        listeners: {},
        attributes: {},
        addEventListener(type, callback) { this.listeners[type] = callback; },
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; },
        focus() { this.focused = true; }
      });
    }
    return elements.get(id);
  }

  const navigation = [];
  const document = { body: { dataset: { page } }, getElementById: element };
  const subscriptions = [];
  const playback = { loads: [], stops: 0 };
  const window = {
    location: { origin: 'https://cast.example', pathname, assign: url => navigation.push(url) },
    addEventListener() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    XBunnyCastSessions: { observeSession(code, callback) { subscriptions.push({ code, callback }); return () => {}; } },
    XBUNNY_CAST_PLAYBACK_CATALOG: { version: 1, entries: [] },
    XBunnyCastSourceResolver: { resolve() { return resolved || { ok: true, title: 'Anime', episodeTitle: 'Episódio', kind: 'mp4', variants: [{ url: 'https://media.example/ep.mp4' }] }; } },
    XBunnyCastPlayer: { create() { return { load(source) { playback.loads.push(source); }, stop() { playback.stops++; } }; } }
  };
  vm.runInNewContext(source, { document, window, URL, Date });
  return { element, navigation, subscriptions, playback };
}

let ui = screen('home', '/');
const code = 'Abcdefghijklmnopqrstuvwx12345678';
ui.element('cast-link').value = 'https://cast.example/assistir/' + code;
ui.element('open-link-form').listeners.submit({ preventDefault() {} });
assert.equal(ui.navigation[0], '/assistir/' + code);

ui = screen('home', '/');
ui.element('cast-link').value = 'https://outro.example/assistir/' + code;
ui.element('open-link-form').listeners.submit({ preventDefault() {} });
assert.equal(ui.navigation.length, 0);
assert.equal(ui.element('link-error').hidden, false);

ui = screen('watch', '/assistir/' + code);
assert.equal(ui.subscriptions[0].code, code);
ui.subscriptions[0].callback({ state: 'active', session: { animeId: 'anime_1', episodeId: 'episode_2', sourceId: 'primary' } });
assert.equal(ui.playback.loads.length, 1);
assert.equal(ui.element('watch-heading').textContent, 'Anime');
ui.subscriptions[0].callback({ state: 'expired' });
assert.equal(ui.element('player-error').hidden, false);
assert.equal(ui.element('watch-heading').textContent, 'Sessão expirada');
assert.equal(ui.playback.stops, 1);

ui = screen('watch', '/assistir/' + code);
ui.subscriptions[0].callback({ state: 'ended' });
assert.equal(ui.element('watch-heading').textContent, 'Sessão encerrada');

ui = screen('watch', '/assistir/' + code, { ok: false, reason: 'external-playback-blocked' });
ui.subscriptions[0].callback({ state: 'active', session: { animeId: 'anime_1', episodeId: 'episode_2', sourceId: 'primary' } });
assert.equal(ui.playback.loads.length, 0);
assert.equal(ui.element('watch-heading').textContent, 'Reprodução externa indisponível');

ui = screen('watch', '/assistir/%3Cscript%3E');
assert.equal(ui.element('player-error').hidden, false);
assert.equal(ui.subscriptions.length, 0);

const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
assert(config.rewrites.some(rule => rule.source === '/assistir/:codigo' && rule.destination === '/assistir/index.html'));

console.log('Smoke OK: formulário, rota válida, rota inválida e rewrite.');
