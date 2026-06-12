import { describe, it, expect } from 'vitest'
import { createSnapPreferencesStore } from '../plan/snap-preferences-store'
import { TOGGLABLE_SNAP_KINDS } from '../plan/snap-preferences'
import type { EditorCommand } from './command'
import { createSnapCommands } from './snap-commands'

function emptyStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>()
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) }
}

function find(commands: EditorCommand[], id: string): EditorCommand {
  const command = commands.find((candidate) => candidate.id === id)
  if (command === undefined) {
    throw new Error(`no command with id ${id}`)
  }
  return command
}

describe('createSnapCommands', () => {
  it('builds a master command, one per kind, and two radius commands', () => {
    const store = createSnapPreferencesStore({ storage: emptyStorage() })
    const commands = createSnapCommands(store)
    expect(commands).toHaveLength(TOGGLABLE_SNAP_KINDS.length + 3)
    for (const command of commands) {
      expect(command.id.length).toBeGreaterThan(0)
      expect(command.label.length).toBeGreaterThan(0)
    }
  })

  it('toggles the master snap flag when the master command runs', () => {
    const store = createSnapPreferencesStore({ storage: emptyStorage() })
    const commands = createSnapCommands(store)
    find(commands, 'toggle-snapping').run({} as never)
    expect(store.getPreferences().enabled).toBe(false)
  })

  it('toggles a single kind when its command runs', () => {
    const store = createSnapPreferencesStore({ storage: emptyStorage() })
    const commands = createSnapCommands(store)
    find(commands, 'toggle-snap-grid').run({} as never)
    expect(store.getPreferences().kinds.grid).toBe(false)
  })

  it('raises and lowers the catch radius with the radius commands', () => {
    const store = createSnapPreferencesStore({ storage: emptyStorage() })
    const start = store.getPreferences().pixelRadius
    const commands = createSnapCommands(store)
    find(commands, 'increase-snap-radius').run({} as never)
    expect(store.getPreferences().pixelRadius).toBeGreaterThan(start)
    find(commands, 'decrease-snap-radius').run({} as never)
    expect(store.getPreferences().pixelRadius).toBe(start)
  })
})
