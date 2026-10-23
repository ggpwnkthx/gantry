/**
 * The fake of Hub.
 *
 * The tests of Gantry talk to a Hub that is not there: the fake answers
 * the three calls that Gantry makes — the principals, the tenants and the
 * access context — and it holds the boundary of the tenant, the one rule
 * that matters for the scope: a credential of a tenant reads that tenant
 * and nothing else.
 */

/** A tenant of the fake. */
export interface FakeTenant {
  id: string
  slug: string
  displayName: string
  issuer: string
  clientId: string
}

/** A principal of the fake. */
export interface FakePrincipal {
  id: string
  tenant: string
  externalSubject: string
  email: string
  displayName: string
  status: string
}

/** The options of the fake. */
export interface FakeHubOptions {
  /** The tenants of the fake. */
  tenants: FakeTenant[]
  /** The principals of the fake. */
  principals: FakePrincipal[]
  /** The keys of every principal, by the id of the principal. */
  keys: Record<string, string[]>
  /** The credentials of the fake: the slug of the tenant, or `*` for the platform. */
  credentials: Record<string, string>
  /** The credential of the access context. */
  accessContextCredential: string
}

/** The fake of Hub. */
export interface FakeHub {
  /** The url of the fake. */
  url: string
  /** The calls the fake received, by the path of the call. */
  calls: string[]
  /** Stops the fake. */
  stop: () => Promise<void>
}

/** Starts the fake of Hub. */
export async function startFakeHub(options: FakeHubOptions): Promise<FakeHub> {
  const calls: string[] = []

  /** The tenant of a credential, or null for the platform. */
  const tenantOf = (credential: string): string | null => {
    for (const [slug, token] of Object.entries(options.credentials)) {
      if (token === credential) return slug === '*' ? null : slug
    }
    return undefined as unknown as string | null
  }

  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(request) {
      const url = new URL(request.url)
      const authorization = request.headers.get('authorization') ?? ''
      const credential = authorization.replace(/^Bearer\s+/i, '')
      calls.push(`${request.method} ${url.pathname}${url.search}`)

      if (url.pathname === '/v1/access-context') {
        if (credential !== options.accessContextCredential) {
          return Response.json({ error: 'unauthorized' }, { status: 401 })
        }
        const body = (await request.json()) as {
          subject: string
          tenantId: string
          workspaceId: string
          routeId: string
        }
        const keys = options.keys[body.subject] ?? []
        return Response.json({
          version: 1,
          allow: keys.length > 0,
          subject: body.subject,
          tenantId: body.tenantId,
          workspaceId: body.workspaceId,
          routeId: body.routeId,
          permissionKeys: keys,
          evaluatedAt: new Date().toISOString(),
          validUntil: new Date(Date.now() + 5_000).toISOString(),
        })
      }

      if (!Object.values(options.credentials).includes(credential)) {
        return Response.json({ error: 'unauthorized' }, { status: 401 })
      }
      const tenant = tenantOf(credential)

      if (url.pathname === '/v1/admin/tenants') {
        const tenants =
          tenant === null ? options.tenants : options.tenants.filter((t) => t.slug === tenant)
        return Response.json({ tenants })
      }

      if (url.pathname === '/v1/admin/groups' && request.method === 'POST') {
        const body = (await request.json()) as { key: string; displayName?: string }
        return Response.json(
          {
            id: `group-${body.key}`,
            tenant: 'acme',
            key: body.key,
            displayName: body.displayName ?? body.key,
            members: [],
          },
          { status: 201 }
        )
      }

      if (url.pathname === '/v1/admin/grants' && request.method === 'PUT') {
        const body = (await request.json()) as {
          permission: string
          routeId?: string | null
          grantedBy?: string
          group?: string
          userId?: string
        }
        return Response.json(
          {
            id: `grant-${body.permission}-${body.routeId ?? 'every'}`,
            tenant: 'acme',
            permission: body.permission,
            userId: body.userId ?? null,
            group: body.group ?? null,
            routeId: body.routeId ?? null,
            workspaceId: null,
            expiresAt: null,
            grantedBy: body.grantedBy ?? null,
          },
          { status: 201 }
        )
      }

      if (url.pathname.startsWith('/v1/admin/grants/') && request.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }

      if (url.pathname === '/v1/admin/audit') {
        return Response.json({ records: [], total: 0, limit: 50, offset: 0 })
      }

      if (url.pathname === '/v1/admin/users') {
        const asked = url.searchParams.get('tenant')
        if (tenant !== null && asked !== null && asked !== tenant) {
          // The boundary of Hub: a credential of a tenant reads that tenant.
          return Response.json({ error: 'forbidden' }, { status: 403 })
        }
        const email = url.searchParams.get('email')
        const principals = options.principals.filter((principal) => {
          if (tenant !== null && principal.tenant !== tenant) return false
          if (asked !== null && principal.tenant !== asked) return false
          if (email !== null && principal.email !== email) return false
          return true
        })
        return Response.json({
          principals,
          total: principals.length,
          limit: 200,
          offset: 0,
        })
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
