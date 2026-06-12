const express = require('express');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(cors());
app.use(express.json());

let sock = null;
let isConnected = false;
let connectionPromise = null;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('.baileys_auth');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
    });

    // Create a promise that resolves when connection is open
    connectionPromise = new Promise((resolve) => {
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('\n======================================================');
                console.log('📱 LEIA O QR CODE ABAIXO NO SEU WHATSAPP');
                console.log('Vá em: Aparelhos Conectados > Conectar um aparelho');
                console.log('======================================================\n');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                const error = lastDisconnect?.error;
                const statusCode = error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.log(`⚠️ Conexão fechada. Código: ${statusCode}, Motivo: ${error?.message}`);
                isConnected = false;

                if (shouldReconnect) {
                    console.log('🔄 Reconectando em 3 segundos...');
                    setTimeout(connectToWhatsApp, 3000);
                } else {
                    console.log('❌ Você deslogou o aparelho no celular.');
                    console.log('Apague a pasta ".baileys_auth" e rode novamente para gerar um novo QR Code.');
                }
            } else if (connection === 'open') {
                console.log('\n✅ CONECTADO AO WHATSAPP COM SUCESSO!');
                console.log('O motor está pronto para receber disparos do Caça Ofertas.');
                isConnected = true;
                resolve();
            }
        });
    });

    sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();

// ─── Status Endpoint ───
app.get('/status', (req, res) => {
    res.json({ connected: isConnected });
});

// ─── Resolve Channel ID ───
app.get('/resolve-channel/:code', async (req, res) => {
    try {
        if (!isConnected || !sock) {
            return res.status(503).json({ ok: false, message: 'O WhatsApp não está conectado no terminal.' });
        }
        const metadata = await sock.newsletterMetadata('invite', req.params.code);
        res.json({ ok: true, id: metadata.id, name: metadata.name });
    } catch (error) {
        res.status(500).json({ ok: false, message: 'Erro ao buscar canal: ' + (error.message || String(error)) });
    }
});

// ─── Send Message ───
app.post('/send', async (req, res) => {
    const { number, text, imageUrl } = req.body;

    if (!number || !text) {
        return res.status(400).json({ ok: false, message: 'Parâmetros "number" e "text" são obrigatórios.' });
    }

    // Sanitize number (strip quotes, spaces)
    const jid = number.replace(/['"]/g, '').trim();

    console.log(`\n📤 ── NOVA REQUISIÇÃO /send ──`);
    console.log(`  JID: ${jid}`);
    console.log(`  Texto: ${text.substring(0, 80)}...`);
    console.log(`  Imagem: ${imageUrl ? 'Sim' : 'Não'}`);
    console.log(`  Conectado: ${isConnected}`);

    if (!isConnected || !sock) {
        console.log('  ❌ Motor não está conectado ao WhatsApp!');
        return res.status(503).json({ ok: false, message: 'O WhatsApp não está conectado. Verifique o terminal.' });
    }

    try {
        let result;
        if (imageUrl) {
            console.log('  → Baixando imagem...');
            try {
                const imgRes = await fetch(imageUrl);
                if (!imgRes.ok) throw new Error(`Falha ao baixar imagem: ${imgRes.statusText}`);
                const arrayBuffer = await imgRes.arrayBuffer();
                let buffer = Buffer.from(arrayBuffer);
                console.log('  → Baixando imagem para Envio Nativo...');
                const sharp = require('sharp');
                
                // Converter para JPEG e obter dimensões
                const imageBuffer = await sharp(buffer)
                    .jpeg({ quality: 85, force: true })
                    .toBuffer();
                
                const metadata = await sharp(imageBuffer).metadata();
                
                // Gerar thumbnail (obrigatório para Newsletters)
                const thumbnail = await sharp(imageBuffer)
                    .resize({ width: 300, height: 300, fit: 'inside' })
                    .jpeg({ quality: 50 })
                    .toBuffer();
                
                console.log('  → Enviando imagem nativa com dimensões explícitas (Bypass de restrição)...');
                result = await sock.sendMessage(jid, {
                    image: imageBuffer,
                    caption: text,
                    mimetype: 'image/jpeg',
                    width: metadata.width,
                    height: metadata.height,
                    jpegThumbnail: thumbnail
                });
            } catch (err) {
                console.error('  ❌ Erro ao processar imagem:', err.message);
                throw err;
            }
        } else {
            console.log('  → Enviando mensagem de texto...');
            result = await sock.sendMessage(jid, {
                text: text
            });
        }

        console.log(`  ✅ ENVIADO! Message ID: ${result?.key?.id || 'N/A'}`);
        console.log(`  ✅ Status: ${result?.status || 'N/A'}`);
        res.json({ ok: true, message: 'Enviado via Baileys Local!', messageId: result?.key?.id });
    } catch (sendError) {
        console.error(`  ❌ ERRO AO ENVIAR:`, sendError.message);
        console.error(`  ❌ Stack:`, sendError.stack?.split('\n').slice(0, 3).join('\n'));
        return res.status(500).json({ ok: false, message: sendError.message || 'Erro ao enviar via Baileys' });
    }
});

// ─── Test Endpoint (for quick debugging) ───
app.get('/test-send', async (req, res) => {
    if (!isConnected || !sock) {
        return res.status(503).json({ ok: false, message: 'Motor desconectado' });
    }
    const jid = '120363426476830692@newsletter';
    try {
        const result = await sock.sendMessage(jid, { text: '🧪 Teste automático do motor — ' + new Date().toLocaleTimeString('pt-BR') });
        console.log(`\n🧪 TESTE: Enviado! ID: ${result?.key?.id}`);
        res.json({ ok: true, messageId: result?.key?.id, status: result?.status });
    } catch (e) {
        console.error(`\n🧪 TESTE FALHOU:`, e.message);
        res.status(500).json({ ok: false, error: e.message });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`\n🚀 Motor do WhatsApp escutando na porta local ${PORT}`);
    console.log(`📡 Aguardando conexão com os servidores da Meta...`);
    console.log(`\n💡 Dica: Acesse http://localhost:${PORT}/test-send para testar o disparo.`);
});
