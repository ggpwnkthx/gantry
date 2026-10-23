#!/usr/bin/env bun
/**
 * The development stack: Hub, Shuttle and Gantry, together.
 *
 * The script starts the three services of the plan with the revisions that
 * `compatibility.json` pins:
 *
 * - Hub, with its **embedded** PostgreSQL, is the broker of the identity
 *   and the access decision service,
 * - Shuttle is the gateway: it authenticates the caller at Hub, it asks Hub
 *   whether the caller may use the route and it signs the identity of the
 *   request it forwards,
 * - Gantry is the upstream: it verifies the signature of Shuttle.
 *
 * The stack is real: the login of a browser goes through Shuttle and Hub,
 * and the page of Gantry is reached through the gateway.
 *
 * What the script does:
 *
 * 1. it clones Shuttle and Hub at the pinned revisions in `.deps/`,
 * 2. it generates the pair of the identity with the script of Shuttle
 *    (`bun run identity:key`) and gives Gantry the public half
 *    (`bun run identity:key --public`),
 * 3. it writes the route table of Shuttle, with the route `gantry` and the
 *    route `gantry-admin`,
 * 4. it registers the tenant, the principal and the grant in Hub through
 *    the administration of Hub,
 * 5. it starts the three services and prints the urls.
 *
 * `shuttle-control` is **not** started: it is not needed before the
 * milestone 3.
 *
 * The script asks Hub the question of the plan about the access context and
 * writes the answer in `.deps/access-context-answer.json`.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { generateKeyPairSync } from 'node:crypto'
import { startProviderFixture, type ProviderFixture } from './idp'

/** The revision of a project. */
interface Pin {
  repository: string
  commit: string
  version: string
}

/** The pins of the projects. */
const pins = JSON.parse(await readFile(join(process.cwd(), 'compatibility.json'), 'utf8')) as {
  shuttle: Pin
  hub: Pin
}

/** The directory of the clones. */
const dependencies = join(process.cwd(), '.deps')
/** The directory of the data of Hub. */
const hubData = join(dependencies, 'hub-data')
/** The directory of the keys of the identity. */
const keysDirectory = join(dependencies, 'keys')

/** The tokens of the stack. They are the tokens of a development machine. */
const ADMIN_TOKEN = 'the-admin-token-of-the-stack'
const ACCESS_TOKEN = 'the-access-token-of-the-stack'
const ACCESS_CONTEXT_TOKEN = 'the-access-context-token-of-the-stack'
const SESSION_SECRET = 'the-session-secret-of-the-stack'
const CLIENT_ID = 'shuttle-gantry'
const CLIENT_SECRET = 'the-secret-of-the-gateway-of-the-stack'
const TENANT_SLUG = 'gantry'

/** Runs a command and returns its output. */
async function run(
  command: string[],
  options: { cwd?: string; env?: Record<string, string> } = {}
) {
  const process_ = Bun.spawn(command, {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...options.env } as Record<string, string>,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr] = await Promise.all([
    new Response(process_.stdout).text(),
    new Response(process_.stderr).text(),
  ])
  const code = await process_.exited
  if (code !== 0) {
    throw new Error(`the command "${command.join(' ')}" failed with ${code}: ${stderr || stdout}`)
  }
  return { stdout, stderr }
}

/**
 * The port of a service of the stack.
 *
 * The ports are the ones of the plan, so the urls of the stack are the
 * same at every run. A port that is taken is an error with a clear
 * message: a stack that listens somewhere else is a stack nobody finds.
 */
async function portOf(name: string, value: number): Promise<number> {
  const server = Bun.serve({
    port: value,
    hostname: '127.0.0.1',
    fetch: () => new Response('ok'),
  })
  await server.stop(true)
  console.log(`${name} listens on the port ${value}`)
  return value
}

/**
 * Prepares the clone of a project at its pinned revision.
 *
 * The clone is written in `.deps/`, which is not committed: the directory
 * is a cache of the revisions of the plan.
 */
async function prepare(name: string, pin: Pin): Promise<string> {
  const directory = join(dependencies, name)
  if (!existsSync(directory)) {
    console.log(`the clone of ${name} is created`)
    await mkdir(directory, { recursive: true })
    await run(['git', 'init', '--quiet'], { cwd: directory })
    await run(['git', 'remote', 'add', 'origin', pin.repository], { cwd: directory })
  }
  console.log(`the revision ${pin.commit} of ${name} is fetched`)
  await run(['git', 'fetch', '--quiet', 'origin', pin.commit], { cwd: directory })
  await run(['git', 'checkout', '--quiet', '--force', pin.commit], { cwd: directory })
  if (!existsSync(join(directory, 'node_modules'))) {
    console.log(`the dependencies of ${name} are installed`)
    await run(['bun', 'install'], { cwd: directory })
  }
  return directory
}

/**
 * The pair of the identity of the stack.
 *
 * The pair is generated once, with the script of Shuttle, and it is kept
 * in `.deps/keys/`: the signature of Shuttle has to be verifiable by
 * Gantry, and a pair that changes at every run would break the pages that
 * are open.
 */
async function identityKeys(shuttle: string): Promise<{ privateKey: string; publicKey: string }> {
  await mkdir(keysDirectory, { recursive: true })
  const privateKeyFile = join(keysDirectory, 'identity-private.pem')
  const publicKeyFile = join(keysDirectory, 'identity-public.pem')
  let privateKey: string
  if (existsSync(privateKeyFile)) {
    privateKey = await readFile(privateKeyFile, 'utf8')
  } else {
    console.log('the pair of the identity is generated with the script of Shuttle')
    const generated = await run(['bun', 'run', 'identity:key'], { cwd: shuttle })
    privateKey = extractPem(generated.stdout, 'PRIVATE KEY')
    await writeFile(privateKeyFile, privateKey)
  }
  // The public half comes from the script of Shuttle as well: the upstream
  // is given the public key of the deployment.
  const published = await run(['bun', 'run', 'identity:key', '--public'], {
    cwd: shuttle,
    env: { SHUTTLE_IDENTITY_SIGNING_KEY: privateKey },
  })
  const publicKey = extractPem(published.stdout, 'PUBLIC KEY')
  await writeFile(publicKeyFile, publicKey)
  return { privateKey, publicKey }
}

/** Reads a PEM of an output of a script. */
function extractPem(output: string, label: string): string {
  const pattern = new RegExp(`-----BEGIN ${label}-----[\\s\\S]*?-----END ${label}-----`)
  const match = pattern.exec(output)
  if (!match) {
    throw new Error(`the output does not hold a ${label}`)
  }
  return `${match[0]}\n`
}

/**
 * The key with which Hub signs its tokens.
 *
 * The key is written in `.deps/keys/`: a key that changes at every run
 * invalidates the tokens that are alive, and the browser of the developer
 * would be logged out at every start of the stack.
 */
async function hubSigningKey(): Promise<string> {
  await mkdir(keysDirectory, { recursive: true })
  const file = join(keysDirectory, 'hub-signing.pem')
  if (existsSync(file)) return await readFile(file, 'utf8')
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  await writeFile(file, pair.privateKey)
  return pair.privateKey
}

/** Waits for a service to answer. */
async function waitFor(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.status > 0) return
    } catch {
      // The service is not listening yet.
    }
    await Bun.sleep(100)
  }
  throw new Error(`the service at ${url} did not answer`)
}

/** Calls the administration of Hub. */
async function admin(
  hubUrl: string,
  path: string,
  method: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(`${hubUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${ADMIN_TOKEN}`,
      'content-type': 'application/json',
    },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`the administration of Hub answered ${response.status}: ${text}`)
  }
  return text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : {}
}

/**
 * The question of the plan about the access context.
 *
 * The plan asks whether `POST /v1/access-context` accepts an empty
 * `workspaceId` for a question about a route alone. The question is asked
 * against the real Hub of the stack and the answer is written down.
 */
async function askAccessContext(
  hubUrl: string,
  subject: string,
  tenantId: string,
  workspaceId: string
): Promise<Record<string, unknown>> {
  const request = {
    version: 1,
    subject,
    tenantId,
    workspaceId,
    routeId: 'gantry',
  }
  const response = await fetch(`${hubUrl}/v1/access-context`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${ACCESS_CONTEXT_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(request),
  })
  const text = await response.text()
  return {
    request: {
      method: 'POST',
      url: `${hubUrl}/v1/access-context`,
      headers: {
        authorization: 'Bearer <the access context token of the stack>',
        'content-type': 'application/json',
      },
      body: request,
    },
    response: {
      status: response.status,
      body: text.length > 0 ? (JSON.parse(text) as unknown) : null,
    },
  }
}

async function main(): Promise<void> {
  await mkdir(dependencies, { recursive: true })

  const shuttleDirectory = await prepare('shuttle', pins.shuttle)
  const hubDirectory = await prepare('hub', pins.hub)

  const hubPort = await portOf('Hub', Number(process.env.GANTRY_DEV_HUB_PORT ?? 8081))
  const shuttlePort = await portOf('Shuttle', Number(process.env.GANTRY_DEV_SHUTTLE_PORT ?? 8080))
  const gantryPort = await portOf('Gantry', Number(process.env.GANTRY_DEV_GANTRY_PORT ?? 3000))
  const hubUrl = `http://127.0.0.1:${hubPort}`
  const shuttleUrl = `http://127.0.0.1:${shuttlePort}`
  const gantryUrl = `http://127.0.0.1:${gantryPort}`

  const keys = await identityKeys(shuttleDirectory)

  // The route table of Shuttle: the two routes of Gantry.
  const configuration = join(dependencies, 'routes.json')
  await writeFile(
    configuration,
    `${JSON.stringify(
      {
        version: 1,
        defaults: {
          auth: { mode: 'none' },
          timeouts: { responseMs: 5000, firstByteMs: 30000, bodyMs: 300000 },
          maxBodyBytes: 10 * 1024 * 1024,
        },
        trustedProxies: ['127.0.0.1/32', '::1/128'],
        routes: [
          {
            id: 'gantry',
            match: { host: '127.0.0.1', path: '/' },
            upstream: gantryUrl,
            auth: { mode: 'session' },
            accessCheck: true,
            crossSite: 'strict',
            forwardAuthorization: false,
          },
          {
            id: 'gantry-admin',
            match: { host: '127.0.0.1', path: '/', methods: ['POST', 'PUT', 'DELETE'] },
            upstream: gantryUrl,
            auth: { mode: 'session' },
            accessCheck: true,
            crossSite: 'strict',
            forwardAuthorization: false,
          },
        ],
      },
      null,
      2
    )}\n`
  )

  // The provider of the identity of the tenant.
  const provider: ProviderFixture = await startProviderFixture()

  // Hub: the broker of the identity and the access decision service.
  console.log('Hub starts')
  const hub = Bun.spawn(['bun', 'run', 'src/main.ts'], {
    cwd: hubDirectory,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      HUB_HOST: '127.0.0.1',
      HUB_PORT: String(hubPort),
      HUB_ISSUER: hubUrl,
      HUB_PUBLIC_URL: hubUrl,
      HUB_DATABASE_URL: `pglite://${hubData}`,
      HUB_ADMIN_TOKEN: ADMIN_TOKEN,
      HUB_ACCESS_TOKEN: ACCESS_TOKEN,
      HUB_ACCESS_CONTEXT_TOKENS: JSON.stringify({ [ACCESS_CONTEXT_TOKEN]: null }),
      HUB_SECRET_ENCRYPTION_KEY: 'a'.repeat(64),
      HUB_STATE_SECRET: 'b'.repeat(64),
      HUB_SIGNING_KEY: await hubSigningKey(),
      HUB_SIGNING_KID: 'hub-1',
      HUB_ENVIRONMENT: 'development',
      HUB_LOG_LEVEL: 'info',
    },
    stdout: 'inherit',
    stderr: 'inherit',
  })
  await waitFor(`${hubUrl}/healthz`)

  // The tenant, the principal and the grant: they are created through the
  // administration of Hub, the same way a deployment does it.
  const tenant = await admin(hubUrl, '/v1/admin/tenants', 'POST', {
    slug: TENANT_SLUG,
    displayName: 'Gantry',
    issuer: provider.issuer,
    idpClientId: provider.clientId,
    idpClientSecret: provider.clientSecret,
    idpRedirectUri: `${hubUrl}/oauth/tenant/callback`,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    clientRedirectUris: [`${shuttleUrl}/auth/callback`],
  })
  const tenantId = String(tenant.id ?? '')
  const principal = await admin(hubUrl, '/v1/admin/users', 'POST', {
    tenant: TENANT_SLUG,
    externalSubject: provider.subject,
    email: provider.email,
    displayName: 'Alice',
  })
  await admin(hubUrl, '/v1/admin/grants', 'PUT', {
    tenant: TENANT_SLUG,
    userId: principal.id,
    permission: 'gantry.status',
    routeId: 'gantry',
  })
  // The question of the plan about the access context: the empty
  // `workspaceId` of the question of the plan, and a placeholder, which is
  // the way a question about a route alone can be asked.
  const answer = {
    question: 'does POST /v1/access-context accept an empty workspaceId?',
    emptyWorkspaceId: await askAccessContext(hubUrl, String(principal.id), tenantId, ''),
    placeholderWorkspaceId: await askAccessContext(
      hubUrl,
      String(principal.id),
      tenantId,
      TENANT_SLUG
    ),
  }
  await writeFile(
    join(dependencies, 'access-context-answer.json'),
    `${JSON.stringify(answer, null, 2)}\n`
  )
  console.log('the question of the access context:')
  console.log(JSON.stringify(answer, null, 2))

  // Shuttle: the gateway.
  console.log('Shuttle starts')
  const shuttle = Bun.spawn(['bun', 'run', 'src/main.ts'], {
    cwd: shuttleDirectory,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      SHUTTLE_CONFIG: configuration,
      SHUTTLE_GATEWAY_HOST: '127.0.0.1',
      SHUTTLE_GATEWAY_PORT: String(shuttlePort),
      SHUTTLE_OIDC_ISSUER: hubUrl,
      SHUTTLE_OIDC_CLIENT_ID: CLIENT_ID,
      SHUTTLE_OIDC_CLIENT_SECRET: CLIENT_SECRET,
      SHUTTLE_OIDC_REDIRECT_URI: `${shuttleUrl}/auth/callback`,
      SHUTTLE_OIDC_SCOPES: 'openid,profile,email',
      SHUTTLE_OIDC_ALLOW_INSECURE: 'true',
      SHUTTLE_ACCESS_URL: hubUrl,
      SHUTTLE_ACCESS_TOKEN: ACCESS_TOKEN,
      SHUTTLE_SESSION_SECRET: SESSION_SECRET,
      SHUTTLE_SESSION_URL: 'memory://local',
      SHUTTLE_COOKIE_SECURE: 'false',
      SHUTTLE_EXTERNAL_PROTO: 'http',
      SHUTTLE_IDENTITY_SIGNING_KEY: keys.privateKey,
      SHUTTLE_LOG_LEVEL: 'info',
    },
    stdout: 'inherit',
    stderr: 'inherit',
  })
  await waitFor(`${shuttleUrl}/healthz`)

  // Gantry: the upstream. It runs the build of the deployment.
  if (!existsSync(join(process.cwd(), 'dist', 'index.js'))) {
    console.log('Gantry is built')
    await run(['bun', 'run', 'build'])
  }
  console.log('Gantry starts')
  const gantry = Bun.spawn(['bun', 'run', 'start'], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      PORT: String(gantryPort),
      GANTRY_SHUTTLE_IDENTITY_PUBLIC_KEY_FILE: join(keysDirectory, 'identity-public.pem'),
    },
    stdout: 'inherit',
    stderr: 'inherit',
  })
  await waitFor(`${gantryUrl}/healthz`)

  const stack = {
    hub: hubUrl,
    shuttle: shuttleUrl,
    gantry: gantryUrl,
    login: `${shuttleUrl}/auth/login?redirect=%2F`,
    tenant: TENANT_SLUG,
    principal: principal.id,
  }
  await writeFile(join(dependencies, 'stack.json'), `${JSON.stringify(stack, null, 2)}\n`)

  console.log('')
  console.log('the stack is up:')
  console.log(`  the browser logs in at ${stack.login}`)
  console.log(`  the page of Gantry is at ${gantryUrl} (behind Shuttle: ${shuttleUrl})`)
  console.log(`  Hub is at ${hubUrl}`)
  console.log('')

  const stop = async (): Promise<void> => {
    console.log('')
    console.log('the stack stops')
    gantry.kill('SIGTERM')
    shuttle.kill('SIGTERM')
    hub.kill('SIGTERM')
    await Promise.all([gantry.exited, shuttle.exited, hub.exited])
    await provider.stop()
    process.exit(0)
  }
  process.on('SIGINT', () => void stop())
  process.on('SIGTERM', () => void stop())

  // The stack runs until it is stopped.
  await Promise.all([
    hub.exited.then(() => undefined),
    shuttle.exited.then(() => undefined),
    gantry.exited.then(() => undefined),
  ])
  await provider.stop()
}

await main()
