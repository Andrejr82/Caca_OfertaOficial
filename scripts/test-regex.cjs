const text = `🚨 *Smartphone Samsung Galaxy A73 5g*

✅ Por R$ 1.500,00

🛒 Achado Mercado Livre 👇🏼
🔗 https://caca-oferta.com.br/go/wp_1234

🚨 CHAMA seus amigos para receber promoções
https://whatsapp.com/channel/12345`;

const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
console.log("First URL:", urlMatch ? urlMatch[0] : "None");
