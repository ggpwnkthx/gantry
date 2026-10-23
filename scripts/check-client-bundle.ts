#!/usr/bin/env bun
/**
 * The check of the client bundle.
 *
 * Two things are checked:
 *
 * 1. the files of the client do not carry the code of the server: the
 *    verifier of the identity, the reading of the environment and the
 *    libraries of the server never reach the browser,
 * 2. the islands and the entry of the client do not import the code of the
 *    server.
 *
 * The check builds the client when the build is not there: the check is
 * then the same one in a fresh tree and in a tree that was built before.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

const root = process.cwd()
const staticDirectory = join(root, 'dist', 'static')

/** The marks of the code of the server, that must not be in the browser. */
const FORBIDDEN = [
  'x-shuttle-signature',
  'x-shuttle-user',
  'GANTRY_SHUTTLE',
  'GANTRY_HUB',
  'node:fs',
  'hono/adapter',
  'importSPKI',
  'compactVerify',
  'preact-render-to-string',
]

/** The modules of the server, that an island may not import. */
const FORBIDDEN_IMPORTS = ['app/server', 'honox/server', 'hono/adapter', 'node:fs', 'jose']

/** Builds the client, when the build is not there. */
async function ensureBuild(): Promise<void> {
  if (existsSync(join(staticDirectory, 'client.js'))) return
  console.log('the client is not built: the build runs')
  const build = Bun.spawn(['bun', 'run', 'build'], {
    cwd: root,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const code = await build.exited
  if (code !== 0) {
    console.error('the build failed')
    process.exit(1)
  }
}

/** The imports of a file of the client. */
function importsOf(source: string): string[] {
  const imports: string[] = []
  const pattern = /(?:from|import)\s*['"]([^'"]+)['"]/g
  let match = pattern.exec(source)
  while (match !== null) {
    if (match[1]) imports.push(match[1])
    match = pattern.exec(source)
  }
  return imports
}

async function main(): Promise<void> {
  await ensureBuild()

  const files = (await readdir(staticDirectory)).filter((name) => name.endsWith('.js'))
  let bytes = 0
  const problems: string[] = []

  for (const name of files) {
    const source = await readFile(join(staticDirectory, name), 'utf8')
    bytes += Buffer.byteLength(source)
    for (const mark of FORBIDDEN) {
      if (source.includes(mark)) {
        problems.push(`${name} carries "${mark}", which belongs to the server`)
      }
    }
  }

  const sources = ['app/client.ts', 'app/islands/LiveStatus.tsx']
  for (const source of sources) {
    const content = await readFile(join(root, source), 'utf8')
    for (const value of importsOf(content)) {
      for (const forbidden of FORBIDDEN_IMPORTS) {
        if (value.includes(forbidden)) {
          problems.push(`${source} imports "${value}", which belongs to the server`)
        }
      }
    }
  }

  console.log(
    `the client carries ${files.length} files and ${(bytes / 1024).toFixed(1)} kB of code, and none of it is the code of the server`
  )
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem)
    process.exit(1)
  }
}

await main()
