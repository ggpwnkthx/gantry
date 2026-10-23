/**
 * The fake of the control plane of Shuttle.
 *
 * The fake answers the calls that the console makes to the control plane,
 * and it holds the rule of the scopes: the token of the scope `operate`
 * revokes the sessions and purges the decisions, and the token of the
 * scope `config` writes the route table. A token of a scope that may not
 * do a thing is refused.
 */

/** The options of the fake. */
export interface FakeControlOptions {
  /** The token of the scope `operate`. */
  operateToken: string
  /** The token of the scope `config`. */
  configToken: string
  /** The revision that is active. */
  activeRevision?: number
  /** The revisions of the history. */
  revisions?: number[]
}

/** The fake of the control plane. */
export interface FakeControl {
  /** The url of the fake. */
  url: string
  /** The calls the fake received, with the scope of the token. */
  calls: Array<{ method: string; path: string; scope: string }>
  /** Stops the fake. */
  stop: () => Promise<void>
}

/** Starts the fake of the control plane. */
export async function startFakeControl(options: FakeControlOptions): Promise<FakeControl> {
  const calls: FakeControl['calls'] = []
  const active = options.activeRevision ?? 2
  const revisions = options.revisions ?? [2, 1]

  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(request) {
      const url = new URL(request.url)
      const authorization = request.headers.get('authorization') ?? ''
      const token = authorization.replace(/^Bearer\s+/i, '')
      const scope =
        token === options.operateToken
          ? 'operate'
          : token === options.configToken
            ? 'config'
            : 'none'
      calls.push({ method: request.method, path: url.pathname, scope })

      if (scope === 'none') {
        return Response.json({ error: 'unauthorized' }, { status: 401 })
      }
      if (url.pathname === '/v1/config' && request.method === 'GET') {
        return Response.json({
          revision: active,
          table: { version: 1, routes: [{ id: 'gantry', match: { path: '/' } }] },
          author: 'the-operator',
          createdAt: Date.now(),
          source: 'store',
          warnings: [],
        })
      }
      if (url.pathname === '/v1/config/history' && request.method === 'GET') {
        return Response.json({
          entries: revisions.map((revision) => ({
            revision,
            author: 'the-operator',
            createdAt: Date.now(),
            table: { version: 1, routes: [{ id: 'gantry', match: { path: '/' } }] },
          })),
          total: revisions.length,
        })
      }
      if (url.pathname === '/v1/config/rollback' && request.method === 'POST') {
        if (scope !== 'config') {
          return Response.json({ error: 'forbidden' }, { status: 403 })
        }
        return Response.json({ revision: active + 1 })
      }
      if (url.pathname === '/v1/sessions' && request.method === 'DELETE') {
        if (scope !== 'operate') {
          return Response.json({ error: 'forbidden' }, { status: 403 })
        }
        return Response.json({ revoked: 2 })
      }
      if (url.pathname === '/v1/decisions' && request.method === 'DELETE') {
        if (scope !== 'operate') {
          return Response.json({ error: 'forbidden' }, { status: 403 })
        }
        return Response.json({ purged: 3 })
      }
      if (url.pathname === '/v1/audit' && request.method === 'GET') {
        return Response.json({ entries: [], total: 0 })
      }
      return Response.json({ error: 'not_found' }, { status: 404 })
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
