import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { THEME_COOKIE, readTheme } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Pyrotree — Network Dashboard",
  description:
    "Customers, revenue and consumer activity across the Pyrotree platform network.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * The theme is stamped on <html> by the server, from a cookie.
 *
 * The usual trick — an inline bootstrap script that reads localStorage before
 * paint — doesn't work cleanly under React 19: inline scripts rendered as
 * component children aren't executed on the client, and mutating <html> ahead
 * of hydration desynchronises it. Reading a cookie server-side gives the same
 * no-flash result with no script at all, and the markup matches by construction.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const theme = readTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="en" data-theme={theme === "system" ? undefined : theme}>
      <body>{children}</body>
    </html>
  );
}
