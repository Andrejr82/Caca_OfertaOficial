# Shopee Curated Discovery V2 — Implementation Plan

> Status: [x] Concluída com validação automatizada e diagnóstico real sem escrita.

**Objetivo:** substituir a coleta Shopee ampla por uma descoberta comercial curada, baseada exclusivamente na OpenAPI oficial, sem publicação automática.

**Arquitetura:** usar o feed `FULL` como catálogo-base, o `DELTA` como atualização, classificar título/descrição/atributos por família e categoria folha, enriquecer cada candidato por `itemId` em `productOfferV2` e recorrer à busca por palavra-chave + categoria folha somente quando houver menos de três famílias qualificadas. Selecionar um representante por família e no máximo três famílias diferentes por nicho.

**Niches em escopo:** Casa/Cozinha/Organização, Beleza, Moda, Ferramentas, Pet e Eletrodomésticos. Informática fica fora do modo curado.

## Task 1 — Contratos e classificação

- [x] Identificação da task
- [x] Especificar consultas FULL e DELTA sem remover compatibilidade DELTA
- [x] Normalizar descrição, atributos e caminho de categorias do feed
- [x] Bloquear acessórios e famílias proibidas antes do enriquecimento
- [x] Validar por testes automatizados
- [x] Revisar os arquivos alterados
- [x] Confirmar critério de conclusão
- [x] Atualizar para `[x]` somente após comprovação real

## Task 2 — Descoberta híbrida

- [x] Identificação da task
- [x] Amostrar o FULL em offsets distribuídos
- [x] Processar NEW/UPDATE/DELETE do DELTA
- [x] Enriquecer candidatos exatos por `itemId`
- [x] Acionar fallback por categoria folha apenas com cobertura insuficiente
- [x] Validar por testes automatizados
- [x] Revisar os arquivos alterados
- [x] Confirmar critério de conclusão
- [x] Atualizar para `[x]` somente após comprovação real

## Task 3 — Seleção e integração ativa

- [x] Identificação da task
- [x] Manter um produto por família
- [x] Limitar a três famílias por nicho
- [x] Preservar aprovação manual e `NO_PUBLISH`
- [x] Excluir Informática do modo curado
- [x] Validar adaptador, persistência controlada e regressões Shopee
- [x] Revisar os arquivos alterados
- [x] Confirmar critério de conclusão
- [x] Atualizar para `[x]` somente após comprovação real

## Critério final de conclusão

- [x] FULL e DELTA comprovados no fluxo ativo
- [x] Nenhum acessório das listas bloqueadas chega ao Top
- [x] Todos os selecionados possuem identidade, preço, imagem, link, vendas, avaliação e comissão válidos
- [x] No máximo três produtos e três famílias distintas por nicho
- [x] Fallback executado somente quando a base não cobre três famílias
- [x] Nenhuma escrita externa ou publicação realizada durante a validação
- [x] Suítes relevantes e revisão do diff aprovadas
- [x] Task final concluída somente após todas as evidências acima existirem
