import type { HealthPort } from "./ports";
import { sanitizeObservabilityValue } from "./sanitization";

export async function evaluateHealth(probes: readonly HealthPort[]) {
  const checks = await Promise.all(probes.map(async (probe) => {
    try {
      const result = await probe.check();
      return { name: probe.name, required: probe.required, healthy: result.healthy, detail: sanitizeObservabilityValue(result.detail ?? null) };
    } catch {
      return { name: probe.name, required: probe.required, healthy: false, detail: "check_failed" };
    }
  }));
  const healthy = checks.every((check) => check.healthy);
  const ready = checks.every((check) => !check.required || check.healthy);
  return { healthy, ready, checks };
}

