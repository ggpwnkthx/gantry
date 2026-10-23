import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateKeyPair } from './signing'

/**
 * The keys of the tests of the browser.
 *
 * The pair is a key of the curve P-256 that signs the identities of the
 * tests. It is written in the directory of the fixtures and it is never
 * used outside the tests: the file is in the list of the files that are not
 * committed.
 */

const directory = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

/** The paths of the files of the keys. */
export const keyFiles = {
  privateKey: join(directory, 'identity-private.pem'),
  publicKey: join(directory, 'identity-public.pem'),
}

/**
 * Writes the pair of the keys of the tests, when it is not written yet.
 */
export function ensureKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  mkdirSync(directory, { recursive: true })
  if (existsSync(keyFiles.privateKey) && existsSync(keyFiles.publicKey)) {
    return {
      privateKeyPem: readFileSync(keyFiles.privateKey, 'utf8'),
      publicKeyPem: readFileSync(keyFiles.publicKey, 'utf8'),
    }
  }
  const keys = generateKeyPair()
  writeFileSync(keyFiles.privateKey, keys.privateKeyPem)
  writeFileSync(keyFiles.publicKey, keys.publicKeyPem)
  return keys
}
