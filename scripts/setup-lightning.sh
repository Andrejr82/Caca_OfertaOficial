#!/usr/bin/env bash
set -euo pipefail

echo "[1/4] Verificando GPU..."
nvidia-smi

echo "[2/4] Instalando FFmpeg e fontes..."
sudo apt-get update
sudo apt-get install -y ffmpeg fonts-dejavu-core

echo "[3/4] Instalando dependências Python..."
python -m pip install --upgrade pip
python -m pip install -r scripts/requirements-video-worker.txt

echo "[4/4] Criando diretório do avatar..."
mkdir -p "$HOME/caca-video-assets"

if [[ ! -f "$HOME/caca-video-assets/Avatar_Anuncio.png" ]]; then
  echo
  echo "AÇÃO NECESSÁRIA: envie Avatar_Anuncio.png para:"
  echo "  $HOME/caca-video-assets/Avatar_Anuncio.png"
else
  echo "Avatar encontrado."
fi

echo
echo "Dependências instaladas. Configure as variáveis e execute:"
echo "  python scripts/video-worker.py"
