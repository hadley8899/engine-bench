import { Alert, Button } from '@mui/material'
import type { ReactNode } from 'react'

export type StatusMessage = {
  key: string
  severity: 'error' | 'warning' | 'info'
  text: ReactNode
  /** What to do next, when the bench can take the user there. */
  action?: { label: string; onClick: () => void }
}

/**
 * The one place for engine state messages: failures, stalls, the limiter,
 * fuel and knock problems and the latest bench notice. Each says what to do
 * next. Shown under the command bar on every tab.
 */
export function StatusStrip({
  messages,
  notice,
}: {
  messages: StatusMessage[]
  notice: string
}) {
  return (
    <div className="status-strip" data-testid="status-strip">
      {messages.map((m) => (
        <Alert
          key={m.key}
          severity={m.severity}
          data-testid={`status-${m.key}`}
          action={
            m.action && (
              <Button size="small" color="inherit" onClick={m.action.onClick}>
                {m.action.label}
              </Button>
            )
          }
        >
          {m.text}
        </Alert>
      ))}
      {notice && (
        <p className="bench-notice" role="status">
          {notice}
        </p>
      )}
    </div>
  )
}
