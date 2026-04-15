/**
 * Lightweight OTEL-compatible tracing for PDF export operations.
 *
 * Emits structured span data to stderr in OTEL-compatible JSON format.
 * When a real OTEL collector is configured (OTEL_EXPORTER_OTLP_ENDPOINT),
 * these spans can be picked up by the AgenticGateway's observability stack.
 *
 * For now: structured console logging that matches OTEL attribute conventions.
 * Future: replace with @opentelemetry/api when the dependency budget allows.
 */

const TRACING_ENABLED = process.env.PRETEXT_PDF_TRACING !== "false";

interface SpanData {
  name: string;
  attributes: Record<string, string | number | boolean>;
  startTime: number;
  endTime?: number;
  status?: "ok" | "error";
  error?: string;
}

/**
 * Start a traced operation. Returns a span handle that must be ended.
 */
export function startSpan(
  name: string,
  attributes?: Record<string, string | number | boolean>
): SpanHandle {
  return new SpanHandle(name, attributes ?? {});
}

export class SpanHandle {
  private data: SpanData;

  constructor(
    name: string,
    attributes: Record<string, string | number | boolean>
  ) {
    this.data = {
      name,
      attributes: {
        "service.name": "pretext-pdf-mcp",
        "service.version": "0.2.0",
        ...attributes,
      },
      startTime: performance.now(),
    };
  }

  /** Add attributes during execution */
  setAttribute(key: string, value: string | number | boolean): void {
    this.data.attributes[key] = value;
  }

  /** End span successfully */
  end(): void {
    this.data.endTime = performance.now();
    this.data.status = "ok";
    this.emit();
  }

  /** End span with error */
  endWithError(error: unknown): void {
    this.data.endTime = performance.now();
    this.data.status = "error";
    this.data.error =
      error instanceof Error ? error.message : String(error);
    this.emit();
  }

  private emit(): void {
    if (!TRACING_ENABLED) return;

    const durationMs = (this.data.endTime! - this.data.startTime).toFixed(2);
    const span = {
      name: this.data.name,
      duration_ms: parseFloat(durationMs),
      status: this.data.status,
      attributes: this.data.attributes,
      ...(this.data.error && { error: this.data.error }),
      timestamp: new Date().toISOString(),
    };

    // Emit to stderr so it doesn't interfere with MCP stdio transport
    process.stderr.write(JSON.stringify(span) + "\n");
  }
}

/**
 * Trace an async function as a span.
 */
export async function traced<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: SpanHandle) => Promise<T>
): Promise<T> {
  const span = startSpan(name, attributes);
  try {
    const result = await fn(span);
    span.end();
    return result;
  } catch (error) {
    span.endWithError(error);
    throw error;
  }
}
