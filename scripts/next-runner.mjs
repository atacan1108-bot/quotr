// Shared helper: starts `next dev`, streams its output live (so you still
// see compile errors etc.), and resolves once the server is actually ready
// with the real local + network URLs (parsed from Next's own output, so
// this keeps working even if Next picks a different port because 3000 is
// already taken).
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NEXT_BIN = path.join(__dirname, "..", "node_modules", ".bin", "next");

const LOCAL_URL_RE = /Local:\s+(http:\/\/localhost:(\d+))/;
const NETWORK_URL_RE = /Network:\s+(http:\/\/[\d.]+:\d+)/;
const READY_RE = /Ready in/;

export function startNext(extraArgs = []) {
  // Next already binds to 0.0.0.0 (all network interfaces) by default, and
  // detects + prints the real LAN IP for the "Network:" URL when left to
  // its own defaults. Passing -H 0.0.0.0 explicitly would make it echo
  // "0.0.0.0" back literally instead of the actual IP, so we don't.
  const child = spawn(NEXT_BIN, ["dev", ...extraArgs], {
    stdio: ["inherit", "pipe", "pipe"],
  });

  let localUrl = null;
  let port = null;
  let networkUrl = null;

  const ready = new Promise((resolve) => {
    const scan = (text) => {
      if (!localUrl) {
        const m = text.match(LOCAL_URL_RE);
        if (m) {
          localUrl = m[1];
          port = m[2];
        }
      }
      if (!networkUrl) {
        const m = text.match(NETWORK_URL_RE);
        if (m) networkUrl = m[1];
      }
      if (localUrl && READY_RE.test(text)) {
        resolve({ port, localUrl, networkUrl });
      }
    };

    child.stdout.on("data", (data) => {
      const text = data.toString();
      process.stdout.write(text);
      scan(text);
    });
    child.stderr.on("data", (data) => {
      const text = data.toString();
      process.stderr.write(text);
      scan(text);
    });
  });

  return { child, ready };
}
