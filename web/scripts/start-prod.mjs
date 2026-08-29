// Build di produzione + copia asset + avvio sito E backend, in un comando.
// Uso: npm run start:prod   (sito su :8080, backend su :3001)
//   PORT=xxxx        cambia la porta del sito
//   --no-build       riavvia senza ricompilare
//   --no-backend     non avviare il backend (se lo gestisci a parte)
import { execSync, spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const PORT = process.env.PORT || "8080";
const skipBuild = process.argv.includes("--no-build");
const skipBackend = process.argv.includes("--no-backend");

if (!skipBuild) {
  console.log("▶ Build di produzione...");
  execSync("next build", { stdio: "inherit" });
}

console.log("▶ Copia asset nello standalone...");
cpSync(join(root, ".next/static"), join(root, ".next/standalone/.next/static"), {
  recursive: true,
});
if (existsSync(join(root, "public"))) {
  cpSync(join(root, "public"), join(root, ".next/standalone/public"), {
    recursive: true,
  });
}

// ── Backend (player) su :3001 ──
let backend = null;
if (!skipBackend) {
  console.log("▶ Avvio backend (player) su http://localhost:3001 ...");
  backend = spawn("node", [join(root, "backend/server.js")], {
    stdio: "inherit",
    env: process.env,
  });
  backend.on("error", (e) =>
    console.warn("⚠ Backend non avviato:", e.message)
  );
  backend.on("exit", (code) => {
    // EADDRINUSE (codice 1) = backend già attivo: non è un problema
    if (code && code !== 0) {
      console.warn(
        "⚠ Il backend si è chiuso (forse la porta 3001 è già in uso): il sito continua a funzionare."
      );
    }
  });
}

// ── Sito (Next standalone) ──
console.log(`▶ Avvio sito su http://localhost:${PORT}\n`);
const server = spawn("node", [join(root, ".next/standalone/server.js")], {
  stdio: "inherit",
  env: { ...process.env, PORT, HOSTNAME: process.env.HOSTNAME || "127.0.0.1" },
});

function shutdown(code) {
  if (backend) backend.kill();
  process.exit(code ?? 0);
}
server.on("exit", (code) => shutdown(code));
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
