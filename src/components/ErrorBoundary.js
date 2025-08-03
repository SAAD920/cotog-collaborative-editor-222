// src/components/ErrorBoundary.js - COMPREHENSIVE ERROR BOUNDARY COMPONENT
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      eventId: null
    };
  }

  // 🆕 Catch errors during rendering
  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { 
      hasError: true,
      error: error
    };
  }

  // 🆕 Log error details and potentially send to error reporting service
  componentDidCatch(error, errorInfo) {
    // Store error details for debugging
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // 🔧 Enhanced error logging with context
    console.group('🚨 Error Boundary Caught Error');
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('Component Stack:', errorInfo.componentStack);
    console.error('Error Stack:', error.stack);
    console.groupEnd();

    // 🆕 Generate unique error ID for tracking
    const eventId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    this.setState({ eventId });

    // 🔧 Send error to external service (uncomment when ready)
    // this.sendErrorToService(error, errorInfo, eventId);
  }

  // 🆕 Optional: Send error to external monitoring service
  sendErrorToService = (error, errorInfo, eventId) => {
    try {
      // Example: Send to Sentry, LogRocket, or custom endpoint
      /*
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: new Date().toISOString(),
          userId: this.props.userId || 'anonymous'
        })
      });
      */
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  };

  // 🆕 Reset error boundary state
  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null
    });
  };

  // 🆕 Reload the entire application
  handleReload = () => {
    window.location.reload();
  };

  // 🆕 Navigate back to home
  handleGoHome = () => {
    window.location.href = '/';
  };

  // 🆕 Copy error details to clipboard for support
  handleCopyError = async () => {
    const errorDetails = {
      eventId: this.state.eventId,
      error: this.state.error?.message,
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString()
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2));
      alert('Error details copied to clipboard');
    } catch (err) {
      console.error('Failed to copy error details:', err);
      // Fallback: create a text area and select it
      const textArea = document.createElement('textarea');
      textArea.value = JSON.stringify(errorDetails, null, 2);
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('Error details copied to clipboard');
    }
  };

  // 🆕 Determine error category for better messaging
  getErrorCategory = (error) => {
    if (!error) return 'unknown';
    
    const message = error.message?.toLowerCase() || '';
    const stack = error.stack?.toLowerCase() || '';
    
    // WebRTC related errors
    if (message.includes('webrtc') || message.includes('peer') || 
        message.includes('audiocontext') || message.includes('getusermedia')) {
      return 'webrtc';
    }
    
    // Network related errors
    if (message.includes('fetch') || message.includes('network') || 
        message.includes('connection') || message.includes('socket')) {
      return 'network';
    }
    
    // Authentication errors
    if (message.includes('auth') || message.includes('token') || 
        message.includes('unauthorized')) {
      return 'auth';
    }
    
    // Memory/Resource errors
    if (message.includes('memory') || message.includes('heap') || 
        message.includes('maximum call stack')) {
      return 'memory';
    }
    
    // Rendering errors
    if (stack.includes('render') || message.includes('cannot read prop')) {
      return 'rendering';
    }
    
    return 'general';
  };

  // 🆕 Get user-friendly error message based on category
  getErrorMessage = (category) => {
    const messages = {
      webrtc: {
        title: 'Voice Chat Error',
        description: 'There was an issue with the voice chat system. This might be due to microphone permissions or browser compatibility.',
        suggestion: 'Try refreshing the page and allowing microphone access when prompted.'
      },
      network: {
        title: 'Connection Error',
        description: 'Unable to connect to the server. This might be due to network issues or server maintenance.',
        suggestion: 'Check your internet connection and try again in a few moments.'
      },
      auth: {
        title: 'Authentication Error',
        description: 'There was an issue with your login session.',
        suggestion: 'Please log out and log back in to refresh your session.'
      },
      memory: {
        title: 'Performance Error',
        description: 'The application is using too much memory or resources.',
        suggestion: 'Try closing other browser tabs and refreshing the page.'
      },
      rendering: {
        title: 'Display Error',
        description: 'There was an issue displaying part of the application.',
        suggestion: 'Refreshing the page should resolve this issue.'
      },
      general: {
        title: 'Application Error',
        description: 'Something unexpected happened in the application.',
        suggestion: 'Please try refreshing the page or contact support if the issue persists.'
      }
    };
    
    return messages[category] || messages.general;
  };

  render() {
    if (this.state.hasError) {
      const errorCategory = this.getErrorCategory(this.state.error);
      const errorMessage = this.getErrorMessage(errorCategory);
      
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center max-w-2xl mx-auto p-6">
            {/* Error Icon */}
            <div className="text-6xl mb-6">
              {errorCategory === 'webrtc' ? '🎙️' :
               errorCategory === 'network' ? '🌐' :
               errorCategory === 'auth' ? '🔐' :
               errorCategory === 'memory' ? '💾' :
               errorCategory === 'rendering' ? '🖥️' : '⚠️'}
            </div>
            
            {/* Error Title */}
            <h1 className="text-3xl font-bold mb-2 text-red-600">
              {errorMessage.title}
            </h1>
            
            {/* Error Description */}
            <p className="text-gray-700 mb-4 text-lg">
              {errorMessage.description}
            </p>
            
            {/* Error Suggestion */}
            <p className="text-gray-600 mb-6">
              {errorMessage.suggestion}
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
            
            {/* Technical Details (Collapsible) */}
            <details className="text-left bg-red-50 border border-red-200 rounded-lg p-4">
              <summary className="cursor-pointer font-semibold text-red-800 mb-2">
                🔧 Technical Details (for developers)
              </summary>
              
              <div className="space-y-3 text-sm">
                {/* Error ID */}
                {this.state.eventId && (
                  <div>
                    <strong className="text-red-700">Error ID:</strong>
                    <code className="ml-2 bg-red-100 px-2 py-1 rounded">{this.state.eventId}</code>
                  </div>
                )}
                
                {/* Error Message */}
                <div>
                  <strong className="text-red-700">Error Message:</strong>
                  <pre className="mt-1 bg-red-100 p-2 rounded text-xs overflow-x-auto">
                    {this.state.error?.message || 'Unknown error'}
                  </pre>
                </div>
                
                {/* Component Stack */}
                {this.state.errorInfo?.componentStack && (
                  <div>
                    <strong className="text-red-700">Component Stack:</strong>
                    <pre className="mt-1 bg-red-100 p-2 rounded text-xs overflow-x-auto">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                )}
                
                {/* Error Stack (truncated) */}
                {this.state.error?.stack && (
                  <div>
                    <strong className="text-red-700">Error Stack:</strong>
                    <pre className="mt-1 bg-red-100 p-2 rounded text-xs overflow-x-auto max-h-32">
                      {this.state.error.stack}
                    </pre>
                  </div>
                )}
                
                {/* Copy Error Details Button */}
                <div className="pt-2">
                  <button
                    onClick={this.handleCopyError}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs transition-colors"
                  >
                    📋 Copy Error Details
                  </button>
                </div>
              </div>
            </details>
            
            {/* Contact Support */}
            <div className="mt-6 text-center">
              <p className="text-gray-500 text-sm">
                If this problem persists, please contact support with the error ID above.
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