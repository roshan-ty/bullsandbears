import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) return <main role="alert">
      <h1>Bulls &amp; Bears could not display this view</h1>
      <p>No replacement market data has been generated. Reload to retry the published application.</p>
      <button onClick={() => window.location.reload()}>Reload application</button>
    </main>
    return this.props.children
  }
}