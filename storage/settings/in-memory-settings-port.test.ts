import { describe, expect, it } from 'vitest'
import { InMemorySettingsPort } from './in-memory-settings-port'
import { assertSettingsPortContract } from './settings-port-contract'

assertSettingsPortContract('InMemorySettingsPort', () => new InMemorySettingsPort())

describe('InMemorySettingsPort', () => {
  it('two memory ports share nothing', () => {
    const first = new InMemorySettingsPort()
    const second = new InMemorySettingsPort()

    first.write('name', 'written to the first')

    expect(second.read('name')).toBeUndefined()
  })
})
