# Fluxo de Campanha por Oferta — Plano de Implementação

Data do plano: 2026-08-21
Projeto: Caça Ofertas Oficial
Objetivo principal: estruturar o fluxo pós-vídeo para trabalhar uma oferta de forma coordenada entre Instagram, Facebook e WhatsApp, medir o resultado por canal e aumentar a chance da primeira venda.

## 1. Decisões já tomadas

Este documento congela as decisões discutidas antes da implementação.

### 1.1 O que permanece como está

Não alterar agora:

- Tendências IA e sua lógica de seleção de produtos.
- Fluxo de aprovação de ofertas.
- Aba Vídeos de Ofertas.
- Prompt atual de usabilidade da aba Vídeos de Ofertas.
- Geração manual do vídeo no Gemini.
- Worker de vídeo existente.
- Fluxos já existentes de publicação que estejam funcionando.
- CTAs apenas por tentativa e erro.

A ideia é evitar mudanças simultâneas em muitas partes do sistema e concentrar o trabalho na etapa ainda ausente: campanha, distribuição coordenada e medição.

### 1.2 Fluxo operacional congelado

Fluxo-base:

1. Tendências IA escolhe o produto.
2. Usuário aprova a oferta.
3. Vídeos de Ofertas fornece imagem e prompt atual.
4. Usuário gera o vídeo no Gemini.
5. A oferta passa a ser trabalhada como uma campanha única.
6. Publicar Reel principal no Instagram.
7. Reforçar a mesma oferta em Stories.
8. Reutilizar o vídeo no Facebook Feed.
9. Distribuir em grupos de Facebook compatíveis com o nicho.
10. Enviar a mesma oferta no WhatsApp.
11. Trabalhar a mesma oferta por uma janela de 24–48 horas.
12. Medir visualizações, cliques, pedidos e comissão por canal.
13. Tomar decisão com base nos dados antes de seguir para outra oferta.

## 2. Princípio do novo fluxo

Uma oferta deve ser tratada como uma campanha curta e coordenada, não como uma publicação isolada.

Regra principal:

**1 oferta → 1 campanha → vários canais → links rastreáveis → métricas → decisão.**

O sistema deverá deixar claro:

- qual oferta está sendo trabalhada;
- qual vídeo pertence à campanha;
- em quais canais ela já foi distribuída;
- quais tarefas ainda estão pendentes;
- quantos cliques vieram de cada canal;
- se houve pedido e comissão;
- qual foi o resultado final da campanha.

## 3. Escopo da primeira implementação

A primeira versão deve ser simples e segura. Não tentar automatizar tudo de uma vez.

### Incluído

- Entidade de campanha vinculada a uma oferta.
- Checklist de distribuição por canal.
- Status da campanha.
- Janela de acompanhamento de 24–48h.
- Links/identificadores rastreáveis por canal.
- Painel básico de métricas da campanha.
- Resultado final da campanha.

### Fora do escopo inicial

- Alterar o algoritmo do Tendências IA.
- Alterar o prompt atual dos vídeos.
- Automatizar geração no Gemini.
- Automatizar postagem em Facebook Groups sem validação.
- Criar inteligência automática complexa antes de termos dados suficientes.
- Trocar CTAs em massa.
- Reinventar o fluxo de publicação atual.

## 4. Fase 0 — Auditoria antes de alterar código

Antes de criar qualquer tabela ou tela, auditar o que já existe.

### TASK 0.1 — Mapear modelo de ofertas

Verificar:

- tabela principal de ofertas;
- identificador da oferta;
- vínculo com produto do Tendências IA;
- marketplace;
- item_id/product_id quando disponíveis;
- preço;
- URL afiliada;
- imagem;
- status de aprovação;
- timestamps relevantes.

Resultado esperado: definir o campo exato que será FK da campanha.

### TASK 0.2 — Mapear publicação social existente

Localizar:

- tabelas de posts/publicações;
- drafts sociais;
- estado de publicação;
- canais existentes;
- IDs externos, se houver;
- timestamps de publicação;
- eventuais métricas já capturadas.

Resultado esperado: reutilizar estruturas existentes sempre que possível.

### TASK 0.3 — Mapear rastreamento `/go/`

Confirmar:

- como os links rastreáveis são gerados;
- quais parâmetros são persistidos;
- onde os cliques são registrados;
- se já existe `source`, `channel`, `campaign`, `post_id` ou equivalente;
- como pedido/comissão são relacionados ao clique/oferta.

Resultado esperado: evitar criar um segundo sistema de tracking desnecessário.

### TASK 0.4 — Mapear tela Vídeos de Ofertas

Identificar o melhor ponto de entrada para a campanha após o vídeo estar pronto.

Resultado esperado: definir se haverá botão, card ou seção “Criar/Iniciar campanha”.

### TASK 0.5 — Registrar arquitetura encontrada

Antes da implementação, atualizar este documento com:

- tabelas reutilizadas;
- novos campos necessários;
- arquivos que serão alterados;
- riscos encontrados.

## 5. Fase 1 — Modelo de campanha

### TASK 1.1 — Definir entidade de campanha

Modelo conceitual mínimo:

- `id`
- `offer_id`
- `trend_product_id` opcional, se fizer sentido
- `name` ou título derivado do produto
- `status`
- `started_at`
- `ends_at`
- `created_at`
- `updated_at`
- `objective` com default de conversão/primeira venda
- referência ao vídeo, se a arquitetura atual permitir

Status sugeridos:

- `draft`
- `ready`
- `active`
- `completed`
- `cancelled`

Não implementar enum rígido sem antes verificar o padrão atual do banco.

### TASK 1.2 — Regra de uma campanha ativa por oferta

Avaliar se deve existir no máximo uma campanha ativa para a mesma oferta.

Versão inicial recomendada:

- permitir histórico de campanhas;
- impedir duplicação acidental de campanha ativa para a mesma oferta.

### TASK 1.3 — Janela de campanha

Default inicial:

- 24 horas ou 48 horas configuráveis;
- sem automatizar encerramento agressivo no primeiro momento;
- mostrar prazo e status no dashboard.

### TASK 1.4 — Migration segura

Se nova tabela for necessária:

- migration pequena;
- nenhuma alteração destrutiva;
- sem remover colunas existentes;
- sem mudar comportamento do Tendências IA;
- validar rollback lógico.

## 6. Fase 2 — Checklist de distribuição

Cada campanha deverá mostrar claramente o que foi ou não feito.

### TASK 2.1 — Canais iniciais

Checklist inicial:

- Instagram Reel
- Instagram Stories
- Facebook Feed
- Facebook Groups
- WhatsApp

### TASK 2.2 — Estado por canal

Estados mínimos sugeridos:

- `pending`
- `ready`
- `published`
- `skipped`

Campos úteis:

- `published_at`
- `external_url` opcional
- `external_post_id` opcional
- observação curta

### TASK 2.3 — Interface do checklist

Na campanha, mostrar:

- nome do canal;
- status;
- ação principal;
- data/hora quando publicado;
- indicador visual do que falta.

O usuário deve conseguir abrir a campanha e entender em poucos segundos a próxima ação.

### TASK 2.4 — Não automatizar grupos do Facebook na V1

Facebook Groups deve inicialmente ser checklist/manual porque:

- regras variam por grupo;
- links podem ser proibidos;
- cada grupo exige contexto;
- publicar automaticamente aumenta risco de spam e bloqueio.

## 7. Fase 3 — Material por canal

A campanha deve trabalhar a mesma oferta, mas sem obrigar o mesmo texto em todos os canais.

### TASK 3.1 — Instagram Reel

Usar:

- vídeo de usabilidade já gerado pelo fluxo atual;
- legenda compatível com Instagram;
- manter estratégia atual de link/vitrine enquanto não houver mudança aprovada.

### TASK 3.2 — Instagram Stories

Criar apoio para a mesma oferta.

V1 pode gerar apenas conteúdo/copy sugerido, sem automação total.

Objetivo:

- reforçar a oferta;
- preço atual;
- contexto simples;
- levar o interessado ao destino configurado.

### TASK 3.3 — Facebook Feed

Reutilizar o Reel principal.

Gerar legenda própria para Facebook sem exigir novo vídeo.

### TASK 3.4 — Facebook Groups

Gerar texto contextualizado ao nicho, evitando spam genérico.

Exemplo de lógica por categoria:

- tênis/moda → moda, corrida, academia, achadinhos relacionados;
- segurança → casa, condomínio, segurança residencial;
- infantil → pais, mães, educação;
- games → comunidades gamer.

Não inventar grupos. Pesquisa de grupos reais será uma etapa operacional separada.

### TASK 3.5 — WhatsApp

Tratar WhatsApp como canal importante de fechamento.

V1 deve gerar uma mensagem curta contendo apenas dados verdadeiros da oferta, por exemplo:

- nome do produto;
- preço;
- dado de demanda/desconto somente quando factual e disponível;
- link rastreável específico do WhatsApp.

Evitar excesso de mensagens e múltiplas ofertas simultâneas durante o teste controlado.

## 8. Fase 4 — Tracking por canal

Esta fase é crítica.

### TASK 4.1 — Definir identidade da origem do clique

Cada destino deve permitir identificar, no mínimo:

- campanha;
- oferta;
- canal;
- opcionalmente publicação específica.

Canais iniciais:

- `instagram_reel`
- `instagram_story`
- `facebook_feed`
- `facebook_group`
- `whatsapp`

### TASK 4.2 — Reutilizar `/go/` existente

Prioridade absoluta: estender/reutilizar o tracking existente se ele já suportar parâmetros de origem.

Não criar outro redirector sem necessidade.

### TASK 4.3 — Garantir monetização

Todo link de campanha deve continuar obedecendo às regras existentes de monetização fail-closed.

Nunca criar link de campanha que remova ou contorne URL afiliada válida.

### TASK 4.4 — Cliques por campanha e canal

Criar consultas que retornem:

- clicks total;
- clicks por canal;
- clicks únicos, se já houver estrutura confiável;
- horário/data dos clicks.

### TASK 4.5 — Pedidos e comissão

Quando houver dados do marketplace:

- relacionar pedido à oferta/campanha conforme a capacidade real do tracking;
- mostrar número de pedidos;
- comissão confirmada/estimada conforme dados existentes;
- não atribuir venda a canal sem evidência suficiente.

## 9. Fase 5 — Tela da campanha

### TASK 5.1 — Card/resumo

Mostrar:

- produto;
- marketplace;
- preço atual;
- imagem;
- status da campanha;
- início;
- prazo restante;
- total de cliques;
- pedidos;
- comissão.

### TASK 5.2 — Checklist operacional

Mostrar em destaque os 5 canais da campanha e seus estados.

### TASK 5.3 — Métricas por canal

Tabela simples:

| Canal | Status | Cliques | Pedidos atribuíveis | Comissão atribuível |
|---|---|---:|---:|---:|
| Instagram Reel | | | | |
| Instagram Story | | | | |
| Facebook Feed | | | | |
| Facebook Groups | | | | |
| WhatsApp | | | | |

Somente exibir atribuição quando tecnicamente sustentada.

### TASK 5.4 — Próxima ação

A tela deve destacar uma próxima ação concreta, por exemplo:

- “Publicar Reel”
- “Enviar no WhatsApp”
- “Aguardar dados”
- “Revisar campanha encerrada”

## 10. Fase 6 — Encerramento e decisão

### TASK 6.1 — Encerrar campanha

Ao final da janela:

- permitir encerrar manualmente;
- registrar `completed_at` ou equivalente;
- preservar histórico.

### TASK 6.2 — Resultado comercial

Resumo final:

- views quando informadas/disponíveis;
- clicks total;
- clicks por canal;
- pedidos;
- comissão;
- conversão click→pedido quando possível.

### TASK 6.3 — Classificação do resultado

No início, usar regras simples e transparentes, não IA opaca.

Exemplos conceituais:

- pouca visualização → problema provável de alcance/criativo/distribuição;
- boa visualização e poucos cliques → baixo interesse comercial/contexto;
- cliques e zero pedido → oferta/página/preço/confiança precisam análise;
- pedido → campanha vencedora e candidata a repetição.

Essas classificações não devem ser tratadas como prova causal automática.

### TASK 6.4 — Feedback futuro para Tendências IA

Não implementar na primeira versão.

Preparar os dados para que, depois de acumular campanhas suficientes, o Tendências IA possa aprender com:

- categoria;
- marketplace;
- faixa de preço;
- canal;
- clicks;
- pedidos;
- comissão;
- histórico real de conversão.

## 11. Fase 7 — Pesquisa e operação de Facebook Groups

Esta frente é operacional e deve ser baseada em grupos reais, não nomes inventados.

### TASK 7.1 — Pesquisa por oferta/nicho

Para cada campanha que fizer sentido em grupos:

- encontrar grupos reais;
- validar atividade recente;
- verificar nicho;
- verificar regras quando públicas;
- identificar se links/ofertas são aceitos;
- evitar grupos abandonados ou genéricos sem intenção.

### TASK 7.2 — Registrar grupos usados

Manter histórico de:

- nome do grupo;
- URL/ID quando possível;
- nicho;
- data da publicação;
- campanha;
- resultado observável.

### TASK 7.3 — Aprender quais grupos performam

Depois de dados suficientes, comparar:

- cliques;
- engajamento;
- vendas;
- bloqueios/rejeições.

## 12. Fase 8 — WhatsApp como canal de fechamento

O WhatsApp deve ser tratado como audiência própria e voluntária.

### TASK 8.1 — Link específico por campanha

Cada campanha deve ter origem `whatsapp` no tracking.

### TASK 8.2 — Copy curta e factual

Gerar mensagem pronta sem inventar benefícios.

### TASK 8.3 — Não saturar a audiência

Durante o teste controlado:

- focar em uma oferta principal;
- evitar rajada de produtos concorrendo pela mesma atenção;
- usar os resultados para definir frequência futura.

### TASK 8.4 — Medir crescimento da base

Futuramente registrar:

- inscritos/participantes;
- crescimento;
- clicks por envio;
- vendas por envio.

Não é requisito da primeira migration se não existir estrutura simples para isso.

## 13. Fase 9 — Testes obrigatórios

### TASK 9.1 — Banco

Testar:

- criar campanha;
- impedir inconsistências;
- atualizar status;
- checklist;
- encerramento;
- integridade com offer_id.

### TASK 9.2 — Tracking

Para cada canal:

- gerar link;
- abrir link;
- confirmar redirect correto;
- confirmar monetização;
- confirmar registro do clique com origem correta.

### TASK 9.3 — UI

Validar:

- desktop;
- mobile;
- campanha sem métricas;
- campanha ativa;
- campanha concluída;
- canal skipped;
- erro de API.

### TASK 9.4 — Regressão

Garantir que mudanças não quebrem:

- Tendências IA;
- aprovação de oferta;
- Vídeos de Ofertas;
- geração de prompts;
- redirects `/go/` atuais;
- publicações existentes;
- workers existentes.

### TASK 9.5 — Build e testes existentes

Antes de deploy:

- testes unitários relevantes;
- testes de integração relevantes;
- build Next.js;
- migration validada.

## 14. Fase 10 — Deploy seguro

### TASK 10.1 — Revisar diff

Antes do commit/deploy:

- listar arquivos modificados;
- confirmar ausência de alterações fora do escopo;
- confirmar que nenhum worker não relacionado foi alterado.

### TASK 10.2 — Aplicar migration

Aplicar somente após validação da estrutura e do código que a utiliza.

### TASK 10.3 — Deploy Vercel

Validar status Ready e testar a nova tela em produção.

### TASK 10.4 — Oracle

Só sincronizar/reiniciar processo Oracle se esta implementação realmente alterar código executado na Oracle.

Não reiniciar serviços não relacionados.

### TASK 10.5 — Smoke test em produção

Fluxo mínimo:

1. selecionar uma oferta aprovada;
2. criar campanha;
3. visualizar checklist;
4. gerar links por canal;
5. testar um redirect;
6. marcar canal como publicado;
7. confirmar clique registrado;
8. confirmar dashboard atualizado.

## 15. Primeira campanha piloto

Depois da implementação, executar uma única campanha controlada.

### Procedimento

1. Escolher uma oferta já aprovada pelo fluxo atual.
2. Gerar vídeo no Gemini com o prompt atual da aba Vídeos de Ofertas.
3. Criar campanha.
4. Publicar Reel no Instagram.
5. Publicar Stories.
6. Publicar o mesmo vídeo no Facebook Feed.
7. Usar grupos reais do nicho quando aplicável.
8. Enviar a oferta no WhatsApp.
9. Trabalhar a mesma oferta por 24–48h.
10. Não interpretar várias ofertas misturadas como um único teste.
11. Ao final, revisar dados da campanha.

## 16. Métricas mínimas da campanha piloto

Registrar, conforme disponibilidade real:

- visualizações do Reel;
- visualizações/interações de Stories;
- visualizações do Facebook;
- clicks Instagram;
- clicks Facebook Feed;
- clicks Facebook Groups;
- clicks WhatsApp;
- total de clicks;
- pedidos;
- comissão;
- conversão click→pedido.

Métricas de plataforma que não estiverem disponíveis automaticamente podem ser registradas manualmente na primeira versão, se necessário. Não criar integrações complexas apenas para a V1.

## 17. Critérios de sucesso da implementação

A implementação estará pronta quando for possível:

- criar uma campanha a partir de uma oferta aprovada;
- ver claramente os canais a publicar;
- marcar o progresso da distribuição;
- usar links rastreáveis diferentes por canal;
- ver clicks por canal;
- ver pedidos/comissão quando disponíveis;
- encerrar a campanha;
- consultar o histórico sem perder os dados;
- executar tudo sem quebrar o fluxo atual de Tendências IA → aprovação → Vídeos de Ofertas → Gemini.

## 18. Ordem recomendada para amanhã

Não começar programando diretamente.

Ordem:

1. Executar Fase 0 completa.
2. Atualizar neste documento o resultado da auditoria.
3. Confirmar desenho do banco.
4. Implementar Fase 1 e Fase 2.
5. Testar criação de campanha + checklist.
6. Implementar tracking por canal.
7. Implementar tela e métricas básicas.
8. Executar regressão.
9. Deploy.
10. Só então iniciar a campanha piloto.

## 19. Regra de segurança do trabalho

Se durante a auditoria for descoberto que uma task exige alterar parte crítica do fluxo atual, parar antes de modificar e reavaliar.

Não fazer alterações amplas “aproveitando” a mesma implementação.

O objetivo desta entrega é criar uma camada pós-vídeo confiável de campanha, distribuição e medição.

## 20. Resumo final

O sistema já cobre:

**Tendências IA → aprovação → Vídeos de Ofertas → Gemini.**

A implementação planejada cobre:

**vídeo pronto → campanha → checklist → distribuição por canal → tracking → métricas → decisão.**

Este documento será a referência de execução das tasks na próxima sessão.