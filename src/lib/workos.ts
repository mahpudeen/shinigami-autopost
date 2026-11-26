import {
  DEFAULT_CLIENT_ID,
  getDb,
  type AccountDoc,
} from "@/lib/firebase-admin";

const WORKOS_AUTH_URL =
  "https://auth.shinigami.io/user_management/authenticate";

export interface WorkOSUser {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  profile_picture_url?: string | null;
}

export interface WorkOSAuthResponse {
  user?: WorkOSUser;
  access_token?: string;
  refresh_token?: string;
  message?: string;
  error?: string;
  error_description?: string;
}

export interface NormalizedWorkOSProfile {
  name: string;
  email: string;
  avatarUrl: string;
  accessToken: string;
  refreshToken: string;
  clientId: string;
}

export async function authenticateWithWorkOS(
  refreshToken: string,
  clientId?: string
): Promise<NormalizedWorkOSProfile> {
  const effectiveClientId = clientId?.trim() || DEFAULT_CLIENT_ID;
  const trimmedRefreshToken = refreshToken.trim();

  if (!trimmedRefreshToken) {
    throw new Error("Refresh token tidak boleh kosong.");
  }

  const response = await fetch(WORKOS_AUTH_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_id: effectiveClientId,
      grant_type: "refresh_token",
      refresh_token: trimmedRefreshToken,
    }),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as WorkOSAuthResponse;

  if (!response.ok || !data.access_token || !data.refresh_token) {
    const errMsg =
      data.error_description ||
      data.message ||
      data.error ||
      `WorkOS refresh gagal dengan status HTTP ${response.status}`;
    throw new Error(errMsg);
  }

  const firstName = data.user?.first_name?.trim() || "";
  const lastName = data.user?.last_name?.trim() || "";
  const email = data.user?.email?.trim() || "";
  const fullName = `${firstName} ${lastName}`.trim() || email || "Shinigami User";
  const avatarUrl = data.user?.profile_picture_url?.trim() || "";

  return {
    name: fullName,
    email,
    avatarUrl,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    clientId: effectiveClientId,
  };
}

/**
 * Refreshes a WorkOS single-use refresh token and immediately persists
 * the rotated tokens + updated profile back to Firestore.
 */
export async function refreshAndSyncAccount(
  account: AccountDoc
): Promise<AccountDoc> {
  const refreshed = await authenticateWithWorkOS(
    account.refreshToken,
    account.clientId || DEFAULT_CLIENT_ID
  );

  const updatedAt = Date.now();
  const patch = {
    name: refreshed.name,
    email: refreshed.email,
    avatarUrl: refreshed.avatarUrl,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    clientId: refreshed.clientId,
    updatedAt,
  };

  const db = getDb();
  await db.collection("accounts").doc(account.id).set(patch, { merge: true });

  return {
    ...account,
    ...patch,
  };
}
