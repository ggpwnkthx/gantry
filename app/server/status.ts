import type { Breakdown, PendingPanel, ServiceStatus, Tile } from '../types'
import type { OperatorScope } from './operator'
import { gaugeValue, type Metrics, quantileOf, sumByLabel, sumOf } from './clients/metrics'
import { type MetricsAnswer, readMetrics } from './clients/metrics-reader'
import { probeReplicas } from './clients/probes'

export type { Breakdown, PendingPanel, ServiceStatus, Tile }

/**
 * The status of a service.
 *
 * The status is what the console shows of a service: the numbers of the
 * service, the state of its replicas, and the panels that a service does
 * not carry yet.
 *
 * Every number comes from the service itself. A number that the console
 * cannot read is not a number that the console invents: it is a source
 * that is missing, and the screen says so.
 */

/** The options of the reading of a status. */
export interface StatusOptions {
  /** The name of the service. */
  service: 'shuttle' | 'hub'
  /** The addresses of the replicas of the service. */
  replicas: string[]
  /** The token of the metrics of the service. */
  metricsToken?: string
}

/**
 * Reads the status of a service.
 *
 * The replicas are probed and their metrics are read, at the same time.
 * The metrics of a replica that is down are not there, and the numbers of
 * the service are the sum of the replicas that answered.
 */
export async function readStatus(options: StatusOptions): Promise<ServiceStatus> {
  const replicas = await probeReplicas(options.replicas)
  const answers = await Promise.all(
    options.replicas.map((address) => readMetrics({ url: address, token: options.metricsToken }))
  )
  const answered = answers.filter(
    (answer): answer is Extract<MetricsAnswer, { ok: true }> => answer.ok
  )
  const metrics = mergeMetrics(answered.map((answer) => answer.metrics))
  const at = Date.now()

  return {
    service: options.service,
    at,
    replicas,
    tiles: options.service === 'shuttle' ? shuttleTiles(metrics) : hubTiles(metrics),
    pending: options.service === 'shuttle' ? shuttlePending() : hubPending(),
    breakdowns: options.service === 'shuttle' ? shuttleBreakdowns(metrics) : hubBreakdowns(metrics),
    source: {
      ok: answered.length > 0,
      replicas: answered.length,
      ...(answered.length > 0
        ? {}
        : { reason: answers[0]?.ok === false ? answers[0].reason : 'there is no replica' }),
    },
  }
}

/**
 * The status of a service, as the scope of the caller may see it.
 *
 * The metrics of Hub carry the name of the tenant of every decision, and a
 * tenant operator reads the numbers of the platform. The rows of the other
 * tenants are removed from the answer: a console that shows the numbers of
 * another tenant to a tenant operator is a console that leaks.
 */
export function forScope(status: ServiceStatus, scope: OperatorScope): ServiceStatus {
  if (scope.platform) return status
  return {
    ...status,
    breakdowns: status.breakdowns.map((breakdown) =>
      breakdown.label === 'the decisions by tenant'
        ? {
            ...breakdown,
            rows: breakdown.rows.filter((row) => row.key === scope.tenantSlug),
          }
        : breakdown
    ),
  }
}

/**
 * Merges the metrics of the replicas.
 *
 * A counter of a replica is a counter of the service: the replicas of a
 * deployment share the work and the counter of each of them is added up.
 */
function mergeMetrics(answers: Metrics[]): Metrics {
  const merged = new Map<
    string,
    Array<{ name: string; labels: Record<string, string>; value: number }>
  >()
  for (const metrics of answers) {
    for (const [name, samples] of metrics.samples) {
      const list = merged.get(name)
      if (list) {
        list.push(...samples)
      } else {
        merged.set(name, [...samples])
      }
    }
  }
  return { samples: merged }
}

/** The tiles of the gateway. */
function shuttleTiles(metrics: Metrics): Tile[] {
  const upstreamFailures = sumOf(metrics, 'shuttle_upstream_failures_total')
  const errors = sumOf(metrics, 'shuttle_request_errors_total')
  const accessUnavailable = sumOf(metrics, 'shuttle_access_unavailable_total')
  return [
    { label: 'the requests', value: sumOf(metrics, 'shuttle_requests_total'), unit: 'count' },
    {
      label: 'the errors of the server',
      value: errors,
      unit: 'count',
      state: errors > 0 ? 'error' : 'ok',
    },
    {
      label: 'the refusals of the authentication',
      value: sumOf(metrics, 'shuttle_auth_failures_total'),
      unit: 'count',
    },
    {
      label: 'the failures of the upstreams',
      value: upstreamFailures,
      unit: 'count',
      state: upstreamFailures > 0 ? 'error' : 'ok',
    },
    {
      label: 'the upstreams that were skipped',
      value: sumOf(metrics, 'shuttle_upstreams_skipped_total'),
      unit: 'count',
    },
    {
      label: 'the refusals of the access service',
      value: accessUnavailable,
      unit: 'count',
      state: accessUnavailable > 0 ? 'warn' : 'ok',
    },
    {
      label: 'the requests in flight',
      value: gaugeValue(metrics, 'shuttle_active_requests'),
      unit: 'count',
    },
  ]
}

/** The breakdowns of the gateway. */
function shuttleBreakdowns(metrics: Metrics): Breakdown[] {
  const byRoute: Record<string, number> = {}
  for (const sample of metrics.samples.get('shuttle_requests_total') ?? []) {
    const route = sample.labels.route ?? ''
    byRoute[route] = (byRoute[route] ?? 0) + sample.value
  }
  const routes = Object.entries(byRoute)
    .map(([key, value]) => ({ key, value }))
    .sort((left, right) => right.value - left.value)
  const byReason: Record<string, number> = {}
  for (const sample of metrics.samples.get('shuttle_auth_failures_total') ?? []) {
    const reason = sample.labels.reason ?? ''
    byReason[reason] = (byReason[reason] ?? 0) + sample.value
  }
  const reasons = Object.entries(byReason)
    .map(([key, value]) => ({ key, value }))
    .sort((left, right) => right.value - left.value)
  const breakdowns: Breakdown[] = [{ label: 'the traffic by route', rows: routes }]
  if (reasons.length > 0) {
    breakdowns.push({ label: 'the refusals of the authentication by reason', rows: reasons })
  }
  const duration = quantileOf(metrics, 'shuttle_request_duration_seconds', 0.95)
  if (duration !== undefined) {
    breakdowns.push({
      label: 'the duration of the requests',
      rows: [{ key: 'the 95th percentile', value: duration, unit: 'seconds' }],
    })
  }
  return breakdowns
}

/** The panels of the gateway that a change of Shuttle carries. */
function shuttlePending(): PendingPanel[] {
  return [
    {
      label: 'the upstreams',
      needs: 'Shuttle 1.4.0',
      description:
        'the failures of every upstream, one row per upstream: the label of the upstream is needed',
    },
    {
      label: 'the breaker of the access service',
      needs: 'Shuttle 1.4.0',
      description: 'the state of the breaker of the access service, open or closed',
    },
  ]
}

/** The tiles of Hub. */
function hubTiles(metrics: Metrics): Tile[] {
  const denials = sumByLabel(metrics, 'hub_decisions_total', 'result', 'deny')
  const storeErrors = sumOf(metrics, 'hub_store_errors_total')
  return [
    { label: 'the decisions', value: sumOf(metrics, 'hub_decisions_total'), unit: 'count' },
    {
      label: 'the refusals',
      value: denials,
      unit: 'count',
      state: denials > 0 ? 'warn' : 'ok',
    },
    { label: 'the logins', value: sumOf(metrics, 'hub_logins_total'), unit: 'count' },
    {
      label: 'the failures of the stores',
      value: storeErrors,
      unit: 'count',
      state: storeErrors > 0 ? 'error' : 'ok',
    },
  ]
}

/** The breakdowns of Hub. */
function hubBreakdowns(metrics: Metrics): Breakdown[] {
  const byTenant: Record<string, number> = {}
  for (const sample of metrics.samples.get('hub_decisions_total') ?? []) {
    const tenant = sample.labels.tenant ?? ''
    byTenant[tenant] = (byTenant[tenant] ?? 0) + sample.value
  }
  const tenants = Object.entries(byTenant)
    .map(([key, value]) => ({ key, value }))
    .sort((left, right) => right.value - left.value)
  const breakdowns: Breakdown[] = []
  if (tenants.length > 0) {
    breakdowns.push({ label: 'the decisions by tenant', rows: tenants })
  }
  const duration = quantileOf(metrics, 'hub_decision_duration_seconds', 0.95)
  if (duration !== undefined) {
    breakdowns.push({
      label: 'the duration of the decisions',
      rows: [{ key: 'the 95th percentile', value: duration, unit: 'seconds' }],
    })
  }
  return breakdowns
}

/** The panels of Hub that a change of Hub carries. */
function hubPending(): PendingPanel[] {
  return [
    {
      label: 'the reasons of the refusals',
      needs: 'Hub 1.0.2',
      description: 'the reasons of the refusals, under the trend of the decisions',
    },
    {
      label: 'the health of the providers',
      needs: 'Hub 1.0.2',
      description: 'the health of the provider of every tenant, one row per tenant',
    },
    {
      label: 'the keys and the rotation',
      needs: 'Hub 1.0.2',
      description: 'the age of the keys and the rotations that are pending',
    },
  ]
}
