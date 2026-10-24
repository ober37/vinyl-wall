import { Component, type ReactNode } from 'react'
import { Alert, AlertTitle, AlertDescription, AlertAction } from '@appica/ui-react/alert'
import { Button } from '@appica/ui-react/button'

// React has no hook for render errors, so this is a class. A crash inside shows an alert instead of a blank page.
export class Boundary extends Component<
  { title: string; onClose?: () => void; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error(error)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <Alert variant="error" role="alert">
        <AlertTitle>{this.props.title}</AlertTitle>
        <AlertDescription>{this.state.error.message}</AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          {this.props.onClose && (
            <Button size="sm" variant="outline" onClick={this.props.onClose}>
              Close
            </Button>
          )}
        </AlertAction>
      </Alert>
    )
  }
}
