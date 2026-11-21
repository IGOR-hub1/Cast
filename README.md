# X-Bunny Cast

Site independente do X-Bunny Animes, preparado para `https://cast-anime.vercel.app/assistir/CODIGO` e para navegadores de TVs antigas. A página de entrada e a resposta de reprodução não carregam JavaScript, Firebase SDK ou bibliotecas de player no navegador.

## Como funciona

1. O aplicativo principal cria uma sessão em `castSessions/CODIGO` no Firebase Realtime Database `animes-64408`.
2. A rota `/assistir/CODIGO` chama a função `api/watch.js` na Vercel. O formulário da página inicial chama a mesma função com `?code=CODIGO`.
3. A função lê **somente** `castSessions/CODIGO.json` pela API REST pública do Realtime Database, sem credencial administrativa. Valida ID, status, expiração, anime, episódio e fonte.
4. Para `serv01_iframe`, valida o formato exato da URL e redireciona a aba para a página original do provedor. O provedor bloqueia sua incorporação no domínio Cast. A URL não aparece na interface do Cast.
5. Para MP4, WebM ou HLS direto, procura uma correspondência em `assets/playback-catalog.json`, exige permissão para reprodução externa e entrega `<video controls>` nativo. O catálogo vem vazio; cadastre apenas URLs autorizadas.

Uma sessão encerrada ou expirada não abre mais pelo link Cast. Uma aba já aberta no provedor não pode ser encerrada pelo Cast. O Cast não faz scraping, proxy, download nem contorna CORS, DRM ou restrições do provedor.

## Arquivos

- `index.html` e `assets/styles.css`: entrada e visual preto/roxo sem scripts.
- `api/watch.js`: consulta pontual, validação e resposta HTML ou redirecionamento.
- `assets/playback-catalog.json`: catálogo opcional de mídia direta autorizada.
- `vercel.json`: encaminha `/assistir/CODIGO` à função.
- `tests/*.cjs`: testes locais da rota, sessão, fonte e regras.

As regras do banco continuam no arquivo compartilhado `../API ANIMES E CHAT/database.rules.json`. Este projeto não substitui nem publica essas regras. A leitura pública é limitada a um código conhecido; a coleção inteira não pode ser listada. As regras devem estar implantadas no Firebase para a função ler uma sessão.

## Publicação

Na Vercel, crie ou atualize um projeto separado com **Root Directory = `XBunny-Cast-Server`**, Framework Preset **Other**, sem comando de build. Associe `cast-anime.vercel.app` ao projeto. A pasta `api` é publicada como função Node e o `vercel.json` ativa as rotas. Publicar somente `index.html` em hospedagem estática não executa a consulta.

O comando `npm start` da raiz do repositório inicia o site principal, não a função Vercel do Cast. Para executar o Cast localmente com a função, use o ambiente de desenvolvimento da Vercel apontando para esta pasta. Esta alteração não foi publicada automaticamente.

Para mudar o domínio Cast, ajuste também `public/cast-share-config.js` no aplicativo principal. As URLs de fontes diretas no catálogo precisam permitir o novo domínio.

## Fonte direta opcional

Cada entrada de `assets/playback-catalog.json` relaciona `animeId`, `episodeId` e `sourceId` da sessão com uma URL HTTPS direta. Exemplo de formato, com endereços fictícios:

```json
{
  "version": 1,
  "entries": [{
    "animeId": "anime_1",
    "episodeId": "ep_1",
    "sourceId": "primary",
    "externalPlaybackAllowed": true,
    "allowedCastOrigins": ["https://cast-anime.vercel.app"],
    "allowedMediaOrigins": ["https://media.example"],
    "kind": "mp4",
    "title": "Anime",
    "episodeTitle": "Episódio 1",
    "variants": [{ "label": "720p", "url": "https://media.example/ep1.mp4" }]
  }]
}
```

O identificador também precisa estar autorizado em `castAuthorizedSources/{animeId}/{episodeId}/{sourceId}` no Firebase. Não inclua URLs com tokens, credenciais, DRM ou exigência de cabeçalhos secretos.

## Testes

Na raiz do repositório:

```text
node --test XBunny-Cast-Server/tests/*.cjs
node --test scripts/cast-share.test.js
```

Se esta pasta estiver em um repositório separado, execute `node --test tests/*.cjs`. O teste das regras só roda quando o arquivo de regras do aplicativo principal estiver disponível ao lado desta pasta.

Compatibilidade total com PS3 ou toda TV antiga não pode ser garantida: TLS, JavaScript e codecs da página do provedor são controlados pelo navegador e pelo provedor. A simplificação remove do **Cast** a dependência de JavaScript moderno e do SDK Firebase no dispositivo.
