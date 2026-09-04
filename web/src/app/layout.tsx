import type { Metadata, Viewport } from "next";
import "@/index.css";
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION } from "@/lib/site";
import { defaultLocale } from "@/lib/i18n-config";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // real lang gets set client side per locale, this is just the ssr default
  return (
    <html lang={defaultLocale} className="dark">
      <head>
        <link rel="preconnect" href="https://image.tmdb.org" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
