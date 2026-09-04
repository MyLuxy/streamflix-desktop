// swaps the blank PERSONAL_TMDB_API_KEY placeholders (Kotlin backend + Electron's spawned
// Next.js frontend) for a real key read from the TMDB_PERSONAL_API_KEY env var (a CI repo
// secret). no-ops when that env var isn't set, so local/dev/fork builds just fall through to
// each side's own hardcoded demo key as before. never run this against a checkout you intend
// to commit from - it's meant for a throwaway CI workspace only.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const key = process.env.TMDB_PERSONAL_API_KEY;
if (!key) {
  console.log("> TMDB_PERSONAL_API_KEY not set, leaving both built-in keys blank (demo key will be used)");
  process.exit(0);
}

function inject(targetFile, placeholder, replacement) {
  const source = readFileSync(targetFile, "utf8");
  if (!source.includes(placeholder)) {
    throw new Error(`expected placeholder not found in ${targetFile} - did its shape change?`);
  }
  writeFileSync(targetFile, source.replace(placeholder, replacement));
  console.log(`> injected TMDB_PERSONAL_API_KEY into ${targetFile}`);
}

inject(
  join(__dirname, "..", "..", "shared", "src", "jvmMain", "kotlin", "com", "streamflixreborn", "streamflix", "utils", "UserPreferences.kt"),
  'private const val PERSONAL_TMDB_API_KEY = ""',
  `private const val PERSONAL_TMDB_API_KEY = "${key}"`
);

inject(
  join(__dirname, "..", "src", "build-secrets.js"),
  'TMDB_PERSONAL_API_KEY: "",',
  `TMDB_PERSONAL_API_KEY: "${key}",`
);
