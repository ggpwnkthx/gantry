/**
 * The fake of a service that the console watches.
 *
 * The fake answers the two endpoints of a service that the console reads:
 * the readiness of the replica and its metrics. It is the service of the
 * tests of the status: a gateway that answers its metrics, and a Hub that
 * is down.
 */

/** The options of the fake. */
export interface FakeServiceOptions {
  /** The body of the metrics of the service, or the function that writes it. */
  metrics?: string | (() => string)
  /** The status of the readiness. */
  ready?: number
  /** The token of the metrics. When it is not set, the metrics are open. */
  token?: string
}

/** The fake of a service. */
export interface FakeService {
  /** The url of the service. */
  url: string
  /** The calls the fake received. */
  calls: string[]
  /** Stops the fake. */
  stop: () => Promise<void>
}

/** Starts the fake of a service. */
export async function startFakeService(options: FakeServiceOptions = {}): Promise<FakeService> {
  const calls: string[] = []
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(request) {
      const url = new URL(request.url)
      calls.push(`${request.method} ${url.pathname}`)
      if (url.pathname === '/readyz') {
        const status = options.ready ?? 200
        return new Response(status === 200 ? 'ready' : 'not ready', { status })
      }
      if (url.pathname === '/metrics') {
        if (options.token) {
          const authorization = request.headers.get('authorization') ?? ''
          if (authorization !== `Bearer ${options.token}`) {
            return new Response('unauthorized', { status: 401 })
          }
        }
        const body = typeof options.metrics === 'function' ? options.metrics() : options.metrics
        return new Response(body ?? '', {
          headers: { 'content-type': 'text/plain; version=0.0.4' },
        })
      }
      return new Response('not found', { status: 404 })
    },
  })
  return {
    url: `http://127.0.0.1:${server.port}`,
    calls,
    stop: async () => {
      await server.stop(true)
    },
  }
}

/** The metrics of a gateway that is working. */
export const GATEWAY_METRICS = `# HELP shuttle_requests_total Requests handled by the gateway.
# TYPE shuttle_requests_total counter
shuttle_requests_total{route="gantry",method="GET",status="200"} 42
shuttle_requests_total{route="gantry-admin",method="POST",status="405"} 3
# HELP shuttle_request_errors_total Requests that failed with a server error.
# TYPE shuttle_request_errors_total counter
shuttle_request_errors_total{route="gantry"} 1
# HELP shuttle_auth_failures_total Callers that were rejected.
# TYPE shuttle_auth_failures_total counter
shuttle_auth_failures_total{route="gantry",reason="missing_role"} 5
# HELP shuttle_upstream_failures_total The failures of the upstreams.
# TYPE shuttle_upstream_failures_total counter
shuttle_upstream_failures_total 7
# HELP shuttle_upstreams_skipped_total The times an upstream was skipped.
# TYPE shuttle_upstreams_skipped_total counter
shuttle_upstreams_skipped_total 2
# HELP shuttle_access_unavailable_total Requests refused because the access service was unreachable.
# TYPE shuttle_access_unavailable_total counter
shuttle_access_unavailable_total{route="gantry"} 0
# HELP shuttle_active_requests Requests that are currently in flight.
# TYPE shuttle_active_requests gauge
shuttle_active_requests 4
`

/** The metrics of a Hub that is working. */
export const HUB_METRICS = `# HELP hub_decisions_total The decisions the service answered.
# TYPE hub_decisions_total counter
hub_decisions_total{result="allow",tenant="acme"} 100
hub_decisions_total{result="deny",tenant="acme"} 4
hub_decisions_total{result="allow",tenant="globex"} 60
hub_decisions_total{result="deny",tenant="globex"} 2
# HELP hub_logins_total The logins of the callers.
# TYPE hub_logins_total counter
hub_logins_total{result="success",tenant="acme"} 12
# HELP hub_store_errors_total The failures of the stores.
# TYPE hub_store_errors_total counter
hub_store_errors_total{store="postgres"} 0
`
