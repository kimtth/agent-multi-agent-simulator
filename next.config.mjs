/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "@heroicons/react", "framer-motion"]
  }
};

export default nextConfig;
