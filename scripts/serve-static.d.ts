// Type declarations for serve-static.mjs (the dependency-free static file server)
// so its test can import it under the strict TypeScript config (allowJs is off,
// so an untyped .mjs import would otherwise be an error). It is a .d.ts file because
// the test imports the module without an extension, which TypeScript resolves to .d.ts only.

import type { Server } from 'node:http'

/**
 * Create an unstarted HTTP server that serves the files under `rootDir`.
 * Requests that resolve outside `rootDir` get a 403; missing files get a 404.
 */
export function createStaticServer(rootDir: string): Server
