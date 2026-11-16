import { useMemo } from 'react'

import { frontDirection, type PlanDirection } from '../../core'

import { useSceneGraph } from './use-scene-graph'

/**
 * The direction the building's front faces, from the whole project graph rather than the
 * active floor, so the front does not change with the floor shown. The lighting reads this
 * front; the first camera is meant to read the same function in a later change. Memoized on
 * the graph, so the result is stable between renders.
 */
export function useFrontDirection(): PlanDirection {
  const graph = useSceneGraph()
  return useMemo(() => frontDirection(graph), [graph])
}
