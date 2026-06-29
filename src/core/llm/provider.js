/**
 * Interface/Base class for LLM Providers
 */
class LLMProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * Executa um prompt no LLM
   * @param {string} systemPrompt 
   * @param {string} userPrompt 
   * @param {boolean} jsonMode 
   * @returns {Promise<any>}
   */
  async generate(systemPrompt, userPrompt, jsonMode = false) {
    throw new Error('Method "generate" must be implemented by the provider.');
  }
}

module.exports = { LLMProvider };
