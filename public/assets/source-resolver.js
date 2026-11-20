(function () {
  'use strict';

  const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
  const extension = { mp4: /\.(mp4|m4v|webm)$/i, hls: /\.m3u8$/i };

  function denied(reason) { return { ok: false, reason }; }

  function resolve(session, catalog, castOrigin) {
    if (!session || !idPattern.test(session.animeId) || !idPattern.test(session.episodeId) || !idPattern.test(session.sourceId)) {
      return denied('invalid-session');
    }
    if (!catalog || catalog.version !== 1 || !Array.isArray(catalog.entries)) return denied('catalog-unavailable');
    const item = catalog.entries.find(entry => entry.animeId === session.animeId && entry.episodeId === session.episodeId && entry.sourceId === session.sourceId);
    if (!item) return denied('source-unconfigured');
    if (item.externalPlaybackAllowed !== true) return denied('external-playback-blocked');
    if (!Array.isArray(item.allowedCastOrigins) || !item.allowedCastOrigins.includes(castOrigin)) return denied('cast-domain-blocked');
    if (!Array.isArray(item.allowedMediaOrigins) || !item.allowedMediaOrigins.length) return denied('source-unconfigured');
    if (!Object.prototype.hasOwnProperty.call(extension, item.kind) || !Array.isArray(item.variants) || !item.variants.length || item.variants.length > 8) {
      return denied('source-unconfigured');
    }
    if (item.kind === 'hls' && item.variants.length !== 1) return denied('source-unconfigured');

    const variants = [];
    for (const variant of item.variants) {
      if (!variant || typeof variant.label !== 'string' || !/^[- A-Za-z0-9]{1,24}$/.test(variant.label)) return denied('source-unconfigured');
      let parsed;
      try { parsed = new URL(variant.url); } catch { return denied('source-unconfigured'); }
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash ||
          !item.allowedMediaOrigins.includes(parsed.origin) || !extension[item.kind].test(parsed.pathname)) {
        return denied('source-not-authorized');
      }
      variants.push({ label: variant.label, url: parsed.href });
    }
    return {
      ok: true,
      kind: item.kind,
      variants,
      title: typeof item.title === 'string' ? item.title.slice(0, 120) : session.animeId,
      episodeTitle: typeof item.episodeTitle === 'string' ? item.episodeTitle.slice(0, 120) : session.episodeId
    };
  }

  window.XBunnyCastSourceResolver = Object.freeze({ resolve });
})();
