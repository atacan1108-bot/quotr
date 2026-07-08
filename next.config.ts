import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent webpack from trying to bundle these Node-only packages.
  // @react-pdf/renderer uses canvas/fs internals that must stay in Node.
  serverExternalPackages: ['@react-pdf/renderer', 'canvas'],
};

export default nextConfig;
