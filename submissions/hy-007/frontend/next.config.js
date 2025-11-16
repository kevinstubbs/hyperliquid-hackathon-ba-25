/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
  // Turbopack config - using empty object to allow webpack config to work
  // The webpack fallbacks are needed for blockchain/web3 libraries
  turbopack: {},
}

module.exports = nextConfig
