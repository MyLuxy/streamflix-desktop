// single entry point for producing an installer on the current OS:
// gradle jpackage -> copy backend -> next build -> copy frontend -> electron-builder.
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopClientDir = join(__dirname, "..");

const run = (cmd, cwd = desktopClientDir) => execSync(cmd, { cwd, stdio: "inherit" });

console.log("=== 1/3: backend ===");
run("node scripts/copy-backend.mjs");

console.log("=== 2/3: frontend ===");
run("node scripts/copy-frontend.mjs");

console.log("=== 3/3: electron-builder ===");
run("npx electron-builder");

console.log("done - see desktop-client/build/");
