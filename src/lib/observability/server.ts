import { randomUUID } from "node:crypto";
import { StructuredLogObservabilityAdapter } from "./structured-log-adapter";

export function createServerObservabilityDependencies() {
  return {
    events: new StructuredLogObservabilityAdapter((line) => console.log(line)),
    clock: { now: () => new Date().toISOString() },
    uuid: { generate: () => randomUUID() },
    environment: process.env.NODE_ENV || "unknown"
  };
}

