import { NextResponse, type NextRequest } from "next/server";
import { verifyBasicAuth } from "@/lib/auth";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cron endpoints handle their own authorization via CRON_SECRET or Basic Auth bypass
  if (
    pathname.startsWith("/api/cron/autopost") ||
    pathname.startsWith("/api/cron/autolike")
  ) {
    return NextResponse.next();
  }

  if (!verifyBasicAuth(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Shinigami Autopost Dashboard"',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/|__nextjs|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
