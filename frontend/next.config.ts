import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pin workspace root to this directory, ignoring any lockfiles in parent folders
  outputFileTracingRoot: path.join(__dirname),
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL ?? 'http://localhost:8001'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
