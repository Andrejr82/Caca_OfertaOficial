'use strict';

const { TextEncoder, TextDecoder } = require('node:util');
const encoded = new TextEncoder().encode('');
if (!(encoded instanceof Uint8Array)) {
  globalThis.Uint8Array = encoded.constructor;
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}
const runtimeRequire = eval('require');
runtimeRequire('tsx/cjs');
module.exports = require('../src/lib/shopee/ranking/oracle-adapter.ts');
