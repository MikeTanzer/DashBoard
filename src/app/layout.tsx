import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { THEME_COOKIE, readTheme } from "@/lib/theme";

/**
 * Inter is the face webjoint.com uses. next/font self-hosts it at build time,
 * so there's no CDN request at runtime and no flash of a fallback face.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pyrotree — Network Dashboard",
  description:
    "Customers, revenue and consumer activity across the Pyrotree platform network.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#021232",
};

/**
 * The theme is stamped on <html> by the server, from a cookie.
 *
 * The usual trick — an inline bootstrap script reading localStorage before
 * paint — doesn't work under React 19: inline scripts rendered as component
 * children aren't executed on the client, and mutating <html> ahead of
 * hydration desynchronises it. A cookie gives the same no-flash result with no
 * script, and the markup matches by construction.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const theme = readTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      data-theme={theme === "system" ? undefined : theme}
      className={inter.variable}
    >
      <body>{children}</body>
    </html>
  );
}
