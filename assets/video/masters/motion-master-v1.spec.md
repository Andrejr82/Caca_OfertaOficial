# motion-master-v1

## Critérios de aprovação

- MP4 vertical 720×1280, 24/25 FPS, 15–25 segundos.
- Sem produto, preço, cartão, CTA, legenda, marketplace ou áudio gravado.
- Rosto livre na zona aproximada `x=130..420`, `y=70..470`.
- Mão direita livre para o card em `x=430..680`, `y=430..800`.
- Movimento corporal natural e repetível; três gestos neutros podem formar um loop.
- O frame inicial e o vídeo inteiro devem ser revisados manualmente antes de marcar
  `motion-master-v1` como `approved` no manifest.

## Aprovação técnica

```bash
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate -of json motion-master-v1.mp4
ffmpeg -y -i motion-master-v1.mp4 -an -frames:v 1 /tmp/motion-master-v1-frame.jpg
sha256sum motion-master-v1.mp4
```

O hash retornado deve ser registrado em `assets/video/manifest.json`. Até essa
aprovação, o worker deve falhar no preflight e nenhum job deve ser reivindicado.
