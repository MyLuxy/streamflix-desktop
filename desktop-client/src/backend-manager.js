"use strict";

const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

const BACKEND_PORT = 3001; // fixed - baked into the frontend's client bundle at build time, see copy-frontend.mjs

function backendLauncherPath(resourcesDir) {
  const dir = path.join(resourcesDir, "backend");
  if (process.platform === "win32") return path.join(dir, "streamflix-backend.exe");
  // jpackage always wraps a macOS app-image in a real .app bundle - the actual binary
  // lives inside it, not at the top level like on windows/linux
  if (process.platform === "darwin") return path.join(dir, "Contents", "MacOS", "streamflix-backend");
  return path.join(dir, "bin", "streamflix-backend");
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function waitForReady(url, { timeoutMs = 20000, intervalMs = 300 } = {}) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error(`timed out waiting for ${url}`));
        else setTimeout(attempt, intervalMs);
      });
    };
    attempt();
  });
}

// if BACKEND_PORT is taken, this walks up to 20 ports looking for a free one instead
// of failing to launch - the frontend bundle still only knows about BACKEND_PORT, so
// main.js patches every request for it at the session level when the real port differs
async function findBackendPort(startPort) {
  let port = startPort;
  while (await isPortInUse(port)) {
    port += 1;
    if (port > startPort + 20) {
      throw new Error(`no free port found near ${startPort} for the backend`);
    }
  }
  return port;
}

async function startBackend(resourcesDir, logDir) {
  const port = await findBackendPort(BACKEND_PORT);

  const launcher = backendLauncherPath(resourcesDir);
  if (!fs.existsSync(launcher)) {
    throw new Error(`backend launcher not found at ${launcher}`);
  }

  const logStream = fs.createWriteStream(path.join(logDir, "backend.log"), { flags: "a" });
  const child = spawn(launcher, [], {
    env: { ...process.env, STREAMFLIX_BACKEND_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  await waitForReady(`http://127.0.0.1:${port}/api/providers`);

  return { process: child, port };
}

module.exports = { startBackend, BACKEND_PORT, waitForReady };
