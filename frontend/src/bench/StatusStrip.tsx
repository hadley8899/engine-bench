import { useState } from 'react'
import { Alert, Button, Popover } from '@mui/material'
import type { ReactNode } from 'react'

export type StatusMessage = {
  key: string
  severity: 'error' | 'warning' | 'info'
  text: ReactNode
  /** What to do next, when the bench can take the user there. */
  action?: { label: string; onClick: () => void }
}

const RANK = { error: 0, warning: 1, info: 2 } as const

/**
 * The one place for engine state messages: failures, stalls, the limiter,
 * fuel and knock problems and the latest bench notice. Each says what to do
 * next. Shown under the command bar on every tab.
 *
 * The strip is one line of fixed height, so messages coming and going never
 * move the page under the pointer: it shows the most serious message (or
 * the notice), and the rest open over the page from its Details button.
 */
export function StatusStrip({
  messages,
  notice,
}: {
  messages: StatusMessage[]
  notice: string
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const ordered = [...messages].sort((a, b) => RANK[a.severity] - RANK[b.severity])
  const top = ordered[0]
  const more = ordered.length - 1
  const action = (m: StatusMessage, close?: boolean) =>
    m.action && (
      <Button
        size="small"
        color="inherit"
        onClick={() => {
          if (close) setAnchor(null)
          m.action!.onClick()
        }}
      >
        {m.action.label}
      </Button>
    )
  return (
    <div className="status-strip" data-testid="status-strip">
      {top ? (
        <Alert
          key={top.key}
          severity={top.severity}
          data-testid={`status-${top.key}`}
          action={action(top)}
        >
          {top.text}
        </Alert>
      ) : (
        <p className="bench-notice" role="status" title={notice}>
          {notice}
        </p>
      )}
      {top && (
        <Button
          size="small"
          className="status-more"
          aria-haspopup="dialog"
          aria-expanded={!!anchor}
          onClick={(e) => setAnchor(e.currentTarget)}
        >
          {more > 0 ? `+${more} more` : 'Details'}
        </Button>
      )}
      <Popover
        open={!!anchor && !!top}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { className: 'status-list', role: 'dialog', 'aria-label': 'Engine messages' } }}
      >
        {ordered.map((m) => (
          <Alert
            key={m.key}
            severity={m.severity}
            data-testid={`status-item-${m.key}`}
            action={action(m, true)}
          >
            {m.text}
          </Alert>
        ))}
        {notice && <p className="bench-notice">{notice}</p>}
      </Popover>
    </div>
  )
}
