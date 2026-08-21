import { Registry, collectDefaultMetrics } from "prom-client";

/** One Registry per Node process (API or Worker). */
export const metricsRegistry = new Registry();

let defaultMetricsStarted = false;
let processService: "api" | "worker" | null = null;

/**
 * Idempotent. Sets default label `service=api|worker` and process collectors.
 * Call once at process boot before serving /metrics.
 */
export function startDefaultProcessMetrics(serviceName: "api" | "worker"): void {
  if (defaultMetricsStarted) {
    return;
  }

  defaultMetricsStarted = true;
  processService = serviceName;
  metricsRegistry.setDefaultLabels({ service: serviceName });
  collectDefaultMetrics({ register: metricsRegistry });
}

export function getProcessServiceLabel(): "api" | "worker" | null {
  return processService;
}

export async function renderPrometheusMetrics(): Promise<string> {
  return metricsRegistry.metrics();
}

export function prometheusContentType(): string {
  return metricsRegistry.contentType;
}
