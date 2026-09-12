"use strict";

const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

const BACKEND_PORT = 3001; // baked into the frontend's client bundle at build time, see copy-frontend.mjs

function backendLauncherPath(resourcesDir) {
  const dir = path.join(resourcesDir, "backend");
  if (process.platform === "win32") return path.join(dir, "streamflix-backend.exe");
  // jpackage wraps macOS in a real .app bundle, binary's inside it not at the top level
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

// walks up to 20 ports for a free one instead of failing, main.js patches requests if it differs
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

// packaged builds bundle a static ffmpeg next to the backend, dev falls back to PATH
function ffmpegPath(resourcesDir) {
  const bundled = path.join(resourcesDir, "ffmpeg", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  return fs.existsSync(bundled) ? bundled : null;
}

async function startBackend(resourcesDir, logDir, downloadsDir) {
  const port = await findBackendPort(BACKEND_PORT);

  const launcher = backendLauncherPath(resourcesDir);
  if (!fs.existsSync(launcher)) {
    throw new Error(`backend launcher not found at ${launcher}`);
  }

  const bundledFfmpeg = ffmpegPath(resourcesDir);
  const logStream = fs.createWriteStream(path.join(logDir, "backend.log"), { flags: "a" });
  const child = spawn(launcher, [], {
    env: {
      ...process.env,
      STREAMFLIX_BACKEND_PORT: String(port),
      STREAMFLIX_DOWNLOADS_DIR: downloadsDir,
      ...(bundledFfmpeg ? { STREAMFLIX_FFMPEG_PATH: bundledFfmpeg } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  await waitForReady(`http://127.0.0.1:${port}/api/providers`);

  return { process: child, port };
}

module.exports = { startBackend, BACKEND_PORT, waitForReady };
