"use strict";

const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");
const { waitForReady } = require("./backend-manager");
const { TMDB_PERSONAL_API_KEY } = require("./build-secrets");

function findFreePort(startPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      if (port > startPort + 20) {
        reject(new Error(`no free port found near ${startPort}`));
        return;
      }
      const server = net.createServer();
      server.once("error", () => tryPort(port + 1));
      server.once("listening", () => server.close(() => resolve(port)));
      server.listen(port, "127.0.0.1");
    };
    tryPort(startPort);
  });
}

async function startFrontend(resourcesDir, logDir, backendPort) {
  const serverJs = path.join(resourcesDir, "web", "server.js");
  if (!fs.existsSync(serverJs)) {
    throw new Error(`frontend server not found at ${serverJs}`);
  }

  const port = await findFreePort(8080);
  const logStream = fs.createWriteStream(path.join(logDir, "frontend.log"), { flags: "a" });

  // real OS child process, not required in-process, so it tears down reliably on quit
  const child = spawn(process.execPath, [serverJs], {
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      ELECTRON_RUN_AS_NODE: "1",
      // not NEXT_PUBLIC_ prefixed, lets server-only fetches follow the real port if it fell back off 3001
      BACKEND_URL_RUNTIME: `http://127.0.0.1:${backendPort}`,
      // blank without the CI secret, web/src/lib/tmdb.ts falls through to its own demo key
      ...(TMDB_PERSONAL_API_KEY ? { TMDB_API_KEY: TMDB_PERSONAL_API_KEY } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  await waitForReady(`http://127.0.0.1:${port}/`);

  return { process: child, port };
}

module.exports = { startFrontend };
