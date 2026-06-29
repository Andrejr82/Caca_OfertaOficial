const { CerebrasProvider } = require('./cerebras');
const { GroqProvider } = require('./groq');
require('dotenv').config({ path: '.env.local' });

class LLMFactory {
  /**
   * Retorna os providers instanciados na ordem oficial definida no .env
   */
  static getProviders() {
    const primaryProviderName = (process.env.LLM_PROVIDER || 'cerebras').toLowerCase();
    const fallbackProviderName = (process.env.LLM_FALLBACK || 'groq').toLowerCase();

    const providerMap = {
      'cerebras': () => new CerebrasProvider(),
      'groq': () => new GroqProvider()
    };

    const primaryFn = providerMap[primaryProviderName];
    const fallbackFn = providerMap[fallbackProviderName];

    if (!primaryFn || !fallbackFn) {
      throw new Error('Configuração de providers inválida no .env.local');
    }

    return {
      primary: primaryFn(),
      fallback: fallbackFn()
    };
  }

  /**
   * Executa a geração usando a estratégia de Fallback
   */
  static async generateWithFallback(systemPrompt, userPrompt, jsonMode = false) {
    const { primary, fallback } = this.getProviders();

    console.log(`[LLM Factory] Tentando provider principal: ${primary.name}...`);
    try {
      const result = await primary.generate(systemPrompt, userPrompt, jsonMode);
      console.log(`[LLM Factory] Sucesso no provider principal: ${primary.name}.`);
      return result;
    } catch (error) {
      console.warn(`[LLM Factory] Provider principal (${primary.name}) falhou: ${error.message}`);
      console.log(`[LLM Factory] Acionando fallback: ${fallback.name}...`);
      
      try {
        const fallbackResult = await fallback.generate(systemPrompt, userPrompt, jsonMode);
        console.log(`[LLM Factory] Sucesso no provider fallback: ${fallback.name}.`);
        return fallbackResult;
      } catch (fallbackError) {
        console.error(`[LLM Factory] Provider fallback (${fallback.name}) também falhou: ${fallbackError.message}`);
        throw new Error(`Ambos os providers falharam. Principal: ${error.message} | Fallback: ${fallbackError.message}`);
      }
    }
  }
}

module.exports = { LLMFactory };
