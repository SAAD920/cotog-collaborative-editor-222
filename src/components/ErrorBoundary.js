// src/components/ErrorBoundary.js - CLEANED VERSION WITH UNUSED CODE REMOVED
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null
    };
  }

  // Catch errors during rendering
  static getDerivedStateFromError(error) {
    return { 
      hasError: true,
      error: error
    };
  }

  // Log error details
  componentDidCatch(error, errorInfo) {
    // Store error for display
    this.setState({
      error: error
    });

    // Simple error logging for developers
    console.group('🚨 Error Boundary Caught Error');
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('Component Stack:', errorInfo.componentStack);
    console.groupEnd();

    // Optional: Send to external error monitoring service
    if (process.env.NODE_ENV === 'production') {
      // Uncomment and configure when ready to use error reporting
      // this.reportError(error, errorInfo);
    }
  }

  // Optional: Send error to external monitoring service
  reportError = (error, errorInfo) => {
    try {
      // Example error reporting - configure as needed
      console.log('Error would be reported to monitoring service:', {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      });
      
      // Example: Send to your error monitoring service
      /*
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href
        })
      }).catch(err => console.error('Failed to report error:', err));
      */
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  };

  // Reset error boundary state
  handleReset = () => {
    this.setState({
      hasError: false,
      error: null
    });
  };

  // Reload the entire application
  handleReload = () => {
    window.location.reload();
  };

  // Navigate back to home
  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center max-w-lg mx-auto p-6">
            {/* Error Icon */}
            <div className="text-6xl mb-6">⚠️</div>
            
            {/* Error Title */}
            <h1 className="text-3xl font-bold mb-4 text-red-600">
              Something went wrong
            </h1>
            
            {/* Error Description */}
            <p className="text-gray-700 mb-6 text-lg">
              We're sorry, but something unexpected happened. Please try refreshing the page or go back to the home page.
            </p>
            
            {/* Action Buttons */}
            <div className="space-y-3 mb-6">
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={this.handleReset}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                >
                  🔄 Try Again
                </button>
                
                <button
                  onClick={this.handleReload}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                >
                  🔃 Reload Page
                </button>
                
                <button
                  onClick={this.handleGoHome}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                >
                  🏠 Go Home
                </button>
              </div>
            </div>
            
            {/* Simple Error Details (Development Only) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="text-left bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
                <summary className="cursor-pointer font-semibold text-red-800 mb-2">
                  🔧 Error Details (Development)
                </summary>
                
                <div className="text-sm text-red-700">
                  <div className="mb-2">
                    <strong>Error Message:</strong>
                    <pre className="mt-1 bg-red-100 p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap">
                      {this.state.error?.message || 'Unknown error'}
                    </pre>
                  </div>
                  
                  <div className="text-xs text-red-600">
                    <strong>Note:</strong> This detailed error information is only shown in development mode.
                  </div>
                </div>
              </details>
            )}
            
            {/* Help Text */}
            <div className="mt-6 text-center">
              <p className="text-gray-500 text-sm">
                If this problem continues, try clearing your browser cache or contact support.
              </p>
            </div>

            {/* Contact Information (Optional) */}
            <div className="mt-4 text-center">
              <p className="text-gray-400 text-xs">
                Need help? Visit our{' '}
                <a 
                  href="/help" 
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  help center
                </a>
                {' '}or{' '}
                <a 
                  href="mailto:support@cotog.com" 
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  contact support
                </a>
              </p>
            </div>
          </div>
        </div>
      );
    }

    // If no error, render children normally
    return this.props.children;
  }
}

export default ErrorBoundary;