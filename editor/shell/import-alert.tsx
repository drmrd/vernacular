import './import-alert.css'

interface ImportAlertProps {
  status: { fileName: string; reason: string } | null
  onDismiss?: () => void
}

// Surfaces a failed project open as a dismissible alert. Renders nothing while
// there is no failure to report.
export function ImportAlert({ status, onDismiss }: ImportAlertProps) {
  if (status === null) {
    return null
  }
  return (
    <div role="alert" className="import-alert">
      <span className="import-alert__message">
        Couldn&apos;t open {status.fileName}: {status.reason}
      </span>
      <button type="button" className="import-alert__dismiss" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  )
}
