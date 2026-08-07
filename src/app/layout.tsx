import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

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
 * No server, so no cookie: ThemeToggle applies data-theme on the client from
 * localStorage. suppressHydrationWarning covers the attribute it adds.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
