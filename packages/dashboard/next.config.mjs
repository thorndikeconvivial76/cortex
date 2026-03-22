/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Static export for serving via Fastify
  distDir: 'out',
  images: { unoptimized: true },
};

export default nextConfig;
