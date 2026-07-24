# Relatório de Correção - Diversidade da Fila (Sprints 6 e 7)

## Objetivo da Sprint Corretiva
Garantir que produtos de boa qualidade não sejam descartados de forma definitiva (Skipped) apenas por terem excedido o limite de sua categoria. Estes itens devem ser mantidos como "Deferred" (adiados) e reavaliados nos próximos ciclos, respeitando prioridade por pontuação de curadoria e limites de tentativas/TTL.

## Implementações Realizadas

### 1. Nome Correto das Variáveis
A variável de controle de limites de categoria foi ajustada de acordo com as especificações para evitar confusões com limites globais diários:
- A variável esperada pelo sistema passa a ser **\MAX_PER_QUEUE_CATEGORY\**.
- Mantida retrocompatibilidade temporária com a variável antiga \MAX_DAILY_PER_CATEGORY\.
- Configurado fallback final e fixo de \5\ produtos por categoria caso nenhuma variável esteja preenchida.

### 2. Recuperação e Lógica de Produtos Adiados (\Deferred\)
- Adicionada a propriedade \deferred\ (lista de itens adiados) e um novo status ao contrato do \uildAutomatedCopyQueue\.
- O método de automação agora permite receber um array \previouslyDeferred\ proveniente do ciclo passado.
- Produtos que ultrapassam o limite de sua categoria no momento da montagem da fila perdem a vaga temporariamente, mas não são marcados como \limite_categoria\ em \skipped\. Agora, eles são incluídos na saída \deferred\.

### 3. Evitando a Fome (Prioridade e Ordenação Determinística)
O motor de processamento agora consolida os novos candidatos vindos da curadoria (recomendados) com os previamente adiados (previously deferred), aplicando uma lógica de ordenação forte:
1. Maior Score de Curadoria (\curationScore\).
2. Data do adiantamento mais antigo (\deferredAt\ ascendente) - aplicável no caso de empate entre dois adiados.
3. Item adiado tem precedência contra um item novo caso tenham a pontuação exata.
4. Ordem alfabética da String de Identidade Comercial (\commercialHash\) para garantir previsibilidade completa da saída em reexecuções.

### 4. Controle de Duplicidades (DeduplicationEngine)
Todos os produtos que fluem para a cópia (novos recomendados e adiados passados) passam antes por um agrupamento com o \DeduplicationEngine.buildCommercialIdentity\, utilizando \commercialHash\.
- Isso garante que, se a API de descoberta retornar novamente no mesmo dia um produto que havia sido empurrado para os "Adiados", ele não dobre de volume, preservando apenas a versão de maior pontuação e estado coerente.

### 5. Limites e Expirações de Segurança (TTL e Tentativas)
Os itens adiados carregam um metadado de tempo e volume que evita congestionamento perpétuo na memória:
- **\deferredMaxAttempts\**: Padrão de 3 tentativas, após as quais se descartam para \skipped\ (motivo: \deferred_max_attempts\).
- **\deferredTtlHours\**: Padrão de 24 horas. Itens não recuperados no prazo são enviados para \skipped\ (motivo: \deferred_ttl_expired\).

## Validação e Qualidade (Test Driven Development)
Todos os 15 critérios definidos nos requisitos foram convertidos em testes no arquivo \copy-v2-automation.test.ts\. 

- *[?] 1. Categoria abaixo do limite entra 100% na fila*
- *[?] 2. Categoria no limite exato entra 100% na fila*
- *[?] 3. Categoria acima do limite preenche vagas*
- *[?] 4. Produtos excedentes de categoria vão para deferred (adiados)*
- *[?] 5. Item deferred que tem espaço livre num próximo ciclo entra na fila real*
- *[?] 6. Item deferred é expurgado da lista deferred se conseguiu vaga*
- *[?] 7. Itens deferred competem entre si priorizando score mais alto*
- *[?] 8. Se um item deferred foi descoberto novamente no ciclo, ele é deduplicado garantindo o mais relevante*
- *[?] 9. Após máximo de tentativas (3), item deferred vai pra skipped e encerra jornada*
- *[?] 10. Após passar o prazo de vida (TTL), item deferred vai pra skipped e encerra jornada*
- *[?] 11. Validação com MAX_DAILY_PER_CATEGORY*
- *[?] 12. Precedência absoluta da MAX_PER_QUEUE_CATEGORY sobre a MAX_DAILY_PER_CATEGORY*
- *[?] 13. Fallback de segurança para 5*
- *[?] 14. O algoritmo valida limites de várias categorias simultaneamente sem vazar*
- *[?] 15. Uma fila que não chegue em maxTotal ou não fira limites, completa as vagas integralmente com adiados e novos.*

## Conclusões
- **Bug Arquitetônico Resolvido:** Produtos premium (acima do limite da categoria) não são mais descartados em lixo permanente de "Skipped".
- **Comportamento Previsível:** Limites continuam rigorosamente respeitados por ciclo, cumprindo o objetivo primário da diversidade na interface da fila.
- **Saúde do Sistema:** O Build TypeCheck TypeScript e os Testes Automatizados aprovaram sem quebras de dependência, e erros antigos de tipagem no catálogo de classificação foram corrigidos paralelamente.
- O projeto encontra-se robusto e a etapa está terminada com sucesso.
