const fetch = require('node-fetch');

const API_KEY = process.env.WHATSAPP_ENGINE_API_KEY || 'local-dev-key';
const PORT = 3001;

async function sendTest() {
    console.log("Enviando Oferta 1 (generateHighQualityLinkPreview=false)...");
    await fetch(`http://localhost:${PORT}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({
            number: "120363410104792329@newsletter",
            text: `🚨 *Oferta 1 - Novo Teste*

🛒 Achado Mercado Livre 👇🏼
🔗 https://caca-oferta-oficial.vercel.app/go/wp_11111111`,
            imageUrl: "https://http2.mlstatic.com/D_Q_NP_2X_791706-MLA99935952649_112025-E.webp"
        })
    });

    console.log("Aguardando 3 segundos...");
    await new Promise(r => setTimeout(r, 3000));

    console.log("Enviando Oferta 2...");
    await fetch(`http://localhost:${PORT}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({
            number: "120363410104792329@newsletter",
            text: `🚨 *Oferta 2 - Novo Teste*

🛒 Achado Amazon 👇🏼
🔗 https://caca-oferta-oficial.vercel.app/go/wp_22222222`,
            imageUrl: "https://http2.mlstatic.com/D_Q_NP_2X_936288-MLA99870057759_112025-E.webp"
        })
    });

    console.log("Aguardando 3 segundos...");
    await new Promise(r => setTimeout(r, 3000));

    console.log("Enviando Oferta 3...");
    await fetch(`http://localhost:${PORT}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({
            number: "120363410104792329@newsletter",
            text: `🚨 *Oferta 3 - Novo Teste*

🛒 Achado Shopee 👇🏼
🔗 https://caca-oferta-oficial.vercel.app/go/wp_33333333`,
            imageUrl: "https://http2.mlstatic.com/D_Q_NP_2X_928186-MLA99824673620_112025-E.webp"
        })
    });

    console.log("Fim dos testes.");
}

sendTest();
