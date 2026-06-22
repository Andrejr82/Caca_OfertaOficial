const express = require('express');
const cors = require('cors');
const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { useSupabaseAuthState } = require('./supabase-auth-state.cjs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Supabase no Node.js 20 exige 'ws' nativamente para conexões Realtime
global.WebSocket = require('ws');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();
app.use(cors());
app.use(express.json());

// API Key Middleware
const API_KEY = process.env.WHATSAPP_ENGINE_API_KEY || 'local-dev-key';

app.use((req, res, next) => {
    // Permitir status check sem key se desejar, mas vamos proteger tudo
    const key = req.headers['x-api-key'];
    if (!key || key !== API_KEY) {
        return res.status(401).json({ ok: false, message: 'Não autorizado. API Key ausente ou incorreta.' });
    }
    next();
});

let sock = null;
let isConnected = false;
let connectionPromise = null;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useSupabaseAuthState(supabase, 'default');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        generateHighQualityLinkPreview: true,
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
                    console.log('❌ Você deslogou o aparelho no celular ou a conexão expirou.');
                    console.log('🧹 Limpando as chaves velhas do banco de dados automaticamente...');
                    supabase.from('baileys_sessions').delete().neq('id', '0').then(() => {
                        console.log('✅ Banco limpo! Por favor, pare o servidor (Ctrl+C) e rode "npm run whatsapp" novamente para gerar um novo QR Code.');
                    });
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
                const imgRes = await fetch(imageUrl, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8"
                    }
                });
                if (!imgRes.ok) throw new Error(`Falha ao baixar imagem: ${imgRes.statusText}`);
                const arrayBuffer = await imgRes.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                
                console.log('  → Convertendo imagem para thumbnail de Link Preview (Alta Resolução - 1200x630)...');
                const sharp = require('sharp');
                const imageBuffer = await sharp(buffer)
                    .resize({ width: 1200, height: 630, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
                    .jpeg({ quality: 80, force: true })
                    .toBuffer();

                console.log('  → Enviando texto com Link Preview Forçado...');
                
                // Extrai o primeiro link do texto (geralmente o link da Vercel/Shopee/ML)
                const urlMatch = text.match(/https?:\/\/[^\s]+/g);
                const firstUrl = urlMatch && urlMatch.length > 0 ? urlMatch[urlMatch.length - 1] : 'https://caca-oferta-oficial.vercel.app';
                
                let extractedTitle = text.split('\n')[0].replace(/[\*🚨_~]/g, '').trim();
                if (extractedTitle.length > 60) extractedTitle = extractedTitle.substring(0, 57) + '...';

                result = await sock.sendMessage(jid, {
                    text: text,
                    linkPreview: {
                        'canonical-url': firstUrl,
                        'matched-text': firstUrl,
                        title: extractedTitle,
                        description: 'Acesse para ver a oferta completa!',
                        jpegThumbnail: imageBuffer,
                        previewType: 'PHOTO' // Força o formato de imagem grande
                    }
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
