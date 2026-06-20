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

## 3. Deploy do Motor WhatsApp (VPS / Railway / Render)

Como o Whatsapp funciona por WebSockets contínuos, se hospedado na Vercel a conexão cairá a cada 10 segundos.

1. Crie uma aplicação no Railway ou Render.
2. Aponte para o mesmo repositório do GitHub.
3. Configure as variáveis de ambiente necessárias (principalmente do banco Supabase).
4. No campo "Build Command" coloque `npm install`.
5. No campo "Start Command", altere o padrão de `npm run start` para:
```bash
npm run whatsapp
```
6. O sistema inicializará a engine Node.js. Como ele exige escanear um QR Code para se conectar, verifique os "Logs" de Deploy desta plataforma para capturar e ler o QRCode. Após isso, os arquivos de sessão `.baileys_auth` manterão a sessão viva.
