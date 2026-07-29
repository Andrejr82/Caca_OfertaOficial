'use strict';

// Baileys 7.0.0-rc13 can receive HTTP 405 when it negotiates its bundled
// default protocol version. Keep this value explicit and isolated so it can
// be updated/tested without touching the Supabase auth state.
const BAILEYS_PROTOCOL_VERSION = Object.freeze([2, 3000, 1034074495]);
// WhatsApp currently rejects some Baileys 7 handshakes using the default
// browser identity with HTTP 405. Keep the desktop identity explicit too.
const BAILEYS_BROWSER = Object.freeze(['Mac OS', 'Desktop', '14.4.1']);

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
