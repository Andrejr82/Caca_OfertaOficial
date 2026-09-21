# Vocabulário editorial do domínio

## Grade editorial oficial

A grade editorial oficial é a única relação normativa entre hora de Discovery, cenário editorial e hora esperada de publicação. Ela usa `America/Sao_Paulo` e mantém `publicationHour` como conceito primário de publicação.

## Discovery

Discovery é a busca Oracle de candidatos para um slot editorial. `discoveryHour` identifica quando a busca deve ocorrer; ele não é a hora de publicação.

## Publicação esperada

`publicationHour` é a hora editorial esperada para publicação. `queueHour` é somente um alias legado de `publicationHour` e não autoriza, por si só, um envio social.

## Slot oficial

Um slot oficial contém exatamente um `scenarioId`, uma `discoveryHour`, uma `publicationHour` e suas flags de Discovery, publicação manual/agendada e intro Telegram. Não pode haver colisão de horas dentro da grade oficial.

## Manual-only

Um slot `manual-only` pode existir na grade para representar a publicação editorial, mas não dispara Discovery nem intro automática. Cupons Aprovados é o slot manual-only atual.

## Rotação premium

Uma rotação premium é um cenário experimental fora da grade oficial. Ela pode permanecer cadastrada para uso futuro, mas nunca pode substituir um slot oficial por hora.

## Curadoria Comercial V1

`CommercialIntent` é a intenção objetiva de compra usada para agrupar um produto na Curadoria Comercial V1; não é sinônimo de cenário editorial.

`AchadinhoScore` é a pontuação de priorização baseada somente em sinais disponíveis no runtime. Ele ordena candidatos, mas não representa conversão comprovada.

`manualReviewRequired` é a barreira editorial que impede copy ou seleção automática quando preço, risco, categoria ou evidência comercial exigem conferência humana.

## Motor de Seleção Multimarketplace V2

`CandidateDecisionV2` é a estrutura de decisão unificada para candidatos de Amazon, Mercado Livre e Shopee baseada em 5 pilares determinísticos (desconto percentual, desconto absoluto, volume de vendas, rating e número de reviews).

`identityGroupKey` é a chave de agrupamento por identidade canônica de produto para prevenir repetições e canibalização entre marketplaces no mesmo ciclo editorial.

## Radar Executivo de Tendências

O `TrendsRadar` é o subsistema autônomo de inteligência de mercado executado via worker dedicado na VPS Oracle (`oracle-trends-radar`), calculando Score V2 de tendências a partir de sinais de demanda e integrando sugestões ao pipeline de curadoria sem concorrência com o scheduler editorial.
