import { useRef, type ReactNode } from 'react'
import { Button } from './button'
import { usePaneCollapse } from './use-pane-collapse'
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

interface CollapsiblePaneProps {
  area: 'rail' | 'inspector'
  label: string
  children: ReactNode
}

function CollapsiblePane({ area, label, children }: CollapsiblePaneProps) {
  const { collapsed, toggle } = usePaneCollapse(false)
  return (
    <aside className={`ds-app-frame__${area}`} aria-label={label} data-collapsed={collapsed}>
      <Button
        className="ds-app-frame__collapse"
        aria-expanded={!collapsed}
        aria-label={`Collapse ${label}`}
        onClick={toggle}
      >
        {collapsed ? '›' : '‹'}
      </Button>
      {collapsed ? null : <div className="ds-app-frame__pane-body">{children}</div>}
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
