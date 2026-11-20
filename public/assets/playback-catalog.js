// Cadastre aqui apenas URLs diretas de mídia com permissão explícita para o domínio Cast.
// Não inclua URLs assinadas, tokens, cabeçalhos privados, páginas de player ou fontes com DRM.
window.XBUNNY_CAST_PLAYBACK_CATALOG = Object.freeze({
  version: 1,
  entries: [
    // {
    //   animeId: 'anime_123', episodeId: 'ep_01', sourceId: 'fonte_publica',
    //   title: 'Nome do anime', episodeTitle: 'Episódio 1',
    //   externalPlaybackAllowed: true,
    //   allowedCastOrigins: ['https://cast.seu-dominio.com'],
    //   allowedMediaOrigins: ['https://midia.autorizada.example'],
    //   kind: 'mp4',
    //   variants: [{ label: '720p', url: 'https://midia.autorizada.example/anime/ep01-720.mp4' }]
    // }
  ]
});
