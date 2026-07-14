import type { LLMConfig, LLMMessage, LLMProvider, LLMResponse } from "./provider.js";

const PARALLEL_COMPONENT_DISABLED = "PARALLEL_COMPONENT_DISABLED: use generateOfficialAI()";

export class GroqProvider implements LLMProvider {
  name = "Groq (disabled legacy gateway)";

  constructor(config: LLMConfig) {
    void config;
  }

  async generateJSON(messages: LLMMessage[], configOverride?: Partial<LLMConfig>): Promise<LLMResponse> {
    void messages;
    void configOverride;
    throw new Error(PARALLEL_COMPONENT_DISABLED);
  }

  async generateText(messages: LLMMessage[], configOverride?: Partial<LLMConfig>): Promise<LLMResponse> {
    void messages;
    void configOverride;
    throw new Error(PARALLEL_COMPONENT_DISABLED);
  }
}
