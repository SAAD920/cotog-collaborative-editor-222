/** @type {import('next').NextConfig} */
const nextConfig = {
  //  FIXED: Disable React Strict Mode for WebRTC compatibility
  // React Strict Mode can cause issues with WebRTC peer connections by mounting components twice
  reactStrictMode: false,
  
  //  FIXED: Experimental features for better development experience
  experimental: {
    // Disable ESM externals to prevent module resolution issues
    esmExternals: false,
  },
  
  //  FIXED: Webpack configuration for hot reload optimization
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // 🔧 Optimize hot reload for development
      config.watchOptions = {
        poll: 1000,           // Check for changes every second
        aggregateTimeout: 300, // Delay before rebuilding (ms)
        ignored: /node_modules/, // Ignore node_modules for better performance
      };
      
      // 🔧 Prevent multiple instances of React (fixes Fast Refresh issues)
      config.resolve.alias = {
        ...config.resolve.alias,
        'react': require.resolve('react'),
        'react-dom': require.resolve('react-dom'),
      };
      
      // 🔧 Optimize chunk splitting for faster rebuilds
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          ...config.optimization.splitChunks,
          cacheGroups: {
            ...config.optimization.splitChunks.cacheGroups,
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
            },
          },
        },
      };
    }
    
    // 🔧 Handle WebRTC and Socket.IO properly
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    
    return config;
  },
  
  //  SECURITY: Custom headers for enhanced security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent MIME type sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Prevent clickjacking
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // XSS Protection
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          // Referrer Policy
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Content Security Policy (basic)
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://ui-avatars.com; connect-src 'self' https://cotog-backend.onrender.com wss://cotog-backend.onrender.com; media-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self';",
          },
          // Permissions Policy (control browser features)
          {
            key: 'Permissions-Policy',
            value: 'microphone=(self), camera=(self), geolocation=(), payment=(), usb=()',
          },
        ],
      },
    ];
  },
  
  //  PERFORMANCE: Disable source maps in development for faster builds
  productionBrowserSourceMaps: false,
  
  //  IMAGE OPTIMIZATION: Configure domains for Next.js Image component
  images: {
    domains: [
      'ui-avatars.com', // For user avatars
      'cdn.jsdelivr.net', // For external libraries
      'cdnjs.cloudflare.com' // For external libraries
    ],
    // Optimize image loading
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  
  //  COMPRESSION: Enable compression for better performance
  compress: true,
  
  //  POWEREDBY: Remove X-Powered-By header for security
  poweredByHeader: false,
  
  //  TRAILING SLASH: Consistent URL handling
  trailingSlash: false,
  
  //  ENVIRONMENT VARIABLES: Make certain vars available to the browser
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  
  //  REDIRECTS: Handle common redirects
  async redirects() {
    return [
      // Redirect /room without ID to home
      {
        source: '/room',
        destination: '/',
        permanent: false,
      },
      // Redirect old paths (if any)
      {
        source: '/editor',
        destination: '/code-editor',
        permanent: true,
      },
    ];
  },
  
  //  REWRITES: Handle API proxying if needed (useful for development)
  async rewrites() {
    return [
      // Proxy API requests to backend in development
      ...(process.env.NODE_ENV === 'development' ? [
        {
          source: '/api/dev/:path*',
          destination: 'http://localhost:4000/api/:path*',
        },
      ] : []),
    ];
  },
  
  //  OUTPUT: Configure output settings
  output: 'standalone', // For Docker deployment
  
  //  TYPESCRIPT: TypeScript configuration (if migrating to TypeScript)
  typescript: {
    // Ignore TypeScript errors during build (useful during migration)
    ignoreBuildErrors: false,
  },
  
  //  ESLINT: ESLint configuration
  eslint: {
    // Only run ESLint on specific directories
    dirs: ['pages', 'components', 'contexts', 'utils'],
    // Don't fail build on ESLint errors (useful for development)
    ignoreDuringBuilds: false,
  },
  
  //  SWC: Use SWC for faster compilation (Next.js default)
  swcMinify: true,
  
  //  COMPILER: Configure SWC compiler options
  compiler: {
    // Remove console logs in production
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error'], // Keep console.error
    } : false,
  },
  
  //  MODULAR IMPORTS: Optimize bundle size for large libraries
  modularizeImports: {
    'lodash': {
      transform: 'lodash/{{member}}',
    },
  },
  
  //  BUNDLE ANALYZER: Enable webpack bundle analyzer (when needed)
  // Uncomment the lines below and run: ANALYZE=true npm run build
  ...(process.env.ANALYZE === 'true' && {
    webpack: (config, { isServer }) => {
      if (!isServer) {
        const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
        config.plugins.push(
          new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            openAnalyzer: true,
            reportFilename: '../bundle-analyzer-report.html',
          })
        );
      }
      return config;
    },
  }),
};

module.exports = nextConfig;