import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scopeCache } from '../../app/server/cache'
import { createTestApp } from '../helpers/app'
import { type FakeControl, startFakeControl } from '../helpers/fake-control'
import { type FakeHub, startFakeHub } from '../helpers/fake-hub'
import { generateKeyPair, type Identity, signIdentity } from '../helpers/signing'

/**
 * The administration of Gantry.
 *
 * The gate of the milestone 3 is that every write is audited in Hub and in
 * the console. The tests check the two halves: the write reaches Hub (or the
 * control plane of Shuttle) and the console writes its own line, with the
 * name of the person.
 */

const keys = generateKeyPair()
const app = createTestApp()

const OPERATE_TOKEN = 'the-token-of-the-operate-scope-of-the-tests'
const CONFIG_TOKEN = 'the-token-of-the-config-scope-of-the-tests'

const adminCredentials = {
  '*': 'the-credential-of-the-platform',
  acme: 'the-credential-of-acme',
}

const accessContextCredential = 'the-credential-of-the-access-context'

const tenant = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'acme',
  displayName: 'Acme Inc',
  issuer: 'https://login.acme.example',
  clientId: 'shuttle-acme',
}

const operator: Identity = {
  subject: 'cccccccc-3333-4333-8333-333333333333',
  email: 'operator@acme.example',
  roles: ['gantry.admin'],
}

const reader: Identity = {
  subject: 'dddddddd-4444-4444-8444-444444444444',
  email: 'reader@acme.example',
  roles: ['gantry.status'],
}

let hub: FakeHub
let control: FakeControl
let directory: string
/** The lines that the console wrote. */
let lines: string[] = []

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'gantry-admin-'))
  const adminTokens = join(directory, 'hub-admin-tokens.json')
  await writeFile(adminTokens, JSON.stringify(adminCredentials))
  const accessContext = join(directory, 'hub-access-context-token')
  await writeFile(accessContext, accessContextCredential)
  const controlTokens = join(directory, 'shuttle-control-tokens.json')
  await writeFile(
    controlTokens,
    JSON.stringify({
      [OPERATE_TOKEN]: { operator: 'gantry', scope: 'operate' },
      [CONFIG_TOKEN]: { operator: 'gantry', scope: 'config' },
    })
  )

  hub = await startFakeHub({
    tenants: [tenant],
    principals: [
      {
        id: operator.subject,
        tenant: 'acme',
        externalSubject: operator.subject,
        email: operator.email ?? '',
        displayName: 'The operator',
        status: 'active',
      },
      {
        id: reader.subject,
        tenant: 'acme',
        externalSubject: reader.subject,
        email: reader.email ?? '',
        displayName: 'The reader',
        status: 'active',
      },
    ],
    keys: {
      [operator.subject]: ['gantry.status', 'gantry.admin', 'gantry.platform'],
      [reader.subject]: ['gantry.status'],
    },
    credentials: adminCredentials,
    accessContextCredential,
  })
  control = await startFakeControl({
    operateToken: OPERATE_TOKEN,
    configToken: CONFIG_TOKEN,
  })

  process.env.GANTRY_HUB_URL = hub.url
  process.env.GANTRY_HUB_ADMIN_TOKENS_FILE = adminTokens
  process.env.GANTRY_HUB_ACCESS_CONTEXT_TOKEN_FILE = accessContext
  process.env.GANTRY_SHUTTLE_CONTROL_URL = control.url
  process.env.GANTRY_SHUTTLE_CONTROL_TOKENS_FILE = controlTokens
  process.env.GANTRY_SHUTTLE_IDENTITY_PUBLIC_KEY = keys.publicKeyPem
  process.env.GANTRY_ALLOWED_ORIGINS = 'https://admin.example.com'
})

afterAll(async () => {
  await hub?.stop()
  await control?.stop()
  if (directory) await rm(directory, { recursive: true, force: true })
})

beforeEach(() => {
  scopeCache.clear()
})

afterEach(() => {
  scopeCache.clear()
  lines = []
})

/** A request of a caller, signed the way Shuttle signs it. */
async function call(
  identity: Identity,
  options: { method?: string; path?: string; body?: unknown; origin?: string } = {}
) {
  const method = options.method ?? 'GET'
  const path = options.path ?? '/hub/tenants/acme'
  const request = { method, path, query: '', host: 'admin.example.com' }
  const signature = await signIdentity({
    privateKeyPem: keys.privateKeyPem,
    identity,
    request,
  })
  const log = spyOn(console, 'log')
  const hubCalls = hub.calls.length
  const controlCalls = control.calls.length
  try {
    const response = await app.request(`http://admin.example.com${path}`, {
      method,
      headers: {
        'x-shuttle-user': identity.subject,
        'x-shuttle-email': identity.email ?? '',
        'x-shuttle-roles': identity.roles?.join(',') ?? '',
        'x-forwarded-host': request.host,
        'x-forwarded-proto': 'https',
        'x-shuttle-signature': signature,
        ...(options.origin === undefined ? {} : { origin: options.origin }),
        ...(options.body === undefined
          ? {}
          : { 'content-type': 'application/x-www-form-urlencoded' }),
      },
      body:
        options.body === undefined
          ? undefined
          : new URLSearchParams(options.body as Record<string, string>).toString(),
    })
    lines = log.mock.calls.map((call) => String(call[0]))
    return { response, hubCalls, controlCalls }
  } finally {
    log.mockRestore()
  }
}

/** The calls that the fakes received during a request. */
function callsSince(
  hubCalls: number,
  controlCalls: number
): {
  hub: string[]
  control: FakeControl['calls']
} {
  return {
    hub: hub.calls.slice(hubCalls),
    control: control.calls.slice(controlCalls),
  }
}

describe('the writes of the console', () => {
  test('a grant is written in Hub and the console writes its line', async () => {
    const { response, hubCalls, controlCalls } = await call(operator, {
      method: 'POST',
      path: '/api/hub/tenants/acme/grants',
      origin: 'https://admin.example.com',
      body: { subject: 'group:gantry-readers', permission: 'gantry.status', routeId: 'gantry' },
    })
    expect(response.status).toBe(201)
    // Hub wrote the grant: the call reached it.
    const calls = callsSince(hubCalls, controlCalls)
    expect(calls.hub.some((entry) => entry === 'PUT /v1/admin/grants')).toBe(true)
    // The console wrote its own line, with the name of the person.
    const line = lines.find((entry) => entry.includes('"level":"audit"'))
    expect(line).toBeDefined()
    const audit = JSON.parse(line ?? '{}') as Record<string, unknown>
    expect(audit.operator).toBe(operator.email)
    expect(audit.tenant).toBe('acme')
    expect(audit.action).toBe('grant.updated')
    expect(audit.answer).toBe('ok')
  })

  test('a write from another site is refused', async () => {
    const { response, hubCalls, controlCalls } = await call(operator, {
      method: 'POST',
      path: '/api/hub/tenants/acme/grants',
      origin: 'https://evil.example.com',
      body: { subject: 'group:gantry-readers', permission: 'gantry.status' },
    })
    expect(response.status).toBe(403)
    const calls = callsSince(hubCalls, controlCalls)
    expect(calls.hub.some((entry) => entry === 'PUT /v1/admin/grants')).toBe(false)
  })

  test('a write without the permission is refused', async () => {
    const { response, hubCalls, controlCalls } = await call(reader, {
      method: 'POST',
      path: '/api/hub/tenants/acme/grants',
      origin: 'https://admin.example.com',
      body: { subject: 'group:gantry-readers', permission: 'gantry.status' },
    })
    expect(response.status).toBe(403)
    const calls = callsSince(hubCalls, controlCalls)
    expect(calls.hub.some((entry) => entry === 'PUT /v1/admin/grants')).toBe(false)
  })

  test('the purge of the sessions reaches the control plane and is audited', async () => {
    const { response, hubCalls, controlCalls } = await call(operator, {
      method: 'POST',
      path: '/api/ops/purge',
      origin: 'https://admin.example.com',
      body: { kind: 'sessions', subject: 'the-subject-of-the-caller' },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      kind: 'sessions',
      subject: 'the-subject-of-the-caller',
      count: 2,
    })
    // The token of the scope `operate` was the one of the purge.
    const purge = callsSince(hubCalls, controlCalls).control.find(
      (entry) => entry.path === '/v1/sessions'
    )
    expect(purge?.scope).toBe('operate')
    const line = lines.find((entry) => entry.includes('"level":"audit"'))
    const audit = JSON.parse(line ?? '{}') as Record<string, unknown>
    expect(audit.action).toBe('sessions.revoked')
    expect(audit.operator).toBe(operator.email)
  })

  test('the rollback needs the platform and is audited', async () => {
    const { response, hubCalls, controlCalls } = await call(operator, {
      method: 'POST',
      path: '/api/ops/rollback',
      origin: 'https://admin.example.com',
      body: { revision: 1, expectedRevision: 2 },
    })
    expect(response.status).toBe(200)
    const rollback = callsSince(hubCalls, controlCalls).control.find(
      (entry) => entry.path === '/v1/config/rollback'
    )
    expect(rollback?.scope).toBe('config')
    const line = lines.find((entry) => entry.includes('"level":"audit"'))
    const audit = JSON.parse(line ?? '{}') as Record<string, unknown>
    expect(audit.action).toBe('config.rollback')
  })

  test('the rollback of a tenant operator is refused', async () => {
    const { response, hubCalls, controlCalls } = await call(reader, {
      method: 'POST',
      path: '/api/ops/rollback',
      origin: 'https://admin.example.com',
      body: { revision: 1, expectedRevision: 2 },
    })
    expect(response.status).toBe(403)
    const calls = callsSince(hubCalls, controlCalls)
    expect(calls.control.some((entry) => entry.path === '/v1/config/rollback')).toBe(false)
  })
})
