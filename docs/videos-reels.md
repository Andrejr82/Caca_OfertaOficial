# Vídeos Reels

`/videos-reels` é um fluxo separado de `/videos`. Ele resolve um link Shopee Video, consulta candidatos no programa de afiliados, escolhe o menor preço, cadastra a oferta quando necessário, cria links rastreados e drafts para Instagram/Facebook.

O worker usa `imported-reel-v1` e armazena somente o MP4 processado. Não gera capa, thumbnail, frame, narração ou vídeo motion. A publicação continua manual, separada por canal e condicionada à aprovação.

O worker local continua sendo um processo separado:

```powershell
python scripts/video-worker.py
```
