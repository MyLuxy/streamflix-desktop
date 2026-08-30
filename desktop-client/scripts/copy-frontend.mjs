// builds the Next.js standalone server and copies it (plus static/public assets)
// into desktop-client/resources/web, ready to be run with plain `node server.js`
// or bundled by electron-builder as an extraResource.
import { execSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const webDir = join(repoRoot, "web");
const outDir = join(__dirname, "..", "resources", "web");

const skipBuild = process.argv.includes("--no-build");

if (!skipBuild) {
  console.log("> next build (web/)...");
  execSync("npm run build", {
    cwd: webDir,
    stdio: "inherit",
    env: {
      ...process.env,
      // baked into the client bundle at build time - the backend's own listening
      // port is fixed (see desktop-client/src/backend-manager.js), so this must
      // match it exactly; it cannot be decided per-launch.
      NEXT_PUBLIC_BACKEND_URL: "http://127.0.0.1:3001",
    },
  });
}

const standaloneDir = join(webDir, ".next", "standalone");
if (!existsSync(standaloneDir)) {
  throw new Error(`missing ${standaloneDir} - did the build produce output: "standalone"?`);
}

console.log("> copying static/public assets into standalone output...");
cpSync(join(webDir, ".next", "static"), join(standaloneDir, ".next", "static"), {
  recursive: true,
});
if (existsSync(join(webDir, "public"))) {
  cpSync(join(webDir, "public"), join(standaloneDir, "public"), { recursive: true });
}

console.log(`> copying standalone output to ${outDir}...`);
rmSync(outDir, { recursive: true, force: true });
cpSync(standaloneDir, outDir, { recursive: true });

console.log("done.");
