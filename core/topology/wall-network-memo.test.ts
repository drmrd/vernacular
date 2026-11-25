import { describe, expect, it } from 'vitest'
import { builtinConstructionProfiles } from '../registries/construction-profiles'
import { createRegistry } from '../registries/registry'
import { brickSquareWalls, networkWallsOf, twoRoomWalls } from './plan-geometry-test-support'
import { deriveWallNetwork } from './wall-network'
import { wallNetworkBuildCount, wallNetworkFor } from './wall-network-memo'

const BRICK_PROFILE = 'solid-masonry-brick'
const CUSTOM_BRICK_THICKNESS_MM = 400
const ONE_BUILD = 1
const TWO_BUILDS = 2

function builtinRegistries() {
  return { constructionProfiles: builtinConstructionProfiles }
}

function brickRegistries() {
  return {
    constructionProfiles: createRegistry(1, [
      {
        id: BRICK_PROFILE,
        system: 'solid-masonry' as const,
        layers: [{ material: 'brick', thickness: CUSTOM_BRICK_THICKNESS_MM }],
      },
    ]),
  }
}

describe('wallNetworkFor', () => {
  it('returns the same network for the same wall list and registries', () => {
    const walls = twoRoomWalls()
    const registries = builtinRegistries()
    const buildsBefore = wallNetworkBuildCount()

    const first = wallNetworkFor(walls, registries)
    const second = wallNetworkFor(walls, registries)

    expect(second).toBe(first)
    expect(wallNetworkBuildCount() - buildsBefore).toBe(ONE_BUILD)
  })

  it('returns the same network for the same wall list when no registries are given', () => {
    const walls = twoRoomWalls()
    const buildsBefore = wallNetworkBuildCount()

    const first = wallNetworkFor(walls)
    const second = wallNetworkFor(walls)

    expect(second).toBe(first)
    expect(wallNetworkBuildCount() - buildsBefore).toBe(ONE_BUILD)
  })

  it('builds again for a new wall list of the same walls', () => {
    const walls = twoRoomWalls()
    const first = wallNetworkFor(walls)
    const buildsBefore = wallNetworkBuildCount()

    const second = wallNetworkFor([...walls])

    expect(second).not.toBe(first)
    expect(wallNetworkBuildCount() - buildsBefore).toBe(ONE_BUILD)
    expect(second).toEqual(first)
  })

  it('builds again for new registries', () => {
    const walls = twoRoomWalls()
    const buildsBefore = wallNetworkBuildCount()

    const first = wallNetworkFor(walls, builtinRegistries())
    const second = wallNetworkFor(walls, builtinRegistries())

    expect(second).not.toBe(first)
    expect(wallNetworkBuildCount() - buildsBefore).toBe(TWO_BUILDS)
    expect(second).toEqual(first)
  })

  it('keeps the network of each registries object of one wall list', () => {
    const walls = twoRoomWalls()
    const registriesA = builtinRegistries()
    const registriesB = builtinRegistries()
    const buildsBefore = wallNetworkBuildCount()

    const networkA = wallNetworkFor(walls, registriesA)
    wallNetworkFor(walls, registriesB)
    const buildsAfterBoth = wallNetworkBuildCount()
    const networkAgain = wallNetworkFor(walls, registriesA)

    expect(networkAgain).toBe(networkA)
    expect(buildsAfterBoth - buildsBefore).toBe(TWO_BUILDS)
    expect(wallNetworkBuildCount()).toBe(buildsAfterBoth)
  })

  it('gives the network that deriveWallNetwork gives for the same walls', () => {
    const walls = twoRoomWalls()
    const brickWalls = brickSquareWalls()
    const registries = brickRegistries()

    expect(wallNetworkFor(walls)).toEqual(deriveWallNetwork(networkWallsOf(walls)))
    expect(wallNetworkFor(brickWalls, registries)).toEqual(
      deriveWallNetwork(networkWallsOf(brickWalls), registries),
    )
    expect(wallNetworkFor(brickWalls, registries).walls[0]?.thickness).toBe(
      CUSTOM_BRICK_THICKNESS_MM,
    )
  })
})
