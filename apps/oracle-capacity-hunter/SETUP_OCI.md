# Guia de Configuração - Oracle Cloud (OCI) para o Capacity Hunter

Para que o bot consiga acessar sua conta da Oracle e criar a máquina virtual, ele precisa de algumas permissões e identificadores únicos (OCIDs).

> [!WARNING]
> **Aviso Importante sobre Regiões (Sempre Grátis / Always Free):**
> A Oracle **limita** os recursos Always Free à sua **Home Region (Região Principal)**. Você **não pode** criar instâncias ARM gratuitas em outras regiões. O bot deverá ser configurado para procurar nas Zonas de Disponibilidade (Availability Domains) da sua Home Region.

Siga este passo a passo para obter os dados que colocaremos no arquivo `.env`:

## 1. Como obter as Chaves de API (Autenticação)

Você precisa gerar um par de chaves (pública e privada) no painel da Oracle.
*(Referência Oficial: [How to Generate an API Signing Key](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/apisigningkey.htm))*

1. Acesse o [Console da Oracle Cloud](https://cloud.oracle.com/).
2. No canto superior direito, clique no ícone do seu perfil e vá em **User Settings (Configurações do Usuário)**.
3. No menu lateral esquerdo, em Resources, clique em **API Keys**.
4. Clique no botão **Add API Key**.
5. Selecione **Generate API Key Pair** e clique em **Download Private Key** (salve este arquivo `.pem` de forma segura, ex: `oci_api_key.pem`, e coloque-o na raiz da pasta `oracle-capacity-hunter`).
6. Clique em **Add**.
7. Uma janela chamada **Configuration File Preview** vai se abrir. Lá você encontrará exatamente o que precisamos:
   - `user=ocid1.user.oc1...` (**OCI_USER_ID**)
   - `fingerprint=...` (**OCI_FINGERPRINT**)
   - `tenancy=ocid1.tenancy.oc1...` (**OCI_TENANCY_ID**)
   - `region=...` (**OCI_REGION** - Ex: `sa-saopaulo-1`)

Copie esses valores. O caminho da chave privada (`OCI_PRIVATE_KEY_PATH`) será o caminho absoluto para onde você salvou o arquivo `.pem`.

## 2. Como obter o OCID do Compartimento (Compartment)

*(Referência Oficial: [Managing Compartments](https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/managingcompartments.htm))*

1. No menu principal da Oracle (hambúrguer no canto superior esquerdo), vá em **Identity & Security** > **Compartments**.
2. Encontre o compartimento onde sua estrutura atual roda (geralmente é o compartimento raiz, com o mesmo nome da sua conta).
3. Clique em "Copy" no OCID dele.
   - Isso será o **OCI_COMPARTMENT_ID**.

## 3. Como obter o OCID da Rede (Subnet)

*(Referência Oficial: [VCNs and Subnets](https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/managingVCNs.htm))*

Para que a máquina crie, ela precisa estar ligada à rede que você já tem.

1. Vá em **Networking** > **Virtual Cloud Networks**.
2. Clique na rede (VCN) existente do seu Caça Ofertas.
3. No menu à esquerda, clique em **Subnets** (Sub-redes).
4. Clique na sub-rede que você usa (geralmente uma sub-rede pública).
5. Copie o OCID dessa sub-rede.
   - Isso será o **SUBNET_ID**.

## 4. Como obter o OCID da Imagem do Sistema Operacional (OS Image)

*(Referência Oficial: [Managing Custom Images](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/managingcustomimages.htm) / [Provided Images](https://docs.oracle.com/en-us/iaas/images/))*

Você precisa dizer ao bot qual sistema operacional instalar (ex: Ubuntu 22.04 para arquitetura ARM).

1. Vá em **Compute** > **Instances**.
2. Clique em **Create Instance** (apenas para simular a criação).
3. Na seção "Image and shape", clique em **Edit** > **Change Image**.
4. Escolha **Canonical Ubuntu 22.04** (certifique-se de que é a versão para ARM - "aarch64").
5. Após selecionar a imagem na interface, você pode ver o OCID da imagem (clique em "Show image details" ou "Mostrar detalhes da imagem"). Copie esse OCID (ele começa com `ocid1.image.oc1...`).
   - Isso será o **IMAGE_ID**.

---

## Próximo Passo

Assim que obtiver todos esses dados, você deverá atualizar o arquivo `.env` na pasta `apps/oracle-capacity-hunter` no seguinte formato:

```env
# CREDENCIAIS API OCI
OCI_TENANCY_ID="ocid1.tenancy.oc1..."
OCI_USER_ID="ocid1.user.oc1..."
OCI_FINGERPRINT="20:3b:..."
OCI_PRIVATE_KEY_PATH="/caminho/absoluto/para/sua/chave_privada.pem"
OCI_REGION="sa-saopaulo-1"

# CONFIGURAÇÃO DA INSTÂNCIA (ALVO)
OCI_COMPARTMENT_ID="ocid1.compartment.oc1..."
SUBNET_ID="ocid1.subnet.oc1..."
IMAGE_ID="ocid1.image.oc1..."
SHAPE="VM.Standard.A1.Flex"

# TELEGRAM BOT (já deve estar configurado)
TELEGRAM_BOT_TOKEN="seu-token"
TELEGRAM_CHAT_ID="seu-chat-id"
TELEGRAM_SEND_ALERTS="true"
```
