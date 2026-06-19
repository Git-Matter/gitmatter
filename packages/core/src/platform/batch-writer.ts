// Buffered, fire-and-forget bulk writer for high-volume, best-effort inserts
// (audit events, usage metering). Instead of one INSERT per event on the hot
// path, rows are collected in memory and flushed as a single multi-row INSERT
// when the buffer fills (maxRows) or a short timer elapses (maxDelayMs).
//
// Trade-off: rows buffered but not yet flushed are lost if the process is killed
// hard (SIGKILL / crash). That matches the existing best-effort contract for
// these tables — they already swallow insert errors. A graceful shutdown flushes
// (see registerFlushOnExit). Do NOT use this for data a request reads back or
// that must be durable.

type FlushFn<T> = (rows: T[]) => Promise<void>;

export class BatchWriter<T> {
  private buffer: T[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly flushFn: FlushFn<T>,
    private readonly maxRows: number,
    private readonly maxDelayMs: number
  ) {}

  /** Enqueue a row. Flushes immediately once the buffer is full, otherwise arms
   *  a short timer so a trickle of rows still lands promptly. */
  add(row: T): void {
    this.buffer.push(row);
    if (this.buffer.length >= this.maxRows) {
      void this.flush();
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), this.maxDelayMs);
      // Don't let a pending flush keep the process alive on its own.
      this.timer.unref?.();
    }
  }

  /** Write everything buffered as one multi-row insert. Best-effort: a failed
   *  flush drops those rows rather than throwing onto the caller. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.buffer.length === 0) return;
    const rows = this.buffer;
    this.buffer = [];
    try {
      await this.flushFn(rows);
    } catch {
      // best-effort: never surface a metering/audit write failure
    }
  }
}

// Registry so a graceful shutdown can drain every writer. Kept on a global so a
// dev HMR reload reuses the same set (and doesn't stack exit listeners).
const REGISTRY = Symbol.for("gitmatter.batchWriters");
const FLUSH_HOOKED = Symbol.for("gitmatter.batchFlushHooked");
const g = globalThis as Record<symbol, unknown>;
const writers = (g[REGISTRY] ??= new Set<BatchWriter<unknown>>()) as Set<BatchWriter<unknown>>;

export function flushAllBatches(): Promise<void[]> {
  return Promise.all([...writers].map((w) => w.flush()));
}

/** Build a registered batch writer and arm a one-time graceful-shutdown flush. */
export function createBatchWriter<T>(
  flushFn: FlushFn<T>,
  options: { maxRows?: number; maxDelayMs?: number } = {}
): BatchWriter<T> {
  const writer = new BatchWriter<T>(flushFn, options.maxRows ?? 100, options.maxDelayMs ?? 1000);
  writers.add(writer as BatchWriter<unknown>);
  if (!g[FLUSH_HOOKED]) {
    g[FLUSH_HOOKED] = true;
    const drain = () => {
      void flushAllBatches();
    };
    process.once("beforeExit", drain);
    process.once("SIGTERM", drain);
    process.once("SIGINT", drain);
  }
  return writer;
}
