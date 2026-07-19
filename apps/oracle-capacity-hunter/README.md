# Oracle Capacity Hunter v2

Monitor operacional one-shot da VPS do Caça Oferta Oficial. Coleta somente métricas locais, metadata read-only da VM, PM2, scheduler e Git. Não cria nem altera recursos OCI, não usa IA e não chama marketplaces.

## Arquitetura e fluxo

`oracle-capacity-hunter.timer` executa o service a cada cinco minutos. Cada execução coleta CPU, RAM, disco, uptime, metadata OCI, processos PM2, reinícios, duplicidades, o único `cron.schedule` esperado no scraper e o SHA Git. O estado em `data/state.json` impede relatório diário duplicado e aplica cooldown aos alertas.

O relatório é enviado uma vez entre 08:00–08:59 em `America/Sao_Paulo`. Alertas críticos são enviados no máximo uma vez por chave dentro de `ALERT_COOLDOWN_MINUTES`. O processo termina após cada verificação.

Módulos:

- `src/monitor/metrics.js`: métricas locais e metadata Oracle.
- `src/monitor/alerts.js`: regras críticas e cooldown.
- `src/monitor/report.js`: mensagens curtas em HTML Telegram.
- `src/monitor/schedule.js`: horário e trava diária.
- `src/monitor/state.js`: estado atômico local.
- `src/telegram/bot.js`: envio HTTPS com timeout de 8 s.

## Instalação

Requisitos: Node.js 20, PM2 já operando para os serviços observados e systemd. Copie `.env.example` para `.env`, configure exclusivamente o token e chat do canal do monitor e mantenha o arquivo com permissão `600`.

```bash
npm ci --omit=dev
npm test
sudo cp config/systemd/oracle-capacity-hunter.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now oracle-capacity-hunter.timer
```

Não habilite o service diretamente: o timer é o único owner.

## Configuração OCI

O monitor não recebe OCIDs nem credenciais. Como a VPS não possui permissão de billing, os campos `OCI_*` de custo são valores declarativos opcionais e só devem ser preenchidos após certificação read-only no Console/CLI. Vazios são exibidos como `INDETERMINADO`; isso produz status `ATENÇÃO`, nunca uma falsa garantia financeira.

## Operação e testes controlados

```bash
npm run test:telegram  # exatamente uma mensagem simples
npm run test:daily     # exatamente um relatório completo
systemctl list-timers oracle-capacity-hunter.timer
journalctl -u oracle-capacity-hunter.service -n 30 --no-pager
```

Alertas: serviço offline/ausente, metadata Oracle inacessível, RAM ou disco ≥90%, scheduler diferente de 1, aumento de reinícios, duplicidade, heartbeat >15 minutos ou custo/previsão/recurso faturável positivo confirmado.

## Recuperação, troubleshooting e rollback

Se o Telegram falhar, confirme apenas presença das variáveis, permissão do bot no canal, DNS e saída HTTPS; nunca imprima `.env`. Se não houver relatório, confira timer, último journal e `data/state.json`. Se PM2 aparecer ausente, execute como usuário `ubuntu` e confirme o daemon já existente, sem reiniciar os serviços observados.

Rollback: desative somente `oracle-capacity-hunter.timer`, restaure o backup identificado no deploy, execute `daemon-reload` e reative o timer. O rollback não deve tocar `oracle-api`, `oracle-scraper` nem `whatsapp-bot`.
