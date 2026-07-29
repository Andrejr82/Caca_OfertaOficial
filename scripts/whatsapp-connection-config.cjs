'use strict';

// Baileys 7.0.0-rc13 can receive HTTP 405 when it negotiates its bundled
// default protocol version. Keep this value explicit and isolated so it can
// be updated/tested without touching the Supabase auth state.
const BAILEYS_PROTOCOL_VERSION = Object.freeze([2, 3000, 1034074495]);

function buildBaileysSocketOptions({ auth, logger }) {
    return {
        auth,
        version: [...BAILEYS_PROTOCOL_VERSION],
        printQRInTerminal: false,
        logger,
        generateHighQualityLinkPreview: false,
    };
}

module.exports = { BAILEYS_PROTOCOL_VERSION, buildBaileysSocketOptions };
