import type { NextRequest } from "next/server";

/**
 * Verifies HTTP Basic Auth against process.env.ADMIN_PASSWORD.
 * Any username is accepted as long as the password matches ADMIN_PASSWORD.
 * If ADMIN_PASSWORD is not configured, returns true (open local dev fallback).
 */
export function verifyBasicAuth(request: Request): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return true;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }

  try {
    const base64Credentials = authHeader.slice(6).trim();
    const decoded = Buffer.from(base64Credentials, "base64").toString("utf8");
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) {
      return false;
    }
    const password = decoded.slice(colonIndex + 1);
    return password === adminPassword;
  } catch {
    return false;
  }
}

export interface CronAuthResult {
  authorized: boolean;
  via: "secret" | "dashboard" | "none";
  isManualTest: boolean;
}

/**
 * Authorizes cron endpoints either via ?secret=<CRON_SECRET> (or x-cron-secret / Bearer)
 * OR via authenticated dashboard Basic Auth (for manual Test Run buttons).
 */
export function verifyCronAccess(request: NextRequest): CronAuthResult {
  const cronSecret = process.env.CRON_SECRET;
  const querySecret = request.nextUrl.searchParams.get("secret");
  const headerSecret = request.headers.get("x-cron-secret");
  const authHeader = request.headers.get("authorization") || "";
  const bearerSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const isManualParam = request.nextUrl.searchParams.get("manual") === "true";

  const providedSecret = querySecret || headerSecret || bearerSecret;

  if (cronSecret && providedSecret && providedSecret === cronSecret) {
    return {
      authorized: true,
      via: "secret",
      isManualTest: isManualParam,
    };
  }

  // Bypass CRON_SECRET when invoked from authenticated dashboard UI
  if (verifyBasicAuth(request)) {
    const hasBasicHeader = authHeader.startsWith("Basic ");
    const noAdminPasswordSet = !process.env.ADMIN_PASSWORD;
    if (hasBasicHeader || noAdminPasswordSet) {
      return {
        authorized: true,
        via: "dashboard",
        isManualTest: isManualParam || true,
      };
    }
  }

  return {
    authorized: false,
    via: "none",
    isManualTest: false,
  };
}
