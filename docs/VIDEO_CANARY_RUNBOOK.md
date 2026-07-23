# Canário controlado da pipeline de vídeos

O fixture local não chama Vercel, Supabase, Storage ou Lightning:

```bash
PYTHONPATH=scripts python scripts/render-video-fixture.py --output /tmp/caca-video-fixture.mp4 --lip-sync off
```

Na Lightning, somente depois do fixture e do preflight passarem, executar uma
única inferência manual com `--lip-sync musetalk`. O canário não deve chamar
`/api/videos/worker/next` e não consome a quota de jobs do painel.

O mestre de movimento aprovado deve ser `motion-master-v1.mp4`. O arquivo
`Video_Avatar_Ofeerta.mp4` permanece apenas como comparação histórica.
