import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scopeCache } from '../../app/server/cache'
import { createTestApp } from '../helpers/app'
import { type FakeHub, startFakeHub } from '../helpers/fake-hub'
import { generateKeyPair, type Identity, signIdentity } from '../helpers/signing'

/**
 * The scope of the operator.
 *
 * The tests talk to a fake of Hub that holds the boundary of the tenant:
 * a credential of a tenant reads that tenant and nothing else. The gate
 * of the milestone 1 is that a tenant operator sees only its own tenant.
 */

const keys = generateKeyPair()
const app = createTestApp()

const tenants = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'acme',
    displayName: 'Acme Inc',
    issuer: 'https://login.acme.example',
    clientId: 'shuttle-acme',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'globex',
    displayName: 'Globex',
    issuer: 'https://login.globex.example',
    clientId: 'shuttle-globex',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    slug: 'initech',
    displayName: 'Initech',
    issuer: 'https://login.initech.example',
    clientId: 'shuttle-initech',
  },
]

const principals = [
  {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    tenant: 'acme',
    externalSubject: 'the-subject-of-alice',
    email: 'alice@acme.example',
    displayName: 'Alice',
    status: 'active',
  },
  {
    id: 'bbbbbbbb-2222-4222-8222-222222222222',
    tenant: 'globex',
    externalSubject: 'the-subject-of-bob',
    email: 'bob@globex.example',
    displayName: 'Bob',
    status: 'active',
  },
  {
    id: 'cccccccc-3333-4333-8333-333333333333',
    tenant: 'initech',
    externalSubject: 'the-subject-of-carol',
    email: 'carol@initech.example',
    displayName: 'Carol',
    status: 'active',
  },
]

const credentials = {
  '*': 'the-credential-of-the-platform',
  acme: 'the-credential-of-acme',
}

const accessContextCredential = 'the-credential-of-the-access-context'

let hub: FakeHub
let directory: string

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'gantry-scope-'))
  const adminTokens = join(directory, 'hub-admin-tokens.json')
  await writeFile(adminTokens, JSON.stringify(credentials))
  const accessContext = join(directory, 'hub-access-context-token')
  await writeFile(accessContext, accessContextCredential)
  hub = await startFakeHub({
    tenants,
    principals,
    keys: {
      'aaaaaaaa-1111-4111-8111-111111111111': ['gantry.status'],
      'bbbbbbbb-2222-4222-8222-222222222222': ['gantry.status', 'gantry.platform'],
      'cccccccc-3333-4333-8333-333333333333': ['gantry.status'],
    },
    credentials,
    accessContextCredential,
  })
  process.env.GANTRY_HUB_URL = hub.url
  process.env.GANTRY_HUB_ADMIN_TOKENS_FILE = adminTokens
  process.env.GANTRY_HUB_ACCESS_CONTEXT_TOKEN_FILE = accessContext
  process.env.GANTRY_SHUTTLE_IDENTITY_PUBLIC_KEY = keys.publicKeyPem
})

afterAll(async () => {
  await hub?.stop()
  if (directory) await rm(directory, { recursive: true, force: true })
})

afterEach(() => {
  scopeCache.clear()
})

/** A request of a caller, signed the way Shuttle signs it. */
async function call(
  identity: Identity,
  options: { method?: string; path?: string; signature?: string } = {}
) {
  const method = options.method ?? 'GET'
  const path = options.path ?? '/shuttle'
  const request = { method, path, query: '', host: 'admin.example.com' }
  const signature =
    options.signature ??
    (await signIdentity({ privateKeyPem: keys.privateKeyPem, identity, request }))
  return await app.request(`http://admin.example.com${path}`, {
    method,
    headers: {
      'x-shuttle-user': identity.subject,
      'x-shuttle-email': identity.email ?? '',
      'x-shuttle-roles': identity.roles?.join(',') ?? '',
      'x-forwarded-host': request.host,
      'x-shuttle-signature': signature,
    },
  })
}

const alice: Identity = {
  subject: 'aaaaaaaa-1111-4111-8111-111111111111',
  email: 'alice@acme.example',
  roles: ['gantry.status'],
}

const bob: Identity = {
  subject: 'bbbbbbbb-2222-4222-8222-222222222222',
  email: 'bob@globex.example',
  roles: ['gantry.status'],
}

const carol: Identity = {
  subject: 'cccccccc-3333-4333-8333-333333333333',
  email: 'carol@initech.example',
  roles: ['gantry.status'],
}

describe('the scope of the operator', () => {
  test('a tenant operator is scoped to its own tenant', async () => {
    const response = await call(alice)
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('id="scope-header">acme — gantry.status<')
    expect(body).not.toContain('id="scope-header">the platform')
  })

  test('an operator of the platform is scoped to the platform', async () => {
    const response = await call(bob)
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('id="scope-header">the platform — gantry.status, gantry.platform<')
  })

  test('a request without a signature is refused', async () => {
    const response = await call(alice, { signature: '' })
    expect(response.status).toBe(401)
  })

  test('a caller without a permission on the route is refused', async () => {
    const stranger: Identity = {
      subject: 'dddddddd-4444-4444-8444-444444444444',
      email: 'dave@acme.example',
    }
    const response = await call(stranger)
    expect(response.status).toBe(403)
  })

  test('a caller whose tenant has no credential is refused', async () => {
    // The tenant of Carol has no credential of the administration: the
    // console has nothing to read its tenant with.
    const response = await call(carol)
    expect(response.status).toBe(403)
  })

  test('the scope of a caller is kept no longer than the answer of Hub', async () => {
    await call(alice)
    const first = hub.calls.filter((call) => call.includes('/v1/access-context')).length
    await call(alice)
    const second = hub.calls.filter((call) => call.includes('/v1/access-context')).length
    expect(second).toBe(first)
  })

  test('the route of the administration answers that it is not there yet', async () => {
    const response = await call(alice, { method: 'POST', path: '/' })
    expect(response.status).toBe(405)
  })
})
