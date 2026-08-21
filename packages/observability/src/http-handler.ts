import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:http";
import {
  prometheusContentType,
  renderPrometheusMetrics,
} from "./registry.js";

export type MetricsHttpAuth = {
  /** When set, require Authorization: Bearer <token> for /metrics. */
  bearerToken?: string;
  /** When false, /metrics returns 404 (same body as unknown routes). */
  enabled?: boolean;
};

function readBearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function unauthorized(res: ServerResponse): void {
  res.statusCode = 401;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end("Unauthorized");
}

function notFound(res: ServerResponse): void {
  res.statusCode = 404;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end("Not Found");
}

/**
 * Handles GET /metrics (Prometheus) and GET /health (liveness).
 * Optional bearer token for /metrics when configured.
 * Never leaks token/config details in responses.
 */
export async function handleMetricsHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  auth: MetricsHttpAuth = {},
): Promise<void> {
  const url = req.url?.split("?")[0] ?? "/";
  const method = req.method ?? "GET";
  const metricsEnabled = auth.enabled !== false;

  if (method !== "GET") {
    res.statusCode = 405;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Method Not Allowed");
    return;
  }

  if (url === "/health") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (url === "/metrics") {
    if (!metricsEnabled) {
      notFound(res);
      return;
    }

    if (auth.bearerToken) {
      const token = readBearer(req);
      if (!token || token !== auth.bearerToken) {
        unauthorized(res);
        return;
      }
    }

    const body = await renderPrometheusMetrics();
    res.statusCode = 200;
    res.setHeader("content-type", prometheusContentType());
    res.end(body);
    return;
  }

  notFound(res);
}

export type StartMetricsHttpServerOptions = {
  host: string;
  port: number;
  bearerToken?: string;
  enabled?: boolean;
};

export function startMetricsHttpServer(options: StartMetricsHttpServerOptions): Server {
  const server = createServer((req, res) => {
    void handleMetricsHttpRequest(req, res, {
      bearerToken: options.bearerToken,
      enabled: options.enabled,
    }).catch(() => {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("Internal Server Error");
    });
  });

  server.listen(options.port, options.host);
  return server;
}
