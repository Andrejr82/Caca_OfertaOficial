# Guia de Aprovação: Meta App Review (Instagram Graph API)

Este guia contém o passo a passo detalhado para tirar o aplicativo "Caça Oferta Oficial-IG" do **Modo de Desenvolvimento** e movê-lo para o **Modo de Produção (Live)**. Apenas no Modo de Produção o robô poderá enviar DMs automaticamente (via permissão `instagram_business_manage_messages`) para qualquer usuário público que comentar "QUERO".

---

## 📋 Pré-requisitos
Antes de iniciar a solicitação, certifique-se de que:
1. Sua conta do Instagram está vinculada a uma **Página do Facebook** e configurada como **Conta Profissional/Criador de Conteúdo**.
2. A sua empresa ou identidade no Facebook Business Manager já passou pelo processo de **Verificação de Empresa** (Business Verification). Isso é crucial para aprovação de permissões avançadas.
3. Você tem a URL da sua **Política de Privacidade** e **Termos de Serviço** hospedados no ar (pode ser no próprio site do Caça Ofertas).
4. O sistema "Caça Ofertas Oficial" está no ar (ex: hospedado na Vercel), acessível pela internet para que a equipe da Meta possa testar, se necessário.

---

## 🚀 Passo 1: Preparar as Informações Básicas
1. Acesse o [Painel de Desenvolvedores da Meta](https://developers.facebook.com/apps/) e entre no aplicativo **Caça Oferta Oficial-IG**.
2. No menu esquerdo, vá em **Configurações > Básico**.
3. Preencha todos os campos obrigatórios:
   - **URL da Política de Privacidade**
   - **URL dos Termos de Serviço**
   - **Exclusão de Dados do Usuário** (URL de instruções ou callback)
   - **Categoria do App** (ex: Negócios ou Compras)
   - **Ícone do App** (1024x1024 pixels)
4. Salve as alterações.

---

## 🔍 Passo 2: Iniciar a Análise do Aplicativo (App Review)
1. No menu esquerdo, clique em **Análise do aplicativo (App Review)** > **Solicitações e Permissões**.
2. Você precisará solicitar **duas permissões cruciais**:
   - `instagram_business_manage_comments` (Ler e responder comentários públicos)
   - `instagram_business_manage_messages` (Enviar as DMs com os links)
3. Clique em **Solicitar acesso avançado** (ou Request) ao lado de cada uma dessas permissões.
4. Após adicionar ambas à lista, clique no botão para **Continuar com a solicitação**.

---

## 🎥 Passo 3: Preencher o Formulário de Justificativa
Para cada permissão solicitada, a Meta exigirá:
1. **Justificativa de Uso:**
   Explique claramente para que a permissão é necessária. 
   - *Exemplo para Messages:* "O aplicativo lerá o comentário público do usuário pedindo o link da oferta e utilizará o endpoint de mensagens para enviar automaticamente uma única mensagem (DM) contendo o link de afiliado do produto que ele solicitou. O bot não manda mensagens de spam não-solicitadas."
   
2. **Gravação de Tela (Screencast):**
   A Meta EXIGE um vídeo mostrando como a integração funciona.
   - O que gravar: Usando o seu usuário de testes (que já está funcionando em modo dev), grave a tela do celular ou computador.
   - Mostre o usuário comentando "QUERO" no post.
   - Mostre a notificação chegando e a DM abrindo com o link da oferta.
   - **Dica de ouro:** No vídeo, garanta que seja possível ver claramente o nome da conta do Instagram usada no teste. Narre ou coloque textos no vídeo explicando que o bot apenas responde ativamente a uma solicitação explícita do usuário (o comentário).

---

## ✅ Passo 4: Verificação de Empresa (Business Verification)
Se você ainda não verificou sua empresa no Facebook Business Manager, o formulário de App Review vai travar e pedir que você faça isso.
1. Vá para o [Centro de Segurança do Gerenciador de Negócios](https://business.facebook.com/settings/security).
2. Envie o contrato social (CNPJ) ou documento equivalente.
3. Isso pode levar alguns dias para ser aprovado. Uma vez aprovado, você pode submeter o formulário de App Review.

---

## 🚦 Passo 5: Submeter e Aguardar
1. Revise se todos os campos estão preenchidos.
2. Clique em **Enviar para análise**.
3. A equipe da Meta pode levar de **3 a 7 dias úteis** para revisar. Eles testarão o vídeo e a justificativa.
4. Se negarem, eles enviarão um feedback exato do porquê. Basta corrigir o que pediram (geralmente refazer o vídeo) e enviar novamente.

---

## 🎉 Passo 6: Ativar o Modo Produção (Publicar)
1. Após ser aprovado nas duas permissões (`instagram_business_manage_comments` e `instagram_business_manage_messages`).
2. Vá ao topo do painel do seu aplicativo na Meta.
3. Você verá um switch que diz **Modo de Desenvolvimento**. 
4. **Mude a chave para o Modo de Produção (Live)**.
5. Pronto! Agora qualquer pessoa no mundo que comentar "QUERO" nos seus posts receberá o seu link no Direct.

---

## 🔧 Passo 7: Reativar o código na nossa plataforma
Assim que a Meta aprovar e você colocar em modo Live, me avise ou simplesmente volte no arquivo `src/lib/post-builder/index.ts` e descomente/reverta a alteração que fizemos, ativando novamente o rodapé:

\`\`\`text
👉 Comente "QUERO" que eu te envio o link da oferta no Direct!
\`\`\`
