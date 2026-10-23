import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestApp } from '../helpers/app'
import { type FakeHub, startFakeHub } from '../helpers/fake-hub'
import {
  GATEWAY_METRICS,
  HUB_METRICS,
  type FakeService,
  startFakeService,
} from '../helpers/fake-service'
import { generateKeyPair, type Identity, signIdentity } from '../helpers/signing'

/**
 * The status of the services.
 *
 * The gate of the milestone 2 is that an outage of Hub and a failure of
 * an upstream are shown as they are: the numbers of the service, and the
 * state of its replicas.
 */

const keys = generateKeyPair()
const app = createTestApp()

const identity: Identity = {
  subject: 'aaaaaaaa-1111-4111-8111-111111111111',
  email: 'alice@acme.example',
  roles: ['gantry.status'],
}

const METRICS_TOKEN = 'the-token-of-the-metrics-of-the-tests'

let gateway: FakeService
let hub: FakeService
let administration: FakeHub
let directory: string

/** A request of the caller, signed the way Shuttle signs it. */
async function call(path: string) {
  const request = { method: 'GET', path, query: '', host: 'admin.example.com' }
  const signature = await signIdentity({
    privateKeyPem: keys.privateKeyPem,
    identity,
    request,
  })
  return await app.request(`http://admin.example.com${path}`, {
    headers: {
      'x-shuttle-user': identity.subject,
      'x-shuttle-email': identity.email ?? '',
      'x-shuttle-roles': identity.roles?.join(',') ?? '',
      'x-forwarded-host': request.host,
      'x-shuttle-signature': signature,
    },
  })
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'gantry-status-'))
  const tokenFile = join(directory, 'metrics-token')
  await writeFile(tokenFile, METRICS_TOKEN)
  gateway = await startFakeService({ metrics: GATEWAY_METRICS, token: METRICS_TOKEN })
  hub = await startFakeService({ metrics: HUB_METRICS, token: METRICS_TOKEN })

  // The Hub of the administration: it gives the scope of the caller. It is
  // not the Hub that the console watches: the watched one answers the
  // metrics and the readiness.
  const adminTokens = join(directory, 'hub-admin-tokens.json')
  await writeFile(
    adminTokens,
    JSON.stringify({
      '*': 'the-credential-of-the-platform',
      acme: 'the-credential-of-acme',
    })
  )
  const accessContext = join(directory, 'hub-access-context-token')
  await writeFile(accessContext, 'the-credential-of-the-access-context')
  administration = await startFakeHub({
    tenants: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'acme',
        displayName: 'Acme Inc',
        issuer: 'https://login.acme.example',
        clientId: 'shuttle-acme',
      },
    ],
    principals: [
      {
        id: identity.subject,
        tenant: 'acme',
        externalSubject: identity.subject,
        email: identity.email ?? '',
        displayName: 'Alice',
        status: 'active',
      },
    ],
    keys: { [identity.subject]: ['gantry.status'] },
    credentials: {
      '*': 'the-credential-of-the-platform',
      acme: 'the-credential-of-acme',
    },
    accessContextCredential: 'the-credential-of-the-access-context',
  })
  process.env.GANTRY_HUB_URL = administration.url
  process.env.GANTRY_HUB_ADMIN_TOKENS_FILE = adminTokens
  process.env.GANTRY_HUB_ACCESS_CONTEXT_TOKEN_FILE = accessContext
  process.env.GANTRY_SHUTTLE_IDENTITY_PUBLIC_KEY = keys.publicKeyPem
  process.env.GANTRY_SHUTTLE_REPLICAS = gateway.url
  process.env.GANTRY_HUB_REPLICAS = hub.url
  process.env.GANTRY_SHUTTLE_METRICS_TOKEN_FILE = tokenFile
  process.env.GANTRY_HUB_METRICS_TOKEN_FILE = tokenFile
})

afterAll(async () => {
  await gateway?.stop()
  await hub?.stop()
  await administration?.stop()
  if (directory) await rm(directory, { recursive: true, force: true })
})

describe('the status of the gateway', () => {
  test('the numbers of the gateway are on the page', async () => {
    const response = await call('/shuttle')
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('the requests')
    expect(body).toContain('42')
    expect(body).toContain('the traffic by route')
    expect(body).toContain('gantry')
  })

  test('a failure of an upstream is shown as a number', async () => {
    const response = await call('/shuttle')
    const body = await response.text()
    expect(body).toContain('the failures of the upstreams')
    expect(body).toContain('tile-error')
  })

  test('the panels that need a change of Shuttle say so', async () => {
    const response = await call('/shuttle')
    const body = await response.text()
    expect(body).toContain('needs Shuttle 1.4.0')
    expect(body).toContain('the upstreams')
    expect(body).toContain('the breaker of the access service')
  })

  test('the replica that is ready is shown as ready', async () => {
    const response = await call('/shuttle')
    const body = await response.text()
    expect(body).toContain('state-ready')
  })
})

describe('the status of Hub', () => {
  test('the numbers of Hub are on the page', async () => {
    const response = await call('/hub')
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('the decisions')
    expect(body).toContain('the refusals')
  })

  test('the panels that need a change of Hub say so', async () => {
    const response = await call('/hub')
    const body = await response.text()
    expect(body).toContain('needs Hub 1.0.2')
    expect(body).toContain('the reasons of the refusals')
    expect(body).toContain('the health of the providers')
    expect(body).toContain('the keys and the rotation')
  })
})

describe('an outage of Hub', () => {
  test('the page is answered and the outage is shown', async () => {
    await hub.stop()
    const response = await call('/hub')
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('the numbers are not there')
    expect(body).toContain('state-unreachable')
    expect(body).toContain('0 of 1 replicas are ready')
  })

  test('the answer of the api says that the numbers are not there', async () => {
    await hub.stop()
    const response = await call('/api/hub/status')
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      source: { ok: boolean; reason?: string }
      replicas: Array<{ state: string }>
    }
    expect(body.source.ok).toBe(false)
    expect(body.replicas[0]?.state).toBe('unreachable')
  })
})
