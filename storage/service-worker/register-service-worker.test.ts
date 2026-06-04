import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker, type ServiceWorkerContainerLike } from './register-service-worker'

function fakeContainer(register = vi.fn(() => Promise.resolve({}))): ServiceWorkerContainerLike {
  return { register }
}

describe('registerServiceWorker', () => {
  it('registers the script as a module in production when the API is present', async () => {
    const register = vi.fn(() => Promise.resolve({}))
    const outcome = await registerServiceWorker({
      container: fakeContainer(register),
      isProduction: true,
      scriptUrl: '/service-worker.js',
    })

    expect(outcome).toEqual({ status: 'registered' })
    expect(register).toHaveBeenCalledWith('/service-worker.js', { type: 'module' })
  })

  it('skips registration outside production without touching the API', async () => {
    const register = vi.fn(() => Promise.resolve({}))
    const outcome = await registerServiceWorker({
      container: fakeContainer(register),
      isProduction: false,
      scriptUrl: '/service-worker.js',
    })

    expect(outcome).toEqual({ status: 'skipped-development' })
    expect(register).not.toHaveBeenCalled()
  })

  it('reports unsupported environments instead of throwing', async () => {
    const outcome = await registerServiceWorker({
      container: undefined,
      isProduction: true,
      scriptUrl: '/service-worker.js',
    })

    expect(outcome).toEqual({ status: 'unsupported' })
  })

  it('captures a registration failure instead of rejecting', async () => {
    const error = new Error('registration blocked')
    const outcome = await registerServiceWorker({
      container: fakeContainer(vi.fn(() => Promise.reject(error))),
      isProduction: true,
      scriptUrl: '/service-worker.js',
    })

    expect(outcome).toEqual({ status: 'failed', error })
  })
})
