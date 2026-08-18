<!-- plan-status: awaiting-approval -->
<!-- based-on-main: 2045b3a92f71c46d5e33bb6366019c545b20990e -->
<!-- created-on: 2026-08-18 -->

# Plano de Correção — Monetização Mercado Livre

## 1. Objetivo

Este documento formaliza a correção da monetização do Mercado Livre no projeto Caça Ofertas Oficial.

A alteração somente será iniciada após aprovação explícita deste plano.

Objetivos principais:

1. Garantir que toda publicação de Mercado Livre encaminhe o clique para um destino monetizado válido.
2. Preservar links oficiais gerados pela Central de Afiliados e Criadores do Mercado Livre.
3. Separar de forma explícita URL de identificação do produto e URL de monetização.
4. Corrigir o ciclo automático Oracle para não publicar Mercado Livre com URL comum de produto quando não houver monetização confirmada.
5. Corrigir a Publicação Expressa para aceitar e preservar links oficiais `meli.la` e URLs completas oficiais de afiliado.
6. Reduzir falsos positivos nas métricas internas de clique causados por crawlers de preview.
7. Adicionar testes que impeçam regressão futura.

---

# 2. Resumo executivo do problema

Foi observado no painel oficial do Mercado Livre:

- últimos 7 dias: 0 cliques;
- últimos 180 dias: 26 cliques.

Ao mesmo tempo, o tracking interno do Caça Ofertas registra cliques recentes.

A investigação encontrou uma divergência entre:

- clique registrado internamente pelo `/go/...`;
- URL efetivamente usada como destino final no Mercado Livre.

O sistema consegue registrar que alguém acessou um link do Caça Ofertas, mas isso não garante que o Mercado Livre receba uma URL com atribuição oficial de afiliado.

A causa principal identificada é que, em grande parte dos fluxos, o campo usado como destino final é a URL comum do produto do Mercado Livre.

---

# 3. Evidências técnicas encontradas

## 3.1 Tracking interno

A rota pública:

`src/app/go/[...subId]/route.ts`

faz duas coisas principais:

1. registra o evento de clique internamente;
2. redireciona o usuário para `affiliate_links.original_url`.

Portanto, o clique interno pode ser contabilizado mesmo que `affiliate_links.original_url` não seja um link monetizado pelo Mercado Livre.

## 3.2 Ciclo automático / Official AI

No fluxo oficial de persistência, o adapter atualmente cria/atualiza o registro de `affiliate_links` utilizando como destino:

`input.offer.originalUrl`

Isso é adequado para marketplaces em que `originalUrl` já representa o destino monetizado, mas não é seguro como contrato genérico para Mercado Livre.

No caso do Mercado Livre, `offer.original_url` pode ser apenas:

`https://www.mercadolivre.com.br/p/MLB...`

ou outra URL canônica/comercial comum.

## 3.3 Publicação Expressa

A Publicação Expressa já reconhece `meli.la` como Mercado Livre e possui um resolvedor capaz de seguir o short link.

Porém, após resolver o produto, o fluxo atualmente tenta gerar outra URL de afiliado por meio de:

`generateMLAffiliateLinkWithId(canonicalUrl, mlAffiliateId)`

Isso cria um conflito de autoridade:

- o usuário fornece um link oficial gerado na Central de Afiliados;
- o sistema resolve esse link;
- em seguida, substitui a URL oficial de monetização por outra URL construída internamente.

## 3.4 Comportamento diferente já existente em outros marketplaces

Shopee e Amazon já possuem lógica para preservar o link de afiliado informado quando o input é reconhecido como afiliado.

Mercado Livre ainda não possui uma regra equivalente forte de preservação.

## 3.5 Banco de produção

Durante a análise foram observados muitos registros de Mercado Livre em `affiliate_links` apontando para URLs comuns de produto.

Também foram encontrados cliques internos em links publicados, demonstrando que o redirect do Caça Ofertas está recebendo tráfego.

Logo, o problema não deve ser tratado como ausência de tráfego apenas.

---

# 4. Causa raiz

## 4.1 Causa raiz principal

O sistema mistura duas responsabilidades diferentes em uma mesma URL:

- URL canônica/de extração do produto;
- URL monetizada/de afiliado.

Isso permite que uma URL tecnicamente válida para identificar o produto seja reutilizada como URL comercial final mesmo sem confirmação de monetização.

## 4.2 Causa secundária — Oracle

O ciclo automático não possui hoje uma barreira fail-closed específica para Mercado Livre que exija monetização confirmada antes de persistir/publicar o link.

## 4.3 Causa secundária — Publicação Expressa

O Mercado Livre não possui uma função de detecção/preservação equivalente às rotinas já existentes para links afiliados de Amazon e Shopee.

## 4.4 Causa secundária — métricas internas

A rota `/go/...` dispara tracking antes de excluir crawlers de preview.

Assim, agentes como previews sociais podem ser contabilizados como cliques internos, aumentando a diferença entre o número interno e o número oficial do marketplace.

---

# 5. Arquitetura alvo

A correção deverá separar claramente dois conceitos.

## 5.1 `canonical_url`

Finalidade:

- identificar o produto;
- resolver short links;
- obter `item_id` / `product_id`;
- buscar preço;
- buscar imagem;
- validar identidade;
- consultar APIs oficiais.

Nunca deve ser assumida automaticamente como URL monetizada.

## 5.2 `affiliate_url`

Finalidade:

- ser o destino comercial final do clique;
- conter ou preservar a atribuição oficial do programa de afiliados;
- ser usada por `/go/...`;
- ser persistida em `affiliate_links.original_url` no modelo atual, ou em campo equivalente caso seja necessário evoluir o contrato.

Regra central:

> Para Mercado Livre, somente um destino explicitamente classificado como monetizado poderá ser usado como `affiliate_url`.

---

# 6. Regra de ouro

Para qualquer oferta Mercado Livre:

`produto identificado != produto monetizado`

A identificação correta do item não será suficiente para liberar publicação.

O sistema deverá comprovar também um destino de afiliado válido.

---

# 7. Tratamento dos links oficiais da Central

## 7.1 Entrada `meli.la`

Exemplo:

`https://meli.la/12hoKT9`

Comportamento alvo:

1. preservar o input original como candidato prioritário de `affiliate_url`;
2. resolver o short link apenas para descobrir o produto;
3. extrair e validar `item_id` / identidade;
4. nunca substituir automaticamente o `meli.la` por uma URL comum de produto;
5. persistir o short link oficial como destino final quando ele for classificado como afiliado válido.

## 7.2 URL completa oficial do Mercado Livre

Exemplo de formato observado:

- domínio oficial Mercado Livre;
- `pdp_filters`;
- `matt_tool`;
- `ua`;
- parâmetros de compartilhamento.

Comportamento alvo:

1. preservar a URL original como possível `affiliate_url`;
2. extrair a URL/ID canônico para uso técnico;
3. não remover parâmetros de afiliado da URL comercial final;
4. validar que o item identificado corresponde ao item que será divulgado.

---

# 8. Não assumir `partner_id` como única autoridade

A implementação atual considera `partner_id` como sinal obrigatório de monetização.

Este contrato será revisto.

Não será feita uma troca cega para outro parâmetro específico.

A nova lógica deverá trabalhar com uma classificação explícita de origem do link, por exemplo:

- `official_meli_shortlink`;
- `official_affiliate_full_url`;
- `internally_generated_affiliate_url`;
- `plain_product_url`;
- `unknown`.

Somente classes aprovadas poderão ser usadas como destino monetizado.

---

# 9. Escopo da alteração

## Incluído

- Mercado Livre na Publicação Expressa;
- Mercado Livre nos ciclos automáticos Oracle / Official AI;
- persistência de `affiliate_links`;
- redirect `/go/...`;
- classificação de links oficiais;
- validação de monetização;
- testes unitários e de integração;
- telemetria sem exposição de credenciais/parâmetros sensíveis;
- correção do tracking de crawlers, se confirmada como segura no mesmo PR ou em commit separado dentro do mesmo plano.

## Fora de escopo

- Shopee Search Engine;
- algoritmo de descoberta do Oracle;
- ranking de ofertas;
- preços e extração de produto que já funcionam;
- sistema de copy;
- hashtags;
- Instagram Policy Guard;
- publicação do Facebook/Instagram;
- alteração de schema sem necessidade comprovada;
- backfill indiscriminado de links históricos.

---

# 10. Estratégia de implementação

## TASK 0 — Congelar baseline

Antes de qualquer alteração:

- confirmar SHA atual da `main`;
- registrar estado dos testes;
- identificar arquivos efetivamente envolvidos;
- confirmar que não há outra alteração de monetização em paralelo.

Critério de saída:

- baseline reproduzível.

---

## TASK 1 — Criar contrato de classificação de link Mercado Livre

Criar uma função central capaz de classificar um input de Mercado Livre sem transformar prematuramente a URL.

Contrato sugerido:

```ts
classifyMLAffiliateInput(url)
```

Saída sugerida:

```ts
{
  kind:
    | "official_meli_shortlink"
    | "official_affiliate_full_url"
    | "plain_product_url"
    | "unknown";
  monetized: boolean;
  affiliateUrl?: string;
}
```

Requisitos:

- determinístico;
- sem chamadas de IA;
- sem mutação;
- sem expor parâmetros sensíveis em logs.

---

## TASK 2 — Preservar `meli.la` na Publicação Expressa

Hoje o resolvedor já aceita `meli.la`.

A alteração será:

- resolver para identificar o produto;
- manter o short link original como `affiliate_url` quando classificado como oficial/monetizado;
- usar a URL resolvida somente como `canonical_url`.

Critério de aceite:

- `meli.la` entra na Publicação Expressa;
- produto é identificado;
- o destino final persistido continua sendo o `meli.la` oficial.

---

## TASK 3 — Preservar URL completa oficial da Central

Quando o usuário fornecer uma URL oficial completa com marcadores reconhecidos de afiliado/compartilhamento:

- não substituir por URL canônica;
- não reconstruir a monetização;
- não remover parâmetros necessários do destino comercial;
- continuar sanitizando apenas logs.

Critério de aceite:

- input oficial completo permanece o destino final.

---

## TASK 4 — Revisar `generateMLAffiliateLinkWithId`

A função atual não deve continuar sendo autoridade universal de monetização.

A implementação irá definir um dos seguintes destinos após inspeção final:

1. restringir a função somente a um fallback explicitamente suportado;
2. descontinuar seu uso para inputs oficiais da Central;
3. mantê-la apenas onde houver evidência de contrato válido e teste correspondente.

Regra:

> Nunca substituir um link oficial de afiliado fornecido pelo usuário por uma URL reconstruída internamente.

---

## TASK 5 — Revisar `validateAffiliateMonetization`

A validação deverá deixar de usar apenas `partner_id` como sinal de monetização.

Nova validação:

- entende a classe do link;
- aceita short link oficial reconhecido;
- aceita URL oficial completa reconhecida;
- rejeita URL comum de produto como monetizada;
- fail-closed em caso desconhecido.

---

## TASK 6 — Separar `canonicalUrl` e `affiliateUrl` no fluxo Express

Garantir que o pipeline mantenha ambas as variáveis até a persistência.

Exemplo alvo:

```text
input oficial afiliado
   ↓
classificação
   ↓
affiliateUrl = input oficial
   ↓
resolver produto
   ↓
canonicalUrl = URL técnica/canônica
   ↓
extrair dados
   ↓
persistir affiliateUrl como destino comercial
```

---

## TASK 7 — Blindar persistência de `affiliate_links`

`buildExpressAffiliateLinks` continuará gerando os `/go/...`, mas o `redirectUrl` deverá sempre receber o `affiliateUrl` aprovado.

Será adicionado teste garantindo:

- `original_url` em `affiliate_links` = URL monetizada;
- `tracked_url` = URL interna do Caça Ofertas;
- `tracked_url` nunca substitui o destino externo;
- URL canônica não sobrescreve URL afiliada.

---

## TASK 8 — Corrigir ciclo automático Oracle / Official AI para Mercado Livre

O fluxo automático não poderá mais persistir cegamente:

```text
offer.original_url → affiliate_links.original_url
```

para Mercado Livre.

Será introduzido um resolvedor/port específico para obter ou confirmar um `affiliateUrl` válido antes da persistência.

Comportamento esperado:

### Cenário A — monetização confirmada

- cria drafts normalmente;
- `/go/...` aponta para destino afiliado.

### Cenário B — monetização não confirmada

- fail-closed;
- não publica link Mercado Livre não monetizado;
- registra motivo operacional;
- oferta permanece disponível para tratamento posterior conforme estado definido na implementação.

Regra:

> O sistema não deve escolher “publicar sem comissão” silenciosamente.

---

## TASK 9 — Definir fonte oficial de monetização para ofertas Oracle

Durante a implementação será confirmado o mecanismo real disponível para gerar/obter link oficial afiliado de uma oferta descoberta automaticamente.

Possibilidades a validar tecnicamente:

- API oficial disponível ao programa;
- endpoint/contrato existente já configurado no projeto;
- transformação suportada pelo Mercado Livre;
- outra fonte oficial já utilizada pelo afiliado.

Não será inventado um algoritmo de afiliação sem confirmação.

Se não houver mecanismo oficial automatizável disponível:

- o ciclo automático de Mercado Livre deverá fail-close para monetização;
- ou usar apenas ofertas que já possuam um `affiliate_url` previamente confirmado.

---

## TASK 10 — Corrigir tracking de crawlers/previews

A rota `/go/...` hoje dispara tracking antes da decisão de preview.

Será revisada para diferenciar, no mínimo:

- clique humano provável;
- crawler de WhatsApp;
- `facebookexternalhit`;
- outros crawlers conhecidos, se necessário.

Objetivo:

- não inflar `affiliate_links.clicks` com scraping de preview;
- preservar geração de Open Graph;
- preservar funcionamento de WhatsApp/Facebook.

Esta task não altera monetização externa; apenas melhora confiabilidade da métrica interna.

---

## TASK 11 — Telemetria de monetização

Adicionar eventos estruturados sem armazenar tokens ou parâmetros sensíveis.

Eventos sugeridos:

```text
ml.affiliate.input.classified
ml.affiliate.destination.accepted
ml.affiliate.destination.rejected
ml.affiliate.oracle.blocked_unmonetized
ml.affiliate.express.preserved_official_link
```

Campos permitidos:

- offerId;
- channel;
- source;
- classification;
- monetized boolean;
- host;
- itemId;
- reason code.

Campos proibidos nos logs:

- `ua` completo;
- tokens;
- secrets;
- access tokens;
- IDs sensíveis não necessários;
- URL afiliada integral quando contiver parâmetros sensíveis.

---

## TASK 12 — Testes unitários

Adicionar testes para:

1. `meli.la` reconhecido como Mercado Livre;
2. `meli.la` preservado como `affiliateUrl`;
3. resolução de `meli.la` usada somente para identidade;
4. URL completa oficial preservada;
5. URL comum não classificada como monetizada;
6. `partner_id` não ser a única condição suportada;
7. URL afiliada nunca ser trocada por canonical URL;
8. mismatch de item continuar bloqueado;
9. SSRF continuar bloqueado;
10. redirect inesperado continuar bloqueado.

---

## TASK 13 — Testes da Publicação Expressa

Casos obrigatórios:

### Caso 1

Input:

`https://meli.la/...`

Resultado:

- sucesso de extração;
- `affiliateUrl` = input original;
- `canonicalUrl` = destino resolvido/técnico;
- `affiliate_links.original_url` = `meli.la/...`.

### Caso 2

Input URL completa oficial.

Resultado:

- preservação da URL afiliada;
- extração normal;
- nenhuma reconstrução indevida.

### Caso 3

Input URL comum de produto.

Resultado esperado:

- somente segue se existir mecanismo válido e comprovado para obter `affiliateUrl`;
- caso contrário, falha explícita de monetização.

---

## TASK 14 — Testes do Oracle

Adicionar cobertura garantindo:

- oferta ML comum não é publicada como afiliada sem monetização;
- oferta com `affiliateUrl` confirmado persiste corretamente;
- outros marketplaces não sofrem regressão;
- drafts existentes não são sobrescritos sem regra explícita.

---

## TASK 15 — Testes do `/go/...`

Garantir:

- usuário humano → tracking + redirect para affiliate URL;
- crawler de preview → comportamento de preview preservado;
- crawler não infla cliques se essa regra for implementada;
- redirect nunca aponta para canonical URL quando affiliate URL existir;
- erro seguro para URL inválida.

---

## TASK 16 — Auditoria de dados históricos

Antes de qualquer backfill:

- contar links ML atuais;
- identificar links publicados ainda ativos;
- separar URLs comuns, URLs oficiais e desconhecidas;
- não alterar histórico automaticamente.

Resultado esperado:

relatório de impacto antes de qualquer migração de dados.

---

## TASK 17 — Estratégia para links históricos

Não será feito backfill indiscriminado no primeiro momento.

Após validação da nova arquitetura, haverá três classes:

### A. Publicados e ainda ativos

Avaliar correção controlada somente se for possível gerar/preservar um destino oficial válido.

### B. Drafts não publicados

Podem ser candidatos a regeneração controlada.

### C. Ofertas antigas/inativas

Não alterar por padrão.

Toda alteração histórica deverá ser aprovada separadamente se envolver reescrita em produção.

---

## TASK 18 — Teste controlado em produção

Depois do merge e deploy:

1. escolher um produto Mercado Livre da Central de Afiliados;
2. copiar o `meli.la` oficial;
3. gerar via Publicação Expressa;
4. confirmar no banco que `affiliate_links.original_url` preserva o link oficial;
5. publicar em um canal controlado;
6. clicar manualmente uma vez;
7. confirmar incremento interno correto;
8. aguardar janela de atualização do painel Mercado Livre;
9. confirmar que o clique aparece na Central.

Não serão gerados cliques artificiais em massa.

---

## TASK 19 — Inspeção final

Antes de merge:

- revisar diff completo;
- confirmar que não houve alteração em copy;
- confirmar que Shopee/Amazon não foram afetados indevidamente;
- confirmar que segurança SSRF permanece;
- confirmar que logs não expõem parâmetros sensíveis;
- confirmar testes de monetização;
- confirmar testes de tracking;
- confirmar documentação de operação.

---

# 11. Arquivos prováveis de alteração

A lista final será confirmada durante TASK 0.

Arquivos já identificados:

- `src/lib/platforms/mercadolivre.ts`
- `src/lib/publish/actions.ts`
- `src/lib/publish/express-url-resolver.ts`
- `src/lib/publish/express-affiliate-links.ts`
- `src/lib/publish/ml-extraction-url.ts`
- `src/lib/ai/official/supabase-official-ai-adapter.ts`
- `src/app/go/[...subId]/route.ts`
- testes relacionados em `src/tests/...`

Pode ser criado um novo módulo dedicado, por exemplo:

`src/lib/platforms/mercadolivre-affiliate.ts`

ou equivalente, caso isso mantenha responsabilidades mais claras.

---

# 12. Invariantes que não podem ser quebradas

## Mercado Livre

- item errado nunca pode ser monetizado no lugar do item informado;
- `meli.la` oficial não pode ser descartado sem motivo;
- URL afiliada não pode ser substituída silenciosamente por URL comum;
- publicação automática deve fail-close sem monetização confirmada.

## Segurança

- SSRF permanece ativa;
- redirect para domínios inesperados permanece bloqueado;
- tokens nunca aparecem em logs;
- parâmetros sensíveis são sanitizados.

## Outros marketplaces

- Shopee continua com fluxo atual;
- Amazon continua com fluxo atual;
- Shein continua com fluxo atual.

## Redes sociais

- nenhuma alteração de copy;
- nenhuma alteração em hashtags;
- nenhuma alteração no mecanismo de Facebook comment link;
- nenhuma alteração na vitrine do Instagram.

---

# 13. Critérios globais de aceite

A correção somente será considerada pronta quando todos os itens abaixo estiverem verdadeiros.

1. Publicação Expressa aceita `meli.la` oficial de produto.
2. `meli.la` é preservado como destino afiliado.
3. URL resolvida é usada somente para extração/identidade quando houver link afiliado original.
4. URL completa oficial de afiliado é preservada.
5. URL comum não é tratada como monetizada por acidente.
6. Oracle não publica ML com destino comum sem monetização confirmada.
7. `/go/...` redireciona para a URL afiliada correta.
8. Métrica interna não depende de URL canônica.
9. Crawlers de preview não devem contaminar a métrica humana após a correção prevista.
10. Nenhuma regressão em Shopee/Amazon/Shein.
11. Nenhuma regressão de SSRF/redirect safety.
12. Testes passam.
13. Um teste real controlado confirma atribuição no painel Mercado Livre após a janela de atualização.

---

# 14. Rollback

A implementação deverá ser dividida em commits pequenos e reversíveis.

Se após deploy ocorrer problema:

1. reverter somente commits de monetização Mercado Livre;
2. preservar alterações não relacionadas já presentes na `main`;
3. não executar migração destrutiva de banco;
4. manter registro dos links previamente publicados;
5. impedir publicação automática de ML se houver dúvida sobre monetização.

Fail-closed é preferível a publicar ofertas sem atribuição.

---

# 15. Riscos

## Risco 1 — classificar erroneamente URL oficial

Mitigação:

- testes com exemplos reais;
- classificação restritiva;
- fail-closed.

## Risco 2 — quebrar extração ao preservar short link

Mitigação:

- manter canonical URL separada;
- resolver short link apenas na camada de identidade.

## Risco 3 — regressão nos previews sociais

Mitigação:

- alterações de tracking separadas da lógica OG;
- testes com user-agent crawler.

## Risco 4 — links históricos continuarem sem monetização

Mitigação:

- não mascarar o problema;
- relatório pós-fix;
- backfill controlado e aprovado separadamente.

## Risco 5 — inexistência de API oficial para gerar link afiliado no Oracle

Mitigação:

- não inventar monetização;
- fail-close;
- somente publicar ML automático quando um link oficial puder ser obtido ou confirmado.

---

# 16. Ordem recomendada de execução

Prioridade operacional:

```text
P0.1  Classificação de link afiliado ML
P0.2  Preservação de meli.la na Express
P0.3  Separação canonicalUrl / affiliateUrl
P0.4  Correção de persistência
P0.5  Fail-closed Oracle sem monetização
P0.6  Testes de monetização
P1.1  Correção de crawlers no tracking
P1.2  Auditoria dos links históricos
P1.3  Teste real controlado em produção
```

---

# 17. Definição de sucesso

A correção estará concluída quando a seguinte cadeia estiver garantida:

```text
Central de Afiliados / Oracle
        ↓
produto identificado
        ↓
affiliate URL oficialmente válida
        ↓
Caça Ofertas /go/...
        ↓
tracking interno confiável
        ↓
redirect para affiliate URL
        ↓
Mercado Livre atribui o clique ao afiliado
```

E nunca mais:

```text
produto identificado
        ↓
URL comum
        ↓
/publicação
        ↓
clique interno sem atribuição ML
```

---

# 18. Relação com o plano de unificação das copies

Este plano é independente do documento de unificação das copies.

Ordem recomendada:

1. corrigir monetização Mercado Livre;
2. validar em produção;
3. somente depois iniciar a unificação das copies.

Motivo:

Monetização é funcionalidade financeira crítica e tem prioridade sobre melhoria editorial.

---

# 19. Estado deste plano

Status atual:

`AWAITING APPROVAL`

Nenhuma alteração de runtime descrita neste documento deve ser iniciada antes da aprovação explícita do usuário.
