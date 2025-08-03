// pages/_app.js - UPDATED WITH ERROR BOUNDARY AND PERFORMANCE OPTIMIZATIONS
import '../styles/globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useEffect } from 'react';

function MyApp({ Component, pageProps }) {
  // 🆕 Global error handling for unhandled promise rejections
  useEffect(() => {
    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event) => {
      console.error('🚨 Unhandled Promise Rejection:', event.reason);
      
      // You can report this to an error service
      // reportError('unhandled_rejection', event.reason);
      
      // Prevent the default browser behavior (showing error in console)
      event.preventDefault();
    };

    // Handle global JavaScript errors that escape error boundaries
    const handleGlobalError = (event) => {
      console.error('🚨 Global JavaScript Error:', event.error);
      
      // You can report this to an error service
      // reportError('global_error', event.error);
    };

    // Add global error listeners
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleGlobalError);

    // 🆕 Performance monitoring (optional)
    if (typeof window !== 'undefined' && 'performance' in window) {
      // Log page load performance
      window.addEventListener('load', () => {
        setTimeout(() => {
          const perfData = performance.getEntriesByType('navigation')[0];
          if (perfData) {
            console.log('📊 Page Load Performance:', {
              loadTime: Math.round(perfData.loadEventEnd - perfData.fetchStart),
              domContentLoaded: Math.round(perfData.domContentLoadedEventEnd - perfData.fetchStart),
              firstByte: Math.round(perfData.responseStart - perfData.fetchStart)
            });
          }
        }, 0);
      });
    }

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleGlobalError);
    };
  }, []);

  // 🆕 Development-only warnings
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // Warn about missing environment variables
      const requiredEnvVars = [
        'NEXT_PUBLIC_API_URL',
        // Add other required env vars here
      ];

      requiredEnvVars.forEach(envVar => {
        if (!process.env[envVar]) {
          console.warn(`⚠️ Missing environment variable: ${envVar}`);
        }
      });

      // Performance warnings
      if ('performance' in window && 'memory' in performance) {
        const memory = performance.memory;
        if (memory.usedJSHeapSize > 50 * 1024 * 1024) { // 50MB
          console.warn('⚠️ High memory usage detected:', {
            used: `${Math.round(memory.usedJSHeapSize / 1024 / 1024)}MB`,
            total: `${Math.round(memory.totalJSHeapSize / 1024 / 1024)}MB`,
            limit: `${Math.round(memory.jsHeapSizeLimit / 1024 / 1024)}MB`
          });
        }
      }
    }
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default MyApp;