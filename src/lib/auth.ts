import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE_NAME = "shinigami_admin_session";

function safeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Generates a deterministic HMAC-SHA256 stateless session token from ADMIN_PASSWORD.
 */
export function createSessionToken(adminPassword: string): string {
  const salt = process.env.CRON_SECRET || "shinigami-autopost-salt";
  return createHmac("sha256", `${adminPassword}:${salt}`)
    .update("shinigami-autopost-admin-session-v1")
    .digest("hex");
}

export function verifyAdminPassword(inputPassword: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return true;
  }
  return safeStringEqual(inputPassword, adminPassword);
}

function parseCookieValue(
  cookieHeader: string | null,
  name: string
): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export function verifySessionCookie(request: Request): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return true;
  }

  const token = parseCookieValue(
    request.headers.get("cookie"),
    SESSION_COOKIE_NAME
  );
  if (!token) {
    return false;
  }

  const expected = createSessionToken(adminPassword);
  return safeStringEqual(token, expected);
}

/**
 * Verifies HTTP Basic Auth against process.env.ADMIN_PASSWORD (kept for API/CLI compatibility).
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
    return safeStringEqual(password, adminPassword);
  } catch {
    return false;
  }
}

/**
 * Checks whether a dashboard request is authenticated via signed session cookie or Basic Auth.
 */
export function isDashboardAuthenticated(request: Request): boolean {
  if (!process.env.ADMIN_PASSWORD) {
    return true;
  }
  return verifySessionCookie(request) || verifyBasicAuth(request);
}

export interface CronAuthResult {
  authorized: boolean;
  via: "secret" | "dashboard" | "none";
  isManualTest: boolean;
}

/**
 * Authorizes cron endpoints either via ?secret=<CRON_SECRET> (or x-cron-secret / Bearer)
 * OR via authenticated dashboard session cookie / Basic Auth (for manual Test Run buttons).
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

  if (cronSecret && providedSecret && safeStringEqual(providedSecret, cronSecret)) {
    return {
      authorized: true,
      via: "secret",
      isManualTest: isManualParam,
    };
  }

  // Bypass CRON_SECRET when invoked from authenticated dashboard UI
  if (isDashboardAuthenticated(request)) {
    const hasAuthEvidence =
      Boolean(
        parseCookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME)
      ) ||
      authHeader.startsWith("Basic ") ||
      !process.env.ADMIN_PASSWORD;

    if (hasAuthEvidence) {
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
