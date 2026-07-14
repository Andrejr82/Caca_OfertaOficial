'use strict';

const { LLMProvider } = require('./provider');
const PARALLEL_COMPONENT_DISABLED = 'PARALLEL_COMPONENT_DISABLED: use generateOfficialAI()';

class GroqProvider extends LLMProvider {
  constructor() {
    super('Groq (disabled legacy gateway)');
  }

  async generate() {
    throw new Error(PARALLEL_COMPONENT_DISABLED);
  }
}

module.exports = { GroqProvider };
