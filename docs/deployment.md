# Deploy

A aplicação central (Painel Web e APIs) é projetada de forma Serverless e está otimizada para implantação na **Vercel**. Componentes assíncronos que precisam manter conexão ativa (WebSockets) exigem um ambiente de execução em contínuo (Node.js daemonizado).

## 1. Deploy da Aplicação Next.js (Vercel)
O projeto conta com o arquivo `vercel.json`.

1. Acesse o dashboard da Vercel.
2. Importe o repositório Git.
3. Configure o Framework Preset como **Next.js**.
4. **Variaveis de Ambiente:** Adicione *exatamente* o conteúdo do seu `.env.local` na aba *Environment Variables* da Vercel. Não se esqueça das chaves principais do Supabase e do `GROQ_API_KEY`.
5. Acione o Deploy. A partir desse momento, qualquer `push` na branch `main` gera uma build automática.

## 2. Deploy do Banco de Dados (Supabase)
O Supabase hospeda o Postgres e o Storage em Nuvem.
1. O Banco não fica na Vercel.
2. Qualquer alteração de Schema (novas tabelas) deve ser rodada via SQL Editor no Supabase antes de ir para produção no código.
3. Certifique-se de que a flag `public` no bucket de imagens esteja setada em conformidade com suas policies RLS.

## 3. Deploy do Motor WhatsApp (Worker Constante)
Funções Serverless (Vercel) sofrem timeout (geralmente de 10 a 60 segundos) e não podem sustentar a conexão contínua exigida pelo `@whiskeysockets/baileys`.
**Ação:**
- Suba uma instância EC2 (AWS), Droplet (DigitalOcean) ou serviço similar (Railway, Render).
- Clone o repositório no servidor.
- Instale Node.js, rode `npm install`.
- Configure o `.env` (o motor precisa conectar no Supabase).
- Execute utilizando um gerenciador de processos como PM2:
```bash
npm install -g pm2
pm2 start scripts/whatsapp-engine.cjs --name "caca-oferta-whatsapp"
pm2 save
```
Isso garante que o script reinicie automaticamente em caso de falhas e mantenha a sessão persistente com o WhatsApp Web.
