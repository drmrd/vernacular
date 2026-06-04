/** The narrow slice of ServiceWorkerContainer the registrar needs. */
export interface ServiceWorkerContainerLike {
  register(
    scriptUrl: string,
    options?: { scope?: string; type?: 'classic' | 'module' },
  ): Promise<unknown>
}

/** The result of a registration attempt. Never thrown; always returned. */
export type ServiceWorkerRegistrationOutcome =
  | { status: 'registered' }
  | { status: 'unsupported' }
  | { status: 'skipped-development' }
  | { status: 'failed'; error: unknown }

export interface RegisterServiceWorkerOptions {
  container: ServiceWorkerContainerLike | undefined
  isProduction: boolean
  scriptUrl: string
}

/**
 * Register the application service worker, guarding the cases where registration
 * should not or cannot happen. The worker script only exists in production builds,
 * so development and test boots are a no-op. Failures are reported, not thrown,
 * because a missing cache must never break the app.
 */
export async function registerServiceWorker(
  options: RegisterServiceWorkerOptions,
): Promise<ServiceWorkerRegistrationOutcome> {
  const { container, isProduction, scriptUrl } = options
  if (!container) {
    return { status: 'unsupported' }
  }
  if (!isProduction) {
    return { status: 'skipped-development' }
  }
  try {
    await container.register(scriptUrl, { type: 'module' })
    return { status: 'registered' }
  } catch (error) {
    return { status: 'failed', error }
  }
}
