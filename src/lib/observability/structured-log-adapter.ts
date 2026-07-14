import type { ObservabilityEvent, ObservabilityEventPort } from "@/core/observability";
import { sanitizeObservabilityValue } from "@/core/observability";

export class StructuredLogObservabilityAdapter implements ObservabilityEventPort {
  constructor(private readonly writeLine: (line: string) => void) {}
  emit(event: ObservabilityEvent): void {
    this.writeLine(JSON.stringify(sanitizeObservabilityValue(event)));
  }
}

