# Guia de Instalação Local

O Caça Oferta Oficial foi desenvolvido para ser executado num ambiente Node.js moderno, utilizando pnpm ou npm.

## Pré-requisitos

- Node.js (v20 ou superior). Recomendamos usar NVM (`nvm use 20`).
- Gerenciador de Pacotes (`npm`).
- Uma conta no [Supabase](https://supabase.com/) com um projeto em branco para aplicar as migrações.
- Uma conta no [Inngest](https://www.inngest.com/) para testar processamentos em background.

## Passos para Instalação

1. **Clone o repositório:**
```bash
git clone https://github.com/Andrejr82/Caca_OfertaOficial.git
cd Caca_OfertaOficial
```

2. **Instale as dependências principais:**
```bash
npm install
```

3. **Configure as Variáveis de Ambiente:**
Copie o template de ambiente:
```bash
cp .env.example .env.local
```
Edite o arquivo `.env.local` para incluir suas credenciais (veja `docs/configuration.md` para detalhes).

4. **Inicie o servidor de Desenvolvimento Next.js:**
```bash
npm run dev
```

### Rodando o Simulador Local do Inngest (Opcional, mas recomendado)
Para testar a orquestração em background localmente sem acessar a nuvem da Inngest:
```bash
npx inngest-cli@latest dev
```
O Inngest detectará o Next.js localmente e proverá um dashboard em `http://localhost:8288/`.

### Rodando o Worker do WhatsApp
O Next.js por si só não dispara o Whatsapp. É necessário ligar o motor à parte. Em um segundo terminal:
```bash
npm run whatsapp
```
Aguarde a geração do QR Code no console, e escaneie com seu celular. Mantenha esse console aberto.
