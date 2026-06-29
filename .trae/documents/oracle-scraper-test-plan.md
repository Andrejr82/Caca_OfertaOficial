# Plano de Teste para oracle-scraper.cjs

## 1. Análise do Código a Ser Testado

### Principais Funcionalidades do Script:
1. **crawleeExtract()**: Função principal que extrai produtos de lojas usando Crawlee + Playwright, valida HTML, e usa Groq para formatar os dados.
2. **Funções de Normalização/URLs**: `cleanProductUrl()`, `normalizeImageUrl()`, `buildAffiliateUrl()`.
3. **Scoring de Ofertas**: `calculateScoreV1()` e `calculateScoreV2()`.
4. **Copywriting IA**: `generateOfferAnalysis()` e `generateFallback()`.
5. **Persistência**: `upsertOffer()`, `processTopOffers()`.
6. **Lógica de Loja e Ciclo Principal**: `scrapeStore()`, `runScrapingCycle()`.

## 2. Plano de Testes

### 2.1 Testes Unitários das Funções Puramente Lógicas (Sem Dependências Externas)

Vamos testar as funções que não dependem de APIs externas ou navegadores:

1. **Testar `cleanProductUrl()`**
   - Validar que URLs são limpas corretamente (remove search params e hash)
   - Testar URLs inválidas (deve retornar a URL original)

2. **Testar `normalizeImageUrl()`**
   - URLs protocolo-duplo (ex: `//ex.com/img.jpg` → `https://ex.com/img.jpg`)
   - Imagens do Mercado Livre (remover dimensão para usar `/orig/`)
   - URLs nulas ou "null"

3. **Testar `buildAffiliateUrl()`**
   - Mercado Livre (dealerRef)
   - Amazon (tag)
   - Magalu (magazinevoce.com.br)
   - Netshoes (Rakuten)
   - URLs inválidas

4. **Testar `calculateScoreV1()` e `calculateScoreV2()`**
   - Casos de desconto normal
   - Produtos high-ticket
   - Preços de impulso (<= R$90)
   - Black Fraude (desconto > 80%)
   - Produtos sem desconto

5. **Testar `generateFallback()`**
   - Deve retornar copy válida mesmo sem IA

### 2.2 Testes de Integração/Unitários com Mocks

Para funções que dependem de APIs externas (Supabase, Groq, Crawlee):

1. **Testar `upsertOffer()`**
   - Mockar `@supabase/supabase-js` para simular inserção/atualização
   - Verificar comportamento para ofertas novas e existentes
   - Verificar metadata de scoring V1/V2

2. **Testar `generateOfferAnalysis()`**
   - Mockar fetch para a API do Groq
   - Simular resposta válida e inválida (JSON malformado)
   - Testar fallback quando Groq falhar

3. **Testar `scrapeStore()` e `crawleeExtract()`**
   - Mockar Crawlee/Playwright para simular extração de dados
   - Mockar requisição para Groq
   - Mockar `upsertOffer()` para não persistir dados reais

### 2.3 Estrutura do Arquivo de Teste

- Criar `src/tests/oracle-scraper.test.ts`
- Usar Vitest para mocking e assertions

## 3. Arquivos que Serão Modificados/Criados

1. **Novo arquivo**: `src/tests/oracle-scraper.test.ts` - Contendo todos os testes
2. **Possivelmente**: `scripts/oracle-scraper.cjs` - Se precisar exportar mais funções para testes (no momento só `crawleeExtract` é exportado)

## 4. Considerações Importantes

- Não usar APIs reais em testes (usar mocks para Supabase, Groq, Crawlee)
- Não modificar o comportamento do script original (apenas expandir exports se necessário)
- Garantir que os testes são rápidos e não dependem de conexão com a internet
- Seguir os padrões de testes existentes no repositório (vitest, tsx)
