#!/usr/bin/env bun
/**
 * The provider of the identity of the stack, as a service.
 *
 * The script starts the fixture of the provider of the identity and keeps
 * it running: it is the provider of the tenant of the stack of the
 * development, and the tenant of Hub is registered against it.
 */
import { startProviderFixture } from './idp'

const port = Number(process.env.GANTRY_DEV_IDP_PORT ?? 5556)
const provider = await startProviderFixture({ port })

console.log(`the provider of the identity is at ${provider.url}`)
console.log(`the caller of the stack is chosen at ${provider.url}/as/<the subject>`)

// The service runs until it is stopped.
await new Promise<void>((resolve) => {
  process.on('SIGINT', () => resolve())
  process.on('SIGTERM', () => resolve())
})
await provider.stop()
