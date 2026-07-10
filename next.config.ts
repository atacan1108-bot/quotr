import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Prevent the bundler from trying to bundle these Node-only packages.
  // @react-pdf/renderer uses canvas/fs internals that must stay in Node.
  // puppeteer-core and @sparticuz/chromium launch a real Chromium binary
  // (the latter ships a compiled/compressed one) — neither can be bundled.
  serverExternalPackages: ['@react-pdf/renderer', 'puppeteer-core', '@sparticuz/chromium'],
  // serverExternalPackages only stops webpack/turbopack from bundling
  // @sparticuz/chromium's JS — it does NOT make Vercel's output-file-tracing
  // copy the package's non-JS chromium binary (node_modules/@sparticuz/
  // chromium/bin/*.br) into the deployed function. Without this, the
  // function ships without the binary and fails at runtime with "the input
  // directory .../bin does not exist" the first time it tries to launch.
  outputFileTracingIncludes: {
    '/api/quote/\\[id\\]/generate-pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
    '/api/settings/template/preview': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
};

export default withNextIntl(nextConfig);
