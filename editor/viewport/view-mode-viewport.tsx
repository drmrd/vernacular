import type { KeyboardEvent, ReactNode } from 'react'
import { Button, usePaneResize } from '../design-system'
import { useViewMode, type ViewControls, type ViewMode } from './view-mode'
import './view-mode-viewport.css'

const RESIZE_STEP = 5
const SPLIT_DEFAULT = 60
const SPLIT_MIN = 30
const SPLIT_MAX = 80

const MODES: ReadonlyArray<{ mode: ViewMode; label: string }> = [
  { mode: 'plan', label: 'Plan view' },
  { mode: 'split', label: 'Split view' },
  { mode: 'preview', label: '3D view' },
]

function ModeToolbar({ mode, setMode }: ViewControls) {
  return (
    <div className="view-mode-viewport__toolbar" role="toolbar" aria-label="View mode">
      {MODES.map(({ mode: value, label }) => (
        <Button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>
          {label}
        </Button>
      ))}
    </div>
  )
}

function Splitter({ onResizeStep }: { onResizeStep: (delta: number) => void }) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onResizeStep(-RESIZE_STEP)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      onResizeStep(RESIZE_STEP)
    }
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panes"
      tabIndex={0}
      className="view-mode-viewport__separator"
      onKeyDown={onKeyDown}
    />
  )
}

function SplitBody({ plan, preview }: { plan: ReactNode; preview: ReactNode }) {
  const { size, onResizeStep } = usePaneResize({
    initial: SPLIT_DEFAULT,
    min: SPLIT_MIN,
    max: SPLIT_MAX,
  })
  return (
    <div className="view-mode-viewport__split">
      <div className="view-mode-viewport__pane" style={{ flexBasis: `${size}%` }}>
        {plan}
      </div>
      <Splitter onResizeStep={onResizeStep} />
      <div className="view-mode-viewport__pane">{preview}</div>
    </div>
  )
}

export function ViewModeViewport({ plan, preview }: { plan: ReactNode; preview: ReactNode }) {
  const { mode, setMode } = useViewMode()
  return (
    <div className="view-mode-viewport">
      <ModeToolbar mode={mode} setMode={setMode} />
      <div className="view-mode-viewport__body">
        {mode === 'plan' ? plan : null}
        {mode === 'preview' ? preview : null}
        {mode === 'split' ? <SplitBody plan={plan} preview={preview} /> : null}
      </div>
    </div>
  )
}
