import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { clearGuestState } from './storage'

/**
 * Catches a render error on the bench so it shows a way back instead of a
 * blank page. Unapplied edits are the likeliest cause, so the first option
 * discards only those; the second also returns to the Road build. Saved
 * builds, runs in the library and preferences are not touched.
 */
export class BenchErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Bench error', error, info.componentStack)
  }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const recover = (everything: boolean) => {
      clearGuestState(everything)
      window.location.reload()
    }
    return (
      <div className="bench-crash" role="alert">
        <h1>The bench hit an error</h1>
        <p>
          Something in the current build stopped the page from drawing. Your
          saved builds and runs are safe.
        </p>
        <p className="bench-crash-detail">{error.message.slice(0, 400)}</p>
        <div className="bench-crash-actions">
          <button type="button" onClick={() => recover(false)}>
            Discard unapplied edits and reload
          </button>
          <button type="button" onClick={() => recover(true)}>
            Start again from the Road build
          </button>
        </div>
      </div>
    )
  }
}
