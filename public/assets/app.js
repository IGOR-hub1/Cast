(function () {
  'use strict';

  const codePattern = /^(?:[1-9][0-9]{6}|[A-Za-z0-9_-]{32})$/;
  const providerPattern = /^https:\/\/serv01\.meusdoramas\.club\/#\/video\/[0-9]{1,12}\/[0-9]{1,4}\/[0-9]{1,4}\/$/;
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  function getCode(value) {
    const input = value.trim();
    if (!input) return null;

    let code = input;
    if (/^https?:\/\//i.test(input)) {
      let url;
      try { url = new URL(input); } catch { return null; }
      if (url.origin !== window.location.origin || url.search || url.hash) return null;
      const match = url.pathname.match(/^\/assistir\/([^/]+)\/?$/);
      if (!match) return null;
      code = match[1];
    } else if (input.startsWith('/')) {
      const match = input.match(/^\/assistir\/([^/]+)\/?$/);
      if (!match) return null;
      code = match[1];
    }

    try { code = decodeURIComponent(code); } catch { return null; }
    return codePattern.test(code) ? code : null;
  }

  function showWatchState(state, title, description) {
    document.getElementById('player-loading').hidden = state !== 'loading';
    document.getElementById('player-error').hidden = state !== 'error';
    document.getElementById('player-start').hidden = true;
    document.getElementById('player-status').textContent = state === 'error' ? 'Reprodução indisponível' : 'Verificando link';
    if (state === 'error') {
      document.getElementById('error-title').textContent = title;
      document.getElementById('error-description').textContent = description;
    }
    document.getElementById('watch-heading').textContent = title;
    document.getElementById('watch-description').textContent = description;
  }

  function sourceMessage(reason) {
    const messages = {
      'source-unconfigured': ['Fonte não configurada', 'Este episódio ainda não tem uma fonte direta autorizada para o X-Bunny Cast.'],
      'external-playback-blocked': ['Reprodução externa indisponível', 'Esta fonte não permite reprodução fora do aplicativo original.'],
      'cast-domain-blocked': ['Domínio não autorizado', 'A fonte não foi liberada para este domínio do X-Bunny Cast.'],
      'source-not-authorized': ['Fonte não autorizada', 'O endereço da mídia não atende aos requisitos de reprodução direta do Cast.'],
      'catalog-unavailable': ['Catálogo indisponível', 'Não foi possível consultar as fontes autorizadas nesta instalação.']
    };
    return messages[reason] || ['Fonte indisponível', 'Este episódio não possui uma fonte compatível com o Cast.'];
  }

  if (document.body.dataset.page === 'home') {
    const form = document.getElementById('open-link-form');
    const input = document.getElementById('cast-link');
    const error = document.getElementById('link-error');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      const code = getCode(input.value);
      if (!code) {
        error.textContent = 'Insira um código ou link válido deste domínio.';
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      window.location.assign('/assistir/' + encodeURIComponent(code));
    });
    input.addEventListener('input', function () {
      error.hidden = true;
      input.removeAttribute('aria-invalid');
    });
  }

  if (document.body.dataset.page === 'watch') {
    const route = window.location.pathname.match(/^\/assistir\/([^/]+)\/?$/);
    const code = route ? getCode('/assistir/' + route[1]) : null;
    if (!code) {
      showWatchState('error', 'Este link não pôde ser aberto', 'Confira se o endereço contém um código válido e tente novamente.');
      return;
    }

    if (!window.XBunnyCastSessions || !window.XBunnyCastSourceResolver || !window.XBunnyCastPlayer) {
      showWatchState('error', 'Serviço indisponível', 'Não foi possível conectar ao X-Bunny Cast. Atualize a página e tente novamente.');
      return;
    }

    const player = window.XBunnyCastPlayer.create({
      onError: function (message) { showWatchState('error', 'Não foi possível reproduzir', message); }
    });
    let currentSessionKey = '';
    let pending;
    try {
      pending = window.setTimeout(function () {
        showWatchState('error', 'Conexão demorada', 'Não foi possível verificar a sessão agora. Atualize a página e tente novamente.');
      }, 12000);
      const stop = window.XBunnyCastSessions.observeSession(code, function (result) {
        window.clearTimeout(pending);
        pending = null;
        if (result.state === 'active') {
          const session = result.session;
          const key = session.animeId + '/' + session.episodeId + '/' + session.sourceId;
          if (currentSessionKey === key) return;
          if (session.sourceId === 'serv01_iframe') {
            player.stop();
            if (typeof session.iframeUrl !== 'string' || !providerPattern.test(session.iframeUrl)) {
              showWatchState('error', 'Fonte inválida', 'O endereço recebido não é uma fonte reconhecida.');
              return;
            }
            currentSessionKey = key;
            showWatchState('error', 'Player indisponível neste domínio', 'O provedor deste episódio bloqueia a reprodução dentro do X-Bunny Cast.');
            return;
          }
          const source = window.XBunnyCastSourceResolver.resolve(session, window.XBUNNY_CAST_PLAYBACK_CATALOG, window.location.origin);
          if (!source.ok) {
            player.stop();
            const message = sourceMessage(source.reason);
            showWatchState('error', message[0], message[1]);
            return;
          }
          currentSessionKey = key;
          document.getElementById('watch-heading').textContent = source.title;
          document.getElementById('watch-description').textContent = source.episodeTitle;
          document.title = source.title + ' • ' + source.episodeTitle + ' — X-Bunny Cast';
          document.getElementById('player-error').hidden = true;
          player.load(source);
        } else if (result.state === 'expired') {
          player.stop();
          showWatchState('error', 'Sessão expirada', 'Peça um novo link no X-Bunny Animes.');
        } else if (result.state === 'ended') {
          player.stop();
          showWatchState('error', 'Sessão encerrada', 'Esta transmissão foi encerrada pelo proprietário.');
        } else if (result.state === 'invalid') {
          player.stop();
          showWatchState('error', 'Sessão não encontrada', 'Confira o código do link ou peça um novo compartilhamento.');
        } else {
          player.stop();
          showWatchState('error', 'Sessão indisponível', 'O link pode ter expirado, sido encerrado ou ainda não existir.');
        }
      });
      window.addEventListener('pagehide', function () {
        window.clearTimeout(pending);
        stop();
        player.stop();
      }, { once: true });
    } catch {
      window.clearTimeout(pending);
      player.stop();
      showWatchState('error', 'Serviço indisponível', 'Não foi possível conectar ao X-Bunny Cast. Atualize a página e tente novamente.');
    }
  }
})();
