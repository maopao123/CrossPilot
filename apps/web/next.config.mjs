/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@crosspilot/shared'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  async rewrites() {
    const apiTarget = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
    const minioTarget = process.env.MINIO_INTERNAL_URL || 'http://127.0.0.1:9002';
    return [
      {
        source: '/api/:path*',
        destination: `${apiTarget}/api/:path*`,
      },
      {
        source: '/assets/:path*',
        destination: `${minioTarget}/crosspilot-assets/:path*`,
      },
    ];
  },
};

export default nextConfig;

