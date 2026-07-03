const testName = process.argv[2] || 'A';
// LEGADO: este teste usa @newsletter apenas como referência histórica.
// Operação oficial atual do WhatsApp usa Grupo via WHATSAPP_TARGET_ID (...@g.us).
const jid = '120363410104792329@newsletter'; // Canal de Testes legado
const url = 'http://localhost:3001/send';

const offers = [
    {
        title: `🚨 Oferta 1 (Teste ${testName})`,
        image: 'https://http2.mlstatic.com/D_Q_NP_766837-MLA98259429221_112025-P.webp',
        link: 'https://caca-oferta-oficial.vercel.app/go/wp_3b741b4b'
    },
    {
        title: `🚨 Oferta 2 (Teste ${testName})`,
        image: 'https://static.netshoes.com.br/produtos/tenis-nike-team-hustle-d-12-infantil/26/SGL-0365-026/SGL-0365-026_detalhe1.jpg?ts=1781728641?ims=326x',
        link: 'https://caca-oferta-oficial.vercel.app/go/wp_20153934'
    }
];

async function runTest() {
    console.log(`\n================================`);
    console.log(`🚀 INICIANDO TESTE ${testName}`);
    console.log(`================================\n`);

    for (let i = 0; i < offers.length; i++) {
        const offer = offers[i];
        let text = `${offer.title}\n\nPreço incrível!\n`;

        if (testName === 'A') {
            text += `\n🛒 Achado 👇🏼\n🔗 ${offer.link}`;
        } else if (testName === 'B') {
            text += `\n🛒 Achado 👇🏼\n🔗 ${offer.link}\n\n🚨 CHAMA seus amigos para receber promoções\n🔗 https://t.me/caca_ofertaoficial`;
        } else if (testName === 'C') {
            text += `\n🚨 CHAMA seus amigos para receber promoções\n🔗 https://t.me/caca_ofertaoficial`;
        } else if (testName === 'D') {
            text += `\n(Nenhuma URL visível no texto, mas o link de compra estará embutido no banner)`;
            // O whatsapp-engine injeta a url do banner caso urlMatch seja nulo. Vamos ver.
        }

        let payload = {
            number: jid,
            text: text,
            imageUrl: offer.image
        };

        if (testName === 'D') {
            payload = {
                number: jid,
                text: `${offer.title}\n\nPreço incrível!\n(Nenhuma URL neste texto)`,
                imageUrl: offer.image
            }
        } else if (testName === 'F') {
            payload = {
                number: jid,
                text: `${offer.title}\n\n🛒 Achado 👇🏼\n🔗 ${offer.link}\n\n(Enviado como Mídia Nativa)`,
                imageUrl: offer.image,
                nativeMedia: true // flag customizada para o engine
            }
        }

        console.log(`Enviando Oferta ${i + 1}...`);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-api-key': 'local-dev-key'
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            console.log(`- Status HTTP: ${res.status}`);
            console.log(`- Resposta:`, data);
        } catch (e) {
            console.error(`- Erro de conexão:`, e.message);
        }

        if (i === 0) {
            console.log(`Aguardando 3 segundos...`);
            await new Promise(r => setTimeout(r, 3000));
        }
    }
    console.log(`\n✅ TESTE ${testName} CONCLUÍDO! Verifique o WhatsApp.\n`);
}

runTest();
