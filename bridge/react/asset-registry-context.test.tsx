import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { AssetRegistry } from '../../storage'
import { AssetRegistryProvider, useAssetRegistry } from './asset-registry-context'

afterEach(cleanup)

function RegistryProbe({ onRegistry }: { onRegistry: (registry: AssetRegistry) => void }) {
  onRegistry(useAssetRegistry())
  return null
}

describe('AssetRegistryProvider', () => {
  it('exposes the provided asset registry to consumers', () => {
    const someRegistry = new AssetRegistry([])
    let captured: AssetRegistry | undefined
    render(
      <AssetRegistryProvider registry={someRegistry}>
        <RegistryProbe
          onRegistry={(registry) => {
            captured = registry
          }}
        />
      </AssetRegistryProvider>,
    )

    expect(captured).toBe(someRegistry)
  })

  it('falls back to a working empty registry outside a provider', async () => {
    let captured: AssetRegistry | undefined
    render(
      <RegistryProbe
        onRegistry={(registry) => {
          captured = registry
        }}
      />,
    )

    expect(captured).toBeDefined()
    expect(await captured!.list()).toEqual([])
  })
})
