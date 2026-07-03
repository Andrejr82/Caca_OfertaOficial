const fetch = require('node-fetch');

// LEGADO: este teste preserva o destino @newsletter de auditorias antigas.
// Operação oficial atual do WhatsApp usa Grupo via WHATSAPP_TARGET_ID (...@g.us).
(async () => {
    const payload = {
        number: "120363410104792329@newsletter",
        text: "📱 *TESTE DE IMAGEM* 📱\n\nAqui está uma verificação do envio da imagem em resolução grande!\n\n👉 Confira a nova formatação\n👉 https://caca-oferta-oficial.vercel.app",
        imageUrl: "https://m.media-amazon.com/images/I/41b6x4X6jOL._AC_SX466_.jpg"
    };

    const res = await fetch('http://193.122.242.178:3001/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'local-dev-key'
        },
        body: JSON.stringify(payload)
    });
    const data = await res.text();
    console.log(res.status, data);
})();
