/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typedRoutes: true,
  eslint: {
    ignoreDuringBuilds: true
  }
};

export default nextConfig;
