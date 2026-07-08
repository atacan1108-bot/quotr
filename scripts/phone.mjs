#!/usr/bin/env node
// `npm run phone` — starts the app AND opens a temporary public https link
// to it, using a free Cloudflare "quick tunnel" (no account needed).
//
// Use this when: you want to open the app on your phone. It needs to be
// https (not plain http) for the PWA "install app" feature and offline
// support (service workers) to work — phones block those over plain http.
//
// `npm run dev` does NOT give you https, so use that one instead when
// you're just working on this computer and don't need your phone.
import { spawn, spawnSync } from "node:child_process";
import QRCode from "qrcode";
import { startNext } from "./next-runner.mjs";

function hasCloudflared() {
  const result = spawnSync("cloudflared", ["--version"], { stdio: "ignore" });
  return result.error == null;
}

if (!hasCloudflared()) {
  console.log("");
  console.log("⚠️  You need one more free tool before this will work: cloudflared.");
  console.log("   It's what creates the secure https link to your app.");
  console.log("");
  console.log("   Install it by running this command in Terminal:");
  console.log("");
  console.log("     brew install cloudflared");
  console.log("");
  console.log("   (If that fails because you don't have Homebrew yet, install");
  console.log("   Homebrew first from https://brew.sh, then run the command above.)");
  console.log("");
  console.log("   Once that finishes, run: npm run phone");
  console.log("");
  process.exit(1);
}

const { child: nextChild, ready } = startNext();

const children = [nextChild];
let shuttingDown = false;
function cleanup() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill("SIGINT");
    } catch {
      // already exited
    }
  }
}
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

const { port } = await ready;

console.log("");
console.log("🌐 Creating a secure link so you can open this app on your phone...");
console.log("");

const tunnel = spawn(
  "cloudflared",
  ["tunnel", "--url", `http://localhost:${port}`],
  { stdio: ["ignore", "pipe", "pipe"] }
);
children.push(tunnel);

const TUNNEL_URL_RE = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;
let found = false;

async function announce(url) {
  found = true;
  console.log("✅ Your app is available on your phone.");
  console.log(`   Open this link: ${url}`);
  console.log("");
  console.log("📱 Or scan this QR code with your phone's camera:");
  console.log("");
  const qr = await QRCode.toString(url, { type: "terminal", small: true });
  console.log(qr);
  console.log("This link is temporary — it stops working when you press Ctrl+C.");
  console.log("It uses https, which your phone needs to install this app properly.");
  console.log("");
}

function scan(text) {
  if (found) return;
  const match = text.match(TUNNEL_URL_RE);
  if (match) announce(match[0]);
}

tunnel.stdout.on("data", (data) => scan(data.toString()));
tunnel.stderr.on("data", (data) => scan(data.toString()));

tunnel.on("exit", () => {
  if (!found && !shuttingDown) {
    console.log(
      "⚠️  The tunnel closed before creating a link. Try running \"npm run phone\" again."
    );
    cleanup();
    process.exit(1);
  }
});
