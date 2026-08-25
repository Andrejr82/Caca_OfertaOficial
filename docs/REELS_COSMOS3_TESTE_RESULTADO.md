# Resultado do teste Cosmos3 Image-to-Video

**Data:** 2026-08-21
**Entrada:** `serra-m-rmore-4-3-8-1300w-c-2discos-4100nh3zx2-makita.jpg`
**Space:** `hugging-apps/cosmos3-super-image2video-4step`
**Modelo:** `nvidia/Cosmos3-Super-Image2Video-4Step`

## Execução

- Token Hugging Face presente e autenticado anteriormente, sem exposição do valor.
- Upload da imagem: aceito.
- Endpoint `/generate`: aceitou a solicitação e criou evento.
- Configuração: `480x832`, proporção `9:16`, 25 frames, 24 fps.
- Prompt: demonstração segura, produto desligado, EPI, aproximação de câmera, sem corte.
- Vercel: não utilizada.
- Supabase: não utilizado.
- Oracle: não utilizado.
- Deploy e commit: não realizados.

## Resultado técnico

**Status:** bloqueado por erro do Space.

O evento terminou com:

```text
event: error
data: null
```

O runtime permaneceu `RUNNING` em `zero-a10g`, sem mensagem detalhada no endpoint público. Não há evidência de MP4 retornado.

## Diagnóstico adicional

- Autenticação HF: validada.
- Space: público, não gated, domínio `READY`.
- Endpoint Gradio `/generate`: disponível e descrito no OpenAPI.
- Upload: aceito.
- Payload: enviado com `FileData` e parâmetros dentro dos limites declarados.
- Runtime: `zero-a10g`, sem campo de erro público.
- O Space solicita `xlarge`; a documentação ZeroGPU informa que `xlarge` consome 2× da cota diária. Conta gratuita possui 5 minutos diários de GPU.
- O erro genérico ocorre após o job entrar no runtime; causa provável é incompatibilidade/instabilidade do Space ou esgotamento/prioridade de cota, não autenticação local.

Foram feitas duas tentativas controladas. Nenhuma nova tentativa Cosmos3 será feita nesta fase para preservar a cota gratuita.

## Decisão

Não integrar ao código produtivo ainda. Não classificar como falha do produto ou do prompt. O bloqueio atual está no runtime público do Space.

## Teste alternativo Wan2.2

- Space: `kulkas2pintu/wan222`.
- Endpoint: `/generate_video`.
- Runtime: ativo em `zero-a10g`.
- Upload da imagem Makita: aceito.
- Primeira chamada: payload HTTP continha tipos incorretos; descartada como erro do teste.
- Segunda chamada: payload tipado corretamente, job aceito, runtime retornou `event: error` sem detalhes.
- MP4: não retornado.

**Decisão:** não integrar Cosmos3 nem Wan2.2 com Spaces públicos sem execução manual confirmada ou Space próprio controlado. Os dois backends falharam no runtime e não forneceram diagnóstico suficiente pela API.
