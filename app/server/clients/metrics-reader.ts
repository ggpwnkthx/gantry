import { type Metrics, parseMetrics } from './metrics'

/**
 * The reader of the metrics of a service.
 *
 * The metrics of a service live on the replicas of the service, and they
 * are protected by a token of the deployment. The reader answers the
 * metrics of one replica, or the error that says that the replica is not
 * there: a console that shows a number it invented is worse than a console
 * that shows nothing.
 */

/** The options of the reader. */
export interface MetricsReaderOptions {
  /** The url of the /metrics of the replica. */
  url: string
  /** The token of the metrics of the deployment. */
  token?: string
  /** The timeout of a call, in milliseconds. */
  timeoutMs?: number
}

/** The answer of the reader: the metrics, or the reason there are none. */
export type MetricsAnswer =
  | { ok: true; metrics: Metrics; at: number }
  | { ok: false; reason: string; at: number }

/** Reads the metrics of a replica. */
export async function readMetrics(options: MetricsReaderOptions): Promise<MetricsAnswer> {
  const at = Date.now()
  try {
    const response = await fetch(`${options.url.replace(/\/$/, '')}/metrics`, {
      headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
      signal: AbortSignal.timeout(options.timeoutMs ?? 3_000),
    })
    if (!response.ok) {
      return { ok: false, reason: `the metrics answered ${response.status}`, at }
    }
    const text = await response.text()
    return { ok: true, metrics: parseMetrics(text), at }
  } catch (error) {
    return { ok: false, reason: `the metrics are not reachable: ${String(error)}`, at }
  }
}
