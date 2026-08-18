import { GridFour, Ruler } from '@phosphor-icons/react'
import { IconButton } from '../design-system'
import { useViewMode } from '../viewport/view-mode'
import { useViewOverlay } from '../viewport/view-overlay-context'

// Shown on a view toggle the 3D-only view mode has made inert. Each names the plan
// layer it draws and the modes that put that plan back on screen, the way the 3D
// toolbar's own inert controls explain themselves.
const PLAN_ONLY_TITLES = {
  grid: 'Draws the grid under the plan. Switch to plan or split view to use it.',
  dimensions:
    'Draws the dimension annotations over the plan. Switch to plan or split view to use it.',
} as const

/**
 * The header's Grid and Dimensions toggles, which show and hide two layers of the 2D
 * plan. Both write the view-overlay state the plan's redraw reads. The 3D-only view
 * mode leaves no plan on screen for either to change, so it disables them, and the
 * hover text names the modes that bring the plan back (the visible button labels
 * outrank `title` in the accessible name, so the buttons stay Grid and Dimensions).
 */
export function ViewToggles() {
  const { showGrid, showDimensions, toggleGrid, toggleDimensions } = useViewOverlay()
  const planHidden = useViewMode().mode === 'preview'
  return (
    <>
      <IconButton
        labeled
        aria-pressed={showGrid}
        onClick={toggleGrid}
        disabled={planHidden}
        title={planHidden ? PLAN_ONLY_TITLES.grid : 'Grid'}
      >
        <GridFour size={16} aria-hidden="true" />
        <span>Grid</span>
      </IconButton>
      <IconButton
        labeled
        aria-pressed={showDimensions}
        onClick={toggleDimensions}
        disabled={planHidden}
        title={planHidden ? PLAN_ONLY_TITLES.dimensions : 'Dimensions'}
      >
        <Ruler size={16} aria-hidden="true" />
        <span>Dimensions</span>
      </IconButton>
    </>
  )
}
