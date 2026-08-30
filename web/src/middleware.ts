import { NextResponse, type NextRequest } from "next/server";
import { locales, defaultLocale } from "@/lib/i18n-config";

// cookie, then accept-language header, then default
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

  if ((locales as readonly string[]).includes(seg)) {
    return NextResponse.next();
  }

  const locale = detectLocale(req);
  const path = `/${locale}${pathname === "/" ? "" : pathname}`;

  // behind ngrok etc the server only sees localhost, rebuild from forwarded headers instead
  const proto = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", ""))
    .split(",")[0]
    .trim();
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host)
    .split(",")[0]
    .trim();

  return NextResponse.redirect(`${proto}://${host}${path}${req.nextUrl.search}`);
}

export const config = {
  // skip _next, api, and anything with a file extension
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
