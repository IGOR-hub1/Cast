# X-Bunny Cast

Interface independente para links de reprodução compartilhados pelo X-Bunny Animes. O Cast consulta sessões no **Firebase Realtime Database do projeto `animes-64408`**. A página recebe `/assistir/CODIGO`, verifica a sessão, resolve uma fonte direta explicitamente autorizada e inicia o episódio no player. Não busca, baixa, extrai nem retransmite vídeos.

As regras compartilhadas ficam em `../API ANIMES E CHAT/database.rules.json`, o arquivo já indicado pelo `firebase.json` do repositório principal. Somente os caminhos `castSessions` e `castAuthorizedSources` foram acrescentados. Os demais caminhos e permissões existentes foram preservados. As regras **não foram publicadas** no Firebase nesta etapa; até sua aplicação, o banco continuará negando as novas operações.

## Arquivos

- `index.html` — página inicial e campo para abrir um link ou código.
- `assistir/index.html` — página de reprodução com carregamento, espaço do player e erro para links inválidos.
- `assets/styles.css` — identidade visual responsiva.
- `assets/app.js` — navegação e estados da interface, sem pacotes adicionais.
- `assets/firebase-config.js` — configuração pública do mesmo aplicativo Web Firebase, sem credenciais administrativas.
- `assets/session-store.js` — criação, consulta pontual, observação, encerramento e exclusão de sessões.
- `assets/playback-catalog.js` — catálogo estático de URLs diretas permitidas; começa vazio até receber fontes reais autorizadas.
- `assets/source-resolver.js` — verifica a associação exata de anime, episódio e fonte, domínio Cast e origem da mídia.
- `assets/player.js` — player HTML5 com controles, MP4/WebM, HLS nativo ou hls.js quando compatível.
- `assets/favicon.svg` — marca vetorial do projeto.
- `vercel.json` — rota estática para a Vercel.
- `tests/*.cjs` — verificações locais da interface, do cliente e das expressões de segurança, sem dependências.

## Estrutura no Realtime Database

```text
castAuthorizedSources/{animeId}/{episodeId}/{sourceId}: true
castSessions/{codigo}: {
  id, ownerUid, animeId, episodeId, sourceId,
  createdAt, expiresAt, status
}
```

`castAuthorizedSources` é um registro de **identificadores**, não de URLs. Somente administradores com conta válida podem escrever seus marcadores. Antes de criar uma sessão, o identificador da fonte precisa estar registrado sob o anime e episódio correspondentes. Uma fonte retirada desse registro deixa de autorizar a leitura das sessões que a referenciam.

O cliente gera o código com `crypto.getRandomValues` (24 bytes, 192 bits) e usa 32 caracteres em Base64 URL. A criação exige um usuário autenticado com e-mail verificado, não banido, não bloqueado e com autenticação não revogada. A sessão é gravada no caminho do próprio código, com horário de criação do servidor e duração máxima de 24 horas. O proprietário pode encerrá-la ou excluí-la; não pode trocar o dono, a fonte, o episódio, o anime ou prolongar sua validade. A leitura de um código conhecido permite distinguir sessão ativa, encerrada ou expirada; somente sessões ativas são enviadas ao player. A leitura de `castSessions` como coleção permanece negada.

Nenhum token de autenticação, chave administrativa ou URL de mídia entra nos dados da sessão. A configuração Web Firebase em `assets/firebase-config.js` contém apenas identificadores públicos necessários ao SDK. Não há botão **Transmitir** no aplicativo nem interface de login/criação no Cast nesta etapa; `XBunnyCastSessions.createSession(...)` já está disponível para a futura integração com um usuário Firebase autenticado.

## Fontes autorizadas e reprodução

Cadastre em `assets/playback-catalog.js` uma entrada para cada combinação exata de `animeId`, `episodeId` e `sourceId` registrada em `castAuthorizedSources`. Defina `externalPlaybackAllowed: true` somente após confirmar a permissão do provedor para o domínio do Cast. Informe `allowedCastOrigins` com o domínio final e `allowedMediaOrigins` com as origens exatas da mídia. Use apenas URLs HTTPS diretas de MP4, WebM ou HLS (`.m3u8`), sem parâmetros, tokens, credenciais, DRM ou exigência de referer privado. Fontes sem essa permissão mostram uma mensagem clara; o Cast não usa o scraper, o proxy nem os iframes do aplicativo principal.

O player oferece play/pause, saltos de 10 segundos, volume, progresso, tempo, qualidade quando há variantes MP4 ou níveis HLS via hls.js, e tela cheia. O autoplay é tentado após carregar os metadados; quando o navegador o bloqueia, aparece **Iniciar reprodução**. MP4/WebM dependem do codec do dispositivo. HLS usa reprodução nativa quando disponível e hls.js nos navegadores com Media Source Extensions; Smart TVs sem esses recursos precisam de uma fonte MP4 compatível. O Cast não contorna CORS ou restrições do provedor.

## Aplicar as regras compartilhadas

Revise os dois novos caminhos no arquivo de regras existente e, quando decidir ativar as sessões, publique **o arquivo completo** apontado pelo `firebase.json` da raiz do repositório. Nunca publique apenas um fragmento de regras: isso substituiria as permissões atuais. A publicação não faz parte desta etapa. Após publicar, cadastre pelo Console do Firebase os identificadores de fontes autorizadas que poderão ser usados nas sessões.

## Publicar em domínio próprio com Vercel

1. Quando quiser publicar, crie **um novo projeto** na Vercel, independente do projeto X-Bunny Animes.
2. Importe este repositório e selecione `XBunny-Cast-Server` como **Root Directory** do novo projeto. Se enviar a pasta como repositório separado, use a raiz desse repositório.
3. Escolha **Framework Preset: Other**. Não configure comando de build nem diretório de saída; os arquivos HTML, CSS e JavaScript já são o site.
4. Conclua a publicação pelo painel da Vercel. Esta etapa de criação dos arquivos não publica o site.
5. Nas configurações do novo projeto, adicione seu domínio ou subdomínio (por exemplo, `cast.seu-dominio.com`) e crie o registro DNS que a Vercel indicar. Use esse domínio nos links compartilhados pelo aplicativo.

A regra em `vercel.json` entrega `assistir/index.html` para `https://SEU-DOMINIO/assistir/CODIGO`. O JavaScript lê o código da URL e consulta somente `castSessions/CODIGO`. O código aceito tem exatamente 32 caracteres: letras, números, `_` ou `-`. URLs com outro domínio, parâmetros ou fragmentos não são aceitas no campo da página inicial.

## Verificação local

Execute, a partir desta pasta:

```text
node tests/smoke.cjs
node tests/session-store.cjs
node tests/rules.cjs
node tests/source-resolver.cjs
node tests/player.cjs
```

Os testes cobrem criação, consulta de um único código, expiração, encerramento, exclusão, acesso por outro usuário, fonte não autorizada, controles de mídia e preservação das regras anteriores. `tests/rules.cjs` avalia localmente as expressões adicionadas; antes da publicação, valide também as regras no **Firebase Local Emulator Suite** ou no simulador de regras do Console, pois o teste local não substitui a execução do mecanismo de regras do Firebase. `tests/browser-harness.cjs` serve uma sessão simulada com a amostra pública MP4 da MDN em `http://127.0.0.1:8765/assistir/Abcdefghijklmnopqrstuvwx12345678`, sem acessar o Firebase real. A amostra fica somente no teste, não no catálogo de produção.

O catálogo de produção permanece vazio porque ainda não foram informados IDs e URLs de episódios com permissão de reprodução externa. Nenhuma API de streaming ou backend privilegiado foi incluído nesta etapa.
