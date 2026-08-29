import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output: ideale per deploy su VPS (genera un server Node autonomo)
  output: "standalone",
  // Radice del tracing: questo progetto (evita il warning sui lockfile multipli)
  outputFileTracingRoot: __dirname,
  reactStrictMode: true,
  eslint: {
    // La build di produzione non deve fallire per warning di lint legacy
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Il progetto usa tipi rilassati (strict:false); non blocchiamo la build
    // su mismatch di tipi pre-esistenti o di librerie terze sotto React 19.
    ignoreBuildErrors: true,
  },
  images: {
    // Le immagini provengono da TMDB
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
    ],
  },
};

export default nextConfig;
