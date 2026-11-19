import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import {
  createEnvironmentSessionStore,
  createSceneSessionStore,
  useActiveFloorId,
  useEditorSession,
  useEnvironmentSessionStore,
  usePerceivedColorStore,
  useSelection,
  type EditorSession,
  type EnvironmentSessionStore,
  type PerceivedColorStore,
  type SceneSessionStore,
  type SelectionStore,
} from '../../../bridge'
import { useSceneSessionStoreOrLocal } from '../../../bridge/react/scene-session-context'
import { createReferenceSession } from './reference-session'
import { ReferenceSceneProviders } from './reference-scene-stage'
import { RENDER_VARIANTS } from './render-variants'
import { RENDER_VARIANT_NAMES } from './timing-run-fixture'

afterEach(cleanup)

interface Seen {
  session: EditorSession
  selection: SelectionStore
  activeFloorId: string | null
  environment: EnvironmentSessionStore
  sceneSession: SceneSessionStore
  perceivedColor: PerceivedColorStore | null
}

/** Renders the providers around a child that reads every hook the live view needs. */
function renderProbe() {
  const stores = {
    session: createReferenceSession(),
    environment: createEnvironmentSessionStore(),
    sceneSession: createSceneSessionStore(),
  }
  const seen: Seen[] = []
  function Probe() {
    seen.push({
      session: useEditorSession(),
      selection: useSelection(),
      activeFloorId: useActiveFloorId(),
      environment: useEnvironmentSessionStore(),
      sceneSession: useSceneSessionStoreOrLocal(),
      perceivedColor: usePerceivedColorStore(),
    })
    return null
  }
  render(
    <ReferenceSceneProviders stores={stores}>
      <Probe />
    </ReferenceSceneProviders>,
  )
  const last = seen.at(-1)
  if (last === undefined) throw new Error('the probe child never rendered')
  return { stores, seen: last }
}

describe('ReferenceSceneProviders', () => {
  it('supplies every provider the live view needs, so that nothing throws', () => {
    expect(() => renderProbe()).not.toThrow()
  })

  it('hands the child the given session, the given stores and the first floor as the active floor', () => {
    const { stores, seen } = renderProbe()

    expect(seen.session).toBe(stores.session)
    expect(seen.activeFloorId).toBe('floor-1')
    expect(seen.environment).toBe(stores.environment)
    expect(seen.sceneSession).toBe(stores.sceneSession)
  })

  it('starts with nothing selected and a perceived color store', () => {
    const { seen } = renderProbe()

    expect(seen.selection.getSelectedIds().size).toBe(0)
    expect(seen.perceivedColor).not.toBeNull()
  })
})

describe('RENDER_VARIANTS', () => {
  it('lists the four variants of the render time, each name once, in order', () => {
    const names = RENDER_VARIANTS.map((variant) => variant.name)

    expect(names).toEqual([
      'floor, schematic',
      'floor, realistic',
      'building, schematic',
      'building, realistic',
    ])
    expect(new Set(names).size).toBe(names.length)
  })

  it('carries the scope and the lighting mode that its name spells out', () => {
    for (const variant of RENDER_VARIANTS) {
      expect(variant.name).toBe(`${variant.scope}, ${variant.lighting}`)
      expect(['floor', 'building']).toContain(variant.scope)
      expect(['schematic', 'realistic']).toContain(variant.lighting)
    }
  })

  it('names the same variants as the report fixture, so that the two cannot drift apart', () => {
    expect(RENDER_VARIANTS.map((variant) => variant.name)).toEqual([...RENDER_VARIANT_NAMES])
  })
})
