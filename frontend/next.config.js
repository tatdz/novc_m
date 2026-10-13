/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  transpilePackages: ['@circle-fin/w3s-pw-web-sdk'],

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        util: require.resolve('util'),
        buffer: require.resolve('buffer'),
      }
    }

    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
    }

    return config
  },

  serverExternalPackages: [
    'libsodium-wrappers',
    'poseidon-lite',
  ],

  typescript: {
    ignoreBuildErrors: true,
  },

  // Add this block. Skips ESLint during `next build` and Vercel builds.
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig