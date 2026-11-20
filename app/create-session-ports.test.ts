import { describe, it, expect } from 'vitest'
import { version } from '../package.json'
import { InMemoryProjectIndex } from '../storage'
import { sampleRecord } from '../storage/project-index/project-record-test-kit'
import { createTemporarySessionPorts } from './create-session-ports'

describe('the ports that the builder gives', () => {
  it('the temporary ports keep their index in memory, apart from the index of any other call', async () => {
    const first = createTemporarySessionPorts().ports
    const second = createTemporarySessionPorts().ports

    await first.index.put(sampleRecord())

    expect(first.index).toBeInstanceOf(InMemoryProjectIndex)
    expect(second.index).toBeInstanceOf(InMemoryProjectIndex)
    expect(await first.index.all()).toEqual([sampleRecord()])
    expect(await second.index.all()).toEqual([])
  })

  it('the build of the ports is the version of the package', () => {
    expect(createTemporarySessionPorts().ports.build).toBe(version)
  })
})
