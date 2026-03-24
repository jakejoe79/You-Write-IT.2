import { Component } from 'react';
import { formatErrorForUser } from '../errors';

/**
 * Error Boundary Component
 * Catches JavaScript errors in child components and displays a fallback UI
 * 
 * Usage:
 * <ErrorBoundary>
 *   <App />
 * </ErrorBoundary>
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { 
      hasError: true, 
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ 
      error,
      errorInfo,
    });
    
    // Log error to console
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <h1 style={styles.title}>Something broke.</h1>
            <p style={styles.message}>
              {formatErrorForUser(this.state.error)}
            </p>
            {this.state.error && (
              <div style={styles.details}>
                <strong>Error:</strong> {this.state.error.message}
                {this.state.error.details && (
                  <div style={styles.detailsList}>
                    {Object.entries(this.state.error.details).map(([key, value]) => (
                      <div key={key}>
                        <strong>{key}:</strong> {String(value)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {this.state.errorInfo && (
              <details style={styles.stack}>
                <summary>Stack trace</summary>
                <pre>{this.state.errorInfo.componentStack}</pre>
              </details>
            )}
            <button 
              onClick={this.handleReset}
              style={styles.button}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: '#1a1a1a',
    padding: '2rem',
  },
  card: {
    background: '#2a2a2a',
    padding: '2rem',
    borderRadius: '8px',
    maxWidth: '600px',
    width: '100%',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  },
  title: {
    color: '#ff6b6b',
    margin: '0 0 1rem 0',
    fontSize: '1.5rem',
  },
  message: {
    color: '#e8e8e8',
    margin: '0 0 1.5rem 0',
    fontSize: '1rem',
    lineHeight: '1.5',
  },
  details: {
    background: '#1a1a1a',
    padding: '1rem',
    borderRadius: '4px',
    marginBottom: '1rem',
    fontSize: '0.85rem',
  },
  detailsList: {
    marginTop: '0.5rem',
    color: '#888',
  },
  stack: {
    background: '#1a1a1a',
    padding: '1rem',
    borderRadius: '4px',
    marginBottom: '1rem',
    fontSize: '0.75rem',
    overflow: 'auto',
    maxHeight: '200px',
  },
  button: {
    background: '#4a4aff',
    color: '#fff',
    border: 'none',
    padding: '0.75rem 1.5rem',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1rem',
    width: '100%',
  },
};
