import { NextResponse, type NextRequest } from "next/server";
import { isDashboardAuthenticated } from "@/lib/auth";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow auth endpoints and cron endpoints (cron validates CRON_SECRET / session itself)
  if (
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/api/cron/autopost") ||
    pathname.startsWith("/api/cron/autolike") ||
    pathname.startsWith("/api/cron/autocomment")
  ) {
    return NextResponse.next();
  }

  const authenticated = isDashboardAuthenticated(request);

  // Login page: redirect straight to dashboard if already authenticated
  if (pathname === "/login") {
    if (authenticated) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!authenticated) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized. Silakan login terlebih dahulu." },
        { status: 401 }
      );
    }

    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/|__nextjs|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
