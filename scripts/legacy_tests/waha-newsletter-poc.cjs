#!/usr/bin/env node
'use strict';

const requiredEnv = ['WAHA_URL', 'WAHA_API_KEY', 'WAHA_SESSION', 'WAHA_CHANNEL_ID'];
const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(JSON.stringify({
    ok: false,
    error: 'MISSING_ENV',
    missing,
  }, null, 2));
  process.exit(1);
}

const baseUrl = process.env.WAHA_URL.replace(/\/+$/, '');
const apiKey = process.env.WAHA_API_KEY;
const session = process.env.WAHA_SESSION;
const channelId = process.env.WAHA_CHANNEL_ID;
const imageUrl = process.env.WAHA_IMAGE_URL || 'https://github.com/devlikeapro/waha/raw/core/examples/dev.likeapro.jpg';
const linkUrl = process.env.WAHA_LINK_URL || 'https://example.com/waha-newsletter-poc';
const cta = process.env.WAHA_CTA || 'CTA: abrir link de teste';
const marker = `WAHA-NEWSLETTER-POC-${Date.now()}`;
const historyDelayMs = Number(process.env.WAHA_HISTORY_DELAY_MS || 5000);

if (!channelId.endsWith('@newsletter')) {
  console.error(JSON.stringify({
    ok: false,
    error: 'CHANNEL_ID_MUST_BE_NEWSLETTER',
    channelId,
  }, null, 2));
  process.exit(1);
}

const caption = [
  'Teste interno Caca Oferta Oficial',
  marker,
  'Imagem + legenda + link + CTA',
  linkUrl,
  cta,
].join('\n');

const headers = {
  'Content-Type': 'application/json',
  'X-Api-Key': apiKey,
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    json,
    text,
  };
}

function compactMessage(message) {
  return {
    id: message.id,
    timestamp: message.timestamp,
    from: message.from,
    fromMe: message.fromMe,
    body: message.body,
    hasMedia: message.hasMedia,
    mediaUrl: message.mediaUrl,
    ack: message.ack,
    ackName: message.ackName,
  };
}

async function main() {
  const sendBody = {
    session,
    chatId: channelId,
    file: {
      mimetype: 'image/jpeg',
      url: imageUrl,
      filename: 'waha-newsletter-poc.jpg',
    },
    caption,
  };

  const sendResult = await requestJson(`${baseUrl}/api/sendImage`, {
    method: 'POST',
    headers,
    body: JSON.stringify(sendBody),
  });

  await new Promise((resolve) => setTimeout(resolve, historyDelayMs));

  const encodedSession = encodeURIComponent(session);
  const encodedChannelId = encodeURIComponent(channelId);
  const historyUrl = `${baseUrl}/api/${encodedSession}/chats/${encodedChannelId}/messages?downloadMedia=true&limit=20`;
  const historyResult = await requestJson(historyUrl, { headers });
  const messages = Array.isArray(historyResult.json) ? historyResult.json : [];
  const matches = messages.filter((message) => JSON.stringify(message).includes(marker));
  const mediaMatches = matches.filter((message) => message.hasMedia || message.media || message.mediaUrl);

  const summary = {
    ok: mediaMatches.length === 1,
    proofRule: 'HTTP 200, ACK, messageId and status are not accepted as success. Only channel history match is accepted.',
    channelId,
    marker,
    sendHttpStatus: sendResult.status,
    sendAcceptedByHttp: sendResult.ok,
    historyHttpStatus: historyResult.status,
    historyFetched: historyResult.ok && Array.isArray(historyResult.json),
    historyConfirms: matches.length > 0,
    imagePublished: mediaMatches.length > 0,
    captionPublished: matches.some((message) => String(message.body || '').includes(marker)),
    linkPublished: matches.some((message) => String(message.body || '').includes(linkUrl)),
    ctaPublished: matches.some((message) => String(message.body || '').includes(cta)),
    singlePostConfirmed: mediaMatches.length === 1,
    matchedMessages: matches.map(compactMessage),
    sendResponse: sendResult.json || sendResult.text,
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    stack: error.stack,
  }, null, 2));
  process.exit(1);
});
