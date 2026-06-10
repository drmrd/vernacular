import { useRef, type CSSProperties, type ReactNode } from 'react'
import { Button } from './button'
import { usePaneCollapse } from './use-pane-collapse'
import { usePaneResize } from './use-pane-resize'
import { useBreakpoint } from './use-breakpoint'
import './app-frame.css'

export interface AppFrameProps {
  header: ReactNode
  rail: ReactNode
  railLabel: string
  main: ReactNode
  mainLabel: string
  inspector: ReactNode
  inspectorLabel: string
}

const RAIL_BOUNDS = { initial: 11, min: 8, max: 20 }
const INSPECTOR_BOUNDS = { initial: 15, min: 10, max: 28 }
const RESIZE_STEP_REM = 1
const PANE_BOUNDS = { rail: RAIL_BOUNDS, inspector: INSPECTOR_BOUNDS } as const

interface CollapsiblePaneProps {
  area: 'rail' | 'inspector'
  label: string
  children: ReactNode
}

interface PaneResizeHandleProps {
  label: string
  size: number
  bounds: { min: number; max: number }
  onResizeStep: (delta: number) => void
}

function PaneResizeHandle({ label, size, bounds, onResizeStep }: PaneResizeHandleProps) {
  return (
    <div
      className="ds-app-frame__resize"
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={`Resize ${label}`}
      aria-valuenow={size}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          onResizeStep(RESIZE_STEP_REM)
        } else if (event.key === 'ArrowLeft') {
          onResizeStep(-RESIZE_STEP_REM)
        }
      }}
    />
  )
}

function CollapsiblePane({ area, label, children }: CollapsiblePaneProps) {
  const { collapsed, toggle } = usePaneCollapse(false)
  const { size, onResizeStep } = usePaneResize(PANE_BOUNDS[area])
  const style = { [`--ds-${area}-size`]: `${size}rem` } as CSSProperties
  return (
    <aside
      className={`ds-app-frame__${area}`}
      aria-label={label}
      data-collapsed={collapsed}
      style={style}
    >
      <Button
        className="ds-app-frame__collapse"
        aria-expanded={!collapsed}
        aria-label={`Collapse ${label}`}
        onClick={toggle}
      >
        {collapsed ? '›' : '‹'}
      </Button>
      {collapsed ? null : (
        <>
          <div className="ds-app-frame__pane-body">{children}</div>
          <PaneResizeHandle
            label={label}
            size={size}
            bounds={PANE_BOUNDS[area]}
            onResizeStep={onResizeStep}
          />
        </>
      )}
    </aside>
  )
}

export function AppFrame({
  header,
  rail,
  railLabel,
  main,
  mainLabel,
  inspector,
  inspectorLabel,
}: AppFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const breakpoint = useBreakpoint(frameRef)
  return (
    <div ref={frameRef} className="ds-app-frame" data-breakpoint={breakpoint}>
      <header className="ds-app-frame__header" role="banner">
        {header}
      </header>
      <CollapsiblePane area="rail" label={railLabel}>
        {rail}
      </CollapsiblePane>
      <main className="ds-app-frame__main" aria-label={mainLabel}>
        {main}
      </main>
      <CollapsiblePane area="inspector" label={inspectorLabel}>
        {inspector}
      </CollapsiblePane>
    </div>
  )
}
