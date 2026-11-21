import { describe, expect, it } from 'vitest'
import { InMemoryProjectIndex } from './in-memory-project-index'
import { describeProjectIndexContract } from './project-index-contract'
import { sampleRecord } from './project-record-test-kit'

describeProjectIndexContract('InMemoryProjectIndex', () => new InMemoryProjectIndex())

describe('InMemoryProjectIndex', () => {
  it('two instances keep separate records', async () => {
    const first = new InMemoryProjectIndex()
    const second = new InMemoryProjectIndex()

    await first.put(sampleRecord())

    expect(await first.all()).toEqual([sampleRecord()])
    expect(await second.all()).toEqual([])
    expect(await second.get('house')).toBeUndefined()
  })
})
