import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import { SHORTCUTS } from './shortcuts'

export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="shortcut-title">
      <DialogTitle id="shortcut-title">Keyboard shortcuts</DialogTitle>
      <DialogContent>
        <table className="shortcut-table">
          <tbody>
            <tr>
              <td>
                <kbd>Space</kbd>
              </td>
              <td>Throttle (hold)</td>
            </tr>
            {SHORTCUTS.map((s) => (
              <tr key={s.key}>
                <td>
                  <kbd>{s.key.toUpperCase()}</kbd>
                </td>
                <td>{s.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="helper-text">
          Shortcuts are ignored while you type in a field.
        </p>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
