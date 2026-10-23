#!/usr/bin/env bun
/**
 * The server of the build, with a Hub of the tests.
 *
 * The tests of the browser need a Gantry that answers, and the page of
 * Gantry needs a scope, and a scope needs a Hub. The Hub of the tests is
 * the fake of the tests: the script starts it, it writes the credentials
 * of the fake in files, and it starts the **built** server with them.
 *
 * The script is the server of the tests of the browser: it runs until it
 * is stopped.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startFakeHub } from '../test/helpers/fake-hub'
import { GATEWAY_METRICS, startFakeService } from '../test/helpers/fake-service'
import { keyFiles } from '../test/helpers/keys'

/** The principal of the tests. */
const principal = {
  id: 'the-subject-of-the-caller',
  tenant: 'acme',
  externalSubject: 'the-subject-of-the-caller',
  email: 'alice@shuttle.test',
  displayName: 'Alice',
  status: 'active',
}

/** The tenant of the tests. */
const tenant = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'acme',
  displayName: 'Acme Inc',
  issuer: 'https://login.acme.example',
  clientId: 'shuttle-acme',
}

/** The token of the metrics of the services of the tests. */
const METRICS_TOKEN = 'the-token-of-the-metrics-of-the-tests'

/** The credential of the platform, of the tenant and of the access context. */
const platformCredential = 'the-credential-of-the-platform-of-the-tests'
const tenantCredential = 'the-credential-of-the-tenant-of-the-tests'
const accessContextCredential = 'the-credential-of-the-access-context-of-the-tests'

const directory = await mkdtemp(join(tmpdir(), 'gantry-built-'))
const adminTokensFile = join(directory, 'hub-admin-tokens.json')
await writeFile(
  adminTokensFile,
  JSON.stringify({ '*': platformCredential, acme: tenantCredential })
)
const accessContextFile = join(directory, 'hub-access-context-token')
await writeFile(accessContextFile, accessContextCredential)

const hub = await startFakeHub({
  tenants: [tenant],
  principals: [principal],
  keys: { [principal.id]: ['gantry.status'] },
  credentials: { '*': platformCredential, acme: tenantCredential },
  accessContextCredential,
})

// The gateway of the tests: it answers the metrics and the readiness. The
// number of the requests grows at every answer, so a test may see that the
// island read the status again.
let requests = 42
const gateway = await startFakeService({
  metrics: () =>
    GATEWAY_METRICS.replace(
      'shuttle_requests_total{route="gantry",method="GET",status="200"} 42',
      `shuttle_requests_total{route="gantry",method="GET",status="200"} ${requests++}`
    ),
})
const metricsTokenFile = join(directory, 'metrics-token')
await writeFile(metricsTokenFile, METRICS_TOKEN)

const port = Number(process.env.GANTRY_TEST_PORT ?? 3210)
const server = Bun.spawn(['bun', 'index.js'], {
  cwd: join(process.cwd(), 'dist'),
  env: {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    PORT: String(port),
    GANTRY_PORT: String(port),
    GANTRY_SHUTTLE_IDENTITY_PUBLIC_KEY_FILE: keyFiles.publicKey,
    GANTRY_HUB_URL: hub.url,
    GANTRY_HUB_ADMIN_TOKENS_FILE: adminTokensFile,
    GANTRY_HUB_ACCESS_CONTEXT_TOKEN_FILE: accessContextFile,
    GANTRY_SHUTTLE_REPLICAS: gateway.url,
    GANTRY_HUB_REPLICAS: gateway.url,
    GANTRY_SHUTTLE_METRICS_TOKEN_FILE: metricsTokenFile,
    GANTRY_HUB_METRICS_TOKEN_FILE: metricsTokenFile,
    GANTRY_STATUS_REFRESH_MS: '1000',
  },
  stdout: 'inherit',
  stderr: 'inherit',
})

const stop = async (): Promise<void> => {
  server.kill('SIGTERM')
  await server.exited
  await hub.stop()
  await gateway.stop()
  await rm(directory, { recursive: true, force: true })
  process.exit(0)
}
process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())
await server.exited
