# Fluxo de Campanha por Oferta — Plano Canônico de Implementação

Data: 2026-08-22  
Projeto: Caça Ofertas Oficial  
Status: **documento canônico para início da implementação**  
Objetivo principal: trabalhar uma oferta por vez como uma campanha curta, coordenada e mensurável, com foco em alcançar a primeira venda e aprender quais canais realmente convertem.

> Este documento substitui como referência operacional o plano de 2026-08-21. O arquivo anterior deve ser tratado como histórico. A implementação deve partir deste documento.

---

## 1. Decisões congeladas

### 1.1 O que NÃO será alterado agora

- Tendências IA e sua lógica atual de seleção.
- Fluxo atual de aprovação de ofertas.
- Aba Vídeos de Ofertas.
- Prompt atual de usabilidade da aba Vídeos de Ofertas.
- Geração manual do vídeo no Gemini.
- Worker de vídeo existente.
- Infraestrutura de Trends que já está estável.
- CTAs apenas por tentativa e erro.

### 1.2 Princípio do novo fluxo

Regra central:

**1 oferta → 1 campanha → vários canais → links oficiais/rastreáveis → métricas → decisão.**

Não publicar dezenas de ofertas sem aprendizado. A mesma oferta deve ser trabalhada de forma coordenada até esgotarmos as possibilidades razoáveis dentro da janela definida.

### 1.3 Fluxo-base congelado

1. Tendências IA seleciona o produto.
2. Usuário aprova a oferta.
3. Vídeos de Ofertas fornece imagem + prompt atual.
4. Usuário gera o vídeo no Gemini.
5. A oferta vira uma campanha ativa.
6. Publicar Reel principal no Instagram.
7. Reforçar a mesma oferta em Stories.
8. Reutilizar o vídeo no Facebook Feed.
9. Publicar em grupos reais e compatíveis com o nicho quando permitido.
10. Enviar a mesma oferta no WhatsApp.
11. Trabalhar a oferta por 24–48h inicialmente.
12. Medir views quando disponíveis, cliques, pedidos e comissão.
13. Encerrar, repetir ou ajustar com base em dados.

---

## 2. Papel dos formatos de vídeo

### 2.1 Formato principal para Reels

Priorizar demonstração/usabilidade com pessoa quando o produto se beneficia de contexto real de uso.

Exemplos:

- moda/tênis/fitness → pessoa usando;
- casa/cozinha/limpeza → pessoa executando a tarefa;
- beleza → pessoa aplicando/manuseando;
- eletrônicos/games → pessoa usando em contexto real;
- pet → interação natural com o animal quando aplicável.

### 2.2 Avatar

Avatar não será formato padrão do Reel principal. Pode ser usado como peça complementar quando fizer sentido para apresentação da oferta, preço ou contexto.

### 2.3 Regra atual do Gemini

Manter o prompt atual da aba Vídeos de Ofertas. Não abrir nova frente de ajuste de prompt antes de termos dados do novo fluxo de campanha.

---

## 3. Fase 0 — Auditoria antes de alterar código

Nenhuma migration ou alteração estrutural deve ser feita antes desta fase.

### TASK 0.1 — Mapear ofertas

Confirmar:

- tabela principal de ofertas;
- `offer_id`;
- vínculo com Tendências IA;
- marketplace;
- `item_id` / `product_id`;
- preço;
- URL de origem;
- URL afiliada atual;
- imagem;
- aprovação;
- timestamps.

**Saída:** definir a FK exata da campanha.

### TASK 0.2 — Mapear publicações existentes

Localizar:

- tabelas de posts/drafts;
- status de publicação;
- canais já modelados;
- IDs externos;
- timestamps;
- métricas existentes.

**Saída:** reutilizar estruturas existentes quando possível.

### TASK 0.3 — Auditar tracking atual `/go/`

Confirmar:

- geração de redirect;
- persistência de clique;
- `source`, `channel`, `campaign`, `post_id` ou equivalentes;
- vínculo clique → oferta;
- vínculo pedido/comissão → oferta;
- quais canais já podem ser identificados.

**Saída:** decidir o que continua usando `/go/` e o que pode migrar para link oficial do marketplace.

### TASK 0.4 — Auditar Shopee afiliado

Verificar na implementação e na conta:

- como o link afiliado Shopee é obtido hoje;
- se existe endpoint/API oficial disponível para nossa conta;
- se a geração automatizada de Link de Conversão é suportada;
- se os Sub_ids podem ser definidos por campanha/canal;
- formato retornado, incluindo link curto oficial `s.shopee.com.br/...` quando disponível;
- como validar monetização antes de publicar.

Referência funcional oficial validada em 2026-08-22: a Shopee permite gerar links no Portal/App e adicionar Sub_ids para rastrear campanha, rede social e formato. O link precisa ser gerado pela plataforma da Shopee para garantir a atribuição.

### TASK 0.5 — Auditar Mercado Livre afiliado

Verificar:

- como o link afiliado ML é obtido hoje;
- uso do Gerador de Links/Barra de Afiliados;
- possibilidade real de automação para nossa conta;
- uso de Etiquetas por campanha/canal;
- escolha entre link curto/completo;
- restrições de redirecionamento e páginas permitidas.

Referência funcional oficial validada em 2026-08-22: o Mercado Livre permite Gerador de Links/Barra de Afiliados, Etiquetas para origem e escolha entre link curto ou completo. Redirecionamento automático para Mercado Livre não deve ser usado para contornar as ferramentas oficiais.

### TASK 0.6 — Mapear Vídeos de Ofertas

Definir o melhor ponto de entrada para:

- criar campanha;
- associar vídeo pronto;
- iniciar checklist.

### TASK 0.7 — Registrar arquitetura encontrada

Atualizar este documento antes da implementação com:

- tabelas reutilizadas;
- tabelas/campos novos;
- arquivos afetados;
- riscos;
- decisões finais sobre links oficiais.

---

## 4. Fase 1 — Entidade de campanha

### TASK 1.1 — Modelo mínimo

Campos conceituais:

- `id`
- `offer_id`
- `trend_product_id` opcional
- título/nome derivado
- `status`
- `started_at`
- `ends_at`
- `completed_at`
- `created_at`
- `updated_at`
- objetivo comercial
- referência ao vídeo, quando compatível com arquitetura atual

Status sugeridos:

- `draft`
- `ready`
- `active`
- `completed`
- `cancelled`

Não criar enum rígido antes de verificar padrão atual do banco.

### TASK 1.2 — Evitar duplicação ativa

Permitir histórico, mas impedir duas campanhas ativas acidentais para a mesma oferta.

### TASK 1.3 — Janela de campanha

Default inicial: 24–48h configuráveis.

Não encerrar automaticamente de forma agressiva na V1.

### TASK 1.4 — Migration segura

- pequena;
- não destrutiva;
- sem remoção de colunas existentes;
- sem alterar Trends;
- com rollback lógico.

---

## 5. Fase 2 — Checklist de distribuição

### TASK 2.1 — Canais iniciais

- Instagram Reel
- Instagram Stories
- Facebook Feed
- Facebook Groups
- WhatsApp

### TASK 2.2 — Estado por canal

Estados sugeridos:

- `pending`
- `ready`
- `published`
- `skipped`

Campos úteis:

- `published_at`
- URL externa opcional
- ID externo opcional
- observação curta

### TASK 2.3 — Tela operacional

A campanha deve responder em segundos:

- o que já foi publicado;
- o que falta;
- qual a próxima ação.

### TASK 2.4 — Facebook Groups manual na V1

Não automatizar publicação em grupos no primeiro ciclo.

Motivos:

- regras variam;
- links podem ser proibidos;
- risco de spam/bloqueio;
- cada grupo pede contexto próprio.

---

## 6. Fase 3 — Material por canal

### TASK 3.1 — Instagram Reel

Usar o vídeo de usabilidade já gerado no fluxo atual.

### TASK 3.2 — Instagram Stories

Gerar apoio para a mesma oferta:

- contexto curto;
- preço factual;
- reforço da oferta;
- destino configurado.

### TASK 3.3 — Facebook Feed

Reutilizar o Reel e adaptar a legenda para Facebook.

### TASK 3.4 — Facebook Groups

Gerar texto contextualizado por nicho, sem inventar grupos.

### TASK 3.5 — WhatsApp

WhatsApp será tratado como canal importante de fechamento.

Mensagem curta e factual contendo:

- produto;
- preço;
- dado de demanda/desconto apenas se confirmado;
- link específico/rastreável do canal.

Não saturar a audiência com várias ofertas simultâneas durante o teste controlado.

---

## 7. Fase 4 — Links oficiais dos marketplaces + tracking

Esta fase passa a ser **prioridade alta**.

### TASK 4.1 — Estratégia de URL por marketplace

Objetivo: sempre que for possível preservar atribuição e rastreamento, divulgar o **link oficial do próprio marketplace** ao usuário.

Exemplos de formato:

- Shopee: `https://s.shopee.com.br/...`
- Mercado Livre: link oficial gerado pelo programa de afiliados, curto ou completo conforme opção disponível.

Nunca fabricar códigos oficiais nem mascarar um redirect próprio como se fosse do marketplace.

### TASK 4.2 — Shopee Sub_id por campanha/canal

Estrutura conceitual:

- campanha: identificador interno curto;
- canal: `instagram_reel`, `instagram_story`, `facebook_feed`, `facebook_group`, `whatsapp`;
- opcional: criativo/post.

Exemplo conceitual de Sub_ids:

- `camp_123`
- `whatsapp`
- `reel`

Respeitar os limites e regras oficiais da Shopee.

### TASK 4.3 — Mercado Livre Etiquetas

Criar estratégia equivalente usando Etiquetas.

Exemplos:

- `instagram`
- `facebook`
- `whatsapp`
- identificador de campanha quando couber dentro das regras de nome.

### TASK 4.4 — Geração automática vs manual

A auditoria deve classificar cada marketplace em uma das opções:

1. **Automação oficial disponível e segura** → integrar.
2. **Sem automação oficial acessível** → manter etapa manual assistida no sistema.
3. **Automação não permitida ou arriscada** → não implementar workaround.

### TASK 4.5 — Fail-closed de monetização

Nenhuma campanha pode ficar `ready` para publicação quando:

- link de afiliado obrigatório estiver ausente;
- monetização não puder ser validada;
- link oficial tiver sido gerado de modo incompatível com o programa.

### TASK 4.6 — Tracking interno complementar

Mesmo usando links oficiais, manter internamente:

- campanha;
- oferta;
- canal;
- link oficial gerado;
- Sub_id/Etiqueta usada;
- timestamps.

### TASK 4.7 — Papel futuro do `/go/`

Após auditoria, decidir:

- manter `/go/` apenas onde ele agrega tracking sem conflitar com regras;
- deixar de exibi-lo ao usuário quando o link oficial puder ser usado diretamente;
- nunca usar `/go/` para redirecionamento proibido por marketplace.

### TASK 4.8 — Cliques e conversões

Combinar, quando tecnicamente possível:

- métricas internas;
- relatórios de Sub_id Shopee;
- relatórios de Etiquetas ML;
- pedidos;
- comissão.

Não atribuir venda a canal sem evidência suficiente.

---

## 8. Fase 5 — Tela da campanha

### TASK 5.1 — Resumo

Mostrar:

- produto;
- marketplace;
- preço;
- imagem;
- status;
- início/fim;
- link oficial atual;
- cliques;
- pedidos;
- comissão.

### TASK 5.2 — Checklist

Mostrar os 5 canais e seus estados.

### TASK 5.3 — Links por canal

Exibir/copiar o link correto de cada canal, com Sub_id/Etiqueta correspondente quando aplicável.

### TASK 5.4 — Métricas por canal

Tabela mínima:

| Canal | Status | Link | Cliques | Pedidos atribuíveis | Comissão atribuível |
|---|---|---|---:|---:|---:|
| Instagram Reel | | | | | |
| Instagram Story | | | | | |
| Facebook Feed | | | | | |
| Facebook Groups | | | | | |
| WhatsApp | | | | | |

### TASK 5.5 — Próxima ação

Mostrar uma única próxima ação clara:

- publicar Reel;
- publicar Story;
- publicar Facebook;
- enviar WhatsApp;
- pesquisar grupo;
- aguardar dados;
- revisar campanha.

---

## 9. Fase 6 — Facebook Groups

### TASK 6.1 — Pesquisa real por nicho

Para cada campanha:

- encontrar grupos reais;
- validar atividade recente;
- conferir compatibilidade de nicho;
- verificar regras públicas;
- confirmar se links/ofertas são aceitos quando isso estiver disponível publicamente.

### TASK 6.2 — Histórico de grupos

Guardar:

- nome;
- URL/ID;
- nicho;
- campanha;
- data da publicação;
- resultado observável.

### TASK 6.3 — Aprendizado

Comparar ao longo do tempo:

- cliques;
- engajamento;
- vendas;
- rejeições/bloqueios.

---

## 10. Fase 7 — WhatsApp como canal de fechamento

### TASK 7.1 — Link próprio de WhatsApp

Cada campanha deve ter link identificado especificamente como WhatsApp via Sub_id/Etiqueta ou mecanismo equivalente.

### TASK 7.2 — Mensagem factual

Gerar copy curta e pronta para envio.

### TASK 7.3 — Controle de frequência

Durante o teste de uma oferta, evitar misturar várias campanhas no WhatsApp.

### TASK 7.4 — Crescimento da audiência

Planejar futuramente a captação voluntária de novos inscritos, sem transformar esta fase inicial em projeto paralelo.

---

## 11. Fase 8 — Encerramento e decisão

### TASK 8.1 — Encerrar campanha

Registrar status final e preservar histórico.

### TASK 8.2 — Resumo comercial

Mostrar:

- views quando disponíveis;
- cliques totais;
- cliques por canal;
- pedidos;
- comissão;
- conversão clique → pedido quando suportada.

### TASK 8.3 — Diagnóstico transparente

Regras simples:

- pouca visualização → investigar alcance/distribuição/criativo;
- boa visualização + poucos cliques → baixo interesse comercial/contexto;
- cliques + zero pedido → investigar oferta, preço, página, confiança ou intenção;
- pedido → campanha vencedora, candidata a repetição.

Não tratar essas regras como causalidade comprovada.

### TASK 8.4 — Repetição da oferta

Se houver sinais fortes mas não venda, permitir novo ciclo controlado da mesma oferta antes de abandoná-la, desde que preço, validade e monetização continuem corretos.

### TASK 8.5 — Feedback futuro ao Tendências IA

Não implementar ainda.

Preparar dados para no futuro aprender com:

- marketplace;
- categoria;
- faixa de preço;
- canal;
- criativo;
- cliques;
- pedidos;
- comissão;
- conversão real.

---

## 12. Fase 9 — Testes e segurança

### TASK 9.1 — Testes de banco

- criação de campanha;
- duplicidade ativa;
- checklist;
- encerramento;
- histórico.

### TASK 9.2 — Testes de monetização

Shopee:

- link oficial válido;
- Sub_id preservado;
- vínculo correto com oferta/campanha.

Mercado Livre:

- link gerado pelas ferramentas oficiais;
- Etiqueta correta;
- página de produto permitida.

### TASK 9.3 — Testes de UI

- campanha criada corretamente;
- próxima ação correta;
- links copiados corretamente;
- status por canal persistente.

### TASK 9.4 — Regressão

Garantir que nada quebre:

- Trends;
- aprovação;
- Vídeos de Ofertas;
- geração manual Gemini;
- tracking existente que continuar válido;
- video-worker.

### TASK 9.5 — Build e testes completos

Executar suíte relevante antes de deploy.

---

## 13. Fase 10 — Deploy e campanha piloto

### TASK 10.1 — Deploy controlado

- commit claro;
- Vercel Ready;
- migrations confirmadas;
- serviços Oracle somente se realmente afetados;
- **não reiniciar `video-worker` por mudanças que não pertençam a ele**.

### TASK 10.2 — Campanha piloto

Escolher uma única oferta forte e executar o fluxo completo.

### TASK 10.3 — Janela piloto

Trabalhar inicialmente por 24–48h.

### TASK 10.4 — Revisão

Após o piloto, responder:

- qual canal gerou mais cliques;
- qual link oficial funcionou melhor operacionalmente;
- se houve pedido;
- se a atribuição ficou clara;
- onde houve atrito manual;
- quais automações valem a pena depois.

---

## 14. Ordem exata de execução a partir de agora

1. **Fase 0 completa — auditoria.**
2. Validar estratégia de link oficial Shopee e ML.
3. Definir modelo mínimo de campanha.
4. Definir checklist e estados.
5. Definir tracking por canal.
6. Implementar banco de forma segura.
7. Implementar tela da campanha.
8. Integrar geração/registro de links oficiais conforme capacidade real.
9. Implementar materiais por canal sem alterar o prompt atual do Gemini.
10. Testar tudo.
11. Deploy controlado.
12. Executar uma única campanha piloto.
13. Medir 24–48h.
14. Só então decidir próximos ajustes.

---

## 15. Critérios de aceite da V1

A V1 estará pronta quando for possível:

- iniciar campanha a partir de uma oferta aprovada;
- trabalhar uma única oferta de forma coordenada;
- visualizar checklist de Instagram, Facebook e WhatsApp;
- obter/copiar o link correto para cada canal;
- usar link oficial Shopee/ML quando tecnicamente permitido e validado;
- registrar Sub_id/Etiqueta por canal quando suportado;
- acompanhar cliques/pedidos/comissão na capacidade real dos dados;
- encerrar a campanha preservando histórico;
- saber qual foi a próxima ação e o resultado comercial.

---

## 16. Regras de proteção do projeto

- Não alterar Trends sem uma task explícita e evidência.
- Não alterar o prompt atual de Vídeos de Ofertas nesta implementação.
- Não alterar ou reiniciar `video-worker` indevidamente.
- Não inventar links oficiais.
- Não remover monetização existente sem substituição validada.
- Não criar automação que viole regras do marketplace.
- Não atribuir venda a canal sem dados confiáveis.
- Não implementar várias grandes mudanças simultaneamente sem testes.

---

## 17. Objetivo comercial final

O sistema deixa de operar apenas como uma máquina de publicar ofertas em quantidade e passa a operar como um processo de campanha:

**selecionar → aprovar → demonstrar → distribuir → insistir de forma controlada → medir → aprender → vender.**

A prioridade imediata é a **primeira venda atribuível**, seguida de aprendizado suficiente para repetir o que funcionar.