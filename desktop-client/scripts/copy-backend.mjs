// runs the Gradle jpackage task for the Kotlin backend (must run on this OS -
// jlink/jpackage output isn't cross-compilable) and copies the resulting
// self-contained app-image into desktop-client/resources/backend.
import { execSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
// jpackage's app-image output is a plain folder on windows/linux, but always a real
// macOS .app bundle on darwin (Contents/MacOS/<name> inside) - there's no way to opt out
const jpackageDir = process.platform === "darwin"
  ? join(repoRoot, "desktop", "build", "jpackage", "streamflix-backend.app")
  : join(repoRoot, "desktop", "build", "jpackage", "streamflix-backend");
const outDir = join(__dirname, "..", "resources", "backend");

const skipBuild = process.argv.includes("--no-build");

if (!skipBuild) {
  console.log("> injecting TMDB key...");
  execSync("node scripts/inject-tmdb-key.mjs", { cwd: join(__dirname, ".."), stdio: "inherit" });

  console.log("> gradle :desktop:jpackageImage...");
  const gradlew = process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew";
  // git doesn't track the executable bit on this file, so a fresh checkout on
  // linux/macOS (e.g. CI) needs it restored before it can be run directly
  if (process.platform !== "win32") chmodSync(join(repoRoot, "gradlew"), 0o755);
  execSync(`${gradlew} :desktop:jpackageImage --no-configuration-cache`, {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

if (!existsSync(jpackageDir)) {
  throw new Error(`missing ${jpackageDir} - did jpackageImage run?`);
}

console.log(`> copying backend app-image to ${outDir}...`);
rmSync(outDir, { recursive: true, force: true });
cpSync(jpackageDir, outDir, { recursive: true });

// some copy operations on some OSes/CI images can drop the executable bit
if (process.platform === "darwin") {
  const macosDir = join(outDir, "Contents", "MacOS");
  if (existsSync(macosDir)) {
    for (const f of readdirSync(macosDir)) {
      const p = join(macosDir, f);
      if (statSync(p).isFile()) chmodSync(p, 0o755);
    }
  }
} else if (process.platform !== "win32") {
  const binDir = join(outDir, "bin");
  if (existsSync(binDir)) {
    for (const f of readdirSync(binDir)) {
      const p = join(binDir, f);
      if (statSync(p).isFile()) chmodSync(p, 0o755);
    }
  }
}

console.log("done.");
