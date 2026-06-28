import type { Icon } from '@phosphor-icons/react'
import { Armchair, Door, Minus, SelectionAll, Tag } from '@phosphor-icons/react'
import { SectionLabel } from '../design-system'
import { useActiveEditLayer, type EditLayer } from './edit-layer-context'
import { useRovingRadioGroup } from './roving-radio-group'
import '../design-system/segmented.css'
import './tools-panel.css'

const EDIT_LAYERS: { id: EditLayer; label: string; icon: Icon }[] = [
  { id: 'all', label: 'All', icon: SelectionAll },
  { id: 'walls', label: 'Walls', icon: Minus },
  { id: 'openings', label: 'Openings', icon: Door },
  // Labeled "Decor" rather than "Furniture" so the chip's name stays distinct from
  // the furniture library launcher button in the same rail (#289).
  { id: 'furniture', label: 'Decor', icon: Armchair },
  { id: 'annotations', label: 'Annotations', icon: Tag },
]

/** Radiogroup selector that scopes which plan elements are selectable. */
export function EditLayerPanel() {
  const { layer, setLayer } = useActiveEditLayer()
  const { containerRef, onKeyDown } = useRovingRadioGroup<HTMLDivElement>()
  return (
    <div className="tools-panel">
      <div
        ref={containerRef}
        className="tools-panel__section"
        role="radiogroup"
        aria-label="Edit layer"
        onKeyDown={onKeyDown}
      >
        <SectionLabel className="tools-panel__section-heading">Edit layer</SectionLabel>
        {EDIT_LAYERS.map(({ id, label, icon }) => {
          const isActive = layer === id
          const IconComponent = icon
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={isActive}
              tabIndex={isActive ? 0 : -1}
              className={`ds-segmented__option tools-panel__chip${isActive ? ' is-active' : ''}`}
              onClick={() => setLayer(id)}
            >
              <IconComponent size={16} aria-hidden="true" />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
