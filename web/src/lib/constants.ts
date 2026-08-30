import { BACKEND_URL } from "@/lib/backend";

export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

// bump this if a browser cached a bad response before a proxy bugfix, invalidates old cache entries
const IMAGE_PROXY_VERSION = 2;

export function proxyImage(url: string): string {
  return `${BACKEND_URL}/image?v=${IMAGE_PROXY_VERSION}&url=${encodeURIComponent(url)}`;
}

export function imageUrl(path: string | null | undefined, size: string): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return proxyImage(path);
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

// local file so it cant itself fail to load like an external favicon can
export const PROVIDER_LOGO_FALLBACK = "/provider-fallback.png";

export const IMAGE_SIZES = {
  poster: {
    small: "w185",
    medium: "w342",
    large: "w500",
    original: "original",
  },
  backdrop: {
    small: "w300",
    medium: "w780",
    large: "w1280",
    original: "original",
  },
  profile: {
    small: "w45",
    medium: "w185",
    large: "h632",
  },
};

export const GENRES: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
};

export const DEMO_VIDEOS = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
];
