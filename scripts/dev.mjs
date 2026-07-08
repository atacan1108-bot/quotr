#!/usr/bin/env node
// `npm run dev` — starts the app for local development.
//
// This is a thin wrapper around `next dev` that, once the server is ready,
// prints a plain-language summary of exactly which addresses to open —
// instead of leaving you to decode Next.js's own log output.
//
// Use this when: you're working on the app on this computer and don't need
// to open it on your phone. For that, use `npm run phone` instead.
import { startNext } from "./next-runner.mjs";

const { child, ready } = startNext();

ready.then(({ localUrl, networkUrl }) => {
  console.log("");
  console.log("✅ Your app is running.");
  console.log(`   On this computer, open: ${localUrl}`);
  if (networkUrl) {
    console.log(`   On your phone (same wifi), open: ${networkUrl}`);
  } else {
    console.log(
      "   Couldn't detect your network address — make sure this Mac is connected to wifi."
    );
  }
  console.log("");
  console.log("   (Press Ctrl+C to stop the app.)");
  console.log("");
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}

child.on("exit", (code) => process.exit(code ?? 0));
