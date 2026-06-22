import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from './button'
import { usePaneCollapse } from './use-pane-collapse'
import { usePaneResize } from './use-pane-resize'
import { useBreakpoint } from './use-breakpoint'
import './app-frame.css'

export interface AppFrameProps {
  header: ReactNode
  banner?: ReactNode
  rail: ReactNode
  railLabel: string
  main: ReactNode
  mainLabel: string
  inspector: ReactNode
  inspectorLabel: string
  statusBar?: ReactNode
}

const RAIL_ID = 'ds-app-frame-rail'
const RAIL_BOUNDS = { initial: 11, min: 8, max: 20 }
const INSPECTOR_BOUNDS = { initial: 15, min: 10, max: 28 }
const RESIZE_STEP_REM = 1
const PANE_BOUNDS = { rail: RAIL_BOUNDS, inspector: INSPECTOR_BOUNDS } as const

interface CollapsiblePaneProps {
  area: 'rail' | 'inspector'
  label: string
  id?: string
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

function CollapsiblePane({ area, label, id, children }: CollapsiblePaneProps) {
  const { collapsed, toggle } = usePaneCollapse(false)
  const { size, onResizeStep } = usePaneResize(PANE_BOUNDS[area])
  const style = { [`--ds-${area}-size`]: `${size}rem` } as CSSProperties
  return (
    <aside
      className={`ds-app-frame__${area}`}
      id={id}
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

interface RailDisclosureToggleProps {
  railLabel: string
  open: boolean
  setOpen: (updater: (open: boolean) => boolean) => void
}

function RailDisclosureToggle({ railLabel, open, setOpen }: RailDisclosureToggleProps) {
  return (
    <Button
      className="ds-app-frame__rail-toggle"
      aria-expanded={open}
      aria-controls={RAIL_ID}
      onClick={() => setOpen((current) => !current)}
    >
      {`${open ? 'Hide' : 'Show'} ${railLabel}`}
    </Button>
  )
}

function NarrowNotice({ railLabel }: { railLabel: string }) {
  return (
    <p className="ds-app-frame__narrow-notice" role="note">
      {`Vernacular works best on a wider screen. Open the tools with the ${railLabel} button.`}
    </p>
  )
}

interface FrameTopSlotsProps {
  header: ReactNode
  banner: ReactNode
}

// The header and the banner share the top of the frame. The banner div is rendered
// unconditionally (unlike the optional statusBar footer) so its CSS-driven :empty collapse
// can add or remove the banner grid row without a React remount when content toggles at runtime.
function FrameTopSlots({ header, banner }: FrameTopSlotsProps) {
  return (
    <>
      <header className="ds-app-frame__header" role="banner">
        {header}
      </header>
      <div className="ds-app-frame__banner">{banner}</div>
    </>
  )
}

export function AppFrame({
  header,
  banner,
  rail,
  railLabel,
  main,
  mainLabel,
  inspector,
  inspectorLabel,
  statusBar,
}: AppFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const breakpoint = useBreakpoint(frameRef)
  const [railOpen, setRailOpen] = useState(false)
  return (
    <div
      ref={frameRef}
      className="ds-app-frame"
      data-breakpoint={breakpoint}
      data-rail-open={railOpen}
    >
      <FrameTopSlots header={header} banner={banner} />
      <RailDisclosureToggle railLabel={railLabel} open={railOpen} setOpen={setRailOpen} />
      <NarrowNotice railLabel={railLabel} />
      <CollapsiblePane area="rail" label={railLabel} id={RAIL_ID}>
        {rail}
      </CollapsiblePane>
      <main className="ds-app-frame__main" aria-label={mainLabel}>
        {main}
      </main>
      <CollapsiblePane area="inspector" label={inspectorLabel}>
        {inspector}
      </CollapsiblePane>
      {statusBar !== undefined ? (
        <footer className="ds-app-frame__status-bar">{statusBar}</footer>
      ) : null}
    </div>
  )
}
