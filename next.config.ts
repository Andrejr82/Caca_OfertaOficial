import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.mlstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  turbopack: {
    root: process.cwd()
  },
  typescript: {
    ignoreBuildErrors: true,
  }
};

export default nextConfig;
