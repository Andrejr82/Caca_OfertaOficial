# Autoridades e Responsabilidades

Estados referem-se a estados de negócio de ofertas/posts. Toda escrita autorizada ocorre exclusivamente por contrato e pelo serviço oficial de transições.

## Oracle Worker

| Aspecto | Regra |
|---|---|
| Permitido | Discovery; categorias oficiais; Top 20; sanitização; deduplicação; novelty; score determinístico; persistência inicial; observabilidade do ciclo |
| Proibido | gerar IA; chamar Cerebras/Groq; criar posts; publicar; promover `approved`; processar `draft`/`selected`; usar `pendingDrafts`, Selection Engine ou Candidate Queue; executar V4; alterar oferta após `pending_manual_review` |
| Entradas | disparo do Scheduler, marketplace, categoria e configuração oficial |
| Saídas | oferta normalizada e auditada em `pending_manual_review`; métricas técnicas |
| Dependências | configuração canônica, conectores dos marketplaces, Supabase e serviço oficial de estado |
| Pode escrever | criação idempotente de oferta em `pending_manual_review` |
| Não pode escrever | `draft`, `selected`, `approved`, `posted`, `rejected`; qualquer estado de post |
| Pode chamar | conectores de Discovery, Supabase/estado para persistência inicial, observabilidade |
| Não pode chamar | IA, serviços de post/publicação, canais, Inngest para governança paralela |

## Next.js

| Aspecto | Regra |
|---|---|
| Permitido | painel, autenticação, curadoria, transições oficiais, IA após `selected`, criação de posts, publicação e consultas |
| Proibido | Discovery automatizado paralelo de Shopee/ML/Amazon; `approved` sem `selected`; publicação sem post oficial; bypass do serviço de estados |
| Entradas | sessão autenticada, ofertas pendentes/selecionadas/aprovadas, posts draft, comandos humanos |
| Saídas | `selected`/`rejected`, `approved`, `posts:draft`, `posts:published`, `offer:posted`, auditoria |
| Dependências | autenticação, Supabase, serviço de estados, serviço único de IA/publicação, transportes |
| Pode escrever | transições oficiais de curadoria, IA e publicação pelo serviço de estados |
| Não pode escrever | estados fora da máquina, transições puladas, estados diretos no banco |
| Pode chamar | Supabase para consulta, serviços oficiais, transportes e Inngest como executor delegado |
| Não pode chamar | Discovery automatizado paralelo ou serviços que contornem contratos |

## Supabase

| Aspecto | Regra |
|---|---|
| Permitido | armazenamento, constraints, integridade, RLS, ofertas, links, posts e auditoria |
| Proibido | decidir fluxo, executar IA, iniciar Discovery ou publicar |
| Entradas | comandos validados dos serviços oficiais |
| Saídas | persistência consistente, consultas, eventos/auditoria autorizados |
| Dependências | esquema e políticas homologadas |
| Pode escrever | dados transacionados pelos serviços oficiais; constraints garantem invariantes |
| Não pode escrever | promoção autônoma de estado ou efeitos externos |
| Pode chamar | mecanismos internos estritamente técnicos autorizados |
| Não pode chamar | marketplaces, IA ou canais para governança de negócio |

## Oracle API

| Aspecto | Regra |
|---|---|
| Permitido | gateway técnico autenticado, normalização técnica e acesso delegado a providers |
| Proibido | Scheduler, regras/decisões de negócio, promoção de estado, IA, posts ou publicação |
| Entradas/saídas | requisição técnica validada / resposta técnica sem decisão de fluxo |
| Dependências | autenticação de serviço, providers e observabilidade |
| Pode escrever | somente telemetria técnica; nenhum estado de negócio |
| Não pode escrever | qualquer estado de oferta/post |
| Pode chamar | providers técnicos autorizados |
| Não pode chamar | IA, publicação ou Scheduler |

## WhatsApp Engine

| Aspecto | Regra |
|---|---|
| Permitido | transportar mensagem WhatsApp por solicitação do serviço único de publicação; gerir sessão técnica |
| Proibido | selecionar oferta, criar conteúdo, decidir êxito de negócio ou alterar estado por conta própria |
| Entradas/saídas | payload de publicação autorizado / comprovante técnico de envio ou erro |
| Dependências | sessão, canal e serviço oficial de publicação |
| Pode escrever | sessão/telemetria técnica; confirmação retorna ao chamador oficial |
| Não pode escrever | `selected`, `approved`, `posted` ou estados de post |
| Pode chamar | API de transporte WhatsApp |
| Não pode chamar | Discovery, IA ou banco para mutação de negócio |

## Inngest

| Aspecto | Regra |
|---|---|
| Permitido | tarefas assíncronas solicitadas pelo fluxo oficial, retry, polling e analytics; execução idempotente |
| Proibido | Discovery paralelo; IA sem `selected`; promoção direta para `approved`; publicação fora do serviço oficial |
| Entradas/saídas | evento delegado com idempotency key / resultado ao serviço proprietário |
| Dependências | autoridade solicitante, contratos, serviço de estados e observabilidade |
| Pode escrever | telemetria e resultado por meio do serviço oficial, conforme delegação |
| Não pode escrever | estado direto ou fora do mandato do evento |
| Pode chamar | serviço oficial explicitamente delegado |
| Não pode chamar | caminhos alternativos de Discovery, IA ou publicação |

## Extensão

| Aspecto | Regra |
|---|---|
| Permitido | capturar produto; autenticar usuário; enviar dados ao serviço oficial; criar entrada para revisão manual |
| Proibido | inserir `approved`; gerar IA; publicar; escolher usuário por fallback; bypassar autenticação; alterar estados diretamente |
| Entradas/saídas | produto capturado e identidade autenticada / aceite ou erro da ingestão oficial |
| Dependências | autenticação e endpoint oficial de entrada |
| Pode escrever | nenhum estado diretamente; entrada aceita resulta em `pending_manual_review` pelo serviço oficial |
| Não pode escrever | qualquer estado de oferta/post no banco |
| Pode chamar | endpoint oficial de entrada |
| Não pode chamar | Supabase service-role, IA, canais ou publicação |

## PM2 e Scheduler

| Componente | Permitido | Proibido | Entrada → saída | Estados | Chamadas |
|---|---|---|---|---|---|
| PM2 | iniciar, manter e observar processos homologados | regras, seleção de runtime ou transição | configuração operacional → processo/telemetria | nenhum | somente ciclo de processo |
| Scheduler | disparar Discovery do Worker segundo configuração oficial | IA, publicação, curadoria ou outro pipeline | agenda → comando idempotente de Discovery | nenhum | somente Oracle Worker Discovery |
