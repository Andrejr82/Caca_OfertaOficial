import type { MetricsPort } from "./ports";

type MetricSnapshot = {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, number[]>;
};
const HIGH_CARDINALITY = /(^|_)(id|uuid|command|correlation|causation|execution|receipt|offer|post|tenant|user)(_|$)|Id$/i;

function key(name: string, labels: Readonly<Record<string, string>> = {}): string {
  for (const label of Object.keys(labels)) {
    if (HIGH_CARDINALITY.test(label)) throw new Error(`High-cardinality metric label is prohibited: ${label}`);
  }
  const suffix = Object.entries(labels).sort().map(([label, value]) => `${label}=${JSON.stringify(value)}`).join(",");
  return suffix ? `${name}{${suffix}}` : name;
}

export class InMemoryMetricsAdapter implements MetricsPort {
  private readonly data: MetricSnapshot = { counters: {}, gauges: {}, histograms: {} };
  increment(name: string, value = 1, labels?: Readonly<Record<string, string>>): void {
    const metric = key(name, labels);
    this.data.counters[metric] = (this.data.counters[metric] ?? 0) + value;
  }
  gauge(name: string, value: number, labels?: Readonly<Record<string, string>>): void {
    this.data.gauges[key(name, labels)] = value;
  }
  observe(name: string, value: number, labels?: Readonly<Record<string, string>>): void {
    const metric = key(name, labels);
    (this.data.histograms[metric] ??= []).push(value);
  }
  snapshot(): MetricSnapshot {
    return {
      counters: { ...this.data.counters },
      gauges: { ...this.data.gauges },
      histograms: Object.fromEntries(Object.entries(this.data.histograms).map(([name, values]) => [name, [...values]]))
    };
  }
}
