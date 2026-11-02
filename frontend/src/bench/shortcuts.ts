import { useEffect, useRef } from 'react'

export type ShortcutAction =
  | 'start'
  | 'stop'
  | 'live'
  | 'quick'
  | 'slot'
  | 'baseline'
  | 'modified'
  | 'gearUp'
  | 'gearDown'
  | 'neutral'
  | 'listener'
  | 'help'

/** Keys and what they do; Space (throttle) is handled separately. */
export const SHORTCUTS: { key: string; action: ShortcutAction; label: string }[] = [
  { key: 's', action: 'start', label: 'Start engine' },
  { key: 'x', action: 'stop', label: 'Emergency stop' },
  { key: 'l', action: 'live', label: 'Live pull' },
  { key: 't', action: 'quick', label: 'Quick test' },
  { key: 'c', action: 'slot', label: 'Swap capture slot (Baseline / Modified)' },
  { key: '1', action: 'baseline', label: 'Hear baseline' },
  { key: '2', action: 'modified', label: 'Hear modified' },
  { key: 'e', action: 'gearUp', label: 'Change up (road load)' },
  { key: 'q', action: 'gearDown', label: 'Change down (road load)' },
  { key: 'n', action: 'neutral', label: 'Neutral (road load)' },
  { key: 'v', action: 'listener', label: 'Next listening position' },
  { key: '?', action: 'help', label: 'Show these shortcuts' },
]

/**
 * Single-key bench shortcuts. They never fire while typing in a field or
 * with a modifier held, and a held key does not repeat its action.
 */
export function useShortcuts(handler: (action: ShortcutAction) => void) {
  const current = useRef(handler)
  useEffect(() => {
    current.current = handler
  })
  useEffect(() => {
    const listen = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (
        target?.closest?.(
          'input,textarea,select,[contenteditable="true"],[role="combobox"],[role="listbox"],[role="dialog"]',
        )
      )
        return
      const shortcut = SHORTCUTS.find((s) => s.key === event.key.toLowerCase())
      if (!shortcut) return
      event.preventDefault()
      current.current(shortcut.action)
    }
    window.addEventListener('keydown', listen)
    return () => window.removeEventListener('keydown', listen)
  }, [])
}
