// Preview local com sessão simulada e fonte pública de teste. Nunca consulta o Firebase real.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const code = 'Abcdefghijklmnopqrstuvwx12345678';
const session = { id: code, animeId: 'demo', episodeId: 'flower', sourceId: 'mdn' };
const catalog = {
  version: 1,
  entries: [{
    ...session,
    title: 'Amostra pública MDN', episodeTitle: 'Flor',
    externalPlaybackAllowed: true,
    allowedCastOrigins: ['http://127.0.0.1:8765'],
    allowedMediaOrigins: ['https://mdn.github.io'],
    kind: 'mp4',
    variants: [{ label: 'Original', url: 'https://mdn.github.io/shared-assets/videos/flower.mp4' }]
  }]
};
let html = fs.readFileSync(path.join(root, 'assistir/index.html'), 'utf8');
html = html.replace(/\s*<script src="https:\/\/(?:www\.gstatic\.com\/firebasejs|cdn\.jsdelivr\.net)[^"]+" defer><\/script>/g, '');
html = html.replace('<script src="/assets/firebase-config.js" defer></script>', '<script src="/__fixture.js" defer></script>');
html = html.replace(/\s*<script src="\/assets\/(?:session-store|playback-catalog)\.js" defer><\/script>/g, '');
const fixture = 'window.XBUNNY_CAST_PLAYBACK_CATALOG=' + JSON.stringify(catalog) + ';\n' +
  'window.XBunnyCastSessions={observeSession:function(code,callback){setTimeout(function(){callback({state:"active",session:' + JSON.stringify(session) + '});},50);return function(){};}};';

http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname === '/assistir/' + code) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
    return;
  }
  if (pathname === '/__fixture.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    response.end(fixture);
    return;
  }
  const match = pathname.match(/^\/assets\/([A-Za-z0-9.-]+)$/);
  if (!match) { response.writeHead(404); response.end(); return; }
  const file = path.join(root, 'assets', match[1]);
  const type = match[1].endsWith('.css') ? 'text/css' : match[1].endsWith('.svg') ? 'image/svg+xml' : 'text/javascript';
  fs.readFile(file, (error, content) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
    response.end(content);
  });
}).listen(8765, '127.0.0.1', () => {
  console.log('Preview local: http://127.0.0.1:8765/assistir/' + code);
});
