# Worker de vídeos na Lightning AI

Este worker processa no máximo três jobs por execução. Ele busca uma oferta na fila, gera áudio em português, monta um vídeo vertical com o avatar e envia os arquivos diretamente ao Supabase Storage usando uma URL assinada.

## Pré-requisitos

- Studio Lightning com GPU T4;
- `VIDEO_WORKER_TOKEN` configurado na Vercel e no Studio;
- migrações `20260720000000_video_jobs.sql` e `20260720010000_video_storage.sql` aplicadas no Supabase;
- arquivo `Avatar_Anuncio.png` copiado para o Studio, por exemplo em `~/caca-video-assets/Avatar_Anuncio.png`.
- vídeo-base `Video_Avatar_Ofeerta.mp4` copiado para o Studio, por exemplo em `~/caca-video-assets/Video_Avatar_Ofeerta.mp4`.

O worker não usa a `SUPABASE_SERVICE_ROLE_KEY`. Essa chave permanece somente na Vercel.

## Configuração do Supabase

No SQL Editor do Supabase, execute a migração `supabase/migrations/20260720010000_video_storage.sql`. Ela cria o bucket público `videos` com limite de 100 MB por arquivo. O bucket público é necessário para que o MP4 possa ser baixado no painel; o upload continua protegido por URL assinada.

## Instalação na Lightning

No terminal do Studio, a instalação pode ser feita com um único comando:

```bash
bash scripts/setup-lightning.sh
```

Se preferir executar manualmente:

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
export VIDEO_BASE_VIDEO_PATH="$HOME/caca-video-assets/Video_Avatar_Ofeerta.mp4"
export VIDEO_RENDER_ENGINE="reference"
export VIDEO_REFERENCE_CLEANUP="1"
# Ative somente depois de instalar e validar o MuseTalk 1.5:
export VIDEO_LIP_SYNC_ENGINE="off"
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

### Sincronização labial

O vídeo-base contém movimentos e artes promocionais gravadas no MP4. O worker
remove o card JBL embutido antes de inserir a oferta atual. Para sincronizar a
boca com o novo áudio TTS, use o MuseTalk 1.5 localmente na GPU. O código é
MIT e os pesos do modelo têm permissão comercial conforme o repositório oficial.

Antes de ativar, valide a instalação sem colocar nenhum job na fila:

```bash
cd ~/MuseTalk
python -m scripts.inference --help
test -f models/musetalkV15/unet.pth
test -f models/musetalkV15/musetalk.json
```

Depois configure os caminhos e faça apenas uma execução controlada:

```bash
export VIDEO_LIP_SYNC_ENGINE="musetalk"
export VIDEO_MUSETALK_DIR="$HOME/MuseTalk"
export VIDEO_MUSETALK_CONFIG="$HOME/MuseTalk/configs/inference/test.yaml"
export VIDEO_MUSETALK_UNET="$HOME/MuseTalk/models/musetalkV15/unet.pth"
export VIDEO_MUSETALK_UNET_CONFIG="$HOME/MuseTalk/models/musetalkV15/musetalk.json"
export VIDEO_MUSETALK_VERSION="v15"
VIDEO_MAX_JOBS=1 python scripts/video-worker.py
```

Com `VIDEO_LIP_SYNC_ENGINE=off`, o worker continua funcional, mas apenas
substitui o áudio; isso não pode produzir lip-sync real para uma fala nova.

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
