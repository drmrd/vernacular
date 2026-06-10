import { useRef, type ReactNode } from 'react'
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

export function AppFrame(props: AppFrameProps) {
  const { header, rail, railLabel, main, mainLabel, inspector, inspectorLabel } = props
  const frameRef = useRef<HTMLDivElement>(null)
  const breakpoint = useBreakpoint(frameRef)
  return (
    <div ref={frameRef} className="ds-app-frame" data-breakpoint={breakpoint}>
      <header className="ds-app-frame__header" role="banner">
        {header}
      </header>
      <aside className="ds-app-frame__rail" aria-label={railLabel}>
        {rail}
      </aside>
      <main className="ds-app-frame__main" aria-label={mainLabel}>
        {main}
      </main>
      <aside className="ds-app-frame__inspector" aria-label={inspectorLabel}>
        {inspector}
      </aside>
    </div>
  )
}
