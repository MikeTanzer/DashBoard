import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

/**
 * Everything is private except the login screen and its POST endpoint.
 * Fails closed: if the session secret is missing or malformed, nobody gets in.
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (
    pathname === "/login" ||
    pathname === "/api/auth" ||
    pathname === "/api/logout"
  ) {
    return NextResponse.next();
  }

  let role: string | null = null;
  try {
    role = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  } catch {
    role = null;
  }

  if (role) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
