import { NextResponse, type NextRequest } from "next/server";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  verifyAdminPassword,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      password?: string;
    };
    const password = typeof body.password === "string" ? body.password : "";

    if (!password) {
      return NextResponse.json(
        { ok: false, error: "Password wajib diisi." },
        { status: 400 }
      );
    }

    if (!verifyAdminPassword(password)) {
      return NextResponse.json(
        { ok: false, error: "Password salah. Silakan coba lagi." },
        { status: 401 }
      );
    }

    const adminPassword = process.env.ADMIN_PASSWORD || "";
    const token = adminPassword ? createSessionToken(adminPassword) : "open";
    const isHttps =
      request.nextUrl.protocol === "https:" ||
      request.headers.get("x-forwarded-proto") === "https";

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps,
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 hari
    });

    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Terjadi kesalahan saat proses login." },
      { status: 500 }
    );
  }
}
