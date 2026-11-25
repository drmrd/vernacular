import { expect, it } from 'vitest'
import { pt, wall } from '../scene/opening-room-side-test-fixtures'
import { networkOf } from './plan-geometry-test-support'

function stretches({ edges, junctions }: ReturnType<typeof networkOf>) {
  return edges.map(({ wallId, from, to, covers }) => ({
    wallId,
    from: junctions[from],
    to: junctions[to],
    covers,
  }))
}

it('nodes later walls to the physical stretches of the walls that own them', () => {
  const owner = wall('owner', pt(0, 0), pt(100, 0))
  const covered = wall('covered', pt(0, 0.75), pt(100, 0.75))
  const nearby = wall('nearby', pt(20, 1.5), pt(80, 1.5))
  const withCoveredWall = networkOf([owner, covered, nearby])

  expect
    .soft(stretches(withCoveredWall), 'a fully covered wall beside an independent wall')
    .toEqual([
      { wallId: 'owner', from: pt(0, 0), to: pt(100, 0), covers: ['covered'] },
      { wallId: 'nearby', from: pt(20, 1.5), to: pt(80, 1.5), covers: [] },
    ])

  const longer = wall('longer', pt(10, -0.75), pt(210, 2.75))
  const withTail = networkOf([owner, longer])

  expect.soft(stretches(withTail), 'both ends of the shared stretch stay on the owner').toEqual([
    { wallId: 'owner', from: pt(0, 0), to: pt(10, 0), covers: [] },
    { wallId: 'owner', from: pt(10, 0), to: pt(100, 0), covers: ['longer'] },
    { wallId: 'longer', from: pt(100, 0), to: pt(210, 2.75), covers: [] },
  ])
  const shared = withTail.edges.find(
    (edge) => edge.wallId === 'owner' && edge.covers.includes('longer'),
  )
  const tail = withTail.edges.find((edge) => edge.wallId === 'longer')
  expect.soft(shared?.to, 'the exposed tail meets the owner at a shared junction').toBe(tail?.from)
})

it('joins the exposed start of a later wall to the shared stretch', () => {
  const owner = wall('owner', pt(0, 0), pt(100, 0))
  const longer = wall('longer', pt(210, 2.75), pt(10, -0.75))
  const network = networkOf([owner, longer])

  expect.soft(stretches(network)).toEqual([
    { wallId: 'owner', from: pt(0, 0), to: pt(10, 0), covers: [] },
    { wallId: 'owner', from: pt(10, 0), to: pt(100, 0), covers: ['longer'] },
    { wallId: 'longer', from: pt(210, 2.75), to: pt(100, 0), covers: [] },
  ])
  expect.soft(network.junctions).toHaveLength(4)
  const [, shared, exposed] = network.edges
  expect.soft(exposed?.to).toBe(shared?.to)
})
