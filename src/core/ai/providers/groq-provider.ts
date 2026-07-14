import type { AIProviderPort, AIProviderRequest } from "../ports";
import { generateOpenAICompatible, type HTTPProviderConfig } from "./http-provider";

export class GroqOfficialAIProvider implements AIProviderPort {
  readonly name = "groq" as const;
  readonly model: string;

  constructor(private readonly config: HTTPProviderConfig) {
    this.model = config.model;
  }

  generate(request: AIProviderRequest) {
    return generateOpenAICompatible(this.name, "https://api.groq.com/openai/v1/chat/completions", this.config, request);
  }
}
