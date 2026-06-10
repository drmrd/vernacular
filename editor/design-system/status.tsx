import { useId, type ReactNode } from 'react'
import './status.css'

export interface LoadingStateProps {
  message: string
}

export function LoadingState({ message }: LoadingStateProps) {
  return (
    <div className="ds-status" role="status">
      <p className="ds-status__message">{message}</p>
    </div>
  )
}

export interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  /** Whether to expose a region landmark. Set false when nested inside an existing region. Defaults to true. */
  asRegion?: boolean
}

export function EmptyState({ title, description, action, asRegion = true }: EmptyStateProps) {
  const titleId = useId()
  return (
    <section
      className="ds-status ds-status--empty"
      role={asRegion ? 'region' : undefined}
      aria-labelledby={asRegion ? titleId : undefined}
    >
      <h2 id={titleId} className="ds-status__title">
        {title}
      </h2>
      {description ? <p className="ds-status__message">{description}</p> : null}
      {action ? <div className="ds-status__action">{action}</div> : null}
    </section>
  )
}
