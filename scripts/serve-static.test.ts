import type { AddressInfo } from 'node:net'

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { get as httpGet } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createStaticServer } from './serve-static'

// Slice 1 of the storybook visual-regression plan: a tiny static-file HTTP
// server (no new dependency; see the 30-day cooldown rule in .claude/rules.md)
// that Playwright's `webServer` uses to serve the built `storybook-static`
// directory. These tests
// pin the contract over a synthetic fixture dir under an OS temp dir so they
// stay independent of the real build output. The server is created unstarted,
// listens on an ephemeral port (`listen(0)`), and is closed after each case.

const INDEX_HTML = '<!doctype html><title>fixture</title><body>hello</body>\n'
const THING_JSON = '{"name":"thing","value":42}\n'

let rootDir: string

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'serve-static-'))
  writeFileSync(join(rootDir, 'index.html'), INDEX_HTML, 'utf8')
  writeFileSync(join(rootDir, 'thing.json'), THING_JSON, 'utf8')
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

async function withServer(run: (port: number) => Promise<void>): Promise<void> {
  const server = createStaticServer(rootDir)
  await new Promise<void>((resolveListen) => {
    server.listen(0, resolveListen)
  })
  try {
    const { port } = server.address() as AddressInfo
    await run(port)
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => {
        if (error) rejectClose(error)
        else resolveClose()
      })
    })
  }
}

interface RawResponse {
  status: number
  body: string
}

// Sends a request with a RAW, un-normalized request target. We bypass the
// WHATWG URL parser (which `fetch` uses, and which collapses `/../` before the
// request is sent) by handing the path straight to `node:http` via the `path`
// option, so the server actually receives the traversal sequence on the wire.
async function rawGet(port: number, path: string): Promise<RawResponse> {
  return new Promise<RawResponse>((resolveRequest, rejectRequest) => {
    const request = httpGet({ host: '127.0.0.1', port, path }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => {
        resolveRequest({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        })
      })
    })
    request.on('error', rejectRequest)
  })
}

describe('createStaticServer', () => {
  it('serves an existing file with a 200, the correct content-type, and the exact bytes', async () => {
    await withServer(async (port) => {
      const baseUrl = `http://127.0.0.1:${port}`
      const htmlResponse = await fetch(`${baseUrl}/index.html`)
      expect(htmlResponse.status).toBe(200)
      expect(htmlResponse.headers.get('content-type')).toContain('text/html')
      expect(await htmlResponse.text()).toBe(INDEX_HTML)

      const jsonResponse = await fetch(`${baseUrl}/thing.json`)
      expect(jsonResponse.status).toBe(200)
      expect(jsonResponse.headers.get('content-type')).toContain('application/json')
      expect(await jsonResponse.text()).toBe(THING_JSON)
    })
  })

  it('responds 404 for a path that does not exist', async () => {
    await withServer(async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/does-not-exist.html`)
      expect(response.status).toBe(404)
    })
  })

  it('blocks path traversal with a 403 and does not leak a file outside the root', async () => {
    // Plant a real secret file as a sibling of the served root, then ask for it
    // via a raw `/../` traversal sequence sent on the wire (not collapsed by the
    // URL parser). The server must reject it with the traversal guard's 403 and
    // never return the out-of-root bytes.
    const secretDir = mkdtempSync(join(tmpdir(), 'serve-static-secret-'))
    const secretBody = 'TOP-SECRET-OUTSIDE-ROOT\n'
    writeFileSync(join(secretDir, 'secret.txt'), secretBody, 'utf8')
    try {
      await withServer(async (port) => {
        const escaped = secretDir.split('/').filter(Boolean).pop() ?? ''
        const response = await rawGet(port, `/../${escaped}/secret.txt`)
        expect(response.status).toBe(403)
        expect(response.body).not.toContain('TOP-SECRET-OUTSIDE-ROOT')
      })
    } finally {
      rmSync(secretDir, { recursive: true, force: true })
    }
  })
})
