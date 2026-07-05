# Oracle Capacity Hunter

Bot para monitoramento de disponibilidade de instâncias Free Tier na Oracle Cloud (OCI).

## Instalação

1. Clone o repositório
2. Execute `npm install`
3. Copie o arquivo `.env.example` para `.env`
4. Preencha as configurações necessárias no arquivo `.env`

## Configuração

### Como obter credenciais OCI
1. Acesse o console da OCI
2. Vá em Profile -> User Settings -> API Keys
3. Gere uma nova chave ou adicione a sua existente
4. Copie os dados fornecidos (Tenancy OCID, User OCID, Fingerprint, Region) para o arquivo `.env`
5. Salve a chave privada localmente e adicione o caminho em `OCI_PRIVATE_KEY_PATH`
6. Obtenha os OCIDs do Compartment, Subnet, e Availability Domain nas respectivas áreas de configuração (Networking, Compute)

### Como criar um canal no Telegram
1. Abra o Telegram
2. Crie um novo Canal ou Grupo
3. Crie um Bot pelo @BotFather e anote o Token (adicione em `TELEGRAM_BOT_TOKEN`)

### Como adicionar o bot como administrador
1. Vá nas configurações do Canal
2. Adicione o seu Bot como Administrador com permissões de postagem

### Como descobrir o CHAT_ID
1. Adicione o bot a um grupo provisório ou envie uma mensagem para o canal.
2. Acesse `https://api.telegram.org/bot<SEU_TOKEN>/getUpdates`
3. Localize o `chat.id` nas mensagens enviadas (geralmente começa com um `-` para grupos e `-100` para canais).
4. Insira este valor em `TELEGRAM_CHAT_ID`.

### Como habilitar o envio
Altere a variável no `.env` para `SEND_TELEGRAM_ALERTS=true`. 

### Como executar o primeiro teste
Com o `SEND_TELEGRAM_ALERTS=true` e o `TELEGRAM_CHAT_ID` configurado, inicie o bot para realizar o teste de envio e verificar logs de sucesso.

### Como iniciar em produção
Para produção e execução contínua via PM2:
```bash
npm run pm2:start
```
