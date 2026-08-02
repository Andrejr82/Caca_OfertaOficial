# Fluxo de Trabalho: Supabase ➔ Google Sheets ➔ Google Flow

Este guia documenta como otimizar a criação de vídeos usando o Google Labs Flow. 

> [!WARNING]
> **Limitação da Plataforma:** O Google Labs Flow (`labs.google/fx/tools/flow`) é, atualmente, uma ferramenta experimental focada em criação puramente visual (arrastar clipes e cenas). **Ele não possui nós nativos de entrada de dados, planilhas ou automação em lote.** 
> 
> A automação 100% "sem mãos" (onde o sistema roda sozinho) só é possível via API (Vertex AI). O processo abaixo foca em **acelerar e padronizar** a criação manual, deixando os prompts prontos.

## Passo 1: O Script de Sincronização (Node.js)

O script conecta seu Supabase e envia as requisições, já montadas e perfeitas, para uma planilha.
**Local do script:** `scripts/sync-supabase-sheets.ts`

### O que você precisa fazer antes de rodar:
1. Crie uma planilha no Google Sheets com as colunas: `ID_Oferta`, `Produto`, `Prompt_Final`, `Status_Video`.
2. Vá em **Extensões > Apps Script** e cole:
   ```javascript
   function doPost(e) {
     var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
     var data = JSON.parse(e.postData.contents);
     sheet.appendRow([data.id, data.produto, data.prompt_final, "Pendente"]);
     return ContentService.createTextOutput(JSON.stringify({"status": "success"})).setMimeType(ContentService.MimeType.JSON);
   }
   ```
3. Clique em **Implantar > Nova implantação** (App da Web) e libere para "Qualquer pessoa". Copie a URL.
4. Abra o arquivo `scripts/sync-supabase-sheets.ts` no seu editor.
5. Na linha onde tem `const GOOGLE_APPS_SCRIPT_WEBHOOK_URL = "..."`, cole a **URL do Web App**.
6. Rode no terminal: `npx tsx scripts/sync-supabase-sheets.ts`

## Passo 2: O Uso Prático no Google Flow (Labs)

Sua planilha agora funcionará como o seu **"Cardápio de Prompts"**.

1. Acesse **[labs.google/fx/tools/flow](https://labs.google/fx/tools/flow)**.
2. Adicione um **Nó de Imagem/Referência**.
   * Faça o upload da imagem estática `Avatar_Silvia.png`.
3. Adicione o **Nó Gerador de Vídeo (Agent/Veo)**.
   * Ligue a imagem do avatar à entrada de imagem do gerador.
4. Abra a sua planilha do Google Sheets.
5. Copie o conteúdo da coluna **Prompt_Final** da primeira oferta.
6. Cole no campo de **Texto/Prompt** do Nó de Vídeo no Google Flow e mande gerar.
7. Após gerar e baixar o vídeo, marque o status na planilha como "Concluído", copie o prompt da próxima linha e repita o processo.

Desta forma, todo o trabalho mental de calcular descontos, formatar a copy, definir o comportamento do avatar e ditar a fala foi **100% automatizado pelo seu script**. O único trabalho manual é "Copiar da Planilha e Colar no Flow".

---

## Tabela de Custos e Créditos (Referência 2026)

O Google Flow funciona com um sistema de créditos por cada tentativa de geração. Se o vídeo der errado e você gerar de novo, consumirá novos créditos.

| Modelo de Vídeo | Custo por Geração | Observação |
| :--- | :--- | :--- |
| **Veo 3.1 Lite** | 10 créditos | Opção mais barata. Ideal para testar formatos. |
| **Veo 3.1 Fast** | 20 créditos | Bom equilíbrio entre rapidez e qualidade. |
| **Veo 3.1 Quality** | 100 créditos | Altíssima qualidade (Consome muito crédito!). |

> **Contas Gratuitas:** Costumam receber cerca de **50 créditos diários** (dá para gerar 5 vídeos no modo Lite ou nenhum no Quality).
> **Contas Google AI Pro:** Costumam receber **1.000 créditos mensais**.

**Dica para economizar:** Sempre valide seus prompts no modelo *Lite* antes de rodar a versão final no modelo *Quality* ou usar *4K Upscaling*.
