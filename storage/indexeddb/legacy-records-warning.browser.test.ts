import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { IndexedDbDirectory } from './indexeddb-directory'
import {
  currentProject,
  directoryReadingBackWith,
  registerDatabaseCleanup,
  seededDatabase,
  storedFileBytesOf,
} from './legacy-records-test-kit'

registerDatabaseCleanup()

const READ_BACK_FAILURE = 'the read-back of one record broke for a known reason'

afterEach(() => {
  vi.restoreAllMocks()
})

function silencedWarnings(): MockInstance<typeof console.warn> {
  return vi.spyOn(console, 'warn').mockImplementation(() => undefined)
}

function asText(argument: unknown): string {
  if (typeof argument === 'string') return argument
  if (argument instanceof Error) return `${argument.name}: ${argument.message}`
  return String(argument)
}

/** Every argument of every call, joined as one text. */
function warningText(warnings: MockInstance<typeof console.warn>): string {
  return warnings.mock.calls.map((call) => call.map(asText).join(' ')).join('\n')
}

describe('a record whose conversion threw', () => {
  it('gives one warning that names its id and carries the reason, and none for the others', async () => {
    const warnings = silencedWarnings()
    const name = await seededDatabase(
      { id: 'a-one', project: currentProject() },
      { id: 'b-two', project: currentProject() },
    )
    const readBack = (path: string): Promise<Uint8Array | undefined> =>
      path.startsWith('a-one/')
        ? Promise.reject(new Error(READ_BACK_FAILURE))
        : Promise.resolve(storedFileBytesOf(name, path))

    await directoryReadingBackWith(name, readBack).list('')

    expect(warnings).toHaveBeenCalledTimes(1)
    const text = warningText(warnings)
    expect(text).toContain('a-one')
    expect(text).toContain(READ_BACK_FAILURE)
    expect(text).not.toContain('b-two')
  })
})

describe('a conversion in which every record converts', () => {
  it('warns nothing', async () => {
    const warnings = silencedWarnings()
    const name = await seededDatabase(
      { id: 'a-one', project: currentProject() },
      { id: 'b-two', project: currentProject() },
    )

    await new IndexedDbDirectory(name).list('')

    expect(warnings).not.toHaveBeenCalled()
  })
})

describe('a record that stays on purpose because JSON cannot hold it unchanged', () => {
  it('warns nothing, as it is kept and served by design', async () => {
    const warnings = silencedWarnings()
    const name = await seededDatabase({
      id: 'current',
      project: { ...currentProject(), note: Number.NaN },
    })

    await new IndexedDbDirectory(name).list('')

    expect(warnings).not.toHaveBeenCalled()
  })
})
