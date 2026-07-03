import { describe, it, expect } from 'vitest'
import {
  roleMaterialParameters,
  slabTopDepthBiasParameters,
  groundPlaneDepthBiasParameters,
  furnitureBaseDepthBiasParameters,
  revealDepthBiasParameters,
  REVEAL_DEPTH_BIAS,
  FURNITURE_COLOR,
  FURNITURE_OPACITY,
  FURNITURE_FAILED_COLOR,
  FURNITURE_FAILED_OPACITY,
  FURNITURE_LOADING_COLOR,
  FURNITURE_LOADING_OPACITY,
  NEUTRAL_COLOR,
} from './role-appearance'
import type { SurfaceRole } from './material-provider'

describe('roleMaterialParameters', () => {
  it('pushes the slab-top role back in depth so the coincident wall base wins', () => {
    const top = roleMaterialParameters('top')

    expect(top.polygonOffset).toBe(true)
    expect(top.polygonOffsetFactor).toBeGreaterThan(0)
    expect(top.polygonOffsetUnits).toBeGreaterThan(0)
  })

  it('pushes the reveal role back in depth so the flush window sash frame wins, leaving the leaf role unbiased', () => {
    const reveal = roleMaterialParameters('reveal')
    const leaf = roleMaterialParameters('leaf')

    // The reveal faces carry the far rung of the ladder so the coincident sash
    // frame (leaf role) reads in front of the raw wall cut behind it.
    expect(reveal.polygonOffset).toBe(true)
    expect(reveal.polygonOffsetFactor).toBe(REVEAL_DEPTH_BIAS.factor)
    expect(reveal.polygonOffsetUnits).toBe(REVEAL_DEPTH_BIAS.units)

    // The sash frame is the finished element the viewer should see, so the leaf
    // role stays the unbiased winner.
    expect(leaf.polygonOffset ?? false).toBe(false)
    expect(leaf.polygonOffsetFactor ?? 0).toBe(0)
    expect(leaf.polygonOffsetUnits ?? 0).toBe(0)
  })

  it('resolves the furniture role to a distinct red, semi-transparent appearance', () => {
    const furniture = roleMaterialParameters('furniture')

    expect(furniture.color).toBe(FURNITURE_COLOR)
    expect(furniture.color).not.toBe(NEUTRAL_COLOR)
    expect(furniture.transparent).toBe(true)
    expect(furniture.opacity).toBe(FURNITURE_OPACITY)
    expect(furniture.name).toBe('furniture')
  })

  it('resolves the failed-furniture role to a distinct, non-red, semi-transparent appearance', () => {
    const failed = roleMaterialParameters('furnitureFailed' as SurfaceRole)

    expect(failed.color).toBe(FURNITURE_FAILED_COLOR)
    expect(failed.color).not.toBe(FURNITURE_COLOR)
    expect(failed.color).not.toBe(NEUTRAL_COLOR)
    expect(failed.transparent).toBe(true)
    expect(failed.opacity).toBe(FURNITURE_FAILED_OPACITY)
    expect(failed.name).toBe('furnitureFailed')
  })

  it('resolves the loading-furniture role to a distinct amber, semi-transparent appearance', () => {
    const loading = roleMaterialParameters('furnitureLoading' as SurfaceRole)

    expect(loading.color).toBe(FURNITURE_LOADING_COLOR)
    expect(loading.color).not.toBe(FURNITURE_COLOR)
    expect(loading.color).not.toBe(FURNITURE_FAILED_COLOR)
    expect(loading.color).not.toBe(NEUTRAL_COLOR)
    expect(loading.transparent).toBe(true)
    expect(loading.opacity).toBe(FURNITURE_LOADING_OPACITY)
    expect(loading.name).toBe('furnitureLoading')
  })
})

describe('depth-bias ladder', () => {
  it('orders the window reveal one rung behind the furniture base, keeping slab top < ground plane < furniture base < reveal', () => {
    const slabTop = slabTopDepthBiasParameters()
    const groundPlane = groundPlaneDepthBiasParameters()
    const furnitureBase = furnitureBaseDepthBiasParameters()
    const reveal = revealDepthBiasParameters()

    // The base cap reads the depth buffer without writing it, so it must be a
    // polygon-offset participant for the depth test to order it behind the floor.
    expect(furnitureBase.polygonOffset).toBe(true)

    // The reveal is biased so the flush window sash frame (leaf role, unbiased)
    // wins the coincident contest, so it too must be a polygon-offset participant.
    expect(reveal.polygonOffset).toBe(true)

    // Front to back the ladder is strictly increasing: slab top, then ground
    // plane, then furniture base, then the reveal at the far end. Each rung is
    // biased farther than the surface it must lose to, so the base cap sits behind
    // both the slab top and the ground plane it can rest on, and the reveal sits
    // behind the flush sash frame.
    expect(groundPlane.polygonOffsetFactor).toBeGreaterThan(slabTop.polygonOffsetFactor ?? 0)
    expect(furnitureBase.polygonOffsetFactor).toBeGreaterThan(groundPlane.polygonOffsetFactor ?? 0)
    expect(reveal.polygonOffsetFactor).toBeGreaterThan(furnitureBase.polygonOffsetFactor ?? 0)

    expect(groundPlane.polygonOffsetUnits).toBeGreaterThan(slabTop.polygonOffsetUnits ?? 0)
    expect(furnitureBase.polygonOffsetUnits).toBeGreaterThan(groundPlane.polygonOffsetUnits ?? 0)
    expect(reveal.polygonOffsetUnits).toBeGreaterThan(furnitureBase.polygonOffsetUnits ?? 0)
  })
})
