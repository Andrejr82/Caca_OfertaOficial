# Imported Video Studio

## Fluxo

Em `/videos`, selecione oferta existente, cole URL Shopee Video, escolha Instagram/Facebook e confirme o direito de uso. A API cria um job; o worker resolve a cadeia Shopee, baixa a mídia permitida, valida com FFprobe, normaliza com FFmpeg, gera assets e atualiza o job. Após revisão, o painel gera drafts, exige aprovação e publica cada canal separadamente.

## Estados

O status principal existente de `video_jobs` permanece compatível: `queued`, `processing`, `ready`, `approved`, `failed`, `cancelled`. O detalhamento fica em `stage`: `resolving_source`, `downloading`, `validating`, `processing`, `generating_assets`, `generating_copies` e `ready_for_review`.

## Arquitetura

`POST /api/videos/import` valida sessão, oferta, origem, canais, direitos, fila e idempotência. O worker existente identifica `template_id = imported-video-v1` e usa `scripts/imported_video_worker.py`; `motion-v1` permanece no caminho anterior.

## Segurança

São aceitos somente HTTPS e hosts Shopee permitidos. Cada redirect é revalidado. DNS é resolvido antes da requisição e endereços locais, privados, link-local e metadata são bloqueados. Há limites de redirects, timeout, tamanho, MIME e assinatura MP4. Não são usados cookies pessoais, CAPTCHA bypass, autenticação contornada ou remoção de marca d’água.

## Storage

Assets gerados usam `videos/{user_id}/{offer_id}/{job_id}/`. O bucket existente `videos` recebe MP4 e JPEG; migrations de bucket e canal Facebook foram criadas, mas não executadas em produção. A mídia de origem permanece apenas no diretório temporário do worker nesta implementação.

## Copys e monetização

`src/lib/videos/import/drafts.ts` chama a engine determinística oficial. Apenas Instagram e Facebook são criados. Cada draft exige `affiliate_links.tracked_url` HTTPS do próprio canal; ausência gera `NO_MONETIZED_LINK`. URL original do vídeo nunca entra na copy.

## Instagram e Facebook

Instagram reutiliza a rota oficial de Reel e a deduplicação existente. Facebook usa transporte de Reel em quatro etapas da Meta: iniciar, upload hospedado, polling e finalizar. A versão Graph é configurável por `FACEBOOK_GRAPH_API_VERSION`, com fallback para `v19.0`, já usado no projeto. Nenhuma chamada real foi feita nos testes.

## Direitos de uso

O job guarda URL original, URL resolvida, origem, tipo de importação, confirmação, usuário e horário como evidência operacional. A confirmação não substitui licença legal.

## Testes e rollback

Testes unitários mockam rede, Storage, FFprobe, FFmpeg e Meta. Para rollback, não aplicar as migrations e reverter os commits da branch; `motion-v1` permanece independente.

## Limitações

O link precisa expor uma mídia acessível sem login, cookies ou CAPTCHA. Facebook Reels exige limites próprios de duração e credenciais/permissões Meta válidas. Importação real e publicação real exigem teste controlado posterior e autorização explícita.
