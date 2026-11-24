import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vi } from 'vitest'

// Test support: a stand-in for `fetch` that answers from the files under the `public` folder.

/** The folder that holds the files the application serves as they are. */
export const PUBLIC_DIRECTORY = join(import.meta.dirname, '..', 'public')

const HTTP_OK = 200
const HTTP_NOT_FOUND = 404

/** A spy for `fetch` that answers a path with the bytes of that file, or 404 when there is none. */
export function servePublicFiles() {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    try {
      return new Response(readFileSync(join(PUBLIC_DIRECTORY, String(input))), { status: HTTP_OK })
    } catch {
      return new Response(null, { status: HTTP_NOT_FOUND })
    }
  })
}
