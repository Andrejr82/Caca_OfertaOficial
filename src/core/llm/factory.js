'use strict';

const PARALLEL_COMPONENT_DISABLED = 'PARALLEL_COMPONENT_DISABLED: use generateOfficialAI()';

class LLMFactory {
  static getProviders() {
    throw new Error(PARALLEL_COMPONENT_DISABLED);
  }

  static async generateWithFallback() {
    throw new Error(PARALLEL_COMPONENT_DISABLED);
  }
}

module.exports = { LLMFactory };
