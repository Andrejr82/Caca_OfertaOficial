import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.mlstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'm.media-amazon.com',
      },
      {
        protocol: 'https',
        hostname: '**.ssl-images-amazon.com',
      },
      {
        protocol: 'https',
        hostname: '**.amazon.com',
      },
      {
        protocol: 'https',
        hostname: '**.images-amazon.com',
      },
      {
        protocol: 'https',
        hostname: '**.amazon.com.br',
      },
      {
        protocol: 'https',
        hostname: '**.mlcdn.com.br',
      },
      {
        protocol: 'https',
        hostname: '**.shopee.com.br',
      },
      {
        protocol: 'https',
        hostname: '**.susercontent.com',
      },
      {
        protocol: 'https',
        hostname: '**.ltwebstatic.com',
      },
      {
        protocol: 'https',
        hostname: '**',
      }
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
