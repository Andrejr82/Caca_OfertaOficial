# Runbook de scripts da Oracle

Guia operacional para a VPS Oracle (`ubuntu@193.122.242.178`). Não coloque tokens, chaves ou valores de `.env` neste arquivo. Os comandos abaixo assumem que a chave SSH está em `keys/ssh-key-2026-06-25.key`.

## 1. Acesso e estado dos processos

```powershell
$key = "C:\Projetos_GitHub\Caca_Oferta_V5\keys\ssh-key-2026-06-25.key"
$oracleTarget = "ubuntu@193.122.242.178"
ssh -i $key $oracleTarget "pm2 jlist"
ssh -i $key $oracleTarget "pm2 status"
```

Processos esperados:

| Processo | Script | Função |
|---|---|---|
| `oracle-scraper` | `scripts/oracle-scraper.cjs` | Scheduler e discovery dos marketplaces |
| `oracle-api` | `scripts/oracle-api.cjs` | Gateway técnico de scraping na porta 3002 |
| `whatsapp-bot` | `scripts/whatsapp-engine.cjs` | Motor Baileys na porta 3001 |

## 2. Logs e diagnóstico

```powershell
ssh -i $key $oracleTarget "pm2 logs oracle-scraper --raw --lines 100 --nostream"
ssh -i $key $oracleTarget "pm2 logs oracle-api --raw --lines 100 --nostream"
ssh -i $key $oracleTarget "pm2 logs whatsapp-bot --raw --lines 100 --nostream"
ssh -i $key $oracleTarget "pm2 monit"
```

Monitorar um ciclo completo localmente, sem interromper o processo:

```powershell
.\scripts\monitor-oracle-scraper.ps1 -TimeoutMinutes 45
```

`-StartNow` reinicia o scraper e dispara um ciclo imediato. Use somente quando isso estiver autorizado:

```powershell
.\scripts\monitor-oracle-scraper.ps1 -StartNow
```

## 3. Ciclos do discovery

Executar no diretório remoto:

```powershell
ssh -i $key $oracleTarget "cd /home/ubuntu/Caca_OfertaOficial; node scripts/oracle-scraper.cjs --shopee-native-top20-dry-run --scenario eletros_cozinha"
ssh -i $key $oracleTarget "cd /home/ubuntu/Caca_OfertaOficial; node scripts/oracle-scraper.cjs --shopee-native-top20-record --scenario eletros_cozinha"
ssh -i $key $oracleTarget "cd /home/ubuntu/Caca_OfertaOficial; node scripts/oracle-scraper.cjs --multi-marketplace-scenario-record --scenario eletros_cozinha"
ssh -i $key $oracleTarget "cd /home/ubuntu/Caca_OfertaOficial; node scripts/oracle-scraper.cjs --mercadolivre-official-intents-dry-run --scenario enxoval_casamento"
ssh -i $key $oracleTarget "cd /home/ubuntu/Caca_OfertaOficial; node scripts/oracle-scraper.cjs --refresh-shopee-native-catalog"
```

| Ação | Grava banco? | IA/publicação? |
|---|---:|---:|
| `--shopee-native-top20-dry-run` | Não | Não |
| `--shopee-native-top20-record` | Sim | Segue o fluxo oficial de drafts |
| `--multi-marketplace-scenario-record` | Sim | Segue o fluxo oficial de drafts |
| `--mercadolivre-official-intents-dry-run` | Não | Não |
| execução sem flag | Sim | Scheduler normal; não usar para teste exploratório |

O scheduler normal usa as janelas configuradas em `scripts/shopee-scenario-config.cjs`, fuso `America/Sao_Paulo`, com `noOverlap`.

## 4. Deploy controlado dos scripts Oracle

O script `scripts/update-oracle.js` faz backup, upload dos scripts de discovery, valida hash, atualiza `.runtime-release.json` e reinicia **somente** `oracle-scraper`.

```powershell
node scripts/update-oracle.js
```

Antes de executar, confirme que a chave existe e que o checkout local contém exatamente a versão aprovada. O deploy não atualiza automaticamente o `whatsapp-bot` nem o `oracle-api`.

## 5. Motor WhatsApp

Reiniciar o processo (não envia mensagens por si só):

```powershell
ssh -i $key $oracleTarget "pm2 restart whatsapp-bot"
```

Obter o QR exibido pelo Baileys:

```powershell
ssh -i $key $oracleTarget "pm2 logs whatsapp-bot --raw --lines 80 --nostream"
```

Leia imediatamente em **WhatsApp → Aparelhos conectados → Conectar aparelho**. A confirmação deve aparecer nos logs como `Conexão aberta`/`Motor WhatsApp conectado`.

Limpar sessão Baileys é uma operação excepcional e exige nova leitura de QR. Execute apenas quando houver conflito de sessão ou credencial inválida:

```powershell
ssh -i $key $oracleTarget "cd /home/ubuntu/Caca_OfertaOficial; node scripts/clear-whatsapp-session.cjs"
ssh -i $key $oracleTarget "pm2 restart whatsapp-bot"
```

Não usar `npm run whatsapp` na VPS: o processo oficial é supervisionado pelo PM2.

## 6. API Oracle

```powershell
ssh -i $key $oracleTarget "pm2 restart oracle-api"
ssh -i $key $oracleTarget "pm2 logs oracle-api --raw --lines 80 --nostream"
```

As rotas exigem `ORACLE_API_KEY`; nunca inclua a chave no histórico do terminal ou neste documento.

## 7. Scripts de suporte e validação

| Script | Uso |
|---|---|
| `oracle-resilience.cjs` | watchdog, timeout e logs por estágio; módulo interno |
| `classification-coverage.cjs` | métricas de cobertura de classificação |
| `marketplace-classification-catalog.json` | catálogo de tipos, aliases e termos bloqueados |
| `marketplace-scenario-contracts.cjs` | contratos por cenário e marketplace |
| `mercadolivre-canonical-classifier.cjs` | classificação canônica do Mercado Livre |
| `offer-freshness-gate.cjs` | bloqueio de ofertas antigas |
| `offer-quality-*.cjs` | shadow/admission/queue de qualidade |
| `test-*-native-*.cjs` | testes controlados de marketplace; não são o scheduler |

Módulos de suporte não devem ser executados isoladamente em produção sem o comando que os consome.

## 8. Checklist após qualquer ação

1. `pm2 status` mostra os três processos `online`.
2. Logs não apresentam `MODULE_NOT_FOUND`, `is not a function`, `401`, `403` ou `ECONNREFUSED`.
3. Após restart do scraper, validar o ciclo e o estado final.
4. Após restart do WhatsApp, confirmar QR ou `Conexão aberta`; `online` no PM2 sozinho não significa sessão conectada.
5. Nunca testar envio real sem aprovação explícita e sem respeitar opt-in/limites do canal.
6. Em erro, preservar logs e não forçar banco por SQL; corrigir a causa e repetir um teste controlado.

## 9. Rollback

O `update-oracle.js` cria backup remoto temporário antes do upload. Em falha de deploy, não reinicie repetidamente: preserve o erro, restaure o backup validado e confirme hashes/PM2 antes de qualquer novo ciclo.

