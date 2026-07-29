'use strict';

// Baileys 6.7.23 is the stable line that still emits a QR. This value is a
// fallback only; the engine fetches the current WA Web version at startup.
const BAILEYS_PROTOCOL_VERSION = Object.freeze([2, 3000, 1043857760]);
// WEB_BROWSER is accepted by the current server for QR pairing. Desktop
// identities (WIN32/DARWIN) are currently terminated with HTTP 428.
const BAILEYS_BROWSER = Object.freeze(['Ubuntu', 'Chrome', '22.04.4']);

function buildBaileysSocketOptions({ auth, logger, version = BAILEYS_PROTOCOL_VERSION }) {
    return {
        auth,
        version: [...version],
        browser: [...BAILEYS_BROWSER],
        printQRInTerminal: false,
        logger,
        generateHighQualityLinkPreview: false,
    };
}

module.exports = { BAILEYS_PROTOCOL_VERSION, BAILEYS_BROWSER, buildBaileysSocketOptions };
