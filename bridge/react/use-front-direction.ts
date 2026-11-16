import { useMemo } from 'react'

import { frontDirection, type PlanDirection } from '../../core'

import { useSceneGraph } from './use-scene-graph'

/**
 * The direction the building's front faces, from the whole project graph rather than the
 * active floor, so the sun and the first camera agree whichever floor is shown. Memoized on
 * the graph, so the result is stable between renders.
 */
export function useFrontDirection(): PlanDirection {
  const graph = useSceneGraph()
  return useMemo(() => frontDirection(graph), [graph])
}
