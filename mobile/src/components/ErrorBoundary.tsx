import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-stack" style={{ padding: 20 }}>
          <section className="section-card">
            <h3>页面加载出错</h3>
            <p style={{ color: '#c00', fontSize: '0.85rem' }}>{this.state.error?.message}</p>
            <button className="primary-button" onClick={() => this.setState({ hasError: false, error: null })}>
              重试
            </button>
          </section>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
