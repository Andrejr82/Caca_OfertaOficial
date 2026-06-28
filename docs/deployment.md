# Guia de Deploy (Produção)

O **Caça Oferta Oficial** não pode ser inteiramente feito deploy num único serviço Serverless se a intenção for utilizar a automação do WhatsApp (`baileys`). O sistema requer um deploy em 2 partes.

## 1. Deploy da Aplicação Principal (Vercel)

Toda a lógica Web, Dashboards, Inngest e APIs REST devem ir para a Vercel, pois ela gerencia o cache pesado do Next.js (App Router) nativamente.

1. Suba o código do seu projeto no GitHub.
2. Acesse `vercel.com` e clique em "Import Project".
3. Nas variáveis de ambiente, insira as chaves listadas em `docs/configuration.md` (`NEXT_PUBLIC_SUPABASE_URL`, `GROQ_API_KEY`, etc).
4. Clique em Deploy.
5. (Importante) Pegue a URL final da Vercel e atualize a variável `NEXT_PUBLIC_APP_URL` nela mesma e na configuração do Supabase Auth (Redirect URLs) para que o login com o Google/Magic Link funcione.

## 2. Configurando Inngest

1. Vá em Inngest Cloud.
2. Sincronize a sua Vercel App com a Inngest digitando a url: `https://sua-url-vercel.com/api/inngest` na sua "Sync URL". 
3. Isso importará as filas e agendamentos nativos da sua plataforma.

## 3. Deploy do Motor WhatsApp (Ngrok / Local)

O Ngrok é utilizado EXCLUSIVAMENTE para expor o Webhook do WhatsApp enquanto não se utiliza a Cloud API oficial. Ele não participa de scraping ou orquestração.
- Inicie o WhatsApp engine localmente (`npm run whatsapp`).
- Exponha a porta via Ngrok e atualize o URL do webhook nas configurações (se aplicável).

## 4. Deploy da Orquestração (Oracle VPS)

A Oracle VPS atua unicamente como **Orquestrador de IA e Publicações** e não faz scraping.
O gerenciamento dos processos é feito via PM2.

**Variáveis de Ambiente Obrigatórias na Oracle:**
Adicione no `.env.local` da Oracle:
```env
SCRAPER_MODE=LOCAL
```
*(Essa flag desativa o Playwright na Oracle e a faz apenas ler o Supabase).*

**Comandos PM2 na Oracle:**
```bash
# Para iniciar o orquestrador (que fará polling do Supabase)
pm2 start scripts/oracle-scraper.cjs --name "oracle-orchestrator"

# Para manter ativo após reboots
pm2 save
pm2 startup
```

## 5. Deploy do Motor de Scraping (Notebook Windows)

O motor real de captura de ofertas roda no Notebook Windows.
- O Notebook Windows deve ter um `.env.local` com `SCRAPER_MODE=LOCAL`.
- Ele executa o script `scripts/oracle-scraper.cjs` (ou via scheduler/cron do Windows).
- Por ser Windows e ter a flag LOCAL, o script acionará o Playwright, o Scrapfly, fará as validações HTML/Produto e salvará as ofertas no Supabase como *draft*.
- Ele também atualizará o heartbeat para a Oracle monitorar.
