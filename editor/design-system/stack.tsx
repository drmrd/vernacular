import type { CSSProperties, ReactNode } from 'react'
import './stack.css'

export type StackDirection = 'vertical' | 'horizontal'
export type SpacingStep = 'space-1' | 'space-2' | 'space-3' | 'space-4' | 'space-5'

export interface StackProps {
  direction?: StackDirection
  gap?: SpacingStep
  children: ReactNode
}

const GAP_CUSTOM_PROPERTY = '--ds-stack-gap'

function gapStyle(gap: SpacingStep): CSSProperties {
  const customProperties: Record<string, string> = { [GAP_CUSTOM_PROPERTY]: `var(--${gap})` }
  return customProperties as CSSProperties
}

export function Stack({ direction = 'vertical', gap = 'space-3', children }: StackProps) {
  return (
    <div className={`ds-stack ds-stack--${direction}`} style={gapStyle(gap)}>
      {children}
    </div>
  )
}
