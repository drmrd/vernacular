import type { ReactNode } from 'react'
import { EmptyState } from './status'
import './panel-slot.css'

export interface PanelSlotProps {
  slotId: string
  label: string
  children?: ReactNode
  emptyTitle?: string
  emptyDescription?: string
}

export function PanelSlot({
  slotId,
  label,
  children,
  emptyTitle,
  emptyDescription,
}: PanelSlotProps) {
  return (
    <section className="ds-panel-slot" role="region" aria-label={label} data-slot-id={slotId}>
      {children ?? (
        <EmptyState
          title={emptyTitle ?? label}
          asRegion={false}
          {...(emptyDescription ? { description: emptyDescription } : {})}
        />
      )}
    </section>
  )
}
