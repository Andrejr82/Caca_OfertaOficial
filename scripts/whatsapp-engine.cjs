const express = require('express');
const cors = require('cors');
const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const { buildBaileysSocketOptions } = require('./whatsapp-connection-config.cjs');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { useSupabaseAuthState } = require('./supabase-auth-state.cjs');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envPath = fs.existsSync('.env.local.remote') ? '.env.local.remote' : '.env.local';
require('dotenv').config({ path: envPath });

function engineLog(level, message, metadata = {}) {
    const payload = {
        level,
        component: 'whatsapp-engine',
        message,
        timestamp: new Date().toISOString(),
        ...metadata
    };
    const line = JSON.stringify(payload);
    if (level === 'ERROR') return console.error(line);
    if (level === 'WARN') return console.warn(line);
    return console.log(line);
}

engineLog('INFO', 'Env carregado', { envPath });

global.WebSocket = require('ws');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.WHATSAPP_ENGINE_API_KEY || 'local-dev-key';

app.use((req, res, next) => {
    const key = req.headers['x-api-key'];
    if (!key || key !== API_KEY) {
        return res.status(401).json({ ok: false, message: 'Não autorizado. API Key ausente ou incorreta.' });
    }
    next();
});

let sock = null;
let isConnected = false;
let connectionPromise = null;
let lastDisconnectInfo = null;

function sanitizeTargetId(value) {
    if (!value) return null;
    const sanitized = String(value).replace(/['"]/g, '').replace(/\s+/g, '').trim();
    return sanitized || null;
}

function detectTargetKind(targetId) {
    if (!targetId) return 'unknown';
    if (targetId.endsWith('@g.us')) return 'group';
    if (targetId.endsWith('@newsletter')) return 'newsletter';
    return 'unknown';
}

function resolveConfiguredTargetId() {
    return sanitizeTargetId(process.env.WHATSAPP_TARGET_ID)
        || sanitizeTargetId(process.env.WHATSAPP_CHANNEL_ID)
        || sanitizeTargetId(process.env.WHATSAPP_DEFAULT_CHANNEL_ID);
}

function normalizeParticipantPhone(value) {
    return String(value || '').split(':')[0].replace(/\D/g, '');
}

function buildSenderMembership(metadata) {
    const senderId = sock?.user?.id || null;
    const senderLid = sock?.user?.lid || null;
    const senderPhone = normalizeParticipantPhone(senderId);
    const participants = metadata?.participants || [];
    const senderParticipant = participants.find((participant) => {
        return participant.id === senderId
            || participant.id === senderLid
            || participant.phoneNumber === senderId
            || participant.phoneNumber === senderLid
            || normalizeParticipantPhone(participant.id) === senderPhone
            || normalizeParticipantPhone(participant.phoneNumber) === senderPhone;
    }) || null;

    return {
        sender: senderId ? { id: senderId, lid: senderLid || null, phone: senderPhone || null, name: sock?.user?.name || null } : null,
        isMember: Boolean(senderParticipant),
        isAdmin: Boolean(senderParticipant?.admin),
        participant: senderParticipant ? {
            id: senderParticipant.id,
            phoneNumber: senderParticipant.phoneNumber || null,
            admin: senderParticipant.admin || null
        } : null
    };
}

async function buildProcessedImageBuffer(finalImageUrl) {
    const crypto = require('crypto');
    const sharp = require('sharp');
    const hashBuf = (buf) => crypto.createHash('sha256').update(buf).digest('hex').substring(0, 10);

    engineLog('INFO', 'Baixando imagem para envio', { imageUrl: finalImageUrl });
    const imgRes = await fetch(finalImageUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "image/webp,image/apng,image/*,*/*;q=0.8"
        }
    });
    if (!imgRes.ok) throw new Error(`Falha ao baixar imagem: ${imgRes.statusText}`);

    const arrayBuffer = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    engineLog('INFO', 'Imagem baixada', { originalBytes: buffer.length, originalHash: hashBuf(buffer) });

    const imageBuffer = await sharp(buffer)
        .resize({ width: 800, withoutEnlargement: true })
        .jpeg({ quality: 80, force: true })
        .toBuffer();

    engineLog('INFO', 'Imagem processada', { processedBytes: imageBuffer.length, processedHash: hashBuf(imageBuffer) });

    return { imageBuffer, hashBuf };
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useSupabaseAuthState(supabase, 'default');

    sock = makeWASocket(buildBaileysSocketOptions({
        auth: state,
        logger: pino({ level: 'silent' }),
    }));

    connectionPromise = new Promise((resolve) => {
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                engineLog('INFO', 'QR Code recebido. Leia no WhatsApp em Aparelhos Conectados > Conectar um aparelho.');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                const error = lastDisconnect?.error;
                const statusCode = error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                engineLog('WARN', 'Conexão fechada', { statusCode, reason: error?.message || null });
                isConnected = false;
                lastDisconnectInfo = {
                    statusCode,
                    message: error?.message,
                    at: new Date().toISOString()
                };

                if (shouldReconnect) {
                    engineLog('INFO', 'Reconectando em 3 segundos');
                    setTimeout(connectToWhatsApp, 3000);
                } else {
                    engineLog('WARN', 'Sessão encerrada. Limpando credenciais antigas.');
                    supabase.from('baileys_sessions').delete().neq('id', '0').then(() => {
                        engineLog('INFO', 'Credenciais antigas removidas. Reinicie o motor para gerar um novo QR Code.');
                    }).catch((cleanupError) => {
                        engineLog('ERROR', 'Falha ao limpar credenciais antigas', { error: cleanupError.message || String(cleanupError) });
                    });
                }
            } else if (connection === 'open') {
                isConnected = true;
                engineLog('INFO', 'Conectado ao WhatsApp', {
                    senderId: sock?.user?.id || null,
                    senderName: sock?.user?.name || null
                });
                resolve();
            }
        });
    });

    sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();

// ─── Status Endpoint ───
app.get('/status', (req, res) => {
    res.json({
        connected: isConnected,
        sender: sock?.user ? { id: sock.user.id, name: sock.user.name } : null,
        lastDisconnect: lastDisconnectInfo
    });
});

async function resolveTargetFromInvite(code) {
    try {
        const invite = await sock.groupGetInviteInfo(code);
        const metadata = await sock.groupMetadata(invite.id);
        return {
            ok: true,
            type: 'group',
            id: metadata.id,
            name: metadata.subject || invite.subject || null,
            invite: {
                code,
                subject: invite.subject || null
            },
            membership: buildSenderMembership(metadata)
        };
    } catch (groupError) {
        try {
            const metadata = await sock.newsletterMetadata('invite', code);
            return {
                ok: true,
                type: 'newsletter',
                id: metadata.id,
                name: metadata.name || null,
                invite: { code },
                membership: {
                    sender: sock?.user ? { id: sock.user.id, lid: sock.user.lid || null, name: sock.user.name || null } : null,
                    isMember: null,
                    isAdmin: null,
                    participant: null
                }
            };
        } catch (newsletterError) {
            throw new Error(`Não foi possível resolver convite como grupo ou canal. group=${groupError.message || String(groupError)} newsletter=${newsletterError.message || String(newsletterError)}`);
        }
    }
}

async function handleResolveTarget(req, res) {
    try {
        if (!isConnected || !sock) {
            return res.status(503).json({ ok: false, message: 'O WhatsApp não está conectado no terminal.' });
        }
        const result = await resolveTargetFromInvite(req.params.code);
        res.json(result);
    } catch (error) {
        res.status(500).json({ ok: false, message: 'Erro ao resolver destino: ' + (error.message || String(error)) });
    }
}

app.get('/resolve-target/:code', handleResolveTarget);
app.get('/resolve-channel/:code', handleResolveTarget);

// ─── Send Message ───
app.post('/send', async (req, res) => {
    const { number, targetId, text, imageUrl } = req.body;

    if ((!number && !targetId) || !text) {
        return res.status(400).json({ ok: false, message: 'Parâmetros "targetId" (ou legado "number") e "text" são obrigatórios.' });
    }

    const requestedJid = sanitizeTargetId(targetId || number);
    const jid = requestedJid || resolveConfiguredTargetId();
    const requestId = req.headers['x-request-id'] || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const targetKind = detectTargetKind(jid);
    const isNewsletter = targetKind === 'newsletter';

    if (!jid) {
        return res.status(400).json({ ok: false, message: 'Nenhum targetId válido foi resolvido para o envio.' });
    }

    engineLog('INFO', 'Início do disparo', {
        requestId,
        requestedJid,
        effectiveJid: jid,
        targetKind,
        textLength: text.length,
        hasImage: Boolean(imageUrl)
    });

    fs.appendFileSync('last_request.log', JSON.stringify(req.body, null, 2) + '\n\n');

    if (!isConnected || !sock) {
        engineLog('WARN', 'Envio recusado: motor desconectado', { requestId, jid });
        return res.status(503).json({ ok: false, message: 'Motor WhatsApp não conectado.' });
    }

    try {
        if (isNewsletter) {
            if (imageUrl) {
                engineLog('INFO', 'Enviando mídia para canal', { requestId, jid, targetKind });
                try {
                    const { imageBuffer } = await buildProcessedImageBuffer(imageUrl);
                    const result = await sock.sendMessage(jid, {
                        image: imageBuffer,
                        caption: text
                    });

                    engineLog('INFO', 'Mensagem enviada', { requestId, jid, targetKind, messageId: result?.key?.id || null, status: result?.status || null });
                    return res.json({
                        ok: true,
                        message: 'Enviado via Baileys Local! (newsletter-media)',
                        requestId,
                        requestedJid,
                        jid,
                        targetKind,
                        messageId: result?.key?.id,
                        status: result?.status || null,
                        sender: sock?.user ? { id: sock.user.id, name: sock.user.name } : null,
                        serverTime: new Date().toISOString()
                    });
                } catch (newsletterMediaError) {
                    engineLog('ERROR', 'Falha ao enviar mídia para canal', {
                        requestId,
                        jid,
                        targetKind,
                        error: newsletterMediaError.message,
                        stack: newsletterMediaError.stack?.split('\n').slice(0, 3).join('\n') || null
                    });
                    return res.status(501).json({
                        ok: false,
                        code: 'NEWSLETTER_MEDIA_NOT_SUPPORTED',
                        message: 'NEWSLETTER_MEDIA_NOT_SUPPORTED',
                        details: newsletterMediaError.message,
                        requestId,
                        requestedJid,
                        jid,
                        targetKind
                    });
                }
            }

            engineLog('INFO', 'Enviando texto para canal', { requestId, jid, targetKind });
            const result = await sock.sendMessage(jid, { text: text });

            engineLog('INFO', 'Mensagem enviada', { requestId, jid, targetKind, messageId: result?.key?.id || null, status: result?.status || null });
            return res.json({
                ok: true,
                message: 'Enviado via Baileys Local! (newsletter-text)',
                requestId,
                requestedJid,
                jid,
                targetKind,
                messageId: result?.key?.id,
                status: result?.status || null,
                sender: sock?.user ? { id: sock.user.id, name: sock.user.name } : null,
                serverTime: new Date().toISOString()
            });
        }

        let finalImageUrl = imageUrl;
        if (!finalImageUrl) {
            const lowerText = text.toLowerCase();
            if (lowerText.includes('amazon')) {
                finalImageUrl = 'https://placehold.co/1200x630/232F3E/FF9900/png?text=OFERTA+AMAZON&font=Montserrat';
            } else if (lowerText.includes('shopee')) {
                finalImageUrl = 'https://placehold.co/1200x630/EE4D2D/FFFFFF/png?text=OFERTA+SHOPEE&font=Montserrat';
            } else if (lowerText.includes('magalu') || lowerText.includes('magazine luiza')) {
                finalImageUrl = 'https://placehold.co/1200x630/0086FF/FFFFFF/png?text=OFERTA+MAGALU&font=Montserrat';
            } else if (lowerText.includes('netshoes')) {
                finalImageUrl = 'https://placehold.co/1200x630/5A2D82/FFFFFF/png?text=OFERTA+NETSHOES&font=Montserrat';
            } else {
                finalImageUrl = 'https://placehold.co/1200x630/E50914/FFFFFF/png?text=ALERTA+DE+CUPOM&font=Montserrat';
            }
            engineLog('INFO', 'Imagem genérica definida', { requestId, imageUrl: finalImageUrl });
        }

        let result;
        if (finalImageUrl) {
            try {
                const crypto = require('crypto');
                const hashStr = (str) => crypto.createHash('sha256').update(str).digest('hex').substring(0, 10);
                const { imageBuffer, hashBuf } = await buildProcessedImageBuffer(finalImageUrl);

                const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
                const clickUrl = urlMatch ? urlMatch[0] : finalImageUrl;

                let uniqueSourceUrl = clickUrl;
                let finalMessageText = text;

                if (!isNewsletter && process.env.WHATSAPP_CACHE_BUSTER === 'true') {
                    const randomStr = Math.random().toString(36).substring(2, 10);
                    uniqueSourceUrl = clickUrl.includes('?')
                        ? `${clickUrl}&_t=${Date.now()}&_r=${randomStr}`
                        : `${clickUrl}?_t=${Date.now()}&_r=${randomStr}`;

                    if (urlMatch) {
                        finalMessageText = text.split(clickUrl).join(uniqueSourceUrl);
                    }
                } else {
                    engineLog('INFO', 'Canal detectado. Cache-buster de URL desativado.', { requestId, jid });
                }

                engineLog('INFO', 'Payload de mídia preparado', {
                    requestId,
                    textHash: hashStr(finalMessageText),
                    clickUrl,
                    uniqueSourceUrl
                });

                const externalAdReplyObj = {
                    title: text.split('\n')[0].substring(0, 50).replace(/[^a-zA-Z0-9 ]/g, '') || "Oferta Especial",
                    body: "Clique no link acima para comprar 👆",
                    mediaType: 1,
                    thumbnail: imageBuffer,
                    sourceUrl: uniqueSourceUrl,
                    renderLargerThumbnail: true
                };

                const extAdReplyHashObj = { ...externalAdReplyObj, thumbnail: hashBuf(imageBuffer) };
                engineLog('INFO', 'External ad reply preparado', { requestId, hash: hashStr(JSON.stringify(extAdReplyHashObj)) });

                engineLog('INFO', 'Enviando mídia nativa', { requestId, jid, targetKind });
                result = await sock.sendMessage(jid, {
                    image: imageBuffer,
                    caption: finalMessageText
                });
            } catch (err) {
                engineLog('ERROR', 'Erro ao processar imagem', { requestId, error: err.message });
                throw err;
            }
        } else {
            engineLog('INFO', 'Enviando texto', { requestId, jid, targetKind });
            result = await sock.sendMessage(jid, {
                text: text
            });
        }

        engineLog('INFO', 'Mensagem enviada', { requestId, jid, targetKind, messageId: result?.key?.id || null, status: result?.status || null });
        res.json({
            ok: true,
            message: 'Enviado via Baileys Local!',
            requestId,
            requestedJid,
            jid,
            targetKind,
            messageId: result?.key?.id,
            status: result?.status || null,
            sender: sock?.user ? { id: sock.user.id, name: sock.user.name } : null,
            serverTime: new Date().toISOString()
        });
    } catch (sendError) {
        engineLog('ERROR', 'Erro ao enviar mensagem', {
            requestId,
            jid,
            targetKind,
            error: sendError.message,
            stack: sendError.stack?.split('\n').slice(0, 3).join('\n') || null
        });
        return res.status(500).json({ ok: false, message: sendError.message || 'Erro ao enviar via Baileys' });
    }
});

// ─── Test Endpoint (for quick debugging) ───
app.get('/test-send', async (req, res) => {
    if (!isConnected || !sock) {
        return res.status(503).json({ ok: false, message: 'Motor desconectado' });
    }
    const jid = resolveConfiguredTargetId() || '120363426476830692@newsletter';
    try {
        const result = await sock.sendMessage(jid, { text: '🧪 Teste automático do motor — ' + new Date().toLocaleTimeString('pt-BR') });
        engineLog('INFO', 'Teste enviado', { jid, messageId: result?.key?.id || null, status: result?.status || null });
        res.json({ ok: true, messageId: result?.key?.id, status: result?.status });
    } catch (e) {
        engineLog('ERROR', 'Teste falhou', { jid, error: e.message });
        res.status(500).json({ ok: false, error: e.message });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    engineLog('INFO', 'Motor do WhatsApp iniciado', { port: PORT });
});
