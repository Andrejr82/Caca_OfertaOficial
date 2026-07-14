import type { AIProviderPort, AIProviderRequest } from "../ports";
import { generateOpenAICompatible, type HTTPProviderConfig } from "./http-provider";

export class CerebrasOfficialAIProvider implements AIProviderPort {
  readonly name = "cerebras" as const;
  readonly model: string;

  constructor(private readonly config: HTTPProviderConfig) {
    this.model = config.model;
  }

  generate(request: AIProviderRequest) {
    return generateOpenAICompatible(this.name, "https://api.cerebras.ai/v1/chat/completions", this.config, request);
  }
}
