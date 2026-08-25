# Reels Image-to-Video com Cosmos3 ZeroGPU — Plano de Teste

> Plano vigente. Substitui qualquer plano anterior baseado em fal.ai/Kling.

**Objetivo:** validar um Reel MP4 com movimento contínuo usando a imagem da serra Makita e o Space público do Hugging Face antes de alterar o fluxo produtivo.

**Arquitetura de teste:** o painel Vercel somente exibirá o resultado quando houver integração. Neste teste, nenhum job será criado pela Vercel, nenhum deploy será feito e nenhum polling será executado nela. A imagem será enviada ao Space `hugging-apps/cosmos3-super-image2video-4step`; o MP4 será baixado localmente para avaliação. Oracle, Supabase e painel entram somente na etapa de integração após aprovação visual.

**Modelo:** `nvidia/Cosmos3-Super-Image2Video-4Step`, servido em ZeroGPU com quantização NVFP4. O Space recebe primeira imagem, prompt de movimento, proporção e quantidade de frames; retorna MP4.

## Restrições globais

- Não usar Gemini.
- Não usar fal.ai, Kling ou qualquer API paga.
- Não fazer commit.
- Não executar deploy na Vercel.
- Não colocar `HF_TOKEN` na Vercel, no navegador, em `NEXT_PUBLIC_*`, em logs ou no Supabase.
- Manter `HF_TOKEN` somente no ambiente local do worker/teste e, futuramente, na Oracle.
- Vercel será somente painel e visualização.
- Supabase persistirá status e metadados somente após aprovação do teste isolado.
- Oracle fará geração/orquestração, processamento FFmpeg e armazenamento na integração.
- Uma geração real por vez; não repetir automaticamente em caso de timeout.
- Entrada factual: `C:\Users\André\Downloads\serra-m-rmore-4-3-8-1300w-c-2discos-4100nh3zx2-makita.jpg`.
- Saída esperada: MP4 vertical 9:16, movimento contínuo, produto coerente, sem slideshow.

## Variáveis

Local:

```env
HF_TOKEN=hf_...
```

Integração futura, não configurar ainda:

```env
HF_SPACE_ID=hugging-apps/cosmos3-super-image2video-4step
VIDEO_PROVIDER=cosmos3-zero
VIDEO_OUTPUT_WIDTH=480
VIDEO_OUTPUT_HEIGHT=832
VIDEO_OUTPUT_FPS=24
VIDEO_MAX_FRAMES=93
```

## Critérios de aceite

O teste será aprovado somente se todos forem verdadeiros:

1. Space autentica sem expor o token.
2. Imagem enviada é a Makita correta.
3. MP4 é retornado pelo Space.
4. Duração contém movimento suficiente para avaliação.
5. Há movimento contínuo de câmera, mão ou ferramenta desde o início.
6. Produto permanece reconhecível e não troca por outro objeto.
7. Vídeo não é sequência de imagens estáticas.
8. Formato é vertical 9:16.
9. Prompt não instrui uso perigoso; demonstração inclui proteção e operação segura.
10. Falha/timeout não gera nova tentativa automática.

## Tarefas

### Task 1 — Teste isolado do provider

**Arquivos:**
- Entrada: `C:\Users\André\Downloads\serra-m-rmore-4-3-8-1300w-c-2discos-4100nh3zx2-makita.jpg`
- Configuração: `Caca_OfertaOficial/.env.local`
- Evidência: `Caca_OfertaOficial/docs/REELS_COSMOS3_TESTE_RESULTADO.md`

**Ações:**

- Confirmar presença de `HF_TOKEN` sem imprimir valor.
- Confirmar runtime do Space e endpoint `/generate`.
- Enviar a imagem original, sem passar pela Vercel.
- Usar `480×832 (9:16)` e teste curto de 25 frames para reduzir cota.
- Usar prompt seguro: mão com EPI posiciona a serra desligada, câmera aproxima, demonstração visual controlada sem corte em material e sem contato perigoso.
- Baixar o MP4 para diretório temporário local.
- Medir codec, resolução, FPS, duração e existência de movimento.
- Registrar resultado, erro técnico e decisão; não repetir automaticamente.

### Task 2 — Avaliação visual humana

**Arquivos:**
- Criar: `Caca_OfertaOficial/docs/REELS_COSMOS3_TESTE_RESULTADO.md`

**Ações:**

- Comparar primeiro segundo, movimento, fidelidade da Makita, deformações e continuidade.
- Classificar: `aprovado`, `reprovado por qualidade` ou `bloqueado por provider/limite`.
- Não integrar código se MP4 não cumprir os critérios.

### Task 3 — Contrato de integração, somente após aprovação visual

**Arquivos previstos:**
- Criar: `Caca_OfertaOficial/src/lib/videos/cosmos3-i2v.ts`
- Criar: `Caca_OfertaOficial/src/tests/videos/cosmos3-i2v.test.ts`
- Modificar: `Caca_OfertaOficial/scripts/video-worker.py`

**Ações:**

- Definir payload provider-neutral.
- Separar submissão, consulta, download e validação MP4.
- Garantir idempotência por `offerId` e tentativa.
- Proibir `render_auto_reel()`, FLUX e `-loop 1` no caminho image-to-video.
- Manter fallback de importação manual.

### Task 4 — Integração Oracle/Supabase/painel, somente após Task 3

**Ações:**

- Oracle criar/claimar job e chamar provider.
- Supabase registrar `queued`, `processing`, `ready_for_review` ou `failed`.
- Oracle armazenar MP4 validado.
- Vercel apenas consultar estado autorizado e visualizar vídeo.
- Remover polling agressivo e impedir criação de job pela Vercel.
- Executar teste local e, somente com autorização separada, homologação no ambiente remoto.

## Segurança e integridade

- Nunca registrar token, URL assinada ou payload com segredo.
- Validar origem e tipo da imagem antes do envio.
- Limitar tamanho da imagem e frames.
- Sanitizar mensagens do provider antes de persistir.
- Não alterar schema, Oracle, Supabase ou Vercel durante Task 1.
- Verificar `git diff` e `git status` antes de qualquer conclusão.
- Não fazer commit nesta etapa.

## Resultado esperado desta fase

Um único MP4 local, acompanhado de evidência técnica e avaliação visual. Sem deploy, sem commit, sem alteração no fluxo produtivo.
