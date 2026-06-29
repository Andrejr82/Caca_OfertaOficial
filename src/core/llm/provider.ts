export interface LLMConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs?: number;
}

export interface LLMProvider {
  name: string;
  generateJSON(messages: LLMMessage[], configOverride?: Partial<LLMConfig>): Promise<LLMResponse>;
  generateText(messages: LLMMessage[], configOverride?: Partial<LLMConfig>): Promise<LLMResponse>;
}
