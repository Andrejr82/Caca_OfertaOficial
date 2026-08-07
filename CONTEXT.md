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
