# Instalação e Setup Local

Siga os passos abaixo para preparar o ambiente de desenvolvimento na sua máquina.

## 1. Pré-requisitos
- Node.js (v20 ou superior).
- Git.
- Uma conta no [Supabase](https://supabase.com).

## 2. Clonando o Repositório
```bash
git clone https://github.com/Andrejr82/Caca_OfertaOficial.git
cd Caca_OfertaOficial
```

## 3. Instalando as Dependências
Nós utilizamos `npm` neste projeto para garantir compatibilidade com `package-lock.json`.
```bash
npm install
```

## 4. Configuração do Banco de Dados
1. No seu projeto do Supabase, vá na aba **SQL Editor**.
2. Copie o conteúdo de `supabase/schema.sql` e execute-o.
3. Certifique-se de que o **Auth** está habilitado e o Bucket **offer-images** foi criado como Privado.

## 5. Variáveis de Ambiente
Crie um arquivo `.env.local` copiando o exemplo:
```bash
cp .env.example .env.local
```
Preencha as chaves principais:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY` (Para a IA)

## 6. Inicializando o Servidor Principal
```bash
npm run dev
```
O frontend estará acessível em `http://localhost:3000`.

## 7. Inicializando o Motor do WhatsApp (Opcional)
Se você for testar a integração com WhatsApp, é necessário rodar o worker num terminal separado:
```bash
npm run whatsapp
```
Aguarde a geração do QRCode no terminal e escaneie com seu celular de disparos.
