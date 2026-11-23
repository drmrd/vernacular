// @vitest-environment node
// Hashes files with the real digest.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { treeOf } from '../../storage/documents/document-store-test-kit'
import { createTestPorts } from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { documentNamed } from '../handle/second-file-test-kit'
import { readTwoFiles } from './choose-kept-file'
import { secondTabOf } from './card-flows-test-kit'
import { FLOWS, MAIN_PATH, SECOND_PATH, choiceOf, storeProject } from './choose-kept-file-test-kit'
import { PROJECT_ID, holdFromAnotherTab } from './open-failed-test-kit'

const DISK_GONE = new Error('The disk is gone')
const UNAVAILABLE = {
  ok: false,
  failure: { kind: 'storage-unavailable', message: expect.stringContaining(DISK_GONE.message) },
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** A workspace that holds the project `a` with two readable files. */
async function twoReadableFiles() {
  const ports = createTestPorts({ durable: true })
  await storeProject(ports, 'both-readable')
  return ports
}

/** Another tab of the browser can take the lock of the project `a`, so that no flow holds it. */
async function expectLockFree(ports: TestPorts): Promise<void> {
  const hold = await secondTabOf(ports).locks.tryAcquire(PROJECT_ID)
  expect(hold).toBeDefined()
  await hold?.release()
}

describe.each(FLOWS)('$name', ({ run, storeMethod }) => {
  it.each([
    { change: 'the main file', path: MAIN_PATH },
    { change: 'the second file', path: SECOND_PATH },
  ])('refuses and writes nothing when $change changed after the choice was read', async (c) => {
    const ports = await twoReadableFiles()
    const choice = await choiceOf(ports)
    await ports.root.writeFile(c.path, documentNamed('Changed by another program'))
    const before = await treeOf(ports.root)

    const result = await run(ports, undefined, choice)

    expect(result).toMatchObject({ ok: false, failure: { kind: 'files-changed' } })
    expect(await treeOf(ports.root)).toEqual(before)
  })

  it('refuses and writes nothing when a second tab holds the project', async () => {
    const ports = await twoReadableFiles()
    const choice = await choiceOf(ports)
    await holdFromAnotherTab(ports)
    const before = await treeOf(ports.root)

    const result = await run(ports, undefined, choice)

    expect(result).toMatchObject({ ok: false, failure: { kind: 'open-elsewhere' } })
    expect(await treeOf(ports.root)).toEqual(before)
    expect(await ports.locks.heldIds()).toEqual(new Set([PROJECT_ID]))
  })

  it('frees the lock of the project after a choice that was made', async () => {
    const ports = await twoReadableFiles()

    const result = await run(ports, undefined, await choiceOf(ports))

    expect(result.ok).toBe(true)
    await expectLockFree(ports)
  })

  it('frees the lock of the project after a refusal', async () => {
    const ports = await twoReadableFiles()
    const choice = await choiceOf(ports)
    await ports.root.writeFile(SECOND_PATH, documentNamed('Changed by another program'))

    const result = await run(ports, undefined, choice)

    expect(result.ok).toBe(false)
    await expectLockFree(ports)
  })

  it.each(['twoFiles', storeMethod] as const)(
    'gives storage-unavailable, writes nothing, and frees the lock when the store method %s throws',
    async (method) => {
      const ports = await twoReadableFiles()
      const choice = await choiceOf(ports)
      vi.spyOn(ports.workspace, method).mockRejectedValueOnce(DISK_GONE)
      const before = await treeOf(ports.root)

      const result = await run(ports, undefined, choice)

      expect(result).toMatchObject(UNAVAILABLE)
      expect(await treeOf(ports.root)).toEqual(before)
      await expectLockFree(ports)
    },
  )
})

describe('reading the two files of a project over a storage that throws', () => {
  it('gives storage-unavailable instead of rejecting', async () => {
    const ports = await twoReadableFiles()
    vi.spyOn(ports.workspace, 'twoFiles').mockRejectedValueOnce(DISK_GONE)

    const read = await readTwoFiles(ports, PROJECT_ID)

    expect(read).toMatchObject(UNAVAILABLE)
  })
})
