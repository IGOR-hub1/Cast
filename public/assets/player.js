(function () {
  'use strict';

  function create(options) {
    const el = id => document.getElementById(id);
    const video = el('cast-video');
    const card = document.querySelector('.player-card');
    const loading = el('player-loading');
    const loadingText = el('player-loading-text');
    const start = el('player-start');
    const controls = el('player-controls');
    const status = el('player-status');
    const playButton = el('toggle-play');
    const playIcon = el('play-icon');
    const progress = el('progress');
    const currentTime = el('current-time');
    const duration = el('duration');
    const volume = el('volume');
    const qualityWrap = el('quality-wrap');
    const quality = el('quality');
    let descriptor = null;
    let hls = null;
    let generation = 0;
    let watchdog = null;
    let resume = null;
    let qualityMode = '';

    function time(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
      const whole = Math.floor(seconds);
      const minutes = Math.floor(whole / 60);
      const hours = Math.floor(minutes / 60);
      const two = value => String(value).padStart(2, '0');
      return hours ? hours + ':' + two(minutes % 60) + ':' + two(whole % 60) : two(minutes) + ':' + two(whole % 60);
    }

    function updateTime() {
      const length = Number.isFinite(video.duration) ? video.duration : 0;
      currentTime.textContent = time(video.currentTime);
      duration.textContent = time(length);
      progress.max = String(length || 100);
      progress.value = String(Math.min(Number(video.currentTime) || 0, length || 100));
      progress.disabled = !length;
    }

    function updatePlay() {
      const paused = video.paused;
      playButton.setAttribute('aria-label', paused ? 'Reproduzir' : 'Pausar');
      playButton.title = paused ? 'Reproduzir' : 'Pausar';
      playIcon.innerHTML = paused ? '<path d="m8 5 12 7-12 7V5Z"/>' : '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';
    }

    function clearWatchdog() {
      if (watchdog) window.clearTimeout(watchdog);
      watchdog = null;
    }

    function fail(message) {
      if (!descriptor) return;
      stop();
      if (options && typeof options.onError === 'function') options.onError(message);
    }

    function attemptPlay() {
      if (!descriptor) return;
      const currentGeneration = generation;
      let result;
      try { result = video.play(); }
      catch (error) { return playRejected(error, currentGeneration); }
      if (result && typeof result.catch === 'function') result.catch(error => playRejected(error, currentGeneration));
    }

    function playRejected(error, currentGeneration) {
      if (!descriptor || currentGeneration !== generation) return;
      clearWatchdog();
      loading.hidden = true;
      if (error && error.name === 'NotAllowedError') {
        start.hidden = false;
        status.textContent = 'Toque para iniciar';
      } else {
        fail('Este navegador não conseguiu reproduzir a fonte autorizada.');
      }
    }

    function addQuality(value, label) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      quality.appendChild(option);
    }

    function setVariantChoices(index) {
      qualityMode = 'variants';
      quality.replaceChildren();
      descriptor.variants.forEach((variant, choice) => addQuality(String(choice), variant.label));
      quality.value = String(index);
      qualityWrap.hidden = descriptor.variants.length < 2;
    }

    function setHlsChoices() {
      if (!hls || !hls.levels) return;
      qualityMode = 'hls';
      quality.replaceChildren();
      addQuality('auto', 'Automática');
      hls.levels.forEach((level, index) => addQuality(String(index), level.height ? level.height + 'p' : 'Nível ' + (index + 1)));
      quality.value = 'auto';
      qualityWrap.hidden = hls.levels.length < 2;
    }

    function attach(index, nextResume) {
      generation++;
      clearWatchdog();
      start.hidden = true;
      loading.hidden = false;
      loadingText.textContent = 'Carregando o episódio…';
      status.textContent = 'Carregando fonte';
      resume = nextResume;
      if (hls) { hls.destroy(); hls = null; }
      video.pause();
      video.removeAttribute('src');
      video.load();
      const variant = descriptor.variants[index];
      if (descriptor.kind === 'hls') {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = variant.url;
          video.load();
          qualityWrap.hidden = true;
        } else if (window.Hls && window.Hls.isSupported()) {
          try {
            hls = new window.Hls();
            hls.on(window.Hls.Events.MANIFEST_PARSED, setHlsChoices);
            hls.on(window.Hls.Events.ERROR, function (_event, data) {
              if (data && data.fatal) fail('A transmissão HLS não pôde ser aberta neste domínio ou dispositivo.');
            });
            hls.loadSource(variant.url);
            hls.attachMedia(video);
          } catch (_) {
            fail('A transmissão HLS não pôde ser iniciada neste navegador.');
            return;
          }
        } else {
          fail('Este navegador não oferece reprodução HLS compatível.');
          return;
        }
      } else {
        const mime = /\.webm$/i.test(variant.url) ? 'video/webm' : 'video/mp4';
        if (!video.canPlayType(mime)) {
          fail('Este navegador não oferece suporte ao formato desta fonte.');
          return;
        }
        video.src = variant.url;
        video.load();
        setVariantChoices(index);
      }
      watchdog = window.setTimeout(function () {
        fail('A fonte não respondeu. Verifique se ela permite reprodução neste domínio.');
      }, 20000);
    }

    function load(nextDescriptor) {
      stop();
      descriptor = nextDescriptor;
      video.hidden = false;
      controls.hidden = false;
      video.controls = /SmartTV|Tizen|Web0S|HbbTV|BRAVIA|AFT/i.test(window.navigator && window.navigator.userAgent || '');
      attach(0, { time: 0, play: true });
    }

    function stop() {
      generation++;
      clearWatchdog();
      descriptor = null;
      resume = null;
      if (hls) { hls.destroy(); hls = null; }
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.hidden = true;
      controls.hidden = true;
      start.hidden = true;
      qualityWrap.hidden = true;
      updateTime();
      updatePlay();
    }

    video.addEventListener('loadedmetadata', function () {
      if (!descriptor) return;
      if (resume) {
        const next = resume;
        resume = null;
        if (next.time > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(next.time, Math.max(0, video.duration - 0.5));
        if (next.play) attemptPlay();
      }
      updateTime();
    });
    video.addEventListener('loadeddata', function () { if (descriptor) { clearWatchdog(); loading.hidden = true; } });
    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('durationchange', updateTime);
    video.addEventListener('play', updatePlay);
    video.addEventListener('pause', updatePlay);
    video.addEventListener('playing', function () {
      if (!descriptor) return;
      clearWatchdog();
      loading.hidden = true;
      start.hidden = true;
      status.textContent = 'Reproduzindo';
      updatePlay();
    });
    video.addEventListener('waiting', function () {
      if (!descriptor) return;
      loadingText.textContent = 'Aguardando a fonte…';
      loading.hidden = false;
      status.textContent = 'Carregando';
      clearWatchdog();
      watchdog = window.setTimeout(function () {
        fail('A fonte parou de responder neste dispositivo ou domínio.');
      }, 20000);
    });
    video.addEventListener('ended', function () { status.textContent = 'Episódio concluído'; updatePlay(); });
    video.addEventListener('error', function () {
      if (descriptor && video.error) fail('A fonte não permite reprodução neste domínio ou está indisponível.');
    });

    el('start-playback').addEventListener('click', attemptPlay);
    playButton.addEventListener('click', function () { if (video.paused) attemptPlay(); else video.pause(); });
    el('seek-back').addEventListener('click', function () { if (descriptor) video.currentTime = Math.max(0, video.currentTime - 10); });
    el('seek-forward').addEventListener('click', function () {
      if (descriptor) video.currentTime = Math.min(Number.isFinite(video.duration) ? video.duration : video.currentTime + 10, video.currentTime + 10);
    });
    progress.addEventListener('input', function () { if (descriptor && Number.isFinite(video.duration)) video.currentTime = Number(progress.value); });
    volume.addEventListener('input', function () { video.volume = Number(volume.value); video.muted = Number(volume.value) === 0; });
    quality.addEventListener('change', function () {
      if (!descriptor) return;
      if (qualityMode === 'hls' && hls) hls.currentLevel = quality.value === 'auto' ? -1 : Number(quality.value);
      if (qualityMode === 'variants') attach(Number(quality.value), { time: video.currentTime, play: !video.paused });
    });
    el('fullscreen').addEventListener('click', function () {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      else if (card.requestFullscreen) {
        const request = card.requestFullscreen();
        if (request && typeof request.catch === 'function') request.catch(function () {});
      }
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    });

    updateTime();
    updatePlay();
    return Object.freeze({ load, stop });
  }

  window.XBunnyCastPlayer = Object.freeze({ create });
})();
