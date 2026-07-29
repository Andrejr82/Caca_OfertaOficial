import { describe, expect, it } from "vitest";

const { buildBaileysSocketOptions, BAILEYS_PROTOCOL_VERSION } = require("../../scripts/whatsapp-connection-config.cjs");

describe("WhatsApp Baileys connection configuration", () => {
  it("uses an explicit protocol version to avoid the 405 connection failure", () => {
    const options = buildBaileysSocketOptions({ auth: { creds: {} }, logger: { level: "silent" } });

    expect(options.version).toEqual(BAILEYS_PROTOCOL_VERSION);
    expect(options.version).toEqual([2, 3000, 1034074495]);
  });

  it("uses the macOS desktop browser identity required by WhatsApp handshake", () => {
    const options = buildBaileysSocketOptions({ auth: { creds: {} }, logger: { level: "silent" } });

    expect(options.browser).toEqual(["Mac OS", "Desktop", "14.4.1"]);
  });
});
