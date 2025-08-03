/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://cotog-backend.onrender.com',
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },

  images: {
    domains: ['ui-avatars.com'],
    unoptimized: true,
  },
};

module.exports = nextConfig;