'use strict';

const { LLMProvider } = require('./provider');
const PARALLEL_COMPONENT_DISABLED = 'PARALLEL_COMPONENT_DISABLED: use generateOfficialAI()';

class CerebrasProvider extends LLMProvider {
  constructor() {
    super('Cerebras (disabled legacy gateway)');
  }

  async generate() {
    throw new Error(PARALLEL_COMPONENT_DISABLED);
  }
}

module.exports = { CerebrasProvider };
