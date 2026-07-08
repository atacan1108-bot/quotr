import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent the bundler from trying to bundle these Node-only packages.
  // @react-pdf/renderer uses canvas/fs internals that must stay in Node.
  // puppeteer-core and @sparticuz/chromium launch a real Chromium binary
  // (the latter ships a compiled/compressed one) — neither can be bundled.
  serverExternalPackages: ['@react-pdf/renderer', 'puppeteer-core', '@sparticuz/chromium'],
};

export default nextConfig;
