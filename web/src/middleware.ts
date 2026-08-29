import { NextResponse, type NextRequest } from "next/server";
import { locales, defaultLocale } from "@/lib/i18n-config";

// Rileva la lingua preferita: cookie -> Accept-Language -> default.
function detectLocale(req: NextRequest): string {
  const cookie = req.cookies.get("NEXT_LOCALE")?.value;
  if (cookie && (locales as readonly string[]).includes(cookie)) return cookie;

  const accept = req.headers.get("accept-language");
  if (accept) {
    const preferred = accept
      .split(",")
      .map((s) => s.split(";")[0].trim().slice(0, 2).toLowerCase());
    for (const p of preferred) {
      if ((locales as readonly string[]).includes(p)) return p;
    }
  }
  return defaultLocale;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const seg = pathname.split("/")[1];

  // Se l'URL ha già un prefisso lingua valido, prosegui senza modifiche.
  if ((locales as readonly string[]).includes(seg)) {
    return NextResponse.next();
  }

  // Altrimenti redirect verso /{locale}{pathname}.
  const locale = detectLocale(req);
  const path = `/${locale}${pathname === "/" ? "" : pathname}`;

  // Dietro un proxy/tunnel (es. ngrok) host e protocollo del server locale sono
  // http://localhost: se li usassimo rimanderemmo il browser su localhost.
  // Ricostruiamo l'URL assoluto con host/protocollo visti dal client (header
  // inoltrati), con fallback su quelli del server. Stringa pulita: evitiamo di
  // mutare l'oggetto NextURL, che produrrebbe una Location malformata.
  const proto = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", ""))
    .split(",")[0]
    .trim();
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host)
    .split(",")[0]
    .trim();

  return NextResponse.redirect(`${proto}://${host}${path}${req.nextUrl.search}`);
}

export const config = {
  // Esclude _next, api e qualsiasi file con estensione (sitemap.xml, robots.txt,
  // immagini, ecc.): quelle rotte non devono avere prefisso lingua.
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
