# Worker de vídeos na Lightning AI

Este worker processa no máximo três jobs por execução. Ele busca uma oferta na fila, gera áudio em português, monta um vídeo vertical com o avatar e envia os arquivos diretamente ao Supabase Storage usando uma URL assinada.

## Pré-requisitos

- Studio Lightning com GPU T4;
- `VIDEO_WORKER_TOKEN` configurado na Vercel e no Studio;
- migrações `20260720000000_video_jobs.sql` e `20260720010000_video_storage.sql` aplicadas no Supabase;
- arquivo `Avatar_Anuncio.png` copiado para o Studio, por exemplo em `~/caca-video-assets/Avatar_Anuncio.png`.

O worker não usa a `SUPABASE_SERVICE_ROLE_KEY`. Essa chave permanece somente na Vercel.

## Configuração do Supabase

No SQL Editor do Supabase, execute a migração `supabase/migrations/20260720010000_video_storage.sql`. Ela cria o bucket público `videos` com limite de 100 MB por arquivo. O bucket público é necessário para que o MP4 possa ser baixado no painel; o upload continua protegido por URL assinada.

## Instalação na Lightning

No terminal do Studio:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg fonts-dejavu-core
python -m pip install --upgrade pip
python -m pip install pillow edge-tts
```

Copie para o Studio os arquivos:

```text
scripts/video-worker.py
scripts/video-worker.env.example
Avatar_Anuncio.png
```

Configure as variáveis no mesmo terminal:

```bash
export VIDEO_PANEL_URL="https://caca-oferta-oficial.vercel.app"
export VIDEO_WORKER_TOKEN="TOKEN_DA_VERCEL"
export VIDEO_AVATAR_PATH="$HOME/caca-video-assets/Avatar_Anuncio.png"
export VIDEO_MAX_JOBS="3"
export VIDEO_POLL_SECONDS="15"
export VIDEO_TTS_VOICE="pt-BR-AntonioNeural"
```

Teste a GPU e as ferramentas:

```bash
nvidia-smi
ffmpeg -version
edge-tts --version
python -c "from PIL import Image; print('Pillow OK')"
```

Execute uma rodada controlada:

```bash
python scripts/video-worker.py
```

A rodada termina depois de processar até três jobs. Para uma execução manual diária, ligue o Studio, execute o comando e desligue-o depois que o painel mostrar **Pronto para aprovar**.

## Resultado

Quando o worker concluir, o painel em `/videos` exibirá o player e o botão **Baixar MP4**. O status passa de `processing` para `ready`; após a revisão, use **Aprovar vídeo**.

## Segurança e custos

- Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` na Lightning.
- Não commite tokens ou variáveis reais.
- O limite do painel é de três jobs em 24 horas.
- O limite do worker é de três jobs por execução.
- O MP4 é enviado ao Supabase diretamente, sem atravessar o payload da função Vercel.
- O Studio gratuito pode reiniciar; não trate a Lightning gratuita como serviço 24/7.
