const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../assets/player.js'), 'utf8');
class Node {
  constructor() { this.hidden = false; this.value = ''; this.textContent = ''; this.listeners = {}; this.children = []; this.attributes = {}; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  fire(type) { if (this.listeners[type]) this.listeners[type](); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; }
  appendChild(node) { this.children.push(node); }
  replaceChildren() { this.children = []; }
}
class Video extends Node {
  constructor() { super(); this.paused = true; this.duration = 120; this.currentTime = 0; this.volume = 1; this.muted = false; this.src = ''; this.error = null; this.playMode = 'ok'; }
  canPlayType(type) { return type === 'video/mp4' ? 'probably' : ''; }
  load() {}
  pause() { this.paused = true; this.fire('pause'); }
  play() {
    if (this.playMode === 'blocked') return Promise.reject({ name: 'NotAllowedError' });
    this.paused = false;
    this.fire('playing');
    return Promise.resolve();
  }
}
const nodes = new Map();
const video = new Video();
nodes.set('cast-video', video);
function element(id) { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); }
const card = new Node();
card.requestFullscreen = () => Promise.resolve();
const document = { getElementById: element, querySelector: () => card, createElement: () => new Node(), fullscreenElement: null };
const timers = new Map();
let nextTimer = 1;
const window = {
  navigator: { userAgent: 'Chrome' },
  setTimeout(callback) { const id = nextTimer++; timers.set(id, callback); return id; },
  clearTimeout(id) { timers.delete(id); }
};
vm.runInNewContext(source, { document, window, Number, String });
const errors = [];
const player = window.XBunnyCastPlayer.create({ onError: message => errors.push(message) });
const descriptor = {
  kind: 'mp4',
  variants: [
    { label: '720p', url: 'https://mdn.github.io/shared-assets/videos/flower.mp4' },
    { label: '480p', url: 'https://mdn.github.io/shared-assets/videos/flower-480.mp4' }
  ]
};

(async () => {
  player.load(descriptor);
  assert.equal(video.src, descriptor.variants[0].url);
  assert.equal(element('player-controls').hidden, false);
  assert.equal(element('quality-wrap').hidden, false);
  video.fire('loadedmetadata');
  assert.equal(video.paused, false);
  assert.equal(element('player-status').textContent, 'Reproduzindo');

  video.currentTime = 30;
  video.fire('timeupdate');
  assert.equal(element('current-time').textContent, '00:30');
  element('seek-back').fire('click');
  assert.equal(video.currentTime, 20);
  element('seek-forward').fire('click');
  assert.equal(video.currentTime, 30);
  element('volume').value = '0.25';
  element('volume').fire('input');
  assert.equal(video.volume, 0.25);
  element('progress').value = '42';
  element('progress').fire('input');
  assert.equal(video.currentTime, 42);
  element('toggle-play').fire('click');
  assert.equal(video.paused, true);

  video.currentTime = 42;
  element('quality').value = '1';
  element('quality').fire('change');
  assert.equal(video.src, descriptor.variants[1].url);
  video.fire('loadedmetadata');
  assert.equal(video.currentTime, 42);

  video.playMode = 'blocked';
  player.load(descriptor);
  video.fire('loadedmetadata');
  await Promise.resolve();
  assert.equal(element('player-start').hidden, false);
  video.playMode = 'ok';
  element('start-playback').fire('click');
  assert.equal(element('player-start').hidden, true);

  video.error = { code: 4 };
  video.fire('error');
  assert.equal(errors.length, 1);
  assert.equal(video.hidden, true);
  assert.equal(element('player-controls').hidden, true);
  console.log('Player OK: MP4, autoplay bloqueado, controles, qualidade e erro de mídia.');
})().catch(error => { console.error(error); process.exitCode = 1; });
