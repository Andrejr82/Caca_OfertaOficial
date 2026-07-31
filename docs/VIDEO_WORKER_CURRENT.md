# Worker de vídeos — operação atual

Documento operacional atual. O arquivo histórico da Lightning está em `archive/video-legacy/VIDEO_WORKER_LIGHTNING.md`.

## Runtime

`scripts/video-worker.py` busca jobs autorizados pelas rotas `/api/videos/worker/*`, gera TTS, renderiza vídeo vertical e pode executar lip-sync MuseTalk. O worker pode rodar em Colab, GPU externa ou outro host compatível; Lightning AI não é requisito do sistema.

Variáveis principais: `VIDEO_PANEL_URL`, `VIDEO_WORKER_TOKEN`, `VIDEO_RENDER_ENGINE`, `VIDEO_LIP_SYNC_ENGINE`, `VIDEO_MUSETALK_DIR`, `VIDEO_MUSETALK_CONFIG`, `VIDEO_MUSETALK_UNET` e `VIDEO_MUSETALK_UNET_CONFIG`.

## Segurança

Não expor token, `SUPABASE_SERVICE_ROLE_KEY` ou URLs assinadas. O worker somente reivindica jobs autorizados e confirma ou falha o job nas rotas oficiais.

## Validação

Antes de declarar execução válida, conferir preflight de TTS/FFmpeg, modelos MuseTalk, formato do vídeo, upload no Storage e status final do job no painel. Limites antigos da Lightning não definem o runtime atual.
