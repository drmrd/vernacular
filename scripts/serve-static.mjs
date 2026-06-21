// A dependency-free static file server built on node built-ins. Used to serve a
// directory of pre-built files (the Storybook static build) to Playwright's
// webServer for visual-regression runs without adding a server package under the
// 30-day dependency cooldown.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const STATUS_OK = 200
const STATUS_FORBIDDEN = 403
const STATUS_NOT_FOUND = 404

const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

const CONTENT_TYPE_BY_EXTENSION = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? DEFAULT_CONTENT_TYPE
}

function requestedPathname(requestUrl) {
  const withoutQuery = requestUrl.split('?')[0]
  return decodeURIComponent(withoutQuery)
}

function resolveWithinRoot(rootDir, pathname) {
  const root = path.resolve(rootDir)
  const relativePath = pathname.replace(/^\/+/, '')
  const resolved = path.resolve(root, relativePath)
  const isInsideRoot = resolved === root || resolved.startsWith(root + path.sep)
  return { resolved, isInsideRoot }
}

async function respondWithFile(response, filePath) {
  try {
    const body = await readFile(filePath)
    response.writeHead(STATUS_OK, { 'Content-Type': contentTypeFor(filePath) })
    response.end(body)
  } catch {
    response.writeHead(STATUS_NOT_FOUND)
    response.end()
  }
}

export function createStaticServer(rootDir) {
  return createServer((request, response) => {
    const pathname = requestedPathname(request.url ?? '/')
    const { resolved, isInsideRoot } = resolveWithinRoot(rootDir, pathname)
    if (!isInsideRoot) {
      response.writeHead(STATUS_FORBIDDEN)
      response.end()
      return
    }
    void respondWithFile(response, resolved)
  })
}

// if run directly: node scripts/serve-static.mjs <dir> <port>
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, port] = process.argv.slice(2)
  createStaticServer(dir).listen(Number(port), () => console.log(`serving ${dir} on ${port}`))
}
