import { describe, it, expect, afterEach, vi } from 'vitest'
import type { ClipboardSnapshot } from '../../core'
import { readSystemClipboard, writeSystemClipboard } from './system-clipboard'

const emptySnapshot = (): ClipboardSnapshot => ({
  walls: [],
  openings: [],
  dimensions: [],
})

interface FakeClipboard {
  writeText(text: string): void
  readText(): Promise<string>
}

const fakeClipboard = (initial = ''): FakeClipboard => {
  let stored = initial
  return {
    writeText(text: string): void {
      stored = text
    },
    async readText(): Promise<string> {
      return stored
    },
  }
}

describe('the system-clipboard adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips a snapshot written to and read back from the OS clipboard', async () => {
    vi.stubGlobal('navigator', { clipboard: fakeClipboard() })
    const snapshot = emptySnapshot()

    await writeSystemClipboard(snapshot)

    expect(await readSystemClipboard()).toEqual(snapshot)
  })

  it('resolves silently when the OS clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    const snapshot = emptySnapshot()

    await expect(writeSystemClipboard(snapshot)).resolves.toBeUndefined()
    expect(await readSystemClipboard()).toBeUndefined()
  })

  it('returns undefined when the OS clipboard holds foreign text', async () => {
    vi.stubGlobal('navigator', { clipboard: fakeClipboard('hello world') })

    expect(await readSystemClipboard()).toBeUndefined()
  })
})
