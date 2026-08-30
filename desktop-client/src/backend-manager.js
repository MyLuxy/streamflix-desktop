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

async function startBackend(resourcesDir, logDir) {
  if (await isPortInUse(BACKEND_PORT)) {
    throw new Error(
      `Port ${BACKEND_PORT} is already in use by another application. Close it and relaunch StreamFlix.`
    );
  }

  const launcher = backendLauncherPath(resourcesDir);
  if (!fs.existsSync(launcher)) {
    throw new Error(`backend launcher not found at ${launcher}`);
  }

  const logStream = fs.createWriteStream(path.join(logDir, "backend.log"), { flags: "a" });
  const child = spawn(launcher, [], {
    env: { ...process.env, STREAMFLIX_BACKEND_PORT: String(BACKEND_PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  await waitForReady(`http://127.0.0.1:${BACKEND_PORT}/api/providers`);

  return { process: child, port: BACKEND_PORT };
}

module.exports = { startBackend, BACKEND_PORT, waitForReady };
