'use strict';

// Baileys 6.7.23 is the last stable line that still emits a QR with the
// current WhatsApp handshake. Keep the bundled protocol version explicit.
const BAILEYS_PROTOCOL_VERSION = Object.freeze([2, 3000, 1023223821]);
// WEB_BROWSER is accepted by the current server for QR pairing. Desktop
// identities (WIN32/DARWIN) are currently terminated with HTTP 428.
const BAILEYS_BROWSER = Object.freeze(['Ubuntu', 'Chrome', '22.04.4']);

function buildBaileysSocketOptions({ auth, logger }) {
    return {
        auth,
        version: [...BAILEYS_PROTOCOL_VERSION],
        browser: [...BAILEYS_BROWSER],
        printQRInTerminal: false,
        logger,
        generateHighQualityLinkPreview: false,
    };
}

module.exports = { BAILEYS_PROTOCOL_VERSION, BAILEYS_BROWSER, buildBaileysSocketOptions };
