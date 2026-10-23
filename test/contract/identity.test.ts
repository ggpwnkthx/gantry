import { beforeAll, describe, expect, test } from 'bun:test'
import { createTestApp } from '../helpers/app'
import { generateKeyPair, type Identity, signIdentity } from '../helpers/signing'

/**
 * The check of the identity, as the routes of Gantry see it.
 *
 * A request without a valid signature is refused with a `401`, and the
 * probes of the deployment are answered without one.
 */

const keys = generateKeyPair()
const otherKeys = generateKeyPair()
const app = createTestApp()

const identity: Identity = {
  subject: 'the-subject-of-the-caller',
  email: 'alice@shuttle.test',
  roles: ['gantry.status'],
}

const request = {
  method: 'GET',
  path: '/',
  query: '',
  host: 'admin.example.com',
}

beforeAll(() => {
  process.env.GANTRY_SHUTTLE_IDENTITY_PUBLIC_KEY = keys.publicKeyPem
})

async function call(path: string, signature?: string, headers: Record<string, string> = {}) {
  return await app.request(`http://admin.example.com${path}`, {
    headers: {
      'x-shuttle-user': identity.subject,
      'x-shuttle-email': identity.email ?? '',
      'x-shuttle-roles': identity.roles?.join(',') ?? '',
      'x-forwarded-host': request.host,
      ...(signature ? { 'x-shuttle-signature': signature } : {}),
      ...headers,
    },
  })
}

describe('the identity of a request', () => {
  test('a request without a signature is refused', async () => {
    const response = await call('/')
    expect(response.status).toBe(401)
  })

  test('a request with a valid signature is answered', async () => {
    const signature = await signIdentity({
      privateKeyPem: keys.privateKeyPem,
      identity,
      request,
    })
    const response = await call('/', signature)
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('<!doctype html>')
    expect(body).toContain('the caller is the-subject-of-the-caller')
  })

  test('a tampered header is refused', async () => {
    const signature = await signIdentity({
      privateKeyPem: keys.privateKeyPem,
      identity,
      request,
    })
    const response = await call('/', signature, { 'x-shuttle-user': 'another-caller' })
    expect(response.status).toBe(401)
  })

  test('a signature of another key is refused', async () => {
    const signature = await signIdentity({
      privateKeyPem: otherKeys.privateKeyPem,
      identity,
      request,
    })
    const response = await call('/', signature)
    expect(response.status).toBe(401)
  })

  test('a signature of the version v4 is refused', async () => {
    const signature = await signIdentity({
      privateKeyPem: keys.privateKeyPem,
      identity,
      request,
      version: 'v4',
    })
    const response = await call('/', signature)
    expect(response.status).toBe(401)
  })

  test('a signature of another path is refused', async () => {
    const signature = await signIdentity({
      privateKeyPem: keys.privateKeyPem,
      identity,
      request: { ...request, path: '/another-path' },
    })
    const response = await call('/', signature)
    expect(response.status).toBe(401)
  })

  test('the probe of the process is answered without a signature', async () => {
    const response = await call('/healthz')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
  })

  test('the probe of the readiness is answered without a signature', async () => {
    const response = await call('/readyz')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ready')
  })
})
