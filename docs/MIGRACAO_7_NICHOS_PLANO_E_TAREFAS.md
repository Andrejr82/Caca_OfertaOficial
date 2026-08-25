# Plano de Migração e Tarefas — Nova Arquitetura dos 7 Nichos Comerciais

Este documento registra o plano diretor, a matriz de rastreabilidade de tarefas e o progresso da migração da matriz legada de 14 cenários para a nova arquitetura dos **7 Nichos Comerciais** do Caça Oferta Oficial.

> **Princípio Arquitetural**: A migração atual altera exclusivamente a **configuração** e os **contratos de nicho**. Os **motores de busca existentes** (Amazon Scrape.do, Shopee OpenAPI/Native e Mercado Livre Official Intents) permanecem rigorosamente **intactos**.

---

## 1. Visão Geral dos 7 Nichos Comerciais (IDs Canônicos Oficiais)

A nova arquitetura comercial substitui as antigas buscas genéricas por 7 verticais de alta densidade e relevância, organizadas em três camadas de catálogo (**Core**, **Expansion**, **Opportunity**) com pesos de **Afinidade por Marketplace (1–3)** e guardrails rígidos anti-peças/acessórios:

1. **Casa, Cozinha e Organização** (`casa_cozinha_organizacao`) — Volume + recorrência.
2. **Beleza e Cuidados Pessoais** (`beleza`) — Conversão + recorrência.
3. **Moda e Calçados** (`moda`) — Grande volume.
4. **Eletrodomésticos** (`eletrodomesticos`) — Ticket alto (somente aparelho final).
5. **Informática** (`informatica`) — Ticket médio/alto (dispositivos acabados).
6. **Ferramentas** (`ferramentas`) — Demanda consistente / ticket médio.
7. **Pet** (`pet`) — Forte recorrência de recompra.

---

## 2. Matriz de Tarefas e Status de Implementação

### Fase 1: Fundação, Contratos e Adaptadores de Configuração (Branch `feat/nichos-comerciais-v1`)
- [x] Criar `scripts/commercial-niche-config.cjs` com a definição canônica dos 7 nichos, listas Core/Expansion aprovadas, pesos de afinidade (1–3), guardrails e mapeamento de cenários legados.
- [x] Criar `scripts/commercial-niche-contracts.cjs` integrando nós de navegação Amazon (fusão de Casa+Organização), categorias aprovadas Shopee e política Mercado Livre sem hardcodes de domínios.
- [x] Criar `scripts/commercial-niche-runtime-adapter.cjs` para resolução pura de planos e escalonamento de termos por afinidade (sem rotinas de fetch/discovery paralelo).
- [x] Criar suíte de testes unitários e de integração de configuração:
  - [x] `scripts/tests/commercial-niche-config.test.cjs`
  - [x] `scripts/tests/commercial-niche-contracts.test.cjs`
  - [x] `scripts/tests/commercial-niche-runtime-adapter.test.cjs`
  - [x] `scripts/tests/commercial-niche-affinity.test.cjs`
- [x] Reverter alterações prematuras em `scripts/oracle-scraper.cjs` e `scripts/scenario-runtime-contract.cjs` (idênticos à `main`).
- [x] Remover runners de discovery paralelo não-aprovados (`commercial-niche-shadow-runner.cjs`).
- [x] Criar runner e testes de validação de eficácia comparativa (`commercial-niche-efficacy-runner.cjs` e `commercial-niche-efficacy.test.cjs`).

### Fase 2: Validação de Eficácia Controlada na Oracle VPS (Pendente)
- [ ] Executar o teste de eficácia isolado na VPS Oracle em modo estritamente read-only (`writes = 0`).
- [ ] Coletar relatório comparativo de métricas reais (Relevância, Cobertura, Qualidade, Ruído, Diversidade).
- [ ] Validar tempo de resposta e ausência de HTTP 429.

### Fase 3: Transição Ativa e Alinhamento de Grade / UI (Pendente)
- [ ] Atualizar grade de horários de discovery e cron no `oracle-scraper.cjs` quando aprovada a transição para modo ativo.
- [ ] Atualizar mensagens de introdução de ciclo em `src/config/cycle-intros.ts`.
- [ ] Atualizar grade visual de estratégia em `src/app/(dashboard)/strategy/page.tsx`.
- [ ] Promover para `main` e aplicar na Oracle em produção.

---

## 3. Configuração Aprovada dos 7 Nichos

### 3.1. Produtos Core e Expansion por Nicho

- **Casa, Cozinha e Organização** (`casa_cozinha_organizacao`)
  - **Core**: `air fryer`, `cafeteira`, `liquidificador`, `aspirador vertical`, `panela elétrica`, `jogo de panelas`, `jogo de cama`, `toalha de banho`, `aparelho de jantar`, `organizador de cozinha`
  - **Expansion**: `batedeira`, `mixer`, `sanduicheira`, `forno elétrico`, `chaleira elétrica`, `grill`, `faqueiro`, `organizador de gaveta`, `organizador de armário`, `mop`, `varal`, `caixa organizadora`, `cesto organizador`
- **Beleza e Cuidados Pessoais** (`beleza`)
  - **Core**: `protetor solar`, `hidratante facial`, `sérum`, `shampoo`, `tratamento capilar`, `perfume`, `maquiagem`, `escova secadora`, `secador`
  - **Expansion**: `chapinha`, `modelador`, `aparador`, `máquina de cortar cabelo`, `escova alisadora`, `depilador`
- **Moda e Calçados** (`moda`)
  - **Core**: `tênis masculino`, `tênis feminino`, `tênis casual`, `camiseta masculina`, `vestido`, `calça jeans`, `jaqueta`, `bolsa`, `mochila`
  - **Expansion**: `camisa`, `bermuda`, `moletom`, `calça social`, `relógio`, `óculos`
- **Eletrodomésticos** (`eletrodomesticos`)
  - **Core**: `geladeira`, `máquina de lavar`, `ar condicionado`, `micro-ondas`, `fogão`, `cooktop`, `lava e seca`, `aspirador`
  - **Expansion**: `freezer`, `lava-louças`, `frigobar`, `adega climatizada`, `coifa`, `depurador`
- **Informática** (`informatica`)
  - **Core**: `notebook`, `monitor`, `ssd`, `impressora`, `roteador`, `mini pc`
  - **Expansion**: `computador`, `desktop`, `teclado`, `mouse`, `webcam`, `hd externo`, `scanner`, `nobreak`, `switch de rede`
- **Ferramentas** (`ferramentas`)
  - **Core**: `parafusadeira`, `furadeira`, `lavadora de alta pressão`, `esmerilhadeira`, `serra`, `máquina de solda`, `jogo de ferramentas`, `kit de chaves`
  - **Expansion**: `alicate`, `chave de impacto`, `trena`, `nível laser`, `compressor`, `maleta de ferramentas`, `lixadeira`, `soprador`
- **Pet** (`pet`)
  - **Core**: `ração cachorro`, `ração gato`, `areia para gato`, `tapete higiênico`
  - **Expansion**: `cama pet`, `fonte pet`, `bebedouro automático`, `comedouro automático`, `caixa de transporte`, `arranhador`, `caixa de areia`, `brinquedo pet`

*Nota: `opportunityProducts` permanece dinâmico (`[]`), preenchido em tempo de execução via sinais de Best Sellers e Highlights.*

---

## 4. Contratos e Políticas de Marketplace

### 4.1. Amazon
Browse Nodes preservados e combinados conforme a configuração inicial aprovada:
- `casa_cozinha_organizacao`: `['17100532011', '17124722011', '17124716011', '17100533011', '17100522011', '17124717011']`
- `beleza`: `['16754345011', '16754346011', '16754347011']`
- `moda`: `['17681970011', '17681966011', '23577004011']`
- `eletrodomesticos`: `['16745371011', '17124786011', '16745366011']`
- `informatica`: `['16243803011', '16243794011', '24035344011']`
- `ferramentas`: `['165793011', '165796011']`
- `pet`: `['19653951011', '19653950011', '19653948011']`

### 4.2. Shopee
Categorias aprovadas estritamente:
- `casa_cozinha_organizacao`: `[100010, 100636]`
- `beleza`: `[100630, 100001]`
- `moda`: `[100009, 100011, 100012, 100534]` *(100017 e 100532 removidas por não aprovação nesta etapa)*
- `eletrodomesticos`: `[100010]`
- `informatica`: `[100644, 100013]`
- `ferramentas`: `[100636]`
- `pet`: `[100631]`

### 4.3. Mercado Livre
- **Política**: `mode: 'official-domain-then-catalog'`, `useBestSellerSignal: true`.
- **Sem matriz hardcoded de domínios**: O motor existente (`scripts/mercadolivre-official-intents-v5.cjs`) continua 100% responsável por aliases, descoberta dinâmica de domínio, catálogo, highlights e coverage gate.

---

## 5. AUDITORIA E LIMPEZA CIRÚRGICA — 2026-08-24

Nesta etapa de auditoria e limpeza cirúrgica, foram corrigidos e eliminados todos os desvios identificados:

1. **IDs Canônicos Corrigidos**:
   - Eliminados sufixos `beleza_cuidados_pessoais` e `moda_calcados`.
   - IDs canônicos unificados exclusivamente em `beleza` e `moda`.
2. **Categorias Shopee Ajustadas**:
   - Removidas categorias `100017` e `100532` da configuração de Moda.
3. **Hardcodes de Domínio Mercado Livre Eliminados**:
   - Removida qualquer lista estática de domínios (`MLB-AIR_FRYERS`, etc.) da nova camada de nichos, preservando a autoridade do motor existente do ML.
4. **Remoção de Discovery/Shadow Paralelo**:
   - Eliminado `scripts/commercial-niche-shadow-runner.cjs` e removida qualquer chamada de rede/fetch em `commercial-niche-runtime-adapter.cjs`.
   - O adapter atua puramente como gerador de configuração e resolvedor de mapeamento.
5. **Reversão de Arquivos Prematuros**:
   - `scripts/oracle-scraper.cjs` revertido e mantido 100% idêntico à `main`.
   - `scripts/scenario-runtime-contract.cjs` revertido e mantido 100% idêntico à `main`.
6. **Preservação de Integridade**:
   - Motores Amazon, Shopee e Mercado Livre permanecem intactos.
   - `CRON_SCHEDULE = '0 6-20 * * *'` intacto.
   - Zero escritas no Supabase.
   - Oracle em produção não alterada.

---

## 6. VALIDAÇÃO DE EFICÁCIA ANTES DA MIGRAÇÃO

A validação de eficácia é o portão de controle obrigatório antes de qualquer ativação ou migração de cenários:

1. **Nenhuma migração ocorrerá antes da validação**: O runtime legado continua autoritativo e em execução inalterada.
2. **Motores de busca permanecem 100% intactos**: Nenhuma alteração é realizada em `amazon-native-top20-v5.cjs`, `shopee-openapi-shadow-engine-v1.cjs` ou `mercadolivre-official-intents-v5.cjs`.
3. **Princípio do Teste**:
   $$\text{Mesmo Motor} + \text{Configuração Legacy} \quad \text{VS} \quad \text{Mesmo Motor} + \text{Configuração Nova}$$
   A única variável é a configuração.
4. **Métricas Comparadas**:
   - Quantidade bruta e válida de candidatos
   - Rejeições e motivos (`blocked_term`, `out_of_niche`, `invalid_price`, `duplicate`)
   - Diversidade de famílias/produtos
   - Cobertura de Core Products e Expansion Products
   - Ruído (acessórios/peças) e produtos fora do nicho
   - Latência, erros de API e ocorrências de HTTP 429
5. **Critério de Avaliação**: O runner gera a comparação com deltas e classifica as métricas em `IMPROVED`, `EQUIVALENT`, `WORSE` ou `INSUFFICIENT_DATA` (sem tomar decisão automática de GO/NO-GO).
6. **Ambiente de Teste**: O runner (`scripts/tests/commercial-niche-efficacy-runner.cjs`) opera de forma totalmente isolada (`writes = 0`), e a Oracle VPS será utilizada apenas na fase subsequente para execução controlada e read-only desse mesmo teste.
