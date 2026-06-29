import { LLMConfig, LLMMessage, LLMProvider, LLMResponse } from './provider.js';

export class CerebrasProvider implements LLMProvider {
  name = 'Cerebras';
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  private async fetchOpenAIFormat(messages: LLMMessage[], responseFormat: any, configOverride?: Partial<LLMConfig>): Promise<LLMResponse> {
    const finalConfig = { ...this.config, ...configOverride };
    const url = (finalConfig.baseURL || 'https://api.cerebras.ai/v1').replace(/\/$/, '') + '/chat/completions';
    
    const body = {
      model: finalConfig.model,
      messages: messages,
      temperature: finalConfig.temperature ?? 0.7,
      max_tokens: finalConfig.maxTokens ?? 1500,
      response_format: responseFormat,
    };

    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${finalConfig.apiKey}`
      },
      body: JSON.stringify(body)
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      let errorText = await response.text();
      throw new Error(`Cerebras API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : undefined,
      latencyMs
    };
  }

  async generateJSON(messages: LLMMessage[], configOverride?: Partial<LLMConfig>): Promise<LLMResponse> {
    return this.fetchOpenAIFormat(messages, { type: 'json_object' }, configOverride);
  }

  async generateText(messages: LLMMessage[], configOverride?: Partial<LLMConfig>): Promise<LLMResponse> {
    return this.fetchOpenAIFormat(messages, undefined, configOverride);
  }
}
