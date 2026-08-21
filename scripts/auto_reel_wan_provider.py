#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Wan 2.2 Image-to-Video ZeroGPU Provider
Caça Ofertas Oficial - Video Worker Integration
"""

import os
import sys
import time
import json
import shutil
import tempfile
import subprocess
import urllib.request
from pathlib import Path
from PIL import Image

from typing import Any

CURRENT_DIR = Path(__file__).resolve().parent
LIBS_DIR = CURRENT_DIR / "libs"

# Global references resolved dynamically at runtime
_Client: Any = None
_handle_file: Any = None


def get_gradio_client() -> tuple[Any, Any]:
    """
    Carrega gradio_client dinamicamente em tempo de execução para evitar
    erros de linter estático em ambientes onde a biblioteca não está instalada localmente.
    """
    global _Client, _handle_file
    if _Client is not None and _handle_file is not None:
        return _Client, _handle_file

    # Incluir caminhos de bibliotecas locais e temporárias
    if LIBS_DIR.exists() and str(LIBS_DIR) not in sys.path:
        sys.path.insert(0, str(LIBS_DIR))
    tmp_libs = Path("/tmp/wan_libs")
    if tmp_libs.exists() and str(tmp_libs) not in sys.path:
        sys.path.insert(0, str(tmp_libs))

    try:
        import importlib
        gc = importlib.import_module("gradio_client")
        _Client = getattr(gc, "Client")
        _handle_file = getattr(gc, "handle_file")
        return _Client, _handle_file
    except Exception as exc:
        raise RuntimeError(
            f"Biblioteca gradio_client não encontrada no ambiente Python ({exc}). "
            "Certifique-se de que o worker possui a dependência instalada."
        )

DEFAULT_SPACE = "r3gm/wan2-2-fp8da-aoti-preview"
DEFAULT_NEGATIVE_PROMPT = (
    "Bright tones, overexposed, static, blurred details, subtitles, static, "
    "overall gray, worst quality, low quality, JPEG compression residue, ugly, "
    "incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, "
    "disfigured, misshapen limbs, fused fingers, still picture, messy background, "
    "three legs, many people in the background, walking backwards, watermark, text, signature"
)


def load_hf_token() -> str:
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    if token:
        return token.strip()
    
    # Try loading from .env.local
    env_local = CURRENT_DIR.parent / ".env.local"
    if env_local.exists():
        for line in env_local.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if line.startswith("HF_TOKEN="):
                token = line.split("=", 1)[1].strip().strip('"').strip("'")
                if token:
                    return token
    return ""


def prepare_vertical_image(src_path: Path, output_path: Path, target_w: int = 512, target_h: int = 896) -> Path:
    """
    Converte/enquadra a imagem do produto em canvas vertical 9:16 limpo para que o modelo
    Wan 2.2 gere nativamente o vídeo em formato vertical sem distorção.
    """
    im = Image.open(src_path).convert("RGB")
    canvas = Image.new("RGB", (target_w, target_h), (250, 250, 250))
    resample = getattr(Image, "Resampling", Image).LANCZOS if hasattr(getattr(Image, "Resampling", Image), "LANCZOS") else Image.ANTIALIAS
    
    scale = min(target_w / im.width, (target_h * 0.75) / im.height)
    new_w = max(1, int(im.width * scale))
    new_h = max(1, int(im.height * scale))
    im_resized = im.resize((new_w, new_h), resample)
    
    offset_x = (target_w - new_w) // 2
    offset_y = (target_h - new_h) // 2
    canvas.paste(im_resized, (offset_x, offset_y))
    canvas.save(output_path, quality=95)
    return output_path


def inspect_video_with_ffprobe(video_path: Path) -> dict:
    """
    Valida e extrai metadados do vídeo gerado via ffprobe.
    """
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "stream=width,height,r_frame_rate,codec_name:format=duration,size",
        "-of", "json", str(video_path)
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe falhou ao inspecionar vídeo gerado: {proc.stderr}")
    
    info = json.loads(proc.stdout)
    streams = info.get("streams", [])
    fmt = info.get("format", {})
    if not streams:
        raise RuntimeError("Vídeo gerado não possui streams de vídeo válidos.")
    
    video_stream = streams[0]
    width = int(video_stream.get("width", 0))
    height = int(video_stream.get("height", 0))
    codec_name = str(video_stream.get("codec_name", "")).lower()
    r_frame_rate = str(video_stream.get("r_frame_rate", "16/1"))
    
    fps = 16.0
    if "/" in r_frame_rate:
        num, den = r_frame_rate.split("/", 1)
        try:
            fps = round(float(num) / float(den), 2)
        except Exception:
            fps = 16.0
    else:
        try:
            fps = float(r_frame_rate)
        except Exception:
            fps = 16.0
            
    duration = float(fmt.get("duration", 0.0))
    size_bytes = int(fmt.get("size", 0))
    
    # Validações de integridade
    if size_bytes <= 0:
        raise RuntimeError("Arquivo de vídeo gerado está vazio (0 bytes).")
    if duration < 1.5:
        raise RuntimeError(f"Duração do vídeo gerado ({duration:.2f}s) é inferior ao mínimo de 1.5s.")
    if width <= 0 or height <= 0:
        raise RuntimeError(f"Dimensões do vídeo inválidas: {width}x{height}.")
    if width >= height:
        print(f"[Aviso] Vídeo gerado não é estritamente vertical: {width}x{height}", flush=True)
        
    return {
        "width": width,
        "height": height,
        "duration": duration,
        "fps": fps,
        "codec": codec_name,
        "size_bytes": size_bytes
    }


def generate_wan_video(
    image_url: str,
    prompt: str,
    output_path: Path,
    space_id: str = DEFAULT_SPACE,
    steps: int = 6,
    duration_seconds: float = 3.5,
    max_retries: int = 2
) -> dict:
    """
    Gera um vídeo Image-to-Video vertical com Wan 2.2 usando ZeroGPU no Hugging Face Spaces.
    """
    hf_token = load_hf_token()
    if not hf_token:
        raise RuntimeError("HF_TOKEN ausente. Configure o token de autenticação Hugging Face para usar o provider Wan 2.2.")
    
    Client, handle_file = get_gradio_client()

    # Configure env for huggingface hub client
    os.environ["HF_TOKEN"] = hf_token
    os.environ["HUGGING_FACE_HUB_TOKEN"] = hf_token
    
    with tempfile.TemporaryDirectory(prefix="wan-gen-") as tmpdir:
        tmp_root = Path(tmpdir)
        raw_img = tmp_root / "source_product.jpg"
        vertical_img = tmp_root / "vertical_canvas.jpg"
        
        # 1. Download image
        print(f"[WanProvider] Baixando imagem do produto...", flush=True)
        req = urllib.request.Request(
            image_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        )
        with urllib.request.urlopen(req, timeout=20) as resp, open(raw_img, "wb") as f:
            f.write(resp.read())
            
        if raw_img.stat().st_size < 1000:
            raise RuntimeError(f"Imagem baixada inválida ou muito pequena ({raw_img.stat().st_size} bytes).")
            
        # 2. Prepare vertical canvas
        prepare_vertical_image(raw_img, vertical_img, target_w=512, target_h=896)
        
        # 3. Connect to Space & call predict
        print(f"[WanProvider] Conectando ao Space ZeroGPU {space_id}...", flush=True)
        client = Client(space_id, verbose=False)
        
        last_error = None
        for attempt in range(1, max_retries + 1):
            try:
                print(f"[WanProvider] Iniciando inferência ZeroGPU (tentativa {attempt}/{max_retries})...", flush=True)
                start_time = time.time()
                
                result = client.predict(
                    input_image=handle_file(str(vertical_img)),
                    last_image=handle_file(str(vertical_img)),
                    prompt=prompt,
                    steps=steps,
                    negative_prompt=DEFAULT_NEGATIVE_PROMPT,
                    duration_seconds=duration_seconds,
                    guidance_scale=1.0,
                    guidance_scale_2=1.0,
                    seed=42,
                    randomize_seed=True,
                    quality=6,
                    scheduler="UniPCMultistep",
                    flow_shift=3.0,
                    frame_multiplier=16,
                    video_component=True,
                    safe_mode=True,
                    enable_safety_checker=True,
                    api_name="/generate_video"
                )
                
                elapsed = time.time() - start_time
                print(f"[WanProvider] Inferência concluída com sucesso em {elapsed:.1f}s!", flush=True)
                
                # Extract generated video path
                video_entry = result[0]
                if isinstance(video_entry, dict):
                    gen_path = video_entry.get("video") or video_entry.get("path")
                else:
                    gen_path = str(video_entry)
                    
                if not gen_path or not Path(gen_path).exists():
                    raise RuntimeError(f"Arquivo retornado pelo Space não existe: {gen_path}")
                    
                # Copy to requested destination
                output_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(gen_path, output_path)
                
                # 4. ffprobe validation
                probe_info = inspect_video_with_ffprobe(output_path)
                
                return {
                    "success": True,
                    "video_path": str(output_path),
                    "width": probe_info["width"],
                    "height": probe_info["height"],
                    "duration": probe_info["duration"],
                    "fps": probe_info["fps"],
                    "codec": probe_info["codec"],
                    "size_bytes": probe_info["size_bytes"],
                    "elapsed_seconds": round(elapsed, 2),
                    "provider": "huggingface",
                    "model": "wan2.2",
                    "space": space_id,
                    "generation_type": "image-to-video"
                }
                
            except Exception as e:
                last_error = e
                print(f"[WanProvider] Erro na tentativa {attempt}: {e}", flush=True)
                if attempt < max_retries:
                    time.sleep(3)
                    
        raise RuntimeError(f"Falha ao gerar vídeo Wan 2.2 após {max_retries} tentativas: {last_error}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python3 auto_reel_wan_provider.py <IMAGE_URL> <OUTPUT_MP4> [PROMPT]")
        sys.exit(1)
        
    img_u = sys.argv[1]
    out_p = Path(sys.argv[2])
    prm = sys.argv[3] if len(sys.argv) > 3 else (
        "Create a realistic vertical product demonstration video using the supplied product image as the strict visual reference. "
        "Preserve the exact product identity, shape, colors, proportions and visible branding. "
        "Start immediately with the product being naturally used for its real-world purpose. "
        "Continuous realistic motion. Do not redesign the product. Do not invent accessories. "
        "Do not add text, prices, labels or promotional graphics. Vertical 9:16 product demonstration."
    )
    
    res = generate_wan_video(img_u, prm, out_p)
    print("RESULTADO_WAN:")
    print(json.dumps(res, indent=2))
