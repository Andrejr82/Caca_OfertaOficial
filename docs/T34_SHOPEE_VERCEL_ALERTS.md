# Configuração de Alertas Operacionais (T34)

Para concluir a observabilidade do Motor Shopee V1 (Fase 3), os seguintes alertas devem ser configurados no painel Vercel Observability / Log Drains, utilizando os logs estruturados JSON injetados na T33.

## 1. Falha de Autenticação Shopee
- **Métrica:** Ocorrência da string `Shopee OpenAPI V1 HTTP 401` ou `Shopee OpenAPI V1 HTTP 403`.
- **Condição:** `count() > 0` em qualquer janela.
- **Severidade:** CRÍTICA.
- **Ação:** Bloqueio imediato do motor Shopee; rotação da chave secreta (App Secret).

## 2. Alta Taxa de Falha de Rota (Disponibilidade)
- **Métrica:** Erros HTTP 500+ na rota ou `status !== 200` da Open API.
- **Condição:** Taxa de falha > 5% em uma janela de 15 minutos.
- **Severidade:** ALTA.
- **Ação:** Pausar descoberta Shopee V1 automaticamente via fallback.

## 3. Degradação de Performance (p95)
- **Métrica:** Log estruturado JSON (`duration_ms`).
- **Query:** `json.event="shopee_search_completed" | percentile(json.duration_ms, 95)`
- **Condição:** p95 > 25000ms (25 segundos, orçamento da rota).
- **Severidade:** MÉDIA.
- **Ação:** Investigar lentidão da API oficial ou ajustar `timeout` interno.

## 4. Anomalia de Cobertura Comercial (Zero Aprovados)
- **Métrica:** Log estruturado JSON (`approved`).
- **Query:** `json.event="shopee_search_completed" | sum(json.approved) by json.category_key`
- **Condição:** 0 aprovados em 3 execuções consecutivas para a mesma categoria.
- **Severidade:** MÉDIA.
- **Ação:** Revisar política de filtros comerciais (Score mínimo ou threshold de preço).

## Ação Restante
Estes alertas devem ser criados manualmente no painel da Vercel ou aplicados via Terraform no próximo deploy de infraestrutura.
